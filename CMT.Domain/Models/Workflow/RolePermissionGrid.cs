using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.Workflow
{
    // =====================================================================================
    // AMENDMENT DOCUMENT C - RolePermissionGrid.cs   (NEW FILE)
    // Copy to: CMT.Domain/Models/Workflow/RolePermissionGrid.cs
    //
    // WHAT THIS FILE IS
    // -----------------
    // Amendment document C asks for "the 16-role x permission grid plus the per-step scope
    // column (OWN_SHOP, FUNCTIONAL_UNIT, ASSIGNED_ONLY, DESIGNATED_ONLY, DEPARTMENT,
    // GLOBAL), in the exact shape required by WorkflowPermissionMatrix.cs and
    // DocumentationPermissionMatrix.cs". This file IS that document, expressed as code
    // instead of prose, exactly like WorkflowStepTableReference.cs is amendment document B.
    //
    // WHY IT IS GENERATED AND NOT HAND-WRITTEN
    //   Three artefacts already hold the truth:
    //     * RoleHierarchy.AllRoles            -> the 16 canonical roles (the grid ROWS)
    //     * RoleHierarchy.DefaultPermissions  -> what each role holds  (the grid CELLS)
    //     * WorkflowPermissionMatrix / DocumentationPermissionMatrix / FormWorkflowCatalog
    //                                         -> the per-step SCOPE column
    //   Re-typing them into a document guarantees they diverge on the first routing or
    //   permission change. RolePermissionGrid therefore PROJECTS them into the printed shape
    //   of amendment document C and then ASSERTS - in Validate() - that the grid, the two
    //   permission matrices and the step tables still agree with each other.
    //
    // THE TWO HALVES OF DOCUMENT C
    //   HALF 1 - THE GRID          : Rows (16) x Columns (every Permissions constant),
    //                                grouped per functional area, with the delegation /
    //                                skip / privilege-grant columns the matrix needs.
    //   HALF 2 - THE SCOPE COLUMN  : StepScopes, one row per catalogued step, carrying the
    //                                WorkflowPermissionMatrix.Scopes value AND - for the
    //                                DOCUMENTATION section - the matching
    //                                DocumentationPermissionMatrix.Scopes value.
    //
    // EXACT SHAPE GUARANTEES (this is what "in the exact shape required by" means)
    //   - The scope vocabulary is NOT re-declared here. ScopeCatalog.Workflow points at
    //     WorkflowPermissionMatrix.Scopes and ScopeCatalog.Documentation points at
    //     DocumentationPermissionMatrix.Scopes, so a rename in either matrix is a compile
    //     error here instead of a silent documentation lie.
    //   - The per-step scope value is taken from WorkflowPermissionMatrix.ScopeForStep via
    //     WorkflowStepTableReference, never recomputed, so document B and document C print
    //     the same column by construction.
    //   - The permission columns are the Permissions constants, cross-checked against
    //     RoleHierarchy.AllPermissions, so a new permission cannot be forgotten.
    //
    // HARD RULES (identical to every other file of this layer)
    //   - Pure projection: no EF, no DbContext, no services, no I/O, no JSON.
    //   - Nothing is modified: ApprovalStatus.cs, RoleHierarchy.cs, Enums.cs,
    //     WorkflowContracts.cs, every FormWorkflowCatalog part file,
    //     WorkflowPermissionMatrix, DocumentationPermissionMatrix and
    //     WorkflowStepTableReference are only CONSUMED.
    //   - No enum member, status, role or permission is added, renamed or renumbered, so
    //     this file produces NO schema difference and NO migration.
    // =====================================================================================

    /// <summary>
    /// One functional area of the permission grid, so the printed document groups the
    /// columns instead of showing one unreadable 55-column table.
    /// </summary>
    public sealed class PermissionGroup
    {
        public string Code { get; init; } = string.Empty;
        public string Title { get; init; } = string.Empty;

        /// <summary>Permissions constants of this area, in printing order.</summary>
        public string[] Permissions { get; init; } = Array.Empty<string>();
    }

    /// <summary>ONE cell of the grid, for a flat API / CSV export.</summary>
    public sealed class PermissionGridCell
    {
        public string Role { get; init; } = string.Empty;
        public string RoleLabel { get; init; } = string.Empty;
        public string PermissionGroup { get; init; } = string.Empty;
        public string Permission { get; init; } = string.Empty;

        /// <summary>The role holds the permission by DEFAULT (RoleHierarchy.DefaultPermissions).</summary>
        public bool Granted { get; init; }

        /// <summary>The role may GRANT the permission to a less senior user.</summary>
        public bool Grantable { get; init; }
    }

    /// <summary>
    /// ONE ROW of the 16-role x permission grid of amendment document C: the role, its
    /// structural facts, its default permission vector and the scopes it actually operates
    /// under across the catalogued step tables.
    /// </summary>
    public sealed class RolePermissionGridRow
    {
        // ---- identity ----------------------------------------------------------------
        /// <summary>Canonical OrgRoles value.</summary>
        public string Role { get; init; } = string.Empty;

        /// <summary>Printed label (RoleHierarchy.DisplayNames).</summary>
        public string RoleLabel { get; init; } = string.Empty;

        /// <summary>Seniority index; lower is more senior.</summary>
        public int Rank { get; init; }

        public string Description { get; init; } = string.Empty;

        /// <summary>Every spelling that may legitimately sit in Users.Role.</summary>
        public string[] PersistedVariants { get; init; } = Array.Empty<string>();

        // ---- structural facts ---------------------------------------------------------
        /// <summary>FunctionalUnits value, or null for shop / department roles.</summary>
        public string? FunctionalUnit { get; init; }

        public string FunctionalUnitLabel { get; init; } = string.Empty;
        public bool LeadsFunctionalUnit { get; init; }
        public bool IsAdminOnly { get; init; }
        public bool IsManagerDelegated { get; init; }
        public bool IsDepartmentLevel { get; init; }
        public bool IsIndividualPersonnel { get; init; }
        public bool SharesShopScope { get; init; }
        public bool RequiresDepartment { get; init; }
        public bool RequiresShop { get; init; }
        public bool RequiresSupervisor { get; init; }
        public string[] AllowedSupervisorRoles { get; init; } = Array.Empty<string>();
        public string[] CreatableRoles { get; init; } = Array.Empty<string>();

        // ---- workflow authority columns -----------------------------------------------
        /// <summary>Member of RoleHierarchy.SkipAuthorityRoles.</summary>
        public bool HoldsSkipAuthority { get; init; }

        /// <summary>Member of RoleHierarchy.DelegationRoles.</summary>
        public bool MayDelegate { get; init; }

        /// <summary>Member of RoleHierarchy.PrivilegeGrantorRoles.</summary>
        public bool MayGrantPrivileges { get; init; }

        // ---- the grid cells ------------------------------------------------------------
        /// <summary>Default permission set of the role, ordered like <see cref="RolePermissionGrid.Columns"/>.</summary>
        public string[] GrantedPermissions { get; init; } = Array.Empty<string>();

        /// <summary>Permissions this role may hand out (RoleHierarchy.GrantablePermissions).</summary>
        public string[] GrantablePermissions { get; init; } = Array.Empty<string>();

        /// <summary>
        /// One boolean per column of <see cref="RolePermissionGrid.Columns"/>, same index,
        /// so the printed grid is a straight zip of Columns and Cells.
        /// </summary>
        public bool[] Cells { get; init; } = Array.Empty<bool>();

        /// <summary>Permission -> granted by default. Case insensitive.</summary>
        public IReadOnlyDictionary<string, bool> Grants { get; init; } =
            new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);

        // ---- observed scopes ------------------------------------------------------------
        /// <summary>WorkflowPermissionMatrix.Scopes values this role is actually exposed to.</summary>
        public string[] WorkflowScopes { get; init; } = Array.Empty<string>();

        /// <summary>DocumentationPermissionMatrix.Scopes values, when the role appears there.</summary>
        public string[] DocumentationScopes { get; init; } = Array.Empty<string>();

        /// <summary>Number of catalogued steps this role may EXECUTE.</summary>
        public int ExecutableStepCount { get; init; }

        /// <summary>Number of catalogued steps this role may ASSIGN.</summary>
        public int AssignableStepCount { get; init; }

        /// <summary>Number of catalogued forms this role may DRAFT.</summary>
        public int DraftableFormCount { get; init; }

        public bool Has(string? permission) =>
            !string.IsNullOrWhiteSpace(permission)
            && Grants.TryGetValue(permission!.Trim(), out var granted)
            && granted;
    }

    /// <summary>
    /// ONE ROW of the per-step scope column of amendment document C. It carries the generic
    /// scope taken from WorkflowPermissionMatrix and, for the DOCUMENTATION section, the
    /// specialised scope taken from DocumentationPermissionMatrix, so the two layers are
    /// printed side by side and can be reconciled.
    /// </summary>
    public sealed class StepScopeRow
    {
        // ---- identity ----------------------------------------------------------------
        public string FormNo { get; init; } = string.Empty;
        public string FormType { get; init; } = string.Empty;
        public string Section { get; init; } = string.Empty;
        public string SectionTitle { get; init; } = string.Empty;

        /// <summary>0 = drafting.</summary>
        public int StepNo { get; init; }

        public string Capability { get; init; } = string.Empty;
        public string Kind { get; init; } = string.Empty;

        // ---- pending status ------------------------------------------------------------
        public ApprovalStatus PendingStatus { get; init; }
        public string PendingStatusName { get; init; } = string.Empty;
        public int PendingStatusValue { get; init; }

        // ---- roles ----------------------------------------------------------------------
        public string[] EligibleRoles { get; init; } = Array.Empty<string>();
        public string[] EligibleRoleLabels { get; init; } = Array.Empty<string>();
        public string[] AssignerRoles { get; init; } = Array.Empty<string>();
        public string[] AssignerRoleLabels { get; init; } = Array.Empty<string>();

        // ---- permission + scope (THE columns amendment document C asks for) -------------
        /// <summary>Permissions constant the executor must hold.</summary>
        public string RequiredPermission { get; init; } = string.Empty;

        /// <summary>Permissions constant the assigner must hold, when the step is assignable.</summary>
        public string AssignPermission { get; init; } = string.Empty;

        /// <summary>WorkflowPermissionMatrix.Scopes value.</summary>
        public string Scope { get; init; } = string.Empty;

        public string ScopeDescription { get; init; } = string.Empty;

        /// <summary>
        /// DocumentationPermissionMatrix.Scopes value, or null when the step does not
        /// belong to the DOCUMENTATION section.
        /// </summary>
        public string? DocumentationScope { get; init; }

        // ---- routing facts -------------------------------------------------------------
        public string AssignmentUnitLabel { get; init; } = string.Empty;
        public string? AssignmentUnit { get; init; }
        public bool RequiresManualAssignment { get; init; }
        public bool RestrictToOriginatorShop { get; init; }
        public bool AllowsDelegation { get; init; }
        public string SignatureCaption { get; init; } = string.Empty;
        public string SkipMode { get; init; } = string.Empty;
    }

    /// <summary>
    /// AMENDMENT DOCUMENT C, as code: the 16-role x permission grid plus the per-step scope
    /// column, generated from RoleHierarchy, WorkflowPermissionMatrix,
    /// DocumentationPermissionMatrix and WorkflowStepTableReference so the printed document
    /// and the executing rules can never contradict each other.
    /// </summary>
    public static class RolePermissionGrid
    {
        // =================================================================================
        // 1. THE SCOPE VOCABULARY  (pointers, never copies)
        // =================================================================================

        /// <summary>
        /// The scope labels of amendment document C. They are NOT re-declared: they point at
        /// WorkflowPermissionMatrix.Scopes and DocumentationPermissionMatrix.Scopes, so a
        /// rename in either matrix breaks the build here instead of silently desynchronising
        /// the document.
        /// </summary>
        public static class ScopeCatalog
        {
            // ---- generic scopes (WorkflowPermissionMatrix.Scopes) -----------------------
            public const string OwnShop = WorkflowPermissionMatrix.Scopes.OwnShop;
            public const string FunctionalUnit = WorkflowPermissionMatrix.Scopes.FunctionalUnit;
            public const string AssignedOnly = WorkflowPermissionMatrix.Scopes.AssignedOnly;
            public const string DesignatedOnly = WorkflowPermissionMatrix.Scopes.DesignatedOnly;
            public const string Department = WorkflowPermissionMatrix.Scopes.Department;
            public const string Global = WorkflowPermissionMatrix.Scopes.Global;

            // ---- documentation scopes (DocumentationPermissionMatrix.Scopes) ------------
            public const string DocumentationUnit = DocumentationPermissionMatrix.Scopes.DocumentationUnit;
            public const string AssignedTicketOnly = DocumentationPermissionMatrix.Scopes.AssignedTicketOnly;

            /// <summary>The six generic scopes, in the order amendment document C prints them.</summary>
            public static readonly string[] Workflow =
            {
                OwnShop,
                FunctionalUnit,
                AssignedOnly,
                DesignatedOnly,
                Department,
                Global
            };

            /// <summary>The four DOCUMENTATION scopes.</summary>
            public static readonly string[] Documentation =
            {
                DocumentationPermissionMatrix.Scopes.OwnShop,
                DocumentationUnit,
                AssignedTicketOnly,
                DocumentationPermissionMatrix.Scopes.Global
            };

            /// <summary>Every scope label used anywhere, deduplicated.</summary>
            public static readonly string[] All =
                Workflow.Concat(Documentation)
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToArray();

            /// <summary>Printed meaning of a scope label.</summary>
            public static string DescriptionOf(string? scope) => scope switch
            {
                OwnShop => "The actor must belong to the originator's shop.",
                FunctionalUnit => "The actor must belong to the central functional unit owning the step.",
                AssignedOnly => "Only the personally assigned user may act (the unit leader may intervene).",
                DesignatedOnly => "Only the exclusively designated user may act (MNT-1378 Inspector / MNT-922C Technician).",
                Department => "Department tier (Manager / Director) of the owning department.",
                Global => "No scope restriction beyond role and permission.",
                DocumentationUnit => "Any member of the Documentation Team may act.",
                AssignedTicketOnly => "Only the clerk the Documentation Team Leader assigned to this ticket.",
                _ => string.IsNullOrWhiteSpace(scope) ? "-" : scope!
            };

            /// <summary>
            /// How a generic scope is expected to appear inside the DOCUMENTATION section.
            /// Used by <see cref="RolePermissionGrid.ScopeDivergences"/> to reconcile the
            /// generic layer with the specialised layer.
            /// </summary>
            public static readonly IReadOnlyDictionary<string, string> WorkflowToDocumentation =
                new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                {
                    [OwnShop] = DocumentationPermissionMatrix.Scopes.OwnShop,
                    [FunctionalUnit] = DocumentationUnit,
                    [AssignedOnly] = AssignedTicketOnly,
                    [Global] = DocumentationPermissionMatrix.Scopes.Global
                };
        }

        // =================================================================================
        // 2. THE COLUMNS OF THE GRID
        // =================================================================================

        /// <summary>Number of canonical roles amendment document C grids (RoleHierarchy.AllRoles).</summary>
        public const int ExpectedRoleCount = 16;

        /// <summary>
        /// The permission columns, grouped per functional area exactly as the printed
        /// document groups them. Every value is a Permissions constant: nothing is invented.
        /// </summary>
        public static readonly PermissionGroup[] Groups =
        {
            new PermissionGroup
            {
                Code = "SHOP",
                Title = "Shop",
                Permissions = new[]
                {
                    CMT.Domain.Models.Shared.Permissions.CreateShop,
                    CMT.Domain.Models.Shared.Permissions.EditShop,
                    CMT.Domain.Models.Shared.Permissions.DeleteShop,
                    CMT.Domain.Models.Shared.Permissions.ViewShop
                }
            },
            new PermissionGroup
            {
                Code = "ATA_RECORD",
                Title = "ATA record",
                Permissions = new[]
                {
                    CMT.Domain.Models.Shared.Permissions.CreateATARecord,
                    CMT.Domain.Models.Shared.Permissions.EditATARecord,
                    CMT.Domain.Models.Shared.Permissions.DeleteATARecord,
                    CMT.Domain.Models.Shared.Permissions.ViewATARecord,
                    CMT.Domain.Models.Shared.Permissions.SubmitATARecord,
                    CMT.Domain.Models.Shared.Permissions.ApproveATARecord,
                    CMT.Domain.Models.Shared.Permissions.RejectATARecord,
                    CMT.Domain.Models.Shared.Permissions.AssignATARecord,
                    CMT.Domain.Models.Shared.Permissions.DirectUpdateATARecord
                }
            },
            new PermissionGroup
            {
                Code = "FORM",
                Title = "Form workflow",
                Permissions = new[]
                {
                    CMT.Domain.Models.Shared.Permissions.CreateForm,
                    CMT.Domain.Models.Shared.Permissions.EditForm,
                    CMT.Domain.Models.Shared.Permissions.DeleteForm,
                    CMT.Domain.Models.Shared.Permissions.ViewForm,
                    CMT.Domain.Models.Shared.Permissions.SubmitForm,
                    CMT.Domain.Models.Shared.Permissions.ApproveForm,
                    CMT.Domain.Models.Shared.Permissions.RejectForm,
                    CMT.Domain.Models.Shared.Permissions.DelegateForm,
                    CMT.Domain.Models.Shared.Permissions.ReturnForm,
                    CMT.Domain.Models.Shared.Permissions.SkipFormStep,
                    CMT.Domain.Models.Shared.Permissions.AssignFormStep,
                    CMT.Domain.Models.Shared.Permissions.SignOffForm
                }
            },
            new PermissionGroup
            {
                Code = "FOLDER",
                Title = "Evaluation folder",
                Permissions = new[]
                {
                    CMT.Domain.Models.Shared.Permissions.CreateFolder,
                    CMT.Domain.Models.Shared.Permissions.EditFolder,
                    CMT.Domain.Models.Shared.Permissions.ViewFolder,
                    CMT.Domain.Models.Shared.Permissions.CompleteFolder,
                    CMT.Domain.Models.Shared.Permissions.LockFolder,
                    CMT.Domain.Models.Shared.Permissions.GenerateFolderReport
                }
            },
            new PermissionGroup
            {
                Code = "DOCUMENTATION",
                Title = "Documentation team",
                Permissions = new[]
                {
                    CMT.Domain.Models.Shared.Permissions.AssignDocumentationClerk,
                    CMT.Domain.Models.Shared.Permissions.SignOffDocumentation
                }
            },
            new PermissionGroup
            {
                Code = "TRAINING",
                Title = "Training / HR",
                Permissions = new[]
                {
                    CMT.Domain.Models.Shared.Permissions.EnrollTraining,
                    CMT.Domain.Models.Shared.Permissions.VerifyTraining,
                    CMT.Domain.Models.Shared.Permissions.ApproveTraining
                }
            },
            new PermissionGroup
            {
                Code = "EXPIRY_REVISION",
                Title = "Expiry, revision and matrices",
                Permissions = new[]
                {
                    CMT.Domain.Models.Shared.Permissions.AmendExpiredRecord,
                    CMT.Domain.Models.Shared.Permissions.TriggerRevision,
                    CMT.Domain.Models.Shared.Permissions.ApproveRevision,
                    CMT.Domain.Models.Shared.Permissions.ViewMatrix,
                    CMT.Domain.Models.Shared.Permissions.EditMatrix
                }
            },
            new PermissionGroup
            {
                Code = "NOTIFICATION_AUDIT",
                Title = "Notifications and audit",
                Permissions = new[]
                {
                    CMT.Domain.Models.Shared.Permissions.ViewNotification,
                    CMT.Domain.Models.Shared.Permissions.ViewWorkflowAudit
                }
            },
            new PermissionGroup
            {
                Code = "FILE",
                Title = "File attachment",
                Permissions = new[]
                {
                    CMT.Domain.Models.Shared.Permissions.UploadFile,
                    CMT.Domain.Models.Shared.Permissions.DeleteFile,
                    CMT.Domain.Models.Shared.Permissions.ViewFile,
                    CMT.Domain.Models.Shared.Permissions.ApproveFile
                }
            },
            new PermissionGroup
            {
                Code = "USER",
                Title = "User management",
                Permissions = new[]
                {
                    CMT.Domain.Models.Shared.Permissions.CreateUser,
                    CMT.Domain.Models.Shared.Permissions.EditUser,
                    CMT.Domain.Models.Shared.Permissions.DeleteUser,
                    CMT.Domain.Models.Shared.Permissions.ViewUser,
                    CMT.Domain.Models.Shared.Permissions.AssignRole
                }
            },
            new PermissionGroup
            {
                Code = "DEPARTMENT",
                Title = "Department",
                Permissions = new[]
                {
                    CMT.Domain.Models.Shared.Permissions.CreateDepartment,
                    CMT.Domain.Models.Shared.Permissions.EditDepartment,
                    CMT.Domain.Models.Shared.Permissions.ViewDepartment
                }
            }
        };

        /// <summary>Every permission column, in printing order.</summary>
        public static readonly string[] Columns =
            Groups.SelectMany(g => g.Permissions)
                  .Distinct(StringComparer.Ordinal)
                  .ToArray();

        /// <summary>The 16 canonical roles, top of the org chart first.</summary>
        public static readonly string[] Roles = RoleHierarchy.AllRoles;

        /// <summary>Permission -> the group it is printed under.</summary>
        private static readonly Dictionary<string, string> GroupOfPermission =
            Groups.SelectMany(g => g.Permissions.Select(p => (Permission: p, Group: g.Code)))
                  .GroupBy(x => x.Permission, StringComparer.OrdinalIgnoreCase)
                  .ToDictionary(g => g.Key, g => g.First().Group, StringComparer.OrdinalIgnoreCase);

        // =================================================================================
        // 3. HALF 2 FIRST: THE PER-STEP SCOPE COLUMN
        //    Built before the grid because the grid rows summarise the scopes a role meets.
        // =================================================================================

        /// <summary>
        /// One row per catalogued step, carrying the scope column of amendment document C.
        /// The scope value is NOT recomputed here: it is the value
        /// WorkflowPermissionMatrix.ScopeForStep produced, surfaced through
        /// WorkflowStepTableReference, so documents B and C always print the same column.
        /// </summary>
        public static readonly StepScopeRow[] StepScopes = BuildStepScopes();

        private static StepScopeRow[] BuildStepScopes() =>
            WorkflowStepTableReference.Rows
                .OrderBy(r => ToCSections.OrderOf(r.Section))
                .ThenBy(r => r.FormNo, StringComparer.OrdinalIgnoreCase)
                .ThenBy(r => r.StepNo)
                .Select(row => new StepScopeRow
                {
                    FormNo = row.FormNo,
                    FormType = row.FormType,
                    Section = row.Section,
                    SectionTitle = row.SectionTitle,

                    StepNo = row.StepNo,
                    Capability = row.Title,
                    Kind = row.KindName,

                    PendingStatus = row.PendingStatus,
                    PendingStatusName = row.PendingStatusName,
                    PendingStatusValue = row.PendingStatusValue,

                    EligibleRoles = row.EligibleRoles,
                    EligibleRoleLabels = row.EligibleRoleLabels,
                    AssignerRoles = row.AssignerRoles,
                    AssignerRoleLabels = row.AssignerRoleLabels,

                    RequiredPermission = row.RequiredPermission,
                    AssignPermission = row.AssignPermission,

                    Scope = row.Scope,
                    ScopeDescription = ScopeCatalog.DescriptionOf(row.Scope),
                    DocumentationScope = ResolveDocumentationScope(row),

                    AssignmentUnit = row.AssignmentUnit,
                    AssignmentUnitLabel = row.AssignmentUnitLabel,
                    RequiresManualAssignment = row.RequiresManualAssignment,
                    RestrictToOriginatorShop = row.RestrictToOriginatorShop,
                    AllowsDelegation = row.AllowsDelegation,
                    SignatureCaption = row.SignatureCaption,
                    SkipMode = row.SkipModeName
                })
                .ToArray();

        /// <summary>
        /// The DOCUMENTATION scope of a step, taken from DocumentationPermissionMatrix.Rows
        /// so the specialised layer is quoted and never re-derived. Null for every step
        /// outside the DOCUMENTATION section.
        /// </summary>
        private static string? ResolveDocumentationScope(WorkflowStepTableRow row)
        {
            var candidates = DocumentationPermissionMatrix.Rows
                .Where(d => string.Equals(d.FormType, row.FormType, StringComparison.OrdinalIgnoreCase)
                            && d.StepNo == row.StepNo)
                .ToArray();

            if (candidates.Length == 0) return null;

            var exact = candidates.FirstOrDefault(d =>
                string.Equals(d.Capability, row.Title, StringComparison.OrdinalIgnoreCase));

            return (exact ?? candidates[0]).Scope;
        }

        // =================================================================================
        // 4. HALF 1: THE 16-ROLE x PERMISSION GRID
        // =================================================================================

        /// <summary>The grid rows, one per canonical role, most senior first.</summary>
        public static readonly RolePermissionGridRow[] Rows = BuildRows();

        /// <summary>Canonical role -> its grid row. Case insensitive.</summary>
        public static readonly IReadOnlyDictionary<string, RolePermissionGridRow> ByRole =
            Rows.ToDictionary(r => r.Role, r => r, StringComparer.OrdinalIgnoreCase);

        private static RolePermissionGridRow[] BuildRows() =>
            Roles.Select(BuildRow).ToArray();

        private static RolePermissionGridRow BuildRow(string role)
        {
            var rule = RoleHierarchy.RuleFor(role);

            var defaults = RoleHierarchy.DefaultPermissions.TryGetValue(role, out var declared)
                ? new HashSet<string>(declared, StringComparer.OrdinalIgnoreCase)
                : new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            var grantable = new HashSet<string>(
                RoleHierarchy.GrantablePermissions(role), StringComparer.OrdinalIgnoreCase);

            var grants = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
            var cells = new bool[Columns.Length];

            for (var i = 0; i < Columns.Length; i++)
            {
                var granted = defaults.Contains(Columns[i]);
                cells[i] = granted;
                grants[Columns[i]] = granted;
            }

            // The step tables the role really appears in - this is what turns the grid from
            // "what may this role do in principle" into "where does this role actually act".
            var executable = StepScopes
                .Where(s => s.EligibleRoles.Contains(role, StringComparer.OrdinalIgnoreCase))
                .ToArray();

            var assignable = StepScopes
                .Where(s => s.RequiresManualAssignment
                            && (s.AssignerRoles.Length > 0
                                ? s.AssignerRoles.Contains(role, StringComparer.OrdinalIgnoreCase)
                                : s.EligibleRoles.Contains(role, StringComparer.OrdinalIgnoreCase)))
                .ToArray();

            var draftable = StepScopes
                .Count(s => s.StepNo == 0
                            && s.EligibleRoles.Contains(role, StringComparer.OrdinalIgnoreCase));

            return new RolePermissionGridRow
            {
                Role = role,
                RoleLabel = RoleHierarchy.Label(role),
                Rank = RoleHierarchy.RankOf(role),
                Description = rule?.Description ?? string.Empty,
                PersistedVariants = RoleHierarchy.PersistedVariants(role),

                FunctionalUnit = RoleHierarchy.FunctionalUnitOf(role),
                FunctionalUnitLabel = string.IsNullOrWhiteSpace(RoleHierarchy.FunctionalUnitOf(role))
                    ? WorkflowStepTableReference.OriginatorShopQueueLabel
                    : RoleHierarchy.FunctionalUnitOf(role)!,
                LeadsFunctionalUnit = RoleHierarchy.LeadsFunctionalUnit(role),
                IsAdminOnly = RoleHierarchy.IsAdminOnly(role),
                IsManagerDelegated = RoleHierarchy.IsManagerDelegated(role),
                IsDepartmentLevel = RoleHierarchy.IsDepartmentLevel(role),
                IsIndividualPersonnel = RoleHierarchy.IsIndividualPersonnel(role),
                SharesShopScope = RoleHierarchy.SharesShopScope(role),
                RequiresDepartment = rule?.RequiresDepartment ?? false,
                RequiresShop = rule?.RequiresShop ?? false,
                RequiresSupervisor = rule?.RequiresSupervisor ?? false,
                AllowedSupervisorRoles = rule?.AllowedSupervisorRoles ?? Array.Empty<string>(),
                CreatableRoles = RoleHierarchy.CreatableRoles(role),

                HoldsSkipAuthority = RoleHierarchy.CanSkipSteps(role),
                MayDelegate = RoleHierarchy.DelegationRoles
                    .Contains(role, StringComparer.OrdinalIgnoreCase),
                MayGrantPrivileges = RoleHierarchy.CanGrantPrivileges(role),

                GrantedPermissions = Columns.Where(defaults.Contains).ToArray(),
                GrantablePermissions = Columns.Where(grantable.Contains).ToArray(),
                Cells = cells,
                Grants = grants,

                WorkflowScopes = executable
                    .Select(s => s.Scope)
                    .Where(s => !string.IsNullOrWhiteSpace(s))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(s => Array.IndexOf(ScopeCatalog.Workflow, s))
                    .ToArray(),

                DocumentationScopes = executable
                    .Select(s => s.DocumentationScope)
                    .Where(s => !string.IsNullOrWhiteSpace(s))
                    .Select(s => s!)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToArray(),

                ExecutableStepCount = executable.Length,
                AssignableStepCount = assignable.Length,
                DraftableFormCount = draftable
            };
        }

        // =================================================================================
        // 5. LOOKUP
        // =================================================================================

        /// <summary>The grid row of one role, or null when the role is unknown.</summary>
        public static RolePermissionGridRow? RowFor(string? role)
        {
            var canonical = RoleHierarchy.Normalize(role);
            if (canonical is null) return null;
            return ByRole.TryGetValue(canonical, out var row) ? row : null;
        }

        /// <summary>Does the role hold the permission BY DEFAULT? Admin always does.</summary>
        public static bool IsGrantedByDefault(string? role, string? permission)
        {
            var canonical = RoleHierarchy.Normalize(role);
            if (canonical is null || string.IsNullOrWhiteSpace(permission)) return false;
            if (canonical == OrgRoles.Admin) return true;
            return RowFor(canonical)?.Has(permission) == true;
        }

        /// <summary>Every role that holds the permission by default (a grid COLUMN read).</summary>
        public static string[] RolesWith(string? permission) =>
            string.IsNullOrWhiteSpace(permission)
                ? Array.Empty<string>()
                : Rows.Where(r => r.Has(permission)).Select(r => r.Role).ToArray();

        /// <summary>Every permission of one role (a grid ROW read).</summary>
        public static string[] PermissionsOf(string? role) =>
            RowFor(role)?.GrantedPermissions ?? Array.Empty<string>();

        /// <summary>Per-step scope rows of one form, in step order.</summary>
        public static StepScopeRow[] StepScopesFor(string? formType) =>
            StepScopes.Where(s => string.Equals(s.FormType, formType, StringComparison.OrdinalIgnoreCase))
                      .OrderBy(s => s.StepNo)
                      .ToArray();

        /// <summary>The scope row of one exact step.</summary>
        public static StepScopeRow? StepScopeAt(string? formType, int stepNo) =>
            StepScopesFor(formType).FirstOrDefault(s => s.StepNo == stepNo);

        /// <summary>The scope value of one exact step, or GLOBAL when the step is unknown.</summary>
        public static string ScopeOf(string? formType, int stepNo) =>
            StepScopeAt(formType, stepNo)?.Scope ?? ScopeCatalog.Global;

        /// <summary>Every step that applies one scope rule.</summary>
        public static StepScopeRow[] StepScopesWith(string? scope) =>
            StepScopes.Where(s => string.Equals(s.Scope, scope, StringComparison.OrdinalIgnoreCase))
                      .ToArray();

        /// <summary>Per-step scope rows of one Table-of-Contents section.</summary>
        public static StepScopeRow[] StepScopesForSection(string? sectionCode) =>
            StepScopes.Where(s => string.Equals(s.Section, sectionCode, StringComparison.OrdinalIgnoreCase))
                      .ToArray();

        /// <summary>Every step a role may execute, with its scope rule.</summary>
        public static StepScopeRow[] StepScopesForRole(string? role)
        {
            var canonical = RoleHierarchy.Normalize(role);
            if (canonical is null) return Array.Empty<StepScopeRow>();
            if (canonical == OrgRoles.Admin) return StepScopes;

            return StepScopes
                .Where(s => s.EligibleRoles.Contains(canonical, StringComparer.OrdinalIgnoreCase))
                .ToArray();
        }

        /// <summary>How many steps each scope rule governs, for the printed summary.</summary>
        public static (string Scope, string Description, int StepCount)[] ScopeUsage() =>
            ScopeCatalog.Workflow
                .Select(scope => (
                    Scope: scope,
                    Description: ScopeCatalog.DescriptionOf(scope),
                    StepCount: StepScopes.Count(s =>
                        string.Equals(s.Scope, scope, StringComparison.OrdinalIgnoreCase))))
                .ToArray();

        /// <summary>The grid flattened into role x permission cells, for a CSV / API export.</summary>
        public static PermissionGridCell[] ToCells()
        {
            var cells = new List<PermissionGridCell>(Rows.Length * Columns.Length);

            foreach (var row in Rows)
            {
                var grantable = new HashSet<string>(row.GrantablePermissions, StringComparer.OrdinalIgnoreCase);

                foreach (var permission in Columns)
                {
                    cells.Add(new PermissionGridCell
                    {
                        Role = row.Role,
                        RoleLabel = row.RoleLabel,
                        PermissionGroup = GroupOfPermission.TryGetValue(permission, out var group)
                            ? group
                            : string.Empty,
                        Permission = permission,
                        Granted = row.Has(permission),
                        Grantable = grantable.Contains(permission)
                    });
                }
            }

            return cells.ToArray();
        }

        // =================================================================================
        // 6. EXPORT  (served verbatim by GET /api/workflow/role-permission-grid)
        // =================================================================================

        /// <summary>Amendment document C rendered as Markdown: the grid, then the scope column.</summary>
        public static string ToMarkdown()
        {
            var sb = new StringBuilder();

            sb.AppendLine("# Amendment document C - role-permission grid and per-step scope column");
            sb.AppendLine();
            sb.AppendLine($"Roles: {Rows.Length} (expected {ExpectedRoleCount}). "
                          + $"Permission columns: {Columns.Length}. "
                          + $"Catalogued steps: {StepScopes.Length}.");
            sb.AppendLine();

            // ---- 6.1 the grid, one table per functional area ----------------------------
            sb.AppendLine("## 1. The 16-role x permission grid");
            sb.AppendLine();

            foreach (var group in Groups)
            {
                sb.AppendLine($"### {group.Title}");
                sb.AppendLine();
                sb.AppendLine("| Role | " + string.Join(" | ", group.Permissions) + " |");
                sb.AppendLine("|---" + string.Concat(group.Permissions.Select(_ => "|---")) + "|");

                foreach (var row in Rows)
                {
                    sb.AppendLine("| " + row.RoleLabel + " | "
                                  + string.Join(" | ", group.Permissions.Select(p => Tick(row.Has(p))))
                                  + " |");
                }

                sb.AppendLine();
            }

            // ---- 6.2 the authority columns ----------------------------------------------
            sb.AppendLine("### Workflow authority columns");
            sb.AppendLine();
            sb.AppendLine("| Role | Rank | Functional unit | Leads unit | Skip authority | May delegate "
                          + "| May grant privileges | Draftable forms | Executable steps | Assignable steps | Scopes |");
            sb.AppendLine("|---|---|---|---|---|---|---|---|---|---|---|");

            foreach (var row in Rows)
            {
                sb.AppendLine(
                    $"| {row.RoleLabel} "
                    + $"| {row.Rank} "
                    + $"| {row.FunctionalUnitLabel} "
                    + $"| {Tick(row.LeadsFunctionalUnit)} "
                    + $"| {Tick(row.HoldsSkipAuthority)} "
                    + $"| {Tick(row.MayDelegate)} "
                    + $"| {Tick(row.MayGrantPrivileges)} "
                    + $"| {row.DraftableFormCount} "
                    + $"| {row.ExecutableStepCount} "
                    + $"| {row.AssignableStepCount} "
                    + $"| {Join(row.WorkflowScopes)} |");
            }

            sb.AppendLine();

            // ---- 6.3 the scope vocabulary ------------------------------------------------
            sb.AppendLine("## 2. The per-step scope column");
            sb.AppendLine();
            sb.AppendLine("| Scope | Meaning | Steps |");
            sb.AppendLine("|---|---|---|");

            foreach (var usage in ScopeUsage())
                sb.AppendLine($"| {usage.Scope} | {usage.Description} | {usage.StepCount} |");

            sb.AppendLine();

            // ---- 6.4 the scope column per step -------------------------------------------
            foreach (var sectionCode in ToCSections.Ordered.Select(s => s.Code))
            {
                var rows = StepScopesForSection(sectionCode);
                if (rows.Length == 0) continue;

                sb.AppendLine($"### {ToCSections.TitleOf(sectionCode)}");
                sb.AppendLine();
                sb.AppendLine("| Form | Step | Capability | Pending ApprovalStatus | Eligible roles "
                              + "| Required permission | Scope | Documentation scope | Assignment unit |");
                sb.AppendLine("|---|---|---|---|---|---|---|---|---|");

                foreach (var row in rows.OrderBy(r => r.FormNo, StringComparer.OrdinalIgnoreCase)
                                        .ThenBy(r => r.StepNo))
                {
                    sb.AppendLine(
                        $"| {row.FormNo} "
                        + $"| {row.StepNo} "
                        + $"| {row.Capability} "
                        + $"| {row.PendingStatusName} ({row.PendingStatusValue}) "
                        + $"| {Join(row.EligibleRoleLabels)} "
                        + $"| {Dash(row.RequiredPermission)} "
                        + $"| {row.Scope} "
                        + $"| {Dash(row.DocumentationScope)} "
                        + $"| {row.AssignmentUnitLabel} |");
                }

                sb.AppendLine();
            }

            return sb.ToString();
        }

        /// <summary>The grid as a flat CSV: one line per role x permission cell.</summary>
        public static string GridToCsv()
        {
            var sb = new StringBuilder();
            sb.AppendLine("Role,RoleLabel,Rank,FunctionalUnit,PermissionGroup,Permission,Granted,Grantable");

            foreach (var cell in ToCells())
            {
                var row = ByRole[cell.Role];

                sb.AppendLine(string.Join(",", new[]
                {
                    Csv(cell.Role),
                    Csv(cell.RoleLabel),
                    row.Rank.ToString(),
                    Csv(row.FunctionalUnitLabel),
                    Csv(cell.PermissionGroup),
                    Csv(cell.Permission),
                    YesNo(cell.Granted),
                    YesNo(cell.Grantable)
                }));
            }

            return sb.ToString();
        }

        /// <summary>The per-step scope column as a flat CSV.</summary>
        public static string StepScopesToCsv()
        {
            var sb = new StringBuilder();
            sb.AppendLine("FormNo,FormType,Section,StepNo,Capability,Kind,PendingStatus,PendingStatusValue,"
                          + "EligibleRoles,AssignerRoles,RequiredPermission,AssignPermission,Scope,"
                          + "DocumentationScope,AssignmentUnit,RequiresManualAssignment,AllowsDelegation,"
                          + "OwnShopOnly,SignatureCaption,SkipMode");

            foreach (var row in StepScopes)
            {
                sb.AppendLine(string.Join(",", new[]
                {
                    Csv(row.FormNo),
                    Csv(row.FormType),
                    Csv(row.Section),
                    row.StepNo.ToString(),
                    Csv(row.Capability),
                    Csv(row.Kind),
                    Csv(row.PendingStatusName),
                    row.PendingStatusValue.ToString(),
                    Csv(string.Join(" | ", row.EligibleRoles)),
                    Csv(string.Join(" | ", row.AssignerRoles)),
                    Csv(row.RequiredPermission),
                    Csv(row.AssignPermission),
                    Csv(row.Scope),
                    Csv(row.DocumentationScope ?? string.Empty),
                    Csv(row.AssignmentUnitLabel),
                    YesNo(row.RequiresManualAssignment),
                    YesNo(row.AllowsDelegation),
                    YesNo(row.RestrictToOriginatorShop),
                    Csv(row.SignatureCaption),
                    Csv(row.SkipMode)
                }));
            }

            return sb.ToString();
        }

        private static string Tick(bool value) => value ? "x" : "";

        private static string Join(IEnumerable<string> values)
        {
            var joined = string.Join(" / ", values);
            return string.IsNullOrWhiteSpace(joined) ? "-" : joined;
        }

        private static string Dash(string? value) =>
            string.IsNullOrWhiteSpace(value) ? "-" : value!;

        private static string YesNo(bool value) => value ? "yes" : "no";

        private static string Csv(string value) =>
            value.Contains(',') || value.Contains('"')
                ? "\"" + value.Replace("\"", "\"\"") + "\""
                : value;

        // =================================================================================
        // 7. RECONCILIATION OF THE TWO PERMISSION MATRICES
        // =================================================================================

        /// <summary>
        /// One reported difference between the GENERIC scope (WorkflowPermissionMatrix) and
        /// the SPECIALISED scope (DocumentationPermissionMatrix) of the same step.
        /// </summary>
        public sealed class ScopeDivergence
        {
            public string FormNo { get; init; } = string.Empty;
            public string FormType { get; init; } = string.Empty;
            public int StepNo { get; init; }
            public string Capability { get; init; } = string.Empty;
            public string WorkflowScope { get; init; } = string.Empty;
            public string DocumentationScope { get; init; } = string.Empty;
            public string ExpectedDocumentationScope { get; init; } = string.Empty;

            public override string ToString() =>
                $"{FormNo} step {StepNo} ('{Capability}'): generic scope {WorkflowScope} maps to "
                + $"{ExpectedDocumentationScope}, but DocumentationPermissionMatrix declares "
                + $"{DocumentationScope}. The specialised layer wins at runtime for "
                + "DOCUMENTATION endpoints.";
        }

        /// <summary>
        /// INFORMATIONAL reconciliation, deliberately NOT part of <see cref="Validate"/>:
        /// DocumentationPermissionMatrix is the more specific layer and is allowed to be
        /// stricter than the generic one. This method lists where the two disagree so the
        /// printed document can annotate those steps instead of hiding the difference.
        /// Drafting rows (StepNo 0) are excluded: the documentation matrix intentionally
        /// prints OWN_SHOP for every documentation draft.
        /// </summary>
        public static IReadOnlyList<ScopeDivergence> ScopeDivergences()
        {
            var divergences = new List<ScopeDivergence>();

            foreach (var row in StepScopes)
            {
                if (row.StepNo == 0) continue;
                if (string.IsNullOrWhiteSpace(row.DocumentationScope)) continue;

                if (!ScopeCatalog.WorkflowToDocumentation.TryGetValue(row.Scope, out var expected))
                    continue;

                if (string.Equals(expected, row.DocumentationScope, StringComparison.OrdinalIgnoreCase))
                    continue;

                divergences.Add(new ScopeDivergence
                {
                    FormNo = row.FormNo,
                    FormType = row.FormType,
                    StepNo = row.StepNo,
                    Capability = row.Capability,
                    WorkflowScope = row.Scope,
                    DocumentationScope = row.DocumentationScope!,
                    ExpectedDocumentationScope = expected
                });
            }

            return divergences;
        }

        // =================================================================================
        // 8. SELF-CHECK
        // =================================================================================

        /// <summary>
        /// Startup / unit-test assertion of amendment document C. It fails when the printed
        /// document and the code have drifted apart:
        ///   - the role count is no longer 16, or a role does not normalise,
        ///   - a role has no default permission set,
        ///   - a Permissions constant exists but is not a grid column (or the other way round),
        ///   - Admin does not hold every permission,
        ///   - a step declares a scope outside the six documented scope labels,
        ///   - a step demands a permission that is not a grid column,
        ///   - a role is eligible for a step but its default set lacks the step permission,
        ///   - an assigner role lacks the assignment permission of the step it may assign,
        ///   - a DESIGNATED_ONLY / ASSIGNED_ONLY step exposes more than the routed role set,
        ///   - a documented scope label governs no step at all.
        /// </summary>
        public static IReadOnlyList<string> Validate()
        {
            var problems = new List<string>();

            // ---- 8.1 the 16 rows --------------------------------------------------------
            if (Rows.Length != ExpectedRoleCount)
            {
                problems.Add($"Amendment document C grids {ExpectedRoleCount} roles but "
                             + $"RoleHierarchy.AllRoles exposes {Rows.Length}.");
            }

            foreach (var row in Rows)
            {
                if (RoleHierarchy.Normalize(row.Role) is null)
                    problems.Add($"Grid row '{row.Role}': the role does not normalise.");

                if (!RoleHierarchy.DefaultPermissions.ContainsKey(row.Role))
                {
                    problems.Add($"Grid row '{row.Role}': no entry in "
                                 + "RoleHierarchy.DefaultPermissions, so the whole row is empty.");
                }

                if (row.Cells.Length != Columns.Length)
                {
                    problems.Add($"Grid row '{row.Role}': {row.Cells.Length} cells for "
                                 + $"{Columns.Length} columns.");
                }

                if (row.Role != OrgRoles.Admin && row.GrantedPermissions.Length == 0)
                    problems.Add($"Grid row '{row.Role}': holds no permission at all.");
            }

            // ---- 8.2 the columns --------------------------------------------------------
            var columnSet = new HashSet<string>(Columns, StringComparer.OrdinalIgnoreCase);

            foreach (var permission in RoleHierarchy.AllPermissions.Where(p => !columnSet.Contains(p)))
            {
                problems.Add($"Permission '{permission}' is granted by a role but is not a "
                             + "column of amendment document C.");
            }

            var knownPermissions = new HashSet<string>(
                RoleHierarchy.AllPermissions, StringComparer.OrdinalIgnoreCase);

            foreach (var column in Columns.Where(c => !knownPermissions.Contains(c)))
            {
                problems.Add($"Grid column '{column}' is printed but no role holds it: "
                             + "the permission is unreachable.");
            }

            var adminRow = RowFor(OrgRoles.Admin);
            if (adminRow is null)
            {
                problems.Add("The Admin row is missing from the grid.");
            }
            else
            {
                foreach (var column in Columns.Where(c => !adminRow.Has(c)))
                    problems.Add($"Admin does not hold '{column}': the universal supervisor is incomplete.");
            }

            // ---- 8.3 the per-step scope column -----------------------------------------
            var scopeSet = new HashSet<string>(ScopeCatalog.Workflow, StringComparer.OrdinalIgnoreCase);
            var documentationScopeSet = new HashSet<string>(
                ScopeCatalog.Documentation, StringComparer.OrdinalIgnoreCase);

            foreach (var row in StepScopes)
            {
                if (!scopeSet.Contains(row.Scope))
                {
                    problems.Add($"{row.FormNo} step {row.StepNo}: scope '{row.Scope}' is not one of "
                                 + $"the documented scopes ({string.Join(", ", ScopeCatalog.Workflow)}).");
                }

                if (!string.IsNullOrWhiteSpace(row.DocumentationScope)
                    && !documentationScopeSet.Contains(row.DocumentationScope!))
                {
                    problems.Add($"{row.FormNo} step {row.StepNo}: documentation scope "
                                 + $"'{row.DocumentationScope}' is not one of "
                                 + $"({string.Join(", ", ScopeCatalog.Documentation)}).");
                }

                if (!string.IsNullOrWhiteSpace(row.RequiredPermission)
                    && !columnSet.Contains(row.RequiredPermission))
                {
                    problems.Add($"{row.FormNo} step {row.StepNo}: required permission "
                                 + $"'{row.RequiredPermission}' is not a grid column.");
                }

                if (!string.IsNullOrWhiteSpace(row.AssignPermission)
                    && !columnSet.Contains(row.AssignPermission))
                {
                    problems.Add($"{row.FormNo} step {row.StepNo}: assign permission "
                                 + $"'{row.AssignPermission}' is not a grid column.");
                }

                // Cross-check: eligible role x required permission.
                foreach (var role in row.EligibleRoles)
                {
                    var canonical = RoleHierarchy.Normalize(role);
                    if (canonical is null)
                    {
                        problems.Add($"{row.FormNo} step {row.StepNo}: unknown eligible role '{role}'.");
                        continue;
                    }

                    if (canonical == OrgRoles.Admin) continue;
                    if (string.IsNullOrWhiteSpace(row.RequiredPermission)) continue;

                    if (!IsGrantedByDefault(canonical, row.RequiredPermission))
                    {
                        problems.Add($"{row.FormNo} step {row.StepNo} ('{row.Capability}'): "
                                     + $"{RoleHierarchy.Label(canonical)} is eligible but the grid "
                                     + $"does not grant it '{row.RequiredPermission}'.");
                    }
                }

                // Cross-check: assigner role x assign permission.
                if (row.RequiresManualAssignment && !string.IsNullOrWhiteSpace(row.AssignPermission))
                {
                    var assigners = row.AssignerRoles.Length > 0 ? row.AssignerRoles : row.EligibleRoles;

                    foreach (var role in assigners)
                    {
                        var canonical = RoleHierarchy.Normalize(role);
                        if (canonical is null)
                        {
                            problems.Add($"{row.FormNo} step {row.StepNo}: unknown assigner role '{role}'.");
                            continue;
                        }

                        if (canonical == OrgRoles.Admin) continue;

                        if (!IsGrantedByDefault(canonical, row.AssignPermission))
                        {
                            problems.Add($"{row.FormNo} step {row.StepNo}: "
                                         + $"{RoleHierarchy.Label(canonical)} may assign the step but the "
                                         + $"grid does not grant it '{row.AssignPermission}'.");
                        }
                    }
                }

                // A DESIGNATED_ONLY step is by definition routed to ONE role only.
                if (string.Equals(row.Scope, ScopeCatalog.DesignatedOnly, StringComparison.OrdinalIgnoreCase)
                    && row.EligibleRoles.Length != 1)
                {
                    problems.Add($"{row.FormNo} step {row.StepNo}: scope {ScopeCatalog.DesignatedOnly} "
                                 + $"must route to exactly one role but declares "
                                 + $"{row.EligibleRoles.Length}.");
                }

                // An ASSIGNED_ONLY / FUNCTIONAL_UNIT step must name the unit that owns it.
                if ((string.Equals(row.Scope, ScopeCatalog.AssignedOnly, StringComparison.OrdinalIgnoreCase)
                     || string.Equals(row.Scope, ScopeCatalog.FunctionalUnit, StringComparison.OrdinalIgnoreCase))
                    && string.IsNullOrWhiteSpace(row.AssignmentUnit))
                {
                    problems.Add($"{row.FormNo} step {row.StepNo}: scope {row.Scope} requires an "
                                 + "assignment unit but none is declared.");
                }
            }

            // ---- 8.4 every documented scope must govern at least one step ---------------
            foreach (var usage in ScopeUsage().Where(u => u.StepCount == 0))
            {
                problems.Add($"Scope {usage.Scope} is documented by amendment document C but no "
                             + "catalogued step applies it.");
            }

            return problems;
        }

        /// <summary>
        /// ONE call that validates amendment document C together with amendment document B,
        /// the catalog and both permission matrices. Suitable for a startup assertion or a
        /// single unit test.
        /// </summary>
        public static IReadOnlyList<string> ValidateAll() =>
            Validate()
                .Concat(WorkflowStepTableReference.Validate())
                .Concat(WorkflowPermissionMatrix.Validate())
                .Distinct(StringComparer.Ordinal)
                .ToList();
    }
}