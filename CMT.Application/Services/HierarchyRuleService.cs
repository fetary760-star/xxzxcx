using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.Shared;

namespace CMT.Application.SelfEvaluation.Services
{
    /// <summary>
    /// AMENDED v7 - server side role hierarchy, creation rules and privilege engine.
    ///
    /// ==================== WHY v5/v6 OF THIS FILE WAS INCOMPLETE ====================
    /// RoleHierarchy.cs had already moved to v6/v7 (Admin-only roles, Manager-owned
    /// shop layer, privilege delegation) while THIS service was still the v5 engine.
    /// Consequences in the running system:
    ///
    ///  (a) The FYI requirement was not enforced anywhere:
    ///      "Once the Manager role is created, the 'User Management' feature should
    ///       restrict creating users who belong to the department from creating
    ///       Shop Team Leaders or Shop Managers."
    ///      A Director could still create Shop Managers / Shop Team Leaders after the
    ///      department got its Manager, bypassing the Manager layer.
    ///      FIX: DepartmentHasActiveManagerAsync + step 2b of ValidateAsync, and
    ///      GetCreationRulesAsync which REMOVES the blocked roles from
    ///      GET /api/users/creation-rules so the dropdown never offers them.
    ///
    ///  (b) "Directors ... can assign privileges to roles such as edit, delete" had
    ///      no server guard: PUT /api/users/{id}/permissions accepted any permission
    ///      for any user, which allowed privilege escalation.
    ///      FIX: ValidatePermissionGrantAsync.
    ///
    ///  (c) "If multiple Shop Team Leaders exist in a single shop, the Shop Manager
    ///      can view all Shop Team Leaders as a group" was only implicit.
    ///      FIX: GetShopLeadershipGroupAsync + shared shop scope in
    ///      GetVisibleUserIdsAsync driven by RoleHierarchy.SharesShopScope.
    ///
    ///  (d) The workflow could not tell a caller WHY it may not act on a form.
    ///      FIX: CanActOnAsync / CanDelegateAsync / GetActionableUserIdsAsync, so
    ///      approve / reject / delegate / edit reach exactly the users created
    ///      through the hierarchy.
    ///
    /// Everything v5 fixed is preserved: alias-aware lookups through
    /// RoleHierarchy.PersistedVariants (legacy "director" / "team_leader" rows stay
    /// visible), auto-resolved supervisors that remove the bootstrap deadlock, and
    /// department / shop inheritance with actionable messages.
    /// =============================================================================
    /// </summary>
    public class HierarchyRuleService
    {
        private readonly ApplicationDbContext _context;

        public HierarchyRuleService(ApplicationDbContext context)
        {
            _context = context;
        }

        /// <summary>
        /// Result of a rule evaluation. Errors are keyed by the request field name so
        /// the frontend can attach them to the right input.
        /// </summary>
        public sealed class RuleResult
        {
            public Dictionary<string, List<string>> Errors { get; } = new();

            public bool IsValid => Errors.Count == 0;

            /// <summary>Canonical role resolved from the request.</summary>
            public string? Role { get; set; }

            /// <summary>Resolved supervisor (null when the role does not need one).</summary>
            public User? Supervisor { get; set; }

            /// <summary>Department the new/updated user finally belongs to.</summary>
            public Guid? DepartmentId { get; set; }

            /// <summary>Shop the new/updated user finally belongs to.</summary>
            public Guid? ShopId { get; set; }

            /// <summary>Log of every value the server filled in automatically.</summary>
            public List<string> ResolutionNotes { get; } = new();

            public void Add(string field, string message)
            {
                if (!Errors.TryGetValue(field, out var list))
                {
                    list = new List<string>();
                    Errors[field] = list;
                }
                if (!list.Contains(message)) list.Add(message);
            }

            public void Note(string message)
            {
                if (!ResolutionNotes.Contains(message)) ResolutionNotes.Add(message);
            }

            /// <summary>Shape consumed by ASP.NET ValidationProblemDetails.</summary>
            public Dictionary<string, string[]> ToModelStateDictionary()
                => Errors.ToDictionary(kv => kv.Key, kv => kv.Value.ToArray());
        }

        /// <summary>Input for the rules engine, already parsed by the controller.</summary>
        public sealed class RuleRequest
        {
            public string? Role { get; set; }
            public Guid? DepartmentId { get; set; }
            public Guid? ShopId { get; set; }
            public long? SupervisorUserId { get; set; }

            /// <summary>Id of the user being edited, so self-supervision is blocked.</summary>
            public long? TargetUserId { get; set; }

            /// <summary>
            /// When true (default) the server fills in a missing supervisor /
            /// department / shop instead of rejecting the request.
            /// </summary>
            public bool AutoResolveParents { get; set; } = true;
        }

        /// <summary>AMENDED v7 - one creatable role, already filtered by the delegation rule.</summary>
        public sealed class CreatableRoleInfo
        {
            public string Role { get; init; } = string.Empty;
            public string DisplayName { get; init; } = string.Empty;
            public string Description { get; init; } = string.Empty;
            public bool RequiresDepartment { get; init; }
            public bool RequiresShop { get; init; }
            public bool RequiresSupervisor { get; init; }
            public string[] AllowedSupervisorRoles { get; init; } = Array.Empty<string>();
            public string[] PreferredSupervisorRoles { get; init; } = Array.Empty<string>();
            public bool AdminOnly { get; init; }
            public bool ManagerDelegated { get; init; }
        }

        /// <summary>AMENDED v7 - payload of GET /api/users/creation-rules.</summary>
        public sealed class CreationRulesInfo
        {
            public long CurrentUserId { get; init; }
            public string CurrentRole { get; init; } = string.Empty;
            public string CurrentRoleDisplayName { get; init; } = string.Empty;
            public Guid? DepartmentId { get; init; }
            public Guid? ShopId { get; init; }
            public bool DepartmentHasActiveManager { get; init; }
            public List<CreatableRoleInfo> CreatableRoles { get; init; } = new();

            /// <summary>Roles hidden by the Manager delegation rule, with the reason.</summary>
            public List<string> Restrictions { get; init; } = new();

            /// <summary>Permissions this caller may grant or revoke.</summary>
            public string[] GrantablePermissions { get; init; } = Array.Empty<string>();
        }

        /// <summary>AMENDED v7 - result of a privilege grant / revoke validation.</summary>
        public sealed class PermissionGrantResult
        {
            public Dictionary<string, List<string>> Errors { get; } = new();
            public bool IsValid => Errors.Count == 0;

            /// <summary>Permissions accepted for granting.</summary>
            public List<string> Granted { get; } = new();

            /// <summary>Permissions accepted for revoking.</summary>
            public List<string> Revoked { get; } = new();

            public void Add(string field, string message)
            {
                if (!Errors.TryGetValue(field, out var list))
                {
                    list = new List<string>();
                    Errors[field] = list;
                }
                if (!list.Contains(message)) list.Add(message);
            }

            public Dictionary<string, string[]> ToModelStateDictionary()
                => Errors.ToDictionary(kv => kv.Key, kv => kv.Value.ToArray());
        }

        // ==================== CREATION / ROLE CHANGE VALIDATION ====================

        /// <summary>
        /// Validates a create / role-change request against the creation matrix, the
        /// Admin-only rule, the Manager delegation rule and the structural rules of
        /// the target role, auto-resolving missing parents.
        /// </summary>
        public async Task<RuleResult> ValidateAsync(
            User currentUser,
            RuleRequest request,
            CancellationToken cancellationToken = default)
        {
            var result = new RuleResult();

            // ---------- 1. Role must be a known canonical role ----------
            var targetRole = RoleHierarchy.Normalize(request.Role);
            if (targetRole is null)
            {
                result.Add("role",
                    $"'{request.Role}' is not a valid role. Valid roles: {string.Join(", ", RoleHierarchy.AllRoles)}.");
                return result;
            }
            result.Role = targetRole;

            var creatorRole = RoleHierarchy.Normalize(currentUser.Role);
            if (creatorRole is null)
            {
                result.Add("role",
                    $"Your account role '{currentUser.Role}' is not recognised. Ask an Admin to run " +
                    "POST /api/users/normalize-roles so legacy role values become canonical ones.");
                return result;
            }

            var isAdmin = creatorRole == OrgRoles.Admin;

            // ---------- 2. Creation matrix (includes the Admin-only rule) ----------
            if (!RoleHierarchy.CanCreate(creatorRole, targetRole))
            {
                if (RoleHierarchy.IsAdminOnly(targetRole) && !isAdmin)
                {
                    result.Add("role",
                        $"A {RoleHierarchy.Label(targetRole)} can only be assigned by the Admin. " +
                        (targetRole == OrgRoles.SpecialTeamLeader
                            ? "Ask the Admin to create the Special Team Leader under the Director; it can then create Engineers."
                            : targetRole == OrgRoles.SpecialAdmin
                                ? "Ask the Admin to create the Special Admin for the Training Documents approval workflow."
                                : "Ask the Admin to create the Director for this department."));
                    return result;
                }

                var allowed = RoleHierarchy.CreatableRoles(creatorRole);
                var allowedText = allowed.Length == 0
                    ? "your role cannot create any user role"
                    : $"you may only create: {string.Join(", ", allowed.Select(RoleHierarchy.Label))}";

                result.Add("role",
                    $"A {RoleHierarchy.Label(creatorRole)} cannot create a {RoleHierarchy.Label(targetRole)} - {allowedText}.");
                return result;
            }

            var rule = RoleHierarchy.RuleFor(targetRole)!;

            // ---------- 2b. AMENDED v7: the Manager owns the shop layer ----------
            // "Once the Manager role is created, the 'User Management' feature should
            //  restrict creating users who belong to the department from creating
            //  Shop Team Leaders or Shop Managers."
            if (RoleHierarchy.IsDepartmentLevel(creatorRole) && RoleHierarchy.IsManagerDelegated(targetRole))
            {
                var scopeDepartmentId = request.DepartmentId ?? currentUser.DepartmentId;
                var managerName = await GetActiveManagerNameAsync(scopeDepartmentId, cancellationToken);

                if (RoleHierarchy.IsBlockedByManagerDelegation(creatorRole, targetRole, managerName is not null))
                {
                    result.Add("role",
                        $"This department already has an active Manager ('{managerName}'). " +
                        $"The shop layer is delegated to the Manager, so a {RoleHierarchy.Label(creatorRole)} " +
                        $"may no longer create a {RoleHierarchy.Label(targetRole)}. " +
                        "Ask that Manager to create it.");
                    return result;
                }
            }

            // ---------- 3. Explicit supervisor, when supplied ----------
            User? supervisor = null;
            var supervisorRejected = false;

            if (request.SupervisorUserId.HasValue && request.SupervisorUserId.Value > 0)
            {
                if (request.TargetUserId.HasValue && request.TargetUserId.Value == request.SupervisorUserId.Value)
                {
                    result.Add("supervisorUserId", "A user cannot report to themselves.");
                    supervisorRejected = true;
                }
                else
                {
                    supervisor = await _context.Users
                        .AsNoTracking()
                        .FirstOrDefaultAsync(u => u.Id == request.SupervisorUserId.Value
                                               && u.RecordStatus != RecordStatus.Deleted,
                                            cancellationToken);

                    if (supervisor is null)
                    {
                        result.Add("supervisorUserId", "The selected supervisor does not exist.");
                        supervisorRejected = true;
                    }
                    else if (!supervisor.IsActive)
                    {
                        result.Add("supervisorUserId", $"'{supervisor.FullName}' is inactive and cannot be a supervisor.");
                        supervisor = null;
                        supervisorRejected = true;
                    }
                    else if (!RoleHierarchy.CanSupervise(supervisor.Role, targetRole))
                    {
                        var expected = rule.AllowedSupervisorRoles.Select(RoleHierarchy.Label).ToArray();
                        result.Add("supervisorUserId",
                            $"A {RoleHierarchy.Label(targetRole)} must report to a {string.Join(" or ", expected)}, " +
                            $"but '{supervisor.FullName}' is a {RoleHierarchy.Label(supervisor.Role)}.");
                        supervisor = null;
                        supervisorRejected = true;
                    }
                }
            }

            // ---------- 4. Auto-resolve the supervisor (bootstrap dead-end killer) ----------
            if (supervisor is null && !supervisorRejected && request.AutoResolveParents)
            {
                supervisor = await AutoResolveSupervisorAsync(
                    currentUser, creatorRole, targetRole, rule,
                    request.DepartmentId, request.ShopId, request.TargetUserId,
                    cancellationToken);

                if (supervisor is not null)
                {
                    result.Note(
                        $"Reporting line resolved automatically: {RoleHierarchy.Label(targetRole)} reports to " +
                        $"'{supervisor.FullName}' ({RoleHierarchy.Label(supervisor.Role)}).");
                }
            }

            if (rule.RequiresSupervisor && supervisor is null && !result.Errors.ContainsKey("supervisorUserId"))
            {
                var expected = rule.AllowedSupervisorRoles.Select(RoleHierarchy.Label).ToArray();
                result.Add("supervisorUserId",
                    $"A {RoleHierarchy.Label(targetRole)} must be assigned under a {string.Join(" or ", expected)}. " +
                    (isAdmin
                        ? "Create that parent first, or use POST /api/users/quick-start to create a Department plus its Director in one step."
                        : "Ask your Admin to create that parent first."));
            }

            result.Supervisor = supervisor;

            // ---------- 5. Department resolution ----------
            var departmentId = request.DepartmentId;

            if (departmentId.HasValue)
            {
                var departmentExists = await _context.Departments
                    .AsNoTracking()
                    .AnyAsync(d => d.Id == departmentId.Value && d.IsActive, cancellationToken);

                if (!departmentExists)
                {
                    result.Add("departmentId", "The selected department does not exist or is inactive.");
                    departmentId = null;
                }
            }

            if (!departmentId.HasValue && request.AutoResolveParents)
            {
                if (supervisor?.DepartmentId is not null)
                {
                    departmentId = supervisor.DepartmentId;
                    result.Note($"Department inherited from the supervisor '{supervisor.FullName}'.");
                }
                else if (currentUser.DepartmentId is not null && !isAdmin)
                {
                    departmentId = currentUser.DepartmentId;
                    result.Note("Department inherited from your own account.");
                }
                else if (rule.RequiresDepartment)
                {
                    var activeDepartments = await _context.Departments
                        .AsNoTracking()
                        .Where(d => d.IsActive)
                        .OrderBy(d => d.Name)
                        .Select(d => new { d.Id, d.Name })
                        .Take(2)
                        .ToListAsync(cancellationToken);

                    if (activeDepartments.Count == 1)
                    {
                        departmentId = activeDepartments[0].Id;
                        result.Note($"Department resolved to the only active department '{activeDepartments[0].Name}'.");
                    }
                }
            }

            if (rule.RequiresDepartment && !departmentId.HasValue && !result.Errors.ContainsKey("departmentId"))
            {
                var anyDepartment = await _context.Departments
                    .AsNoTracking()
                    .AnyAsync(d => d.IsActive, cancellationToken);

                result.Add("departmentId", anyDepartment
                    ? $"A {RoleHierarchy.Label(targetRole)} must be assigned to a department. Pick one in the Department field."
                    : "No department exists yet. Create a department first (Administration Panel -> Departments), then create this role.");
            }

            // A Director owns exactly one department.
            if (targetRole == OrgRoles.Director && departmentId.HasValue)
            {
                var directorVariants = RoleHierarchy.PersistedVariants(OrgRoles.Director);

                var conflictingDirector = await _context.Users
                    .AsNoTracking()
                    .Where(u => directorVariants.Contains(u.Role)
                             && u.DepartmentId == departmentId.Value
                             && u.IsActive
                             && u.RecordStatus != RecordStatus.Deleted)
                    .Where(u => !request.TargetUserId.HasValue || u.Id != request.TargetUserId.Value)
                    .Select(u => u.FullName)
                    .FirstOrDefaultAsync(cancellationToken);

                if (conflictingDirector is not null)
                {
                    result.Add("departmentId",
                        $"This department already has an active Director ('{conflictingDirector}'). " +
                        "Pick another department, or deactivate / reassign that Director first.");
                }
            }

            // AMENDED v7: re-check the delegation rule against the FINAL department,
            // because it may have been inherited only in step 5.
            if (RoleHierarchy.IsDepartmentLevel(creatorRole)
                && RoleHierarchy.IsManagerDelegated(targetRole)
                && departmentId.HasValue
                && !result.Errors.ContainsKey("role"))
            {
                var managerName = await GetActiveManagerNameAsync(departmentId, cancellationToken);
                if (managerName is not null)
                {
                    result.Add("role",
                        $"Department Manager '{managerName}' owns the shop layer of this department, " +
                        $"so a {RoleHierarchy.Label(creatorRole)} may not create a {RoleHierarchy.Label(targetRole)} here.");
                }
            }

            result.DepartmentId = departmentId;

            // ---------- 6. Shop resolution ----------
            var shopId = request.ShopId;

            if (shopId.HasValue)
            {
                var shopExists = await _context.Shops
                    .AsNoTracking()
                    .AnyAsync(s => s.Id == shopId.Value && s.IsActive, cancellationToken);

                if (!shopExists)
                {
                    result.Add("shopId", "The selected shop does not exist or is inactive.");
                    shopId = null;
                }
            }

            if (!shopId.HasValue && rule.RequiresShop && request.AutoResolveParents)
            {
                if (supervisor?.ShopId is not null)
                {
                    shopId = supervisor.ShopId;
                    result.Note($"Shop inherited from the supervisor '{supervisor.FullName}'.");
                }
                else if (currentUser.ShopId is not null)
                {
                    shopId = currentUser.ShopId;
                    result.Note("Shop inherited from your own account.");
                }
            }

            if (rule.RequiresShop && !shopId.HasValue && !result.Errors.ContainsKey("shopId"))
            {
                var anyShop = await _context.Shops.AsNoTracking().AnyAsync(s => s.IsActive, cancellationToken);

                result.Add("shopId", anyShop
                    ? $"A {RoleHierarchy.Label(targetRole)} must be assigned to a shop. Pick one in the Assigned Shop field."
                    : "No shop exists yet. Create a shop first (Administration Panel -> Shop Management), then create this role.");
            }

            // Shop personnel must sit in the same shop as their shop-scoped supervisor.
            if (rule.RequiresShop && shopId.HasValue && supervisor?.ShopId is not null && supervisor.ShopId != shopId)
            {
                var supervisorRole = RoleHierarchy.Normalize(supervisor.Role);
                var supervisorIsAboveShopLevel =
                    supervisorRole == OrgRoles.Admin ||
                    supervisorRole == OrgRoles.Director ||
                    supervisorRole == OrgRoles.Manager;

                if (!supervisorIsAboveShopLevel)
                {
                    result.Add("shopId",
                        $"'{supervisor.FullName}' manages a different shop. " +
                        "Pick the same shop, or choose a supervisor from this shop.");
                }
            }

            result.ShopId = shopId;

            // ---------- 7. Special Team Leader must hang under a Director (or the Admin) ----------
            if (targetRole == OrgRoles.SpecialTeamLeader && supervisor is not null)
            {
                var supervisorRole = RoleHierarchy.Normalize(supervisor.Role);
                if (supervisorRole != OrgRoles.Director && supervisorRole != OrgRoles.Admin)
                {
                    result.Add("supervisorUserId",
                        "A Special Team Leader can only be created under a Director (or directly under the Admin).");
                }
            }

            // ---------- 8. Only the Admin may attach users directly to the Admin ----------
            if (supervisor is not null
                && RoleHierarchy.Normalize(supervisor.Role) == OrgRoles.Admin
                && !isAdmin)
            {
                result.Add("supervisorUserId", "Only an Admin can assign a user directly under the Admin.");
            }

            return result;
        }

        // ==================== AMENDED v7: CREATION RULES FOR THE UI ====================

        /// <summary>
        /// AMENDED v7 - payload of GET /api/users/creation-rules. The Manager
        /// delegation rule is applied HERE, so a Director whose department already
        /// has an active Manager never even sees Shop Manager / Shop Team Leader in
        /// the "Create User" dropdown, instead of discovering it through a 422.
        /// </summary>
        public async Task<CreationRulesInfo> GetCreationRulesAsync(
            User currentUser,
            Guid? departmentIdOverride = null,
            CancellationToken cancellationToken = default)
        {
            var creatorRole = RoleHierarchy.Normalize(currentUser.Role) ?? string.Empty;
            var scopeDepartmentId = departmentIdOverride ?? currentUser.DepartmentId;

            var managerName = await GetActiveManagerNameAsync(scopeDepartmentId, cancellationToken);
            var hasManager = managerName is not null;

            var allowed = RoleHierarchy.CreatableRoles(creatorRole);
            var permitted = RoleHierarchy.CreatableRoles(creatorRole, hasManager);

            var restrictions = new List<string>();
            foreach (var blocked in allowed.Except(permitted, StringComparer.OrdinalIgnoreCase))
            {
                restrictions.Add(
                    $"{RoleHierarchy.Label(blocked)} is not creatable here: department Manager '{managerName}' " +
                    "owns the shop layer. Ask that Manager to create it.");
            }

            var creatable = permitted
                .Select(RoleHierarchy.RuleFor)
                .Where(r => r is not null)
                .Select(r => new CreatableRoleInfo
                {
                    Role = r!.Role,
                    DisplayName = RoleHierarchy.Label(r.Role),
                    Description = r.Description,
                    RequiresDepartment = r.RequiresDepartment,
                    RequiresShop = r.RequiresShop,
                    RequiresSupervisor = r.RequiresSupervisor,
                    AllowedSupervisorRoles = r.AllowedSupervisorRoles,
                    PreferredSupervisorRoles = r.PreferredSupervisorRoles,
                    AdminOnly = r.AdminOnly,
                    ManagerDelegated = r.ManagerDelegated
                })
                .OrderBy(r => RoleHierarchy.RankOf(r.Role))
                .ToList();

            return new CreationRulesInfo
            {
                CurrentUserId = currentUser.Id,
                CurrentRole = creatorRole,
                CurrentRoleDisplayName = RoleHierarchy.Label(creatorRole),
                DepartmentId = currentUser.DepartmentId,
                ShopId = currentUser.ShopId,
                DepartmentHasActiveManager = hasManager,
                CreatableRoles = creatable,
                Restrictions = restrictions,
                GrantablePermissions = RoleHierarchy.GrantablePermissions(creatorRole)
            };
        }

        /// <summary>
        /// AMENDED v7 - true when <paramref name="departmentId"/> already has an
        /// active Manager, which is the trigger of the delegation restriction.
        /// </summary>
        public async Task<bool> DepartmentHasActiveManagerAsync(
            Guid? departmentId,
            CancellationToken cancellationToken = default)
            => await GetActiveManagerNameAsync(departmentId, cancellationToken) is not null;

        /// <summary>Name of the first active Manager of a department, or null.</summary>
        private async Task<string?> GetActiveManagerNameAsync(
            Guid? departmentId,
            CancellationToken cancellationToken)
        {
            if (!departmentId.HasValue) return null;

            var managerVariants = RoleHierarchy.PersistedVariants(OrgRoles.Manager);

            return await _context.Users
                .AsNoTracking()
                .Where(u => managerVariants.Contains(u.Role)
                         && u.DepartmentId == departmentId.Value
                         && u.IsActive
                         && u.RecordStatus != RecordStatus.Deleted)
                .OrderBy(u => u.FullName)
                .Select(u => u.FullName)
                .FirstOrDefaultAsync(cancellationToken);
        }

        // ==================== AMENDED v7: PRIVILEGE DELEGATION ====================

        /// <summary>
        /// AMENDED v7 - validates PUT /api/users/{id}/permissions.
        /// Implements "Directors ... can assign privileges to roles such as edit,
        /// delete, etc." without allowing privilege escalation:
        ///   - the caller must be a privilege grantor (Admin, Director, Special TL,
        ///     Manager, Shop Manager, Shop Team Leader);
        ///   - the target must be inside the caller's visible scope;
        ///   - the target role must be strictly less senior (Admin bypasses this);
        ///   - every permission must be one the caller holds itself.
        /// </summary>
        public async Task<PermissionGrantResult> ValidatePermissionGrantAsync(
            User currentUser,
            User targetUser,
            IEnumerable<string>? permissionsToGrant,
            IEnumerable<string>? permissionsToRevoke,
            CancellationToken cancellationToken = default)
        {
            var result = new PermissionGrantResult();

            var grantorRole = RoleHierarchy.Normalize(currentUser.Role);
            if (grantorRole is null || !RoleHierarchy.CanGrantPrivileges(grantorRole))
            {
                result.Add("role",
                    $"A {RoleHierarchy.Label(currentUser.Role)} cannot assign privileges. " +
                    "Only Admin, Director, Special Team Leader, Manager, Shop Manager and Shop Team Leader may.");
                return result;
            }

            if (!await CanManageUserAsync(currentUser, targetUser, cancellationToken))
            {
                result.Add("userId",
                    $"'{targetUser.FullName}' is outside your scope, so you cannot change their privileges.");
                return result;
            }

            if (!RoleHierarchy.CanAdjustPrivilegesOf(grantorRole, targetUser.Role))
            {
                result.Add("userId",
                    $"A {RoleHierarchy.Label(grantorRole)} cannot change the privileges of a " +
                    $"{RoleHierarchy.Label(targetUser.Role)}. You may only adjust roles below your own, " +
                    "and Director / Special Team Leader privileges are Admin-only.");
                return result;
            }

            var grantable = RoleHierarchy.GrantablePermissions(grantorRole);

            foreach (var permission in Clean(permissionsToGrant))
            {
                if (!RoleHierarchy.AllPermissions.Contains(permission, StringComparer.OrdinalIgnoreCase))
                {
                    result.Add("permissionsToGrant", $"'{permission}' is not a known permission.");
                    continue;
                }
                if (!grantable.Contains(permission, StringComparer.OrdinalIgnoreCase))
                {
                    result.Add("permissionsToGrant",
                        $"You cannot grant '{permission}' because your own role does not hold it.");
                    continue;
                }
                if (!result.Granted.Contains(permission, StringComparer.OrdinalIgnoreCase))
                    result.Granted.Add(permission);
            }

            foreach (var permission in Clean(permissionsToRevoke))
            {
                if (!RoleHierarchy.AllPermissions.Contains(permission, StringComparer.OrdinalIgnoreCase))
                {
                    result.Add("permissionsToRevoke", $"'{permission}' is not a known permission.");
                    continue;
                }
                if (!grantable.Contains(permission, StringComparer.OrdinalIgnoreCase))
                {
                    result.Add("permissionsToRevoke",
                        $"You cannot revoke '{permission}' because your own role does not hold it.");
                    continue;
                }
                if (!result.Revoked.Contains(permission, StringComparer.OrdinalIgnoreCase))
                    result.Revoked.Add(permission);
            }

            var conflicting = result.Granted
                .Intersect(result.Revoked, StringComparer.OrdinalIgnoreCase)
                .ToArray();

            foreach (var permission in conflicting)
            {
                result.Add("permissionsToGrant",
                    $"'{permission}' cannot be granted and revoked in the same request.");
            }

            return result;
        }

        private static IEnumerable<string> Clean(IEnumerable<string>? values)
            => (values ?? Array.Empty<string>())
                .Where(v => !string.IsNullOrWhiteSpace(v))
                .Select(v => v.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase);

        // ==================== SUPERVISOR RESOLUTION ====================

        /// <summary>
        /// Picks the most sensible parent for <paramref name="targetRole"/>.
        /// Ranking, best first, over the allowed parent roles ordered by preference:
        ///   1. a holder of that parent role in the same shop;
        ///   2. a holder of that parent role in the same department;
        ///   3. any holder of that parent role (skipped for shop-scoped parents when
        ///      a shop is known, because a parent from another shop is invalid);
        ///   4. the creator themselves, when their own role is an allowed parent.
        /// All comparisons use PersistedVariants, so legacy rows such as
        /// Role = "director" are found as well.
        /// </summary>
        private async Task<User?> AutoResolveSupervisorAsync(
            User creator,
            string creatorRole,
            string targetRole,
            RoleRule rule,
            Guid? requestedDepartmentId,
            Guid? requestedShopId,
            long? targetUserId,
            CancellationToken cancellationToken)
        {
            if (rule.AllowedSupervisorRoles.Length == 0) return null;

            var variants = RoleHierarchy.PersistedVariants(rule.AllowedSupervisorRoles);
            if (variants.Length == 0) return null;

            var candidates = await _context.Users
                .AsNoTracking()
                .Where(u => u.IsActive
                         && u.RecordStatus != RecordStatus.Deleted
                         && variants.Contains(u.Role))
                .ToListAsync(cancellationToken);

            if (targetUserId.HasValue)
                candidates = candidates.Where(u => u.Id != targetUserId.Value).ToList();

            var departmentId = requestedDepartmentId ?? creator.DepartmentId;
            var shopId = requestedShopId ?? creator.ShopId;

            if (creatorRole != OrgRoles.Admin)
            {
                var scope = await GetSubtreeUserIdsAsync(creator.Id, cancellationToken);
                candidates = candidates.Where(u => scope.Contains(u.Id) || u.Id == creator.Id).ToList();
            }

            var preferred = rule.PreferredSupervisorRoles.Length > 0
                ? rule.PreferredSupervisorRoles
                : rule.AllowedSupervisorRoles;

            var ordered = rule.AllowedSupervisorRoles
                .OrderBy(r =>
                {
                    var index = Array.IndexOf(preferred, r);
                    return index < 0 ? int.MaxValue : index;
                })
                .ThenBy(RoleHierarchy.RankOf)
                .ToArray();

            foreach (var parentRole in ordered)
            {
                var pool = candidates
                    .Where(u => RoleHierarchy.Normalize(u.Role) == parentRole)
                    .ToList();

                if (pool.Count == 0) continue;

                if (shopId.HasValue)
                {
                    var bySameShop = pool
                        .Where(u => u.ShopId == shopId)
                        .OrderBy(u => u.FullName)
                        .FirstOrDefault();
                    if (bySameShop is not null) return bySameShop;
                }

                if (departmentId.HasValue)
                {
                    var bySameDepartment = pool
                        .Where(u => u.DepartmentId == departmentId)
                        .OrderBy(u => u.FullName)
                        .FirstOrDefault();
                    if (bySameDepartment is not null) return bySameDepartment;
                }

                var parentRule = RoleHierarchy.RuleFor(parentRole);
                if (parentRule is not null && parentRule.RequiresShop && shopId.HasValue) continue;

                var anyHolder = pool.OrderBy(u => u.FullName).FirstOrDefault();
                if (anyHolder is not null) return anyHolder;
            }

            var creatorIsAllowedParent =
                rule.AllowedSupervisorRoles.Contains(creatorRole, StringComparer.OrdinalIgnoreCase);

            if (creatorIsAllowedParent && (!targetUserId.HasValue || targetUserId.Value != creator.Id))
            {
                return await _context.Users
                    .AsNoTracking()
                    .FirstOrDefaultAsync(u => u.Id == creator.Id, cancellationToken);
            }

            return null;
        }

        /// <summary>
        /// Candidate parents for a target role, honouring legacy role spellings.
        /// This is what GET /api/users/supervisor-candidates returns, and the reason
        /// the dropdown is no longer empty.
        /// </summary>
        public async Task<List<User>> GetSupervisorCandidatesAsync(
            User currentUser,
            string? targetRole,
            Guid? shopId,
            Guid? departmentId,
            CancellationToken cancellationToken = default)
        {
            var canonicalTarget = RoleHierarchy.Normalize(targetRole);
            if (canonicalTarget is null) return new List<User>();

            var rule = RoleHierarchy.RuleFor(canonicalTarget)!;
            if (rule.AllowedSupervisorRoles.Length == 0) return new List<User>();

            var variants = RoleHierarchy.PersistedVariants(rule.AllowedSupervisorRoles);

            var candidates = await _context.Users
                .AsNoTracking()
                .Where(u => u.IsActive
                         && u.RecordStatus != RecordStatus.Deleted
                         && variants.Contains(u.Role))
                .ToListAsync(cancellationToken);

            var currentRole = RoleHierarchy.Normalize(currentUser.Role);
            if (currentRole != OrgRoles.Admin)
            {
                var visible = await GetVisibleUserIdsAsync(currentUser, cancellationToken);
                candidates = candidates
                    .Where(u => visible.Contains(u.Id) || u.Id == currentUser.Id)
                    .ToList();
            }

            if (rule.RequiresShop && shopId.HasValue)
            {
                candidates = candidates
                    .Where(u =>
                    {
                        var parentRule = RoleHierarchy.RuleFor(u.Role);
                        var parentIsShopScoped = parentRule is not null && parentRule.RequiresShop;
                        return !parentIsShopScoped || u.ShopId == shopId;
                    })
                    .ToList();
            }

            if (departmentId.HasValue)
            {
                var inDepartment = candidates
                    .Where(u => u.DepartmentId == departmentId || u.DepartmentId is null)
                    .ToList();

                if (inDepartment.Count > 0) candidates = inDepartment;
            }

            return candidates
                .OrderBy(u => RoleHierarchy.RankOf(u.Role))
                .ThenBy(u => u.FullName)
                .ToList();
        }

        // ==================== SCOPES AND VISIBILITY ====================

        /// <summary>
        /// True when <paramref name="currentUser"/> is allowed to manage
        /// (edit / deactivate / re-role) <paramref name="targetUser"/>.
        /// Admin may manage everyone; everyone else only their own visible scope.
        /// </summary>
        public async Task<bool> CanManageUserAsync(
            User currentUser,
            User targetUser,
            CancellationToken cancellationToken = default)
        {
            if (RoleHierarchy.Normalize(currentUser.Role) == OrgRoles.Admin) return true;
            if (currentUser.Id == targetUser.Id) return true;

            var visible = await GetVisibleUserIdsAsync(currentUser, cancellationToken);
            return visible.Contains(targetUser.Id);
        }

        /// <summary>
        /// Every user id in the reporting subtree of <paramref name="rootUserId"/>,
        /// including the root itself. One query plus an in-memory walk, so it works
        /// on every provider (no recursive CTE required).
        /// </summary>
        public async Task<HashSet<long>> GetSubtreeUserIdsAsync(
            long rootUserId,
            CancellationToken cancellationToken = default)
        {
            var links = await _context.Users
                .AsNoTracking()
                .Where(u => u.RecordStatus != RecordStatus.Deleted)
                .Select(u => new { u.Id, u.SupervisorUserId })
                .ToListAsync(cancellationToken);

            var childrenBySupervisor = links
                .Where(l => l.SupervisorUserId.HasValue)
                .GroupBy(l => l.SupervisorUserId!.Value)
                .ToDictionary(g => g.Key, g => g.Select(x => x.Id).ToList());

            var result = new HashSet<long> { rootUserId };
            var queue = new Queue<long>();
            queue.Enqueue(rootUserId);

            while (queue.Count > 0)
            {
                var current = queue.Dequeue();
                if (!childrenBySupervisor.TryGetValue(current, out var children)) continue;

                foreach (var child in children)
                {
                    if (result.Add(child)) queue.Enqueue(child);
                }
            }

            return result;
        }

        /// <summary>
        /// The scope of users visible to <paramref name="currentUser"/>:
        /// - Admin: everyone
        /// - Director / Manager: own subtree PLUS the whole department
        /// - Shop Manager / Shop Team Leader: own subtree PLUS every user of their
        ///   shop, because several Shop Team Leaders share one shop's data scope
        /// - Special Team Leader: own subtree PLUS its Director and every Engineer
        ///   it assigned
        /// - everyone else: own subtree
        /// </summary>
        public async Task<HashSet<long>> GetVisibleUserIdsAsync(
            User currentUser,
            CancellationToken cancellationToken = default)
        {
            var role = RoleHierarchy.Normalize(currentUser.Role);

            if (role == OrgRoles.Admin)
            {
                var all = await _context.Users
                    .AsNoTracking()
                    .Where(u => u.RecordStatus != RecordStatus.Deleted)
                    .Select(u => u.Id)
                    .ToListAsync(cancellationToken);
                return all.ToHashSet();
            }

            var visible = await GetSubtreeUserIdsAsync(currentUser.Id, cancellationToken);

            // AMENDED v7: shared shop scope driven by RoleHierarchy.SharesShopScope,
            // so multiple Shop Team Leaders of one shop see each other as a group.
            if (currentUser.ShopId.HasValue && RoleHierarchy.SharesShopScope(role))
            {
                var shopUsers = await _context.Users
                    .AsNoTracking()
                    .Where(u => u.ShopId == currentUser.ShopId
                             && u.RecordStatus != RecordStatus.Deleted)
                    .Select(u => u.Id)
                    .ToListAsync(cancellationToken);

                foreach (var id in shopUsers) visible.Add(id);
            }

            // A Director sees the whole department; a Manager sees their department too.
            if (currentUser.DepartmentId.HasValue &&
                (role == OrgRoles.Director || role == OrgRoles.Manager))
            {
                var departmentUsers = await _context.Users
                    .AsNoTracking()
                    .Where(u => u.DepartmentId == currentUser.DepartmentId
                             && u.RecordStatus != RecordStatus.Deleted)
                    .Select(u => u.Id)
                    .ToListAsync(cancellationToken);

                foreach (var id in departmentUsers) visible.Add(id);
            }

            // A Special Team Leader also sees the Director it belongs to.
            if (role == OrgRoles.SpecialTeamLeader && currentUser.SupervisorUserId.HasValue)
                visible.Add(currentUser.SupervisorUserId.Value);

            return visible;
        }

        /// <summary>
        /// AMENDED v7 - the leadership group of a shop.
        /// "If multiple Shop Team Leaders exist in a single shop, the Shop Manager
        ///  can view all Shop Team Leaders as a group" and "these leaders share
        ///  information and responsibilities for the shop".
        /// Returns the Shop Managers and Shop Team Leaders of the shop, most senior
        /// first, so the UI can render one shared shop card.
        /// </summary>
        public async Task<List<User>> GetShopLeadershipGroupAsync(
            Guid shopId,
            CancellationToken cancellationToken = default)
        {
            var variants = RoleHierarchy.PersistedVariants(RoleHierarchy.ShopGroupRoles);

            var members = await _context.Users
                .AsNoTracking()
                .Where(u => u.ShopId == shopId
                         && u.IsActive
                         && u.RecordStatus != RecordStatus.Deleted
                         && variants.Contains(u.Role))
                .ToListAsync(cancellationToken);

            return members
                .OrderBy(u => RoleHierarchy.RankOf(u.Role))
                .ThenBy(u => u.FullName)
                .ToList();
        }

        /// <summary>
        /// Walks up the reporting chain of <paramref name="userId"/> and returns the
        /// supervisors from the closest one upwards. Cycle safe.
        /// </summary>
        public async Task<List<User>> GetSupervisorChainAsync(
            long userId,
            CancellationToken cancellationToken = default)
        {
            var users = await _context.Users
                .AsNoTracking()
                .Where(u => u.RecordStatus != RecordStatus.Deleted)
                .ToListAsync(cancellationToken);

            var byId = users.ToDictionary(u => u.Id);
            var chain = new List<User>();
            var seen = new HashSet<long> { userId };

            if (!byId.TryGetValue(userId, out var current)) return chain;

            while (current.SupervisorUserId.HasValue
                   && byId.TryGetValue(current.SupervisorUserId.Value, out var supervisor)
                   && seen.Add(supervisor.Id))
            {
                chain.Add(supervisor);
                current = supervisor;
            }

            return chain;
        }

        // ==================== APPROVAL ROUTING ====================

        /// <summary>
        /// Resolves the user a record must be routed to at <paramref name="status"/>.
        /// Prefers the originator's own reporting chain so approvals stay inside the
        /// hierarchy, then falls back to any active holder of an approver role in the
        /// same shop, then the same department, then any.
        /// Returns null when nobody holds an approver role for that stage.
        /// </summary>
        public async Task<User?> ResolveApproverAsync(
            long originatorUserId,
            ApprovalStatus status,
            CancellationToken cancellationToken = default)
        {
            var approverRoles = RoleHierarchy.ApproverRolesFor(status);
            if (approverRoles.Length == 0) return null;

            var originator = await _context.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.Id == originatorUserId, cancellationToken);

            // 1. the closest supervisor entitled to act at this stage
            var chain = await GetSupervisorChainAsync(originatorUserId, cancellationToken);
            var fromChain = chain.FirstOrDefault(u => u.IsActive && RoleHierarchy.CanActOn(u.Role, status));
            if (fromChain is not null) return fromChain;

            // 2. any active holder of an approver role, shop first, then department
            var variants = RoleHierarchy.PersistedVariants(approverRoles);

            var pool = await _context.Users
                .AsNoTracking()
                .Where(u => u.IsActive
                         && u.RecordStatus != RecordStatus.Deleted
                         && u.Id != originatorUserId
                         && variants.Contains(u.Role))
                .ToListAsync(cancellationToken);

            if (pool.Count == 0) return null;

            if (originator?.ShopId is not null)
            {
                var sameShop = pool
                    .Where(u => u.ShopId == originator.ShopId)
                    .OrderBy(u => RoleHierarchy.RankOf(u.Role))
                    .ThenBy(u => u.FullName)
                    .FirstOrDefault();
                if (sameShop is not null) return sameShop;
            }

            if (originator?.DepartmentId is not null)
            {
                var sameDepartment = pool
                    .Where(u => u.DepartmentId == originator.DepartmentId)
                    .OrderBy(u => RoleHierarchy.RankOf(u.Role))
                    .ThenBy(u => u.FullName)
                    .FirstOrDefault();
                if (sameDepartment is not null) return sameDepartment;
            }

            return pool
                .OrderBy(u => RoleHierarchy.RankOf(u.Role))
                .ThenBy(u => u.FullName)
                .FirstOrDefault();
        }

        /// <summary>
        /// AMENDED v7 - may this user act (approve / reject / return) on a record in
        /// <paramref name="status"/> that originated from
        /// <paramref name="originatorUserId"/>? The role must be an approver for the
        /// stage AND the originator must be inside the actor's visible scope, so a
        /// Shop Team Leader of shop A can never approve a form of shop B.
        /// </summary>
        public async Task<bool> CanActOnAsync(
            User currentUser,
            long originatorUserId,
            ApprovalStatus status,
            CancellationToken cancellationToken = default)
        {
            if (!RoleHierarchy.CanActOn(currentUser.Role, status)) return false;
            if (RoleHierarchy.Normalize(currentUser.Role) == OrgRoles.Admin) return true;
            if (currentUser.Id == originatorUserId) return false;

            var visible = await GetVisibleUserIdsAsync(currentUser, cancellationToken);
            return visible.Contains(originatorUserId);
        }

        /// <summary>
        /// AMENDED v7 - may this user DELEGATE the pending stage to
        /// <paramref name="delegateToUserId"/>? The delegate must itself be entitled
        /// to act on the stage and must be inside the delegator's visible scope.
        /// </summary>
        public async Task<bool> CanDelegateAsync(
            User currentUser,
            long delegateToUserId,
            ApprovalStatus status,
            CancellationToken cancellationToken = default)
        {
            if (!RoleHierarchy.CanDelegate(currentUser.Role, status)) return false;
            if (currentUser.Id == delegateToUserId) return false;

            var target = await _context.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.Id == delegateToUserId
                                       && u.IsActive
                                       && u.RecordStatus != RecordStatus.Deleted,
                                    cancellationToken);

            if (target is null) return false;
            if (!RoleHierarchy.CanActOn(target.Role, status)) return false;
            if (RoleHierarchy.Normalize(currentUser.Role) == OrgRoles.Admin) return true;

            var visible = await GetVisibleUserIdsAsync(currentUser, cancellationToken);
            return visible.Contains(delegateToUserId);
        }

        /// <summary>
        /// AMENDED v7 - every user that may act on a record currently sitting in
        /// <paramref name="status"/> and originated by
        /// <paramref name="originatorUserId"/>. Used to populate the "Delegate to"
        /// dropdown and to send workflow notifications, which is what guarantees the
        /// workflow "reaches all users created and assigned accordingly".
        /// </summary>
        public async Task<List<User>> GetActionableUsersAsync(
            long originatorUserId,
            ApprovalStatus status,
            CancellationToken cancellationToken = default)
        {
            var approverRoles = RoleHierarchy.ApproverRolesFor(status);
            if (approverRoles.Length == 0) return new List<User>();

            var variants = RoleHierarchy.PersistedVariants(approverRoles);

            var originator = await _context.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.Id == originatorUserId, cancellationToken);

            var pool = await _context.Users
                .AsNoTracking()
                .Where(u => u.IsActive
                         && u.RecordStatus != RecordStatus.Deleted
                         && u.Id != originatorUserId
                         && variants.Contains(u.Role))
                .ToListAsync(cancellationToken);

            // Keep the shop scope meaningful: shop-scoped approvers must belong to
            // the originator's shop, higher levels stay available.
            if (originator?.ShopId is not null)
            {
                pool = pool
                    .Where(u =>
                    {
                        var rule = RoleHierarchy.RuleFor(u.Role);
                        var isShopScoped = rule is not null && rule.RequiresShop;
                        return !isShopScoped || u.ShopId == originator.ShopId;
                    })
                    .ToList();
            }

            return pool
                .OrderBy(u => RoleHierarchy.RankOf(u.Role))
                .ThenBy(u => u.FullName)
                .ToList();
        }

        /// <summary>Convenience overload returning only the ids.</summary>
        public async Task<HashSet<long>> GetActionableUserIdsAsync(
            long originatorUserId,
            ApprovalStatus status,
            CancellationToken cancellationToken = default)
            => (await GetActionableUsersAsync(originatorUserId, status, cancellationToken))
                .Select(u => u.Id)
                .ToHashSet();

        // ==================== MAINTENANCE ====================

        /// <summary>
        /// One-shot repair for legacy role values. Rewrites every Users.Role that is
        /// a known alias ("director", "team_leader", "shop_tl", ...) to its canonical
        /// form, which permanently removes the "No eligible Director found" class of
        /// bug. Returns the number of rows changed; the caller owns SaveChangesAsync.
        /// </summary>
        public async Task<int> NormalizePersistedRolesAsync(CancellationToken cancellationToken = default)
        {
            var users = await _context.Users
                .Where(u => u.RecordStatus != RecordStatus.Deleted)
                .ToListAsync(cancellationToken);

            var changed = 0;
            foreach (var user in users)
            {
                var canonical = RoleHierarchy.Normalize(user.Role);
                if (canonical is null) continue;
                if (string.Equals(user.Role, canonical, StringComparison.Ordinal)) continue;

                user.Role = canonical;
                user.UpdateAudit("role-normalisation");
                changed++;
            }

            return changed;
        }
    }
}