using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CMT.Application.SelfEvaluation.Services;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.Shared;
using PasswordService = CMT.Application.SelfEvaluation.Services.PasswordService;
using Task = System.Threading.Tasks.Task;
using User = CMT.Domain.Models.SelfEvaluation.User;
using RecordStatus = CMT.Domain.Models.Shared.RecordStatus;

namespace CMT.Web.Api.SelfEvaluation.Controllers
{
    /// <summary>
    /// User Management Controller - AMENDED v5
    ///
    /// ==================== WHAT v5 CHANGES vs v4 ====================
    /// RoleHierarchy.cs is at v7 and HierarchyRuleService at v7, but THIS
    /// controller was still the v4 file. It therefore bypassed the parts of the
    /// engine that implement the specification, which is why the amended
    /// requirements had no effect at runtime:
    ///
    ///  (1) USER MANAGEMENT REACHES THE WHOLE HIERARCHY.
    ///      Nothing here was Admin/Director gated except delete, but
    ///      GET /api/users/creation-rules built its answer from
    ///      RoleHierarchy.CreatableRoles() directly, so a Manager, Shop Manager or
    ///      Shop Team Leader received a payload WITHOUT
    ///      departmentHasActiveManager / restrictions / grantablePermissions and
    ///      the UI could not tell whether they were allowed in.
    ///      v5 delegates to HierarchyRuleService.GetCreationRulesAsync, so:
    ///        Admin              -> Director, Special Team Leader, and any role
    ///        Director           -> Manager (+ shop layer only while the
    ///                              department has NO active Manager)
    ///        Manager            -> Shop Manager, Shop Team Leader
    ///        Shop Manager       -> Shop Team Leader, Certifying Staff
    ///        Shop Team Leader   -> Technician, Certifying Staff, QA, ECAA
    ///        Special Team Leader-> Engineer
    ///
    ///  (2) THE "FYI" DELEGATION RULE IS NOW VISIBLE, NOT A LATE 422.
    ///      "Once the Manager role is created, the 'User Management' feature
    ///       should restrict creating users who belong to the department from
    ///       creating Shop Team Leaders or Shop Managers."
    ///      creation-rules now accepts ?departmentId= and REMOVES the delegated
    ///      roles from the payload, and returns the reason in `restrictions`.
    ///
    ///  (3) PRIVILEGE DELEGATION ("Directors ... can assign privileges to roles
    ///      such as edit, delete, etc.") actually works and cannot escalate.
    ///      PUT /api/users/{id}/permissions was Admin/Director only, ignored the
    ///      rules engine and expected a payload the amended UI never sends (the
    ///      UI posts the DIFF: permissionsToGrant / permissionsToRevoke).
    ///      v5 accepts BOTH shapes, validates every permission through
    ///      HierarchyRuleService.ValidatePermissionGrantAsync and lets every
    ///      privilege-grantor role (Admin, Director, Special TL, Manager, Shop
    ///      Manager, Shop Team Leader) adjust strictly-less-senior users only.
    ///
    ///  (4) LEGACY ROLE ROWS STAY VISIBLE. Role filters and supervisor lookups now
    ///      go through RoleHierarchy.PersistedVariants / the rules engine, so rows
    ///      persisted as "director", "team_leader" or "shop_tl" are still matched.
    ///      POST /api/users/normalize-roles repairs them permanently (Admin only).
    ///
    ///  (5) SHOP GROUP + WORKFLOW REACH ENDPOINTS.
    ///      GET /api/users/shop/{shopId}/leadership-group  - the Shop Manager sees
    ///        all Shop Team Leaders of a shop as one group with a shared scope.
    ///      GET /api/users/actionable?status=...&originatorUserId=... - every user
    ///        entitled to approve / reject / return a stage, which is what powers
    ///        the "Delegate to" dropdown of the Table of Contents forms.
    ///
    /// Everything v4 fixed is preserved: string ids + lenient parsing (no opaque
    /// 400 application/problem+json), 422 ValidationProblemDetails with
    /// lowerCamelCase field keys, scoped directory and append-only audit trail.
    /// ==============================================================
    /// </summary>
    [ApiController]
    [Route("api/self-evaluation/users")]
    [Authorize]
    public class UserManagementController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly PasswordService _passwordService;
        private readonly HierarchyRuleService _rules;

        public UserManagementController(
            ApplicationDbContext context,
            PasswordService passwordService,
            HierarchyRuleService rules)
        {
            _context = context;
            _passwordService = passwordService;
            _rules = rules;
        }

        #region Identity helpers

        private long GetCurrentUserId()
        {
            var claim = User.FindFirst(ClaimTypes.NameIdentifier) ?? User.FindFirst("sub");
            return long.TryParse(claim?.Value, out var id) ? id : 0;
        }

        private string CurrentActorName()
            => User.FindFirst("fullName")?.Value
            ?? User.FindFirst("FullName")?.Value
            ?? User.Identity?.Name
            ?? "system";

        /// <summary>
        /// Loads the signed-in user from the database. The DB row - not the JWT - is
        /// the authority for role, department, shop and supervisor chain.
        /// </summary>
        private async Task<User?> GetCurrentUserAsync()
        {
            var id = GetCurrentUserId();
            if (id == 0) return null;

            return await _context.Users
                .FirstOrDefaultAsync(u => u.Id == id && u.RecordStatus != RecordStatus.Deleted);
        }

        /// <summary>422 with field-level errors, the shape the amended UI consumes.</summary>
        private ObjectResult ValidationFailure(Dictionary<string, string[]> errors, string title)
        {
            var problem = new ValidationProblemDetails(errors)
            {
                Title = title,
                Status = StatusCodes.Status422UnprocessableEntity,
                Detail = "One or more fields are invalid. Fix the highlighted fields and submit again."
            };
            return StatusCode(StatusCodes.Status422UnprocessableEntity, problem);
        }

        private ObjectResult SingleFieldFailure(string field, string message, string? title = null)
            => ValidationFailure(
                new Dictionary<string, string[]> { [field] = new[] { message } },
                title ?? "Validation failed");

        private async Task WriteAuditAsync(WorkflowAction action, long targetUserId, string details)
        {
            _context.WorkflowAuditLogs.Add(new CMT.Domain.Models.SelfEvaluation.WorkflowAuditLog
            {
                Id = Guid.NewGuid(),
                Action = action.ToString(),
                WorkflowAction = action,
                EntityType = "User",
                EntityId = Guid.Empty,
                PerformedBy = $"{CurrentActorName()} (#{GetCurrentUserId()})",
                Details = Truncate($"UserId={targetUserId}; {details}", 2000),
                IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                Timestamp = DateTime.UtcNow
            });
            await Task.CompletedTask;
        }

        private static string Truncate(string value, int max)
            => string.IsNullOrEmpty(value) || value.Length <= max ? value : value[..max];

        #endregion

        #region GET endpoints

        /// <summary>
        /// Scoped user directory. Never returns users outside the caller's scope.
        /// GET /api/users?role=Engineer&amp;shopId=...&amp;departmentId=...&amp;isActive=true&amp;search=john&amp;page=1&amp;pageSize=50
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> GetUsers(
            [FromQuery] string? role = null,
            [FromQuery] string? shopId = null,
            [FromQuery] string? departmentId = null,
            [FromQuery] string? functionalUnit = null,
            [FromQuery] bool? isActive = null,
            [FromQuery] string? search = null,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 50,
            [FromQuery] bool managerPool = false)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 500) pageSize = 50;

            var visibleIds = await _rules.GetVisibleUserIdsAsync(currentUser);

            // Assignment handoff: Shop Team Leaders may route SB work to the central
            // Documentation Team, but those users do not belong to the STL's shop scope.
            // Expose only Documentation-unit roles for this narrowly scoped picker; the
            // workflow assign command remains the final authorization check.
            var currentRole = RoleHierarchy.Normalize(currentUser.Role);
            var mayRouteDocumentation =
                string.Equals(functionalUnit, FunctionalUnits.Documentation, StringComparison.OrdinalIgnoreCase)
                && currentRole is OrgRoles.TeamLeader or OrgRoles.ShopManager or OrgRoles.SpecialTeamLeader;
            var mayRouteCentralUnit = currentRole is OrgRoles.TeamLeader or OrgRoles.ShopManager
                or OrgRoles.SpecialTeamLeader or OrgRoles.HRManager
                or OrgRoles.DocumentationTeamLeader or OrgRoles.SpecialAdmin;
            if (mayRouteDocumentation || (mayRouteCentralUnit && !string.IsNullOrWhiteSpace(functionalUnit)))
            {
                var documentationRoles = RoleHierarchy.PersistedVariants(new[]
                {
                    OrgRoles.DocumentationTeamLeader,
                    OrgRoles.DocumentationClerk
                });
                var centralUnitRoles = string.Equals(functionalUnit, FunctionalUnits.HumanResources, StringComparison.OrdinalIgnoreCase)
                    ? RoleHierarchy.PersistedVariants(new[] { OrgRoles.HRSpecialist, OrgRoles.HRManager })
                    : documentationRoles;
                var documentationUsers = await _context.Users
                    .AsNoTracking()
                    .Where(u => u.RecordStatus != RecordStatus.Deleted
                             && centralUnitRoles.Contains(u.Role))
                    .Select(u => u.Id)
                    .ToListAsync();
                foreach (var id in documentationUsers) visibleIds.Add(id);
            }

            // AMENDED v5: alias-aware role filter, so rows stored as "director" or
            // "team_leader" are matched too.
            var canonicalRole = RoleHierarchy.Normalize(role);
            var isHrSpecialistPool = canonicalRole == OrgRoles.HRSpecialist
                && isActive == true;
            var isTrainingManagerPool = managerPool
                && canonicalRole == OrgRoles.Manager
                && (currentRole is OrgRoles.Admin or OrgRoles.SpecialAdmin);
            var managerRoleVariants = RoleHierarchy.PersistedVariants(new[] { OrgRoles.Manager });

            // Training verification Step 1 is a cross-shop handoff. The manager picker
            // may be used by the current workflow actor, so an explicit active Manager
            // query must not inherit the caller's normal shop or hierarchy-visible user set.
            var query = _context.Users
                .AsNoTracking()
                .Where(u => u.RecordStatus != RecordStatus.Deleted
                         && (isHrSpecialistPool || isTrainingManagerPool || visibleIds.Contains(u.Id)));

            if (managerPool)
            {
                // Training verification is a cross-shop handoff. Return active Manager
                // accounts only; do not inherit the caller's visibility, shop, department,
                // or functional-unit scope.
                if (isTrainingManagerPool)
                    query = query.Where(u => managerRoleVariants.Contains(u.Role) && u.IsActive);
                else
                    query = query.Where(u => false);
            }
            else if (canonicalRole is not null)
            {
                var variants = RoleHierarchy.PersistedVariants(canonicalRole);
                query = query.Where(u => variants.Contains(u.Role));
            }

            var shopFilter = isTrainingManagerPool ? null : IdParsing.ToGuid(shopId);
            if (shopFilter.HasValue)
                query = query.Where(u => u.ShopId == shopFilter.Value);

            var departmentFilter = isTrainingManagerPool ? null : IdParsing.ToGuid(departmentId);
            if (departmentFilter.HasValue)
                query = query.Where(u => u.DepartmentId == departmentFilter.Value);

            if (isActive.HasValue)
                query = query.Where(u => u.IsActive == isActive.Value);

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim().ToLower();
                query = query.Where(u =>
                    u.FullName.ToLower().Contains(term) ||
                    u.Username.ToLower().Contains(term) ||
                    u.Email.ToLower().Contains(term));
            }

            var totalCount = await query.CountAsync();

            var users = await query
                .OrderBy(u => u.FullName)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(u => new
                {
                    u.Id,
                    u.Username,
                    u.Email,
                    u.FullName,
                    u.Role,
                    u.ShopId,
                    u.DepartmentId,
                    u.JobTitle,
                    u.PersonnelType,
                    u.IsActive,
                    u.SupervisorUserId,
                    u.ManagerId,
                    u.AdditionalPermissions,
                    u.RevokedPermissions,
                    u.CreatedDate,
                    u.LastUpdateDate
                })
                .ToListAsync();

            return Ok(new
            {
                data = users,
                totalCount,
                page,
                pageSize,
                totalPages = (int)Math.Ceiling((double)totalCount / pageSize)
            });
        }

        /// <summary>
        /// AMENDED v5 - what the signed-in user may do, produced by the rules engine
        /// so the API and the UI can never drift apart.
        ///
        /// The response already applies:
        ///   - the creation matrix (Admin / Director / Manager / Shop Manager /
        ///     Shop Team Leader / Special Team Leader);
        ///   - the Admin-only rule for Director and Special Team Leader;
        ///   - the Manager delegation rule: once the department has an active
        ///     Manager, a department-level creator (Director) no longer receives
        ///     Shop Manager / Shop Team Leader, and `restrictions` explains why;
        ///   - the privileges the caller may grant or revoke.
        ///
        /// Pass ?departmentId= to evaluate the delegation rule against the
        /// department the "Create User" form has currently selected.
        /// GET /api/users/creation-rules?departmentId=...
        /// </summary>
        [HttpGet("creation-rules")]
        public async Task<IActionResult> GetCreationRules([FromQuery] string? departmentId = null)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            var scopeDepartmentId = IdParsing.ToGuid(departmentId);

            var info = await _rules.GetCreationRulesAsync(currentUser, scopeDepartmentId);

            var creatable = info.CreatableRoles.Select(r =>
            {
                var rule = RoleHierarchy.RuleFor(r.Role);
                return new
                {
                    role = r.Role,
                    displayName = r.DisplayName,
                    description = r.Description,
                    requiresDepartment = r.RequiresDepartment,
                    requiresShop = r.RequiresShop,
                    requiresSupervisor = r.RequiresSupervisor,
                    allowedSupervisorRoles = r.AllowedSupervisorRoles,
                    preferredSupervisorRoles = r.PreferredSupervisorRoles,
                    adminOnly = r.AdminOnly,
                    managerDelegated = r.ManagerDelegated,
                    isIndividualPersonnel = rule?.IsIndividualPersonnel ?? false,
                    sharesShopScope = rule?.SharesShopScope ?? false
                };
            }).ToList();

            return Ok(new
            {
                currentUserId = info.CurrentUserId,
                currentRole = info.CurrentRole,
                currentRoleDisplayName = info.CurrentRoleDisplayName,
                departmentId = info.DepartmentId,
                shopId = info.ShopId,
                scopeDepartmentId,
                departmentHasActiveManager = info.DepartmentHasActiveManager,
                canCreateUsers = creatable.Count > 0,
                canGrantPrivileges = RoleHierarchy.CanGrantPrivileges(info.CurrentRole),
                grantablePermissions = info.GrantablePermissions,
                restrictions = info.Restrictions,
                creatableRoles = creatable
            });
        }

        /// <summary>
        /// AMENDED v5 - candidate supervisors resolved by the rules engine, so legacy
        /// role spellings are found and the caller's scope is respected. This is what
        /// removes the "No eligible Director found" dead end.
        /// GET /api/users/supervisor-candidates?role=Engineer&amp;shopId=...&amp;departmentId=...
        /// </summary>
        [HttpGet("supervisor-candidates")]
        public async Task<IActionResult> GetSupervisorCandidates(
            [FromQuery] string? role = null,
            [FromQuery] string? shopId = null,
            [FromQuery] string? departmentId = null)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            var targetRole = RoleHierarchy.Normalize(role);
            if (targetRole is null)
                return SingleFieldFailure("role", "A valid role is required to resolve supervisor candidates.");

            var candidates = await _rules.GetSupervisorCandidatesAsync(
                currentUser,
                targetRole,
                IdParsing.ToGuid(shopId),
                IdParsing.ToGuid(departmentId));

            return Ok(candidates.Select(u => new
            {
                u.Id,
                u.FullName,
                u.Username,
                role = RoleHierarchy.Normalize(u.Role) ?? u.Role,
                roleDisplayName = RoleHierarchy.Label(u.Role),
                u.ShopId,
                u.DepartmentId,
                u.JobTitle
            }));
        }

        /// <summary>GET /api/users/me</summary>
        [HttpGet("me")]
        public async Task<IActionResult> GetCurrentUserProfile()
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            var chain = await _rules.GetSupervisorChainAsync(currentUser.Id);
            var canonicalRole = RoleHierarchy.Normalize(currentUser.Role);
            var creatable = RoleHierarchy.CreatableRoles(canonicalRole);

            return Ok(new
            {
                currentUser.Id,
                currentUser.Username,
                currentUser.Email,
                currentUser.FullName,
                role = canonicalRole ?? currentUser.Role,
                roleDisplayName = RoleHierarchy.Label(currentUser.Role),
                currentUser.ShopId,
                currentUser.DepartmentId,
                currentUser.JobTitle,
                currentUser.PersonnelType,
                currentUser.IsActive,
                currentUser.SupervisorUserId,
                currentUser.AdditionalPermissions,
                currentUser.RevokedPermissions,
                permissions = RoleHierarchy
                    .EffectivePermissions(currentUser.Role, currentUser.AdditionalPermissions, currentUser.RevokedPermissions)
                    .OrderBy(p => p)
                    .ToArray(),
                creatableRoles = creatable,
                // AMENDED v5: the flag the sidebar uses to show "User Management".
                canAccessUserManagement = creatable.Length > 0,
                canGrantPrivileges = RoleHierarchy.CanGrantPrivileges(canonicalRole),
                supervisorChain = chain.Select(s => new
                {
                    s.Id,
                    s.FullName,
                    role = RoleHierarchy.Normalize(s.Role) ?? s.Role,
                    roleDisplayName = RoleHierarchy.Label(s.Role)
                }).ToList()
            });
        }

        /// <summary>GET /api/users/{id}</summary>
        [HttpGet("{id:long}")]
        public async Task<IActionResult> GetUser(long id)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            var user = await _context.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.Id == id && u.RecordStatus != RecordStatus.Deleted);

            if (user is null) return NotFound(new { message = "User not found" });

            var visibleIds = await _rules.GetVisibleUserIdsAsync(currentUser);
            if (!visibleIds.Contains(user.Id))
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "This user is outside your scope" });

            return Ok(new
            {
                user.Id,
                user.Username,
                user.Email,
                user.FullName,
                user.Role,
                roleDisplayName = RoleHierarchy.Label(user.Role),
                user.ShopId,
                user.DepartmentId,
                user.JobTitle,
                user.PersonnelType,
                user.IsActive,
                user.SupervisorUserId,
                user.ManagerId,
                user.AdditionalPermissions,
                user.RevokedPermissions,
                effectivePermissions = RoleHierarchy
                    .EffectivePermissions(user.Role, user.AdditionalPermissions, user.RevokedPermissions)
                    .OrderBy(p => p)
                    .ToArray(),
                user.CreatedDate,
                user.LastUpdateDate,
                user.RegisteredBy
            });
        }

        /// <summary>
        /// Org chart for the caller's scope:
        /// Admin -> Director -> Manager / Special TL -> Shop Manager -> Shop TL -> personnel.
        /// GET /api/users/org-tree
        /// </summary>
        [HttpGet("org-tree")]
        public async Task<IActionResult> GetOrganizationalTree()
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            var visibleIds = await _rules.GetVisibleUserIdsAsync(currentUser);

            var users = await _context.Users
                .AsNoTracking()
                .Where(u => u.RecordStatus != RecordStatus.Deleted && visibleIds.Contains(u.Id))
                .Select(u => new
                {
                    u.Id,
                    u.FullName,
                    u.Username,
                    u.Role,
                    u.ShopId,
                    u.DepartmentId,
                    u.JobTitle,
                    u.PersonnelType,
                    u.IsActive,
                    u.SupervisorUserId
                })
                .ToListAsync();

            var shops = await _context.Shops
                .AsNoTracking()
                .Select(s => new { s.Id, s.Name })
                .ToListAsync();

            var departments = await _context.Departments
                .AsNoTracking()
                .Select(d => new { d.Id, d.Name, d.Code })
                .ToListAsync();

            var shopNames = shops.ToDictionary(s => s.Id, s => s.Name);
            var departmentNames = departments.ToDictionary(d => d.Id, d => d.Name);

            var childrenBySupervisor = users
                .Where(u => u.SupervisorUserId.HasValue)
                .GroupBy(u => u.SupervisorUserId!.Value)
                .ToDictionary(g => g.Key, g => g.ToList());

            var userIds = users.Select(u => u.Id).ToHashSet();

            // Roots: users whose supervisor is missing or outside the visible scope.
            var roots = users
                .Where(u => !u.SupervisorUserId.HasValue || !userIds.Contains(u.SupervisorUserId.Value))
                .OrderBy(u => RoleHierarchy.RankOf(u.Role))
                .ThenBy(u => u.FullName)
                .ToList();

            object BuildNode(dynamic u, int depth)
            {
                var canonical = RoleHierarchy.Normalize(u.Role);
                var children = childrenBySupervisor.TryGetValue((long)u.Id, out var list)
                    ? list.OrderBy(c => RoleHierarchy.RankOf(c.Role))
                          .ThenBy(c => c.FullName)
                          .Select(c => BuildNode(c, depth + 1))
                          .ToList()
                    : new List<object>();

                Guid? shopId = u.ShopId;
                Guid? departmentId = u.DepartmentId;

                return new
                {
                    id = (long)u.Id,
                    fullName = (string)u.FullName,
                    username = (string)u.Username,
                    role = canonical ?? (string)u.Role,
                    roleDisplayName = RoleHierarchy.Label((string)u.Role),
                    jobTitle = (string?)u.JobTitle,
                    personnelType = (string?)u.PersonnelType,
                    isActive = (bool)u.IsActive,
                    sharesShopScope = RoleHierarchy.SharesShopScope((string)u.Role),
                    isIndividualPersonnel = RoleHierarchy.IsIndividualPersonnel((string)u.Role),
                    shopId,
                    shopName = shopId.HasValue && shopNames.TryGetValue(shopId.Value, out var sn) ? sn : null,
                    departmentId,
                    departmentName = departmentId.HasValue && departmentNames.TryGetValue(departmentId.Value, out var dn) ? dn : null,
                    depth,
                    children
                };
            }

            var tree = roots.Select(r => BuildNode(r, 0)).ToList();

            // Shop Managers additionally get their Shop Team Leaders grouped by shop.
            var shopGroups = users
                .Where(u => RoleHierarchy.Normalize(u.Role) == OrgRoles.TeamLeader && u.ShopId.HasValue)
                .GroupBy(u => u.ShopId!.Value)
                .Select(g => new
                {
                    shopId = g.Key,
                    shopName = shopNames.TryGetValue(g.Key, out var name) ? name : g.Key.ToString(),
                    sharedDataScope = g.Count() > 1,
                    teamLeaders = g.OrderBy(u => u.FullName)
                                   .Select(u => new { u.Id, u.FullName, u.JobTitle, u.IsActive })
                                   .ToList()
                })
                .OrderBy(g => g.shopName)
                .ToList();

            return Ok(new { tree, shopGroups, totalVisibleUsers = users.Count });
        }

        /// <summary>GET /api/users/shop/{shopId}</summary>
        [HttpGet("shop/{shopId:guid}")]
        public async Task<IActionResult> GetUsersByShop(Guid shopId)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            var visibleIds = await _rules.GetVisibleUserIdsAsync(currentUser);

            var users = await _context.Users
                .AsNoTracking()
                .Where(u => u.ShopId == shopId
                         && u.RecordStatus != RecordStatus.Deleted
                         && visibleIds.Contains(u.Id))
                .OrderBy(u => u.Role).ThenBy(u => u.FullName)
                .Select(u => new
                {
                    u.Id, u.Username, u.Email, u.FullName, u.Role,
                    u.JobTitle, u.PersonnelType, u.IsActive, u.SupervisorUserId
                })
                .ToListAsync();

            return Ok(users);
        }

        /// <summary>
        /// AMENDED v5 - the leadership group of a shop.
        /// "Some shops may have more than one Shop Team Leader ... the Shop Manager
        ///  can view all Shop Team Leaders as a group" and "these leaders share
        ///  information and responsibilities for the shop".
        /// GET /api/users/shop/{shopId}/leadership-group
        /// </summary>
        [HttpGet("shop/{shopId:guid}/leadership-group")]
        public async Task<IActionResult> GetShopLeadershipGroup(Guid shopId)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            var members = await _rules.GetShopLeadershipGroupAsync(shopId);
            var visibleIds = await _rules.GetVisibleUserIdsAsync(currentUser);

            var scoped = members.Where(m => visibleIds.Contains(m.Id)).ToList();

            var shopManagers = scoped
                .Where(m => RoleHierarchy.Normalize(m.Role) == OrgRoles.ShopManager)
                .Select(m => new { m.Id, m.FullName, m.Username, m.JobTitle, m.IsActive })
                .ToList();

            var teamLeaders = scoped
                .Where(m => RoleHierarchy.Normalize(m.Role) == OrgRoles.TeamLeader)
                .Select(m => new { m.Id, m.FullName, m.Username, m.JobTitle, m.IsActive })
                .ToList();

            return Ok(new
            {
                shopId,
                shopManagers,
                teamLeaders,
                // Several Shop Team Leaders in one shop share the shop data scope.
                sharedDataScope = teamLeaders.Count > 1,
                totalMembers = scoped.Count
            });
        }

        /// <summary>GET /api/users/department/{departmentId}</summary>
        [HttpGet("department/{departmentId:guid}")]
        public async Task<IActionResult> GetUsersByDepartment(Guid departmentId)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            var visibleIds = await _rules.GetVisibleUserIdsAsync(currentUser);

            var users = await _context.Users
                .AsNoTracking()
                .Where(u => u.DepartmentId == departmentId
                         && u.RecordStatus != RecordStatus.Deleted
                         && visibleIds.Contains(u.Id))
                .OrderBy(u => u.Role).ThenBy(u => u.FullName)
                .Select(u => new
                {
                    u.Id, u.Username, u.Email, u.FullName, u.Role,
                    u.ShopId, u.JobTitle, u.PersonnelType, u.IsActive, u.SupervisorUserId
                })
                .ToListAsync();

            return Ok(new
            {
                departmentId,
                // The trigger of the "FYI" restriction, exposed for the UI.
                hasActiveManager = await _rules.DepartmentHasActiveManagerAsync(departmentId),
                users
            });
        }

        /// <summary>
        /// AMENDED v5 - every user entitled to act on a record sitting in
        /// <paramref name="status"/>. Powers the "Delegate to" dropdown and the
        /// workflow notifications, which is what guarantees the approval /
        /// rejection / delegation workflow REACHES all users created here.
        /// GET /api/users/actionable?status=PendingQAApproval&amp;originatorUserId=12
        /// </summary>
        [HttpGet("actionable")]
        public async Task<IActionResult> GetActionableUsers(
            [FromQuery] string? status = null,
            [FromQuery] string? originatorUserId = null)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            if (!Enum.TryParse<ApprovalStatus>(status, ignoreCase: true, out var approvalStatus))
                return SingleFieldFailure("status",
                    $"'{status}' is not a valid approval status. Valid values: {string.Join(", ", Enum.GetNames(typeof(ApprovalStatus)))}.");

            var originator = IdParsing.ToLong(originatorUserId) ?? currentUser.Id;

            var actionable = await _rules.GetActionableUsersAsync(originator, approvalStatus);
            var visibleIds = await _rules.GetVisibleUserIdsAsync(currentUser);
            var isAdmin = RoleHierarchy.Normalize(currentUser.Role) == OrgRoles.Admin;

            var stage = RoleHierarchy.StageOf(approvalStatus);

            return Ok(new
            {
                status = approvalStatus.ToString(),
                stageTitle = stage?.Title ?? "-",
                approverRoles = RoleHierarchy.ApproverRolesFor(approvalStatus),
                canActOnStage = await _rules.CanActOnAsync(currentUser, originator, approvalStatus),
                canDelegateStage = RoleHierarchy.CanDelegate(currentUser.Role, approvalStatus),
                candidates = actionable
                    .Where(u => isAdmin || visibleIds.Contains(u.Id))
                    .Select(u => new
                    {
                        u.Id,
                        u.FullName,
                        u.Username,
                        role = RoleHierarchy.Normalize(u.Role) ?? u.Role,
                        roleDisplayName = RoleHierarchy.Label(u.Role),
                        u.ShopId,
                        u.DepartmentId,
                        u.JobTitle
                    })
                    .ToList()
            });
        }

        /// <summary>
        /// Machine readable reference of roles, who-creates-whom, default permissions
        /// and approval routing. format=json (default) or format=csv.
        /// GET /api/users/role-reference?format=csv
        /// </summary>
        [HttpGet("role-reference")]
        public IActionResult GetRoleReference([FromQuery] string format = "json")
        {
            var roles = RoleHierarchy.AllRoles.Select(role =>
            {
                var rule = RoleHierarchy.RuleFor(role)!;
                return new
                {
                    role,
                    displayName = RoleHierarchy.Label(role),
                    description = rule.Description,
                    canCreate = RoleHierarchy.CreatableRoles(role),
                    adminOnly = rule.AdminOnly,
                    managerDelegated = rule.ManagerDelegated,
                    isIndividualPersonnel = rule.IsIndividualPersonnel,
                    sharesShopScope = rule.SharesShopScope,
                    requiresDepartment = rule.RequiresDepartment,
                    requiresShop = rule.RequiresShop,
                    requiresSupervisor = rule.RequiresSupervisor,
                    allowedSupervisorRoles = rule.AllowedSupervisorRoles,
                    canGrantPrivileges = RoleHierarchy.CanGrantPrivileges(role),
                    grantablePermissions = RoleHierarchy.GrantablePermissions(role),
                    defaultPermissions = RoleHierarchy.DefaultPermissions.TryGetValue(role, out var perms)
                        ? perms.OrderBy(p => p).ToArray()
                        : Array.Empty<string>()
                };
            }).ToList();

            var routing = RoleHierarchy.RoutingReference()
                .Select(r => new { status = r.Status, approvers = r.Approvers })
                .ToList();

            if (format.Equals("csv", StringComparison.OrdinalIgnoreCase))
            {
                var sb = new System.Text.StringBuilder();
                sb.AppendLine("Role,DisplayName,CanCreate,AdminOnly,ManagerDelegated,RequiresDepartment,RequiresShop,RequiresSupervisor,AllowedSupervisorRoles,DefaultPermissions");
                foreach (var r in roles)
                {
                    sb.AppendLine(string.Join(",", new[]
                    {
                        Csv(r.role),
                        Csv(r.displayName),
                        Csv(string.Join(" | ", r.canCreate)),
                        Csv(r.adminOnly.ToString()),
                        Csv(r.managerDelegated.ToString()),
                        Csv(r.requiresDepartment.ToString()),
                        Csv(r.requiresShop.ToString()),
                        Csv(r.requiresSupervisor.ToString()),
                        Csv(string.Join(" | ", r.allowedSupervisorRoles)),
                        Csv(string.Join(" | ", r.defaultPermissions))
                    }));
                }

                sb.AppendLine();
                sb.AppendLine("ApprovalStatus,Approvers");
                foreach (var r in routing)
                    sb.AppendLine($"{Csv(r.status)},{Csv(r.approvers)}");

                return File(System.Text.Encoding.UTF8.GetBytes(sb.ToString()),
                            "text/csv",
                            "role-permission-reference.csv");
            }

            return Ok(new
            {
                generatedAtUtc = DateTime.UtcNow,
                roles,
                approvalRouting = routing,
                allPermissions = RoleHierarchy.AllPermissions
            });

            static string Csv(string value)
                => value.Contains(',') || value.Contains('"')
                    ? $"\"{value.Replace("\"", "\"\"")}\""
                    : value;
        }

        #endregion

        #region POST endpoints

        /// <summary>
        /// Create a user. All ids arrive as strings and are parsed here, so the
        /// request can never fail framework model binding with an opaque 400.
        ///
        /// AMENDED v5: the creation matrix, the Admin-only rule and the Manager
        /// delegation rule are all enforced by HierarchyRuleService, so a Manager,
        /// Shop Manager or Shop Team Leader can create exactly the roles the
        /// specification allows and nothing else.
        /// POST /api/users
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest? request)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            if (request is null)
                return SingleFieldFailure("request", "A request body is required.");

            var errors = new Dictionary<string, List<string>>();

            void AddError(string field, string message)
            {
                if (!errors.TryGetValue(field, out var list))
                {
                    list = new List<string>();
                    errors[field] = list;
                }
                list.Add(message);
            }

            // ---- basic field validation ----
            var username = request.Username?.Trim() ?? string.Empty;
            var email = request.Email?.Trim() ?? string.Empty;
            var fullName = request.FullName?.Trim() ?? string.Empty;
            var password = request.Password ?? string.Empty;

            if (username.Length == 0) AddError("username", "Username is required.");
            else if (username.Length < 3) AddError("username", "Username must be at least 3 characters.");

            if (email.Length == 0) AddError("email", "Email is required.");
            else if (!email.Contains('@') || !email.Contains('.')) AddError("email", "Enter a valid email address.");

            if (fullName.Length == 0) AddError("fullName", "Full name is required.");
            if (password.Length == 0) AddError("password", "Password is required.");
            else if (password.Length < 6) AddError("password", "Password must be at least 6 characters.");

            if (string.IsNullOrWhiteSpace(request.Role))
                AddError("role", "Role is required.");

            // ---- lenient id parsing: "", "none", "0", "null" => not supplied ----
            var shopId = IdParsing.ToGuid(request.ShopId);
            if (IdParsing.IsSupplied(request.ShopId) && !shopId.HasValue)
                AddError("shopId", "The shop id is not a valid identifier.");

            var departmentId = IdParsing.ToGuid(request.DepartmentId);
            if (IdParsing.IsSupplied(request.DepartmentId) && !departmentId.HasValue)
                AddError("departmentId", "The department id is not a valid identifier.");

            var supervisorUserId = IdParsing.ToLong(request.SupervisorUserId);
            if (IdParsing.IsSupplied(request.SupervisorUserId) && !supervisorUserId.HasValue)
                AddError("supervisorUserId", "The supervisor id is not a valid identifier.");

            var managerId = IdParsing.ToLong(request.ManagerId);

            if (errors.Count > 0)
                return ValidationFailure(errors.ToDictionary(k => k.Key, v => v.Value.ToArray()), "Cannot create user");

            // ---- duplicates ----
            var usernameTaken = await _context.Users.AnyAsync(u =>
                u.Username.ToLower() == username.ToLower() && u.RecordStatus != RecordStatus.Deleted);
            if (usernameTaken)
                return SingleFieldFailure("username", $"Username '{username}' is already taken.", "Cannot create user");

            var emailTaken = await _context.Users.AnyAsync(u =>
                u.Email.ToLower() == email.ToLower() && u.RecordStatus != RecordStatus.Deleted);
            if (emailTaken)
                return SingleFieldFailure("email", $"Email '{email}' is already registered.", "Cannot create user");

            // ---- hierarchy + creation matrix + delegation rule (server authority) ----
            var ruleResult = await _rules.ValidateAsync(currentUser, new HierarchyRuleService.RuleRequest
            {
                Role = request.Role,
                DepartmentId = departmentId,
                ShopId = shopId,
                SupervisorUserId = supervisorUserId
            });

            if (!ruleResult.IsValid)
                return ValidationFailure(ruleResult.ToModelStateDictionary(), "Cannot create user");

            // ---- persist ----
            var actor = CurrentActorName();
            var user = new User
            {
                Username = username,
                Email = email.ToLower(),
                FullName = fullName,
                PasswordHash = _passwordService.HashPassword(password),
                Role = ruleResult.Role!,
                ShopId = ruleResult.ShopId,
                DepartmentId = ruleResult.DepartmentId,
                SupervisorUserId = ruleResult.Supervisor?.Id,
                ManagerId = managerId ?? ruleResult.Supervisor?.Id,
                JobTitle = string.IsNullOrWhiteSpace(request.JobTitle) ? null : request.JobTitle!.Trim(),
                PersonnelType = string.IsNullOrWhiteSpace(request.PersonnelType) ? null : request.PersonnelType!.Trim(),
                IsActive = true,
                RecordStatus = RecordStatus.Active,
                RegisteredBy = actor,
                CreatedDate = DateTime.UtcNow,
                LastUpdateDate = DateTime.UtcNow
            };

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            await WriteAuditAsync(WorkflowAction.Created, user.Id,
                $"Created {user.Role} '{user.FullName}' by {RoleHierarchy.Label(currentUser.Role)} " +
                $"(supervisor={user.SupervisorUserId?.ToString() ?? "none"}, " +
                $"department={user.DepartmentId?.ToString() ?? "none"}, shop={user.ShopId?.ToString() ?? "none"})");
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetUser), new { id = user.Id }, new
            {
                message = $"{RoleHierarchy.Label(user.Role)} '{user.FullName}' created successfully",
                userId = user.Id,
                username = user.Username,
                email = user.Email,
                fullName = user.FullName,
                role = user.Role,
                roleDisplayName = RoleHierarchy.Label(user.Role),
                shopId = user.ShopId,
                departmentId = user.DepartmentId,
                supervisorUserId = user.SupervisorUserId,
                // Explains every parent the server filled in automatically.
                resolutionNotes = ruleResult.ResolutionNotes
            });
        }

        /// <summary>
        /// Assign / change a role on an existing user. Same rules engine as create.
        /// POST /api/users/assign-role
        /// </summary>
        [HttpPost("assign-role")]
        public async Task<IActionResult> AssignRole([FromBody] AssignRoleRequest? request)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            if (request is null)
                return SingleFieldFailure("request", "A request body is required.");

            var userId = IdParsing.ToLong(request.UserId);
            if (!userId.HasValue || userId.Value <= 0)
                return SingleFieldFailure("userId", "Select a valid user.", "Cannot assign role");

            var user = await _context.Users
                .FirstOrDefaultAsync(u => u.Id == userId.Value && u.RecordStatus != RecordStatus.Deleted);
            if (user is null)
                return NotFound(new { message = "User not found" });

            if (!await _rules.CanManageUserAsync(currentUser, user))
                return StatusCode(StatusCodes.Status403Forbidden,
                    new { message = $"'{user.FullName}' is outside the part of the organisation you manage." });

            var shopId = IdParsing.ToGuid(request.ShopId) ?? user.ShopId;
            var departmentId = IdParsing.ToGuid(request.DepartmentId) ?? user.DepartmentId;
            var supervisorUserId = IdParsing.ToLong(request.SupervisorUserId) ?? user.SupervisorUserId;

            var ruleResult = await _rules.ValidateAsync(currentUser, new HierarchyRuleService.RuleRequest
            {
                Role = request.Role,
                DepartmentId = departmentId,
                ShopId = shopId,
                SupervisorUserId = supervisorUserId,
                TargetUserId = user.Id
            });

            if (!ruleResult.IsValid)
                return ValidationFailure(ruleResult.ToModelStateDictionary(), "Cannot assign role");

            var previousRole = user.Role;

            user.Role = ruleResult.Role!;
            user.ShopId = ruleResult.ShopId;
            user.DepartmentId = ruleResult.DepartmentId;
            user.SupervisorUserId = ruleResult.Supervisor?.Id;

            var managerId = IdParsing.ToLong(request.ManagerId);
            if (managerId.HasValue) user.ManagerId = managerId.Value;
            else if (ruleResult.Supervisor is not null) user.ManagerId = ruleResult.Supervisor.Id;

            if (!string.IsNullOrWhiteSpace(request.JobTitle)) user.JobTitle = request.JobTitle!.Trim();
            if (!string.IsNullOrWhiteSpace(request.PersonnelType)) user.PersonnelType = request.PersonnelType!.Trim();

            user.UpdateAudit(CurrentActorName());

            await WriteAuditAsync(WorkflowAction.Updated, user.Id,
                $"Role changed from '{previousRole}' to '{user.Role}'");

            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = $"'{user.FullName}' is now a {RoleHierarchy.Label(user.Role)}",
                userId = user.Id,
                previousRole,
                role = user.Role,
                roleDisplayName = RoleHierarchy.Label(user.Role),
                shopId = user.ShopId,
                departmentId = user.DepartmentId,
                supervisorUserId = user.SupervisorUserId,
                resolutionNotes = ruleResult.ResolutionNotes
            });
        }

        /// <summary>
        /// AMENDED v5 - one-shot repair of legacy role values ("director",
        /// "team_leader", "shop_tl" ...) so every hierarchy lookup finds them.
        /// Referenced by the error message of HierarchyRuleService.
        /// POST /api/users/normalize-roles
        /// </summary>
        [HttpPost("normalize-roles")]
        public async Task<IActionResult> NormalizeRoles()
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            if (RoleHierarchy.Normalize(currentUser.Role) != OrgRoles.Admin)
                return StatusCode(StatusCodes.Status403Forbidden,
                    new { message = "Only an Admin can normalise persisted role values." });

            var changed = await _rules.NormalizePersistedRolesAsync();
            await WriteAuditAsync(WorkflowAction.Updated, currentUser.Id,
                $"Normalised {changed} legacy role value(s) to their canonical form");
            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = changed == 0
                    ? "All role values are already canonical."
                    : $"{changed} role value(s) normalised successfully.",
                changed
            });
        }

        #endregion

        #region PUT endpoints

        /// <summary>PUT /api/users/{id}</summary>
        [HttpPut("{id:long}")]
        public async Task<IActionResult> UpdateUser(long id, [FromBody] UpdateUserRequest? request)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            if (request is null)
                return SingleFieldFailure("request", "A request body is required.");

            var user = await _context.Users
                .FirstOrDefaultAsync(u => u.Id == id && u.RecordStatus != RecordStatus.Deleted);
            if (user is null) return NotFound(new { message = "User not found" });

            var isSelf = currentUser.Id == id;
            if (!isSelf && !await _rules.CanManageUserAsync(currentUser, user))
                return StatusCode(StatusCodes.Status403Forbidden,
                    new { message = "You do not have permission to update this user." });

            if (!string.IsNullOrWhiteSpace(request.FullName))
                user.FullName = request.FullName!.Trim();

            if (!string.IsNullOrWhiteSpace(request.Email))
            {
                var email = request.Email!.Trim().ToLower();
                var taken = await _context.Users.AnyAsync(u =>
                    u.Id != id && u.Email.ToLower() == email && u.RecordStatus != RecordStatus.Deleted);
                if (taken)
                    return SingleFieldFailure("email", $"Email '{email}' is already registered by another user.", "Cannot update user");
                user.Email = email;
            }

            if (!string.IsNullOrWhiteSpace(request.Username))
            {
                var username = request.Username!.Trim();
                var taken = await _context.Users.AnyAsync(u =>
                    u.Id != id && u.Username.ToLower() == username.ToLower() && u.RecordStatus != RecordStatus.Deleted);
                if (taken)
                    return SingleFieldFailure("username", $"Username '{username}' is already taken.", "Cannot update user");
                user.Username = username;
            }

            // Re-validate the hierarchy whenever a structural field is touched.
            var structuralChange = IdParsing.IsSupplied(request.ShopId)
                                || IdParsing.IsSupplied(request.DepartmentId)
                                || IdParsing.IsSupplied(request.SupervisorUserId);

            if (structuralChange && !isSelf)
            {
                var shopId = IdParsing.IsSupplied(request.ShopId) ? IdParsing.ToGuid(request.ShopId) : user.ShopId;
                var departmentId = IdParsing.IsSupplied(request.DepartmentId) ? IdParsing.ToGuid(request.DepartmentId) : user.DepartmentId;
                var supervisorUserId = IdParsing.IsSupplied(request.SupervisorUserId) ? IdParsing.ToLong(request.SupervisorUserId) : user.SupervisorUserId;

                var ruleResult = await _rules.ValidateAsync(currentUser, new HierarchyRuleService.RuleRequest
                {
                    Role = user.Role,
                    DepartmentId = departmentId,
                    ShopId = shopId,
                    SupervisorUserId = supervisorUserId,
                    TargetUserId = user.Id
                });

                if (!ruleResult.IsValid)
                    return ValidationFailure(ruleResult.ToModelStateDictionary(), "Cannot update user");

                user.ShopId = ruleResult.ShopId;
                user.DepartmentId = ruleResult.DepartmentId;
                user.SupervisorUserId = ruleResult.Supervisor?.Id;
            }

            var managerId = IdParsing.ToLong(request.ManagerId);
            if (managerId.HasValue) user.ManagerId = managerId.Value == 0 ? null : managerId.Value;

            if (request.JobTitle is not null)
                user.JobTitle = string.IsNullOrWhiteSpace(request.JobTitle) ? null : request.JobTitle.Trim();

            if (request.PersonnelType is not null)
                user.PersonnelType = string.IsNullOrWhiteSpace(request.PersonnelType) ? null : request.PersonnelType.Trim();

            user.UpdateAudit(CurrentActorName());
            await WriteAuditAsync(WorkflowAction.Updated, user.Id, "Profile updated");
            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = "User updated successfully",
                userId = user.Id,
                username = user.Username,
                email = user.Email,
                fullName = user.FullName,
                role = user.Role,
                shopId = user.ShopId,
                departmentId = user.DepartmentId,
                supervisorUserId = user.SupervisorUserId
            });
        }

        /// <summary>
        /// AMENDED v5 - fine-grained privileges on top of the role defaults.
        ///
        /// Implements "Directors ... Can assign privileges to roles such as edit,
        /// delete, etc." for EVERY privilege-grantor role (Admin, Director, Special
        /// Team Leader, Manager, Shop Manager, Shop Team Leader) while making
        /// escalation impossible:
        ///   - the target must be inside the caller's scope;
        ///   - the target role must be strictly less senior (Admin bypasses);
        ///   - Director / Special Team Leader privileges are Admin-only;
        ///   - a grantor may only hand out permissions it holds itself.
        ///
        /// Accepts BOTH payload shapes:
        ///   { "permissionsToGrant": [...], "permissionsToRevoke": [...] }   (diff, used by the amended UI)
        ///   { "additionalPermissions": [...], "revokedPermissions": [...] } (absolute, legacy clients)
        /// PUT /api/users/{id}/permissions
        /// </summary>
        [HttpPut("{id:long}/permissions")]
        public async Task<IActionResult> UpdatePermissions(long id, [FromBody] UpdatePermissionsRequest? request)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            if (request is null)
                return SingleFieldFailure("request", "A request body is required.");

            var grantorRole = RoleHierarchy.Normalize(currentUser.Role);
            if (!RoleHierarchy.CanGrantPrivileges(grantorRole))
                return StatusCode(StatusCodes.Status403Forbidden, new
                {
                    message = $"A {RoleHierarchy.Label(currentUser.Role)} cannot assign privileges. " +
                              "Only Admin, Director, Special Team Leader, Manager, Shop Manager and Shop Team Leader may."
                });

            var user = await _context.Users
                .FirstOrDefaultAsync(u => u.Id == id && u.RecordStatus != RecordStatus.Deleted);
            if (user is null) return NotFound(new { message = "User not found" });

            // The amended UI posts the DIFF; legacy clients post absolute lists.
            var isDiffPayload = request.PermissionsToGrant is not null || request.PermissionsToRevoke is not null;

            var toGrant = isDiffPayload ? request.PermissionsToGrant : request.AdditionalPermissions;
            var toRevoke = isDiffPayload ? request.PermissionsToRevoke : request.RevokedPermissions;

            var grantResult = await _rules.ValidatePermissionGrantAsync(currentUser, user, toGrant, toRevoke);
            if (!grantResult.IsValid)
                return ValidationFailure(grantResult.ToModelStateDictionary(), "Cannot update privileges");

            // Both shapes are stored the same way: the diff against role defaults.
            user.AdditionalPermissions = grantResult.Granted.Count > 0
                ? string.Join(",", grantResult.Granted)
                : null;

            user.RevokedPermissions = grantResult.Revoked.Count > 0
                ? string.Join(",", grantResult.Revoked)
                : null;

            user.UpdateAudit(CurrentActorName());
            await WriteAuditAsync(WorkflowAction.Updated, user.Id,
                $"Privileges updated by {RoleHierarchy.Label(currentUser.Role)}: " +
                $"granted=[{user.AdditionalPermissions}], revoked=[{user.RevokedPermissions}]");
            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = $"Privileges updated successfully for '{user.FullName}'",
                userId = user.Id,
                role = user.Role,
                roleDisplayName = RoleHierarchy.Label(user.Role),
                additionalPermissions = user.AdditionalPermissions,
                revokedPermissions = user.RevokedPermissions,
                effectivePermissions = RoleHierarchy
                    .EffectivePermissions(user.Role, user.AdditionalPermissions, user.RevokedPermissions)
                    .OrderBy(p => p)
                    .ToArray()
            });
        }

        /// <summary>PUT /api/users/{id}/change-password</summary>
        [HttpPut("{id:long}/change-password")]
        public async Task<IActionResult> ChangePassword(long id, [FromBody] ChangePasswordRequest? request)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            if (request is null || string.IsNullOrWhiteSpace(request.NewPassword))
                return SingleFieldFailure("newPassword", "A new password is required.");

            if (request.NewPassword.Length < 6)
                return SingleFieldFailure("newPassword", "New password must be at least 6 characters.");

            var user = await _context.Users
                .FirstOrDefaultAsync(u => u.Id == id && u.RecordStatus != RecordStatus.Deleted);
            if (user is null) return NotFound(new { message = "User not found" });

            if (currentUser.Id == id)
            {
                if (string.IsNullOrWhiteSpace(request.CurrentPassword))
                    return SingleFieldFailure("currentPassword", "Enter your current password.");

                if (!_passwordService.VerifyPassword(request.CurrentPassword, user.PasswordHash))
                    return SingleFieldFailure("currentPassword", "Current password is incorrect.");
            }
            else if (!await _rules.CanManageUserAsync(currentUser, user))
            {
                return StatusCode(StatusCodes.Status403Forbidden,
                    new { message = "You do not have permission to reset this user's password." });
            }

            user.PasswordHash = _passwordService.HashPassword(request.NewPassword);
            user.RefreshToken = null;
            user.RefreshTokenExpiryTime = null;
            user.UpdateAudit(CurrentActorName());
            await WriteAuditAsync(WorkflowAction.Updated, user.Id, "Password changed");
            await _context.SaveChangesAsync();

            return Ok(new { message = "Password changed successfully" });
        }

        /// <summary>PUT /api/users/{id}/activate</summary>
        [HttpPut("{id:long}/activate")]
        public async Task<IActionResult> ActivateUser(long id)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            var user = await _context.Users
                .FirstOrDefaultAsync(u => u.Id == id && u.RecordStatus != RecordStatus.Deleted);
            if (user is null) return NotFound(new { message = "User not found" });

            if (!await _rules.CanManageUserAsync(currentUser, user))
                return StatusCode(StatusCodes.Status403Forbidden,
                    new { message = "You do not have permission to activate this user." });

            user.IsActive = true;
            user.RecordStatus = RecordStatus.Active;
            user.UpdateAudit(CurrentActorName());
            await WriteAuditAsync(WorkflowAction.Updated, user.Id, "Account activated");
            await _context.SaveChangesAsync();

            return Ok(new { message = $"'{user.FullName}' activated successfully", userId = user.Id });
        }

        /// <summary>PUT /api/users/{id}/deactivate</summary>
        [HttpPut("{id:long}/deactivate")]
        public async Task<IActionResult> DeactivateUser(long id)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            if (currentUser.Id == id)
                return SingleFieldFailure("userId", "You cannot deactivate your own account.");

            var user = await _context.Users
                .FirstOrDefaultAsync(u => u.Id == id && u.RecordStatus != RecordStatus.Deleted);
            if (user is null) return NotFound(new { message = "User not found" });

            if (!await _rules.CanManageUserAsync(currentUser, user))
                return StatusCode(StatusCodes.Status403Forbidden,
                    new { message = "You do not have permission to deactivate this user." });

            // Block orphaning an active subtree.
            var activeReports = await _context.Users.CountAsync(u =>
                u.SupervisorUserId == user.Id && u.IsActive && u.RecordStatus != RecordStatus.Deleted);

            if (activeReports > 0)
                return SingleFieldFailure("supervisorUserId",
                    $"'{user.FullName}' still has {activeReports} active direct report(s). Reassign them first.",
                    "Cannot deactivate user");

            user.IsActive = false;
            user.RecordStatus = RecordStatus.Inactive;
            user.RefreshToken = null;
            user.RefreshTokenExpiryTime = null;
            user.UpdateAudit(CurrentActorName());
            await WriteAuditAsync(WorkflowAction.Updated, user.Id, "Account deactivated");
            await _context.SaveChangesAsync();

            return Ok(new { message = $"'{user.FullName}' deactivated successfully", userId = user.Id });
        }

        #endregion

        #region DELETE endpoints

        /// <summary>DELETE /api/users/{id} - soft delete, Admin only.</summary>
        [HttpDelete("{id:long}")]
        public async Task<IActionResult> DeleteUser(long id)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            if (RoleHierarchy.Normalize(currentUser.Role) != OrgRoles.Admin)
                return StatusCode(StatusCodes.Status403Forbidden,
                    new { message = "Only administrators can delete user accounts." });

            if (currentUser.Id == id)
                return SingleFieldFailure("userId", "You cannot delete your own account.");

            var user = await _context.Users
                .FirstOrDefaultAsync(u => u.Id == id && u.RecordStatus != RecordStatus.Deleted);
            if (user is null) return NotFound(new { message = "User not found" });

            var activeReports = await _context.Users.CountAsync(u =>
                u.SupervisorUserId == user.Id && u.IsActive && u.RecordStatus != RecordStatus.Deleted);

            if (activeReports > 0)
                return SingleFieldFailure("supervisorUserId",
                    $"'{user.FullName}' still has {activeReports} active direct report(s). Reassign them first.",
                    "Cannot delete user");

            user.RecordStatus = RecordStatus.Deleted;
            user.IsActive = false;
            user.RefreshToken = null;
            user.RefreshTokenExpiryTime = null;
            user.UpdateAudit(CurrentActorName());
            await WriteAuditAsync(WorkflowAction.Archived, user.Id, "Account deleted (soft)");
            await _context.SaveChangesAsync();

            return Ok(new { message = $"'{user.FullName}' deleted successfully", userId = user.Id });
        }

        #endregion
    }

    // ===================== ID PARSING =====================

    /// <summary>
    /// Lenient id parsing (unchanged since v4).
    ///
    /// The frontend legitimately sends "", "none", "0", null, "null" or a real id.
    /// Binding those straight into Guid? / long? is what produced the opaque
    /// 400 application/problem+json. Every DTO id is a string and goes through
    /// these helpers instead.
    /// </summary>
    internal static class IdParsing
    {
        private static readonly string[] Empty = { "", "none", "null", "undefined", "0", "0000", "-" };

        /// <summary>False for values that mean "not supplied".</summary>
        public static bool IsSupplied(string? raw)
            => !string.IsNullOrWhiteSpace(raw)
            && !Empty.Contains(raw.Trim(), StringComparer.OrdinalIgnoreCase)
            && raw.Trim() != Guid.Empty.ToString();

        /// <summary>Parses a Guid, returning null for "not supplied" and for garbage.</summary>
        public static Guid? ToGuid(string? raw)
        {
            if (!IsSupplied(raw)) return null;
            return Guid.TryParse(raw!.Trim(), out var value) && value != Guid.Empty ? value : null;
        }

        /// <summary>Parses a long, returning null for "not supplied" and for garbage.</summary>
        public static long? ToLong(string? raw)
        {
            if (!IsSupplied(raw)) return null;
            return long.TryParse(raw!.Trim(), out var value) && value > 0 ? value : null;
        }
    }

    // ===================== REQUEST DTOs =====================
    // Every id is a string on purpose: it makes framework model binding
    // impossible to fail, so validation errors are always OUR field-level 422.

    public class CreateUserRequest
    {
        public string? Username { get; set; }
        public string? Email { get; set; }
        public string? FullName { get; set; }
        public string? Password { get; set; }
        public string? Role { get; set; }

        [JsonConverter(typeof(FlexibleStringConverter))]
        public string? ShopId { get; set; }

        [JsonConverter(typeof(FlexibleStringConverter))]
        public string? DepartmentId { get; set; }

        [JsonConverter(typeof(FlexibleStringConverter))]
        public string? ManagerId { get; set; }

        [JsonConverter(typeof(FlexibleStringConverter))]
        public string? SupervisorUserId { get; set; }

        public string? JobTitle { get; set; }
        public string? PersonnelType { get; set; }
    }

    public class AssignRoleRequest
    {
        [JsonConverter(typeof(FlexibleStringConverter))]
        public string? UserId { get; set; }

        public string? Role { get; set; }

        [JsonConverter(typeof(FlexibleStringConverter))]
        public string? ShopId { get; set; }

        [JsonConverter(typeof(FlexibleStringConverter))]
        public string? DepartmentId { get; set; }

        [JsonConverter(typeof(FlexibleStringConverter))]
        public string? SupervisorUserId { get; set; }

        [JsonConverter(typeof(FlexibleStringConverter))]
        public string? ManagerId { get; set; }

        public string? JobTitle { get; set; }
        public string? PersonnelType { get; set; }
    }

    public class UpdateUserRequest
    {
        public string? Username { get; set; }
        public string? Email { get; set; }
        public string? FullName { get; set; }

        [JsonConverter(typeof(FlexibleStringConverter))]
        public string? ShopId { get; set; }

        [JsonConverter(typeof(FlexibleStringConverter))]
        public string? DepartmentId { get; set; }

        [JsonConverter(typeof(FlexibleStringConverter))]
        public string? SupervisorUserId { get; set; }

        [JsonConverter(typeof(FlexibleStringConverter))]
        public string? ManagerId { get; set; }

        public string? JobTitle { get; set; }
        public string? PersonnelType { get; set; }
    }

    /// <summary>
    /// AMENDED v5 - accepts both the diff payload posted by the amended
    /// Privileges dialog and the absolute payload of legacy clients.
    /// </summary>
    public class UpdatePermissionsRequest
    {
        /// <summary>Diff payload: privileges to add on top of the role defaults.</summary>
        public List<string>? PermissionsToGrant { get; set; }

        /// <summary>Diff payload: privileges to remove from the role defaults.</summary>
        public List<string>? PermissionsToRevoke { get; set; }

        /// <summary>Legacy absolute payload (same meaning as PermissionsToGrant).</summary>
        public List<string>? AdditionalPermissions { get; set; }

        /// <summary>Legacy absolute payload (same meaning as PermissionsToRevoke).</summary>
        public List<string>? RevokedPermissions { get; set; }
    }

    public class ChangePasswordRequest
    {
        public string? CurrentPassword { get; set; }
        public string NewPassword { get; set; } = string.Empty;
    }

    /// <summary>
    /// Accepts a JSON string, number, boolean or null for a string property.
    /// Last line of defence: even if the UI posts "supervisorUserId": 2 (a number)
    /// instead of "2", binding still succeeds.
    /// </summary>
    public class FlexibleStringConverter : JsonConverter<string?>
    {
        public override string? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            switch (reader.TokenType)
            {
                case JsonTokenType.Null:
                    return null;
                case JsonTokenType.String:
                    return reader.GetString();
                case JsonTokenType.Number:
                    if (reader.TryGetInt64(out var l)) return l.ToString();
                    if (reader.TryGetDouble(out var d)) return d.ToString(System.Globalization.CultureInfo.InvariantCulture);
                    return null;
                case JsonTokenType.True:
                    return "true";
                case JsonTokenType.False:
                    return "false";
                default:
                    reader.Skip();
                    return null;
            }
        }

        public override void Write(Utf8JsonWriter writer, string? value, JsonSerializerOptions options)
        {
            if (value is null) writer.WriteNullValue();
            else writer.WriteStringValue(value);
        }
    }
}