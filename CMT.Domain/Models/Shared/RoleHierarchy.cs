using System;
using System.Collections.Generic;
using System.Linq;

namespace CMT.Domain.Models.Shared
{
    /// <summary>
    /// Canonical role names used across the whole solution - AMENDED v14.
    ///
    /// ======================== WHAT v14 CHANGES vs v8..v13 ========================
    /// v12 declared the delegated-review STATE (ApprovalStatus.PendingDelegatedReview = 31)
    /// and the catalog flags (AllowsDelegatedReview / DelegatedReviewRoles), but the ROLE
    /// layer was never amended, so the amendment could not actually be executed:
    ///
    ///   (1) The requirement names THREE approvers of the 918 forms - "the Director, ECAA, or
    ///       QA Manager". Only OrgRoles.Director appeared in DelegationRoles and only the
    ///       Director held a delegate-style permission. OrgRoles.QAPersonnel and
    ///       OrgRoles.ECAAPersonnel held NEITHER, so two of the three named managers could
    ///       never send a review to an employee. Their steps were dead ends.
    ///
    ///   (2) Reusing DelegationRoles / Permissions.DelegateForm would have been WRONG even
    ///       for the Director: that pair transfers the APPROVAL to a lower tier, whereas the
    ///       requirement explicitly keeps it ("the form will route back to the Director,
    ///       ECAA, or QA Manager for final approval, which will dynamically display the
    ///       approver's name, date, and signature"). Two different capabilities need two
    ///       different role sets.
    ///
    ///   (3) The reviewer side was missing entirely: the departmental employees, the HR
    ///       Specialist and the Documentation Clerk had no permission that lets them CONFIRM
    ///       a review, so even a successfully requested review could not be closed and the
    ///       record would be stuck in status 31 forever.
    ///
    /// v14 therefore adds, additively:
    ///   - <see cref="RoleHierarchy.DelegatedReviewRequesterRoles"/> - the approvers that may
    ///     BORROW a reviewer while keeping the approval (Director, QA, ECAA, HR Manager,
    ///     Documentation Team Leader, Manager, Admin);
    ///   - <see cref="RoleHierarchy.DelegatedReviewerRoles"/> - the employees that may act AS
    ///     the delegated reviewer;
    ///   - <see cref="RoleHierarchy.CanRequestDelegatedReview"/> /
    ///     <see cref="RoleHierarchy.CanConfirmDelegatedReview"/>;
    ///   - Permissions.RequestDelegatedReview on every requester role and
    ///     Permissions.ConfirmDelegatedReview on every reviewer role, inside
    ///     <see cref="RoleHierarchy.DefaultPermissions"/>.
    ///
    /// v14 also fixes a LATENT ROUTING BUG in <see cref="RoleHierarchy.ApproverRolesFor"/>:
    /// the v12 fallback for PendingDelegatedReview returned the union of every conceivable
    /// reviewer role, which made the ToC read path resolve an approver that has nothing to do
    /// with the form at hand (e.g. a Documentation Clerk offered as the reviewer of a 918A
    /// ECAA endorsement). It now returns the CANONICAL REVIEWER POOL ONLY - and the precise
    /// per-step pool still comes from FormWorkflowCatalog.ApproverRolesFor, which wins for
    /// every catalogued form.
    ///
    /// Nothing was renamed, removed or renumbered: every alias, every PersistedVariant and
    /// every existing permission string keeps working, so no data migration is required.
    ///
    /// ============================ THE HIERARCHY ============================
    ///   Admin
    ///     -> Director (one per department, assigned ONLY by Admin)
    ///          -> Manager (ACS, MCS, NDT, Standard ...)
    ///               -> ShopManager -> ShopTeamLeader (STL) -> Technician /
    ///                                 CertifyingStaff / QAPersonnel / Inspector /
    ///                                 ECAAPersonnel
    ///          -> DocumentationTeamLeader (DL) -> DocumentationClerk
    ///          -> HRManager -> HRSpecialist
    ///     -> SpecialTeamLeader (created by Admin UNDER a Director) -> Engineer
    ///
    /// NOTE: the persisted value of a Shop Team Leader stays "TeamLeader" so old rows
    /// and JWTs keep working. "ShopTeamLeader" / "shop_tl" / "stl" are aliases.
    /// </summary>
    public static class OrgRoles
    {
        public const string Admin = "Admin";
        public const string SpecialAdmin = "SpecialAdmin";
        public const string Director = "Director";
        public const string SpecialTeamLeader = "SpecialTeamLeader";
        public const string Manager = "Manager";
        public const string ShopManager = "ShopManager";

        /// <summary>Shop Team Leader (STL). Persisted value stays "TeamLeader".</summary>
        public const string TeamLeader = "TeamLeader";

        public const string Engineer = "Engineer";
        public const string Technician = "Technician";
        public const string CertifyingStaff = "CertifyingStaff";

        /// <summary>
        /// QA Personnel. The "QA Manager" named by the 918 / 918A requirement is this role:
        /// the aliases "qa_manager" / "qamanager" normalise to it.
        /// </summary>
        public const string QAPersonnel = "QAPersonnel";

        public const string ECAAPersonnel = "ECAAPersonnel";

        // ===== AMENDED v8: five new roles required by the Functional Workflow Matrix =====

        /// <summary>Documentation Team Leader (DL) - assigns clerks and signs off MNT-1420A.</summary>
        public const string DocumentationTeamLeader = "DocumentationTeamLeader";

        /// <summary>Documentation Clerk - processes the bulletin entry assigned by the DL.</summary>
        public const string DocumentationClerk = "DocumentationClerk";

        /// <summary>HR Specialist - verifies training enrolments and updates training status.</summary>
        public const string HRSpecialist = "HRSpecialist";

        /// <summary>HR Manager - approves the verified training package.</summary>
        public const string HRManager = "HRManager";

        /// <summary>Inspector - exclusive reviewer/approver of MNT-1378 inspection proficiency.</summary>
        public const string Inspector = "Inspector";
    }

    /// <summary>
    /// Structural requirements for a role: which parent fields are mandatory and
    /// which roles are accepted as its direct supervisor.
    /// </summary>
    public sealed class RoleRule
    {
        public string Role { get; init; } = string.Empty;
        public string Description { get; init; } = string.Empty;

        public bool RequiresDepartment { get; init; }
        public bool RequiresShop { get; init; }
        public bool RequiresSupervisor { get; init; }

        public string[] AllowedSupervisorRoles { get; init; } = Array.Empty<string>();
        public string[] PreferredSupervisorRoles { get; init; } = Array.Empty<string>();

        public bool AdminOnly { get; init; }
        public bool ManagerDelegated { get; init; }
        public bool IsIndividualPersonnel { get; init; }
        public bool SharesShopScope { get; init; }

        /// <summary>
        /// AMENDED v8: the role belongs to a CENTRAL functional unit (Documentation
        /// Team, HR Team) rather than to a shop. Its work queue is the unit queue, so
        /// the workflow engine routes to "the team" and the unit leader dispatches.
        /// </summary>
        public string? FunctionalUnit { get; init; }

        /// <summary>
        /// AMENDED v8: the role leads its functional unit and therefore may assign
        /// work inside it (DL assigns a clerk, HR Manager oversees HR Specialists).
        /// </summary>
        public bool LeadsFunctionalUnit { get; init; }
    }

    /// <summary>Names of the central functional units introduced in v8.</summary>
    public static class FunctionalUnits
    {
        public const string Documentation = "Documentation";
        public const string HumanResources = "HumanResources";
        public const string QualityAssurance = "QualityAssurance";
        public const string Authority = "Authority";
    }

    /// <summary>
    /// Single source of truth for role hierarchy, creation matrix, privilege
    /// delegation and DEFAULT approval routing. Per-form routing lives in
    /// CMT.Domain.Models.Workflow.FormWorkflowCatalog.
    /// Mirrored 1:1 by the frontend file CMT.Frontend/src/lib/role-hierarchy.ts.
    /// </summary>
    public static class RoleHierarchy
    {
        /// <summary>All canonical roles, ordered from top to bottom of the org chart.</summary>
        public static readonly string[] AllRoles =
        {
            OrgRoles.Admin,
            OrgRoles.SpecialAdmin,
            OrgRoles.Director,
            OrgRoles.SpecialTeamLeader,
            OrgRoles.Manager,
            OrgRoles.HRManager,                 // v8 - department level, peer of Manager
            OrgRoles.DocumentationTeamLeader,   // v8 - unit leader under the Director
            OrgRoles.ShopManager,
            OrgRoles.TeamLeader,
            OrgRoles.HRSpecialist,              // v8
            OrgRoles.DocumentationClerk,        // v8
            OrgRoles.Engineer,
            OrgRoles.Inspector,                 // v8
            OrgRoles.CertifyingStaff,
            OrgRoles.QAPersonnel,
            OrgRoles.Technician,
            OrgRoles.ECAAPersonnel
        };

        /// <summary>Human readable labels for UI / exports.</summary>
        public static readonly Dictionary<string, string> DisplayNames = new(StringComparer.OrdinalIgnoreCase)
        {
            [OrgRoles.Admin] = "Admin",
            [OrgRoles.SpecialAdmin] = "Special Admin",
            [OrgRoles.Director] = "Director",
            [OrgRoles.SpecialTeamLeader] = "Special Team Leader",
            [OrgRoles.Manager] = "Manager",
            [OrgRoles.ShopManager] = "Shop Manager",
            [OrgRoles.TeamLeader] = "Shop Team Leader",
            [OrgRoles.Engineer] = "Engineer",
            [OrgRoles.Technician] = "Technician",
            [OrgRoles.CertifyingStaff] = "Certifying Staff",
            [OrgRoles.QAPersonnel] = "QA Manager",
            [OrgRoles.ECAAPersonnel] = "ECAA Team",
            [OrgRoles.DocumentationTeamLeader] = "Documentation Team Leader",
            [OrgRoles.DocumentationClerk] = "Documentation Clerk",
            [OrgRoles.HRSpecialist] = "HR Specialist",
            [OrgRoles.HRManager] = "HR Manager",
            [OrgRoles.Inspector] = "Inspector"
        };

        /// <summary>Accepted aliases (legacy values, snake_case, display text) -> canonical role.</summary>
        private static readonly Dictionary<string, string> Aliases = new(StringComparer.OrdinalIgnoreCase)
        {
            ["admin"] = OrgRoles.Admin,
            ["administrator"] = OrgRoles.Admin,
            ["system_admin"] = OrgRoles.Admin,
            ["special_admin"] = OrgRoles.SpecialAdmin,
            ["specialadmin"] = OrgRoles.SpecialAdmin,
            ["special admin"] = OrgRoles.SpecialAdmin,

            ["director"] = OrgRoles.Director,
            ["dir"] = OrgRoles.Director,
            ["department_director"] = OrgRoles.Director,

            ["special_team_leader"] = OrgRoles.SpecialTeamLeader,
            ["specialteamleader"] = OrgRoles.SpecialTeamLeader,
            ["special team leader"] = OrgRoles.SpecialTeamLeader,
            ["special_tl"] = OrgRoles.SpecialTeamLeader,
            ["specialtl"] = OrgRoles.SpecialTeamLeader,

            ["manager"] = OrgRoles.Manager,
            ["mgr"] = OrgRoles.Manager,
            ["manager_role"] = OrgRoles.Manager,
            ["manager role"] = OrgRoles.Manager,
            ["department_manager"] = OrgRoles.Manager,
            ["department manager"] = OrgRoles.Manager,
            ["section_manager"] = OrgRoles.Manager,
            ["section manager"] = OrgRoles.Manager,

            ["shop_manager"] = OrgRoles.ShopManager,
            ["shopmanager"] = OrgRoles.ShopManager,
            ["shop manager"] = OrgRoles.ShopManager,

            ["team_leader"] = OrgRoles.TeamLeader,
            ["teamleader"] = OrgRoles.TeamLeader,
            ["shop_tl"] = OrgRoles.TeamLeader,
            ["shoptl"] = OrgRoles.TeamLeader,
            ["stl"] = OrgRoles.TeamLeader,
            ["shopteamleader"] = OrgRoles.TeamLeader,
            ["shop_team_leader"] = OrgRoles.TeamLeader,
            ["shop team leader"] = OrgRoles.TeamLeader,

            ["engineer"] = OrgRoles.Engineer,
            ["eng"] = OrgRoles.Engineer,

            ["technician"] = OrgRoles.Technician,
            ["tech"] = OrgRoles.Technician,

            ["certifying_staff"] = OrgRoles.CertifyingStaff,
            ["certifyingstaff"] = OrgRoles.CertifyingStaff,
            ["certifying staff"] = OrgRoles.CertifyingStaff,
            ["cs"] = OrgRoles.CertifyingStaff,

            ["qa"] = OrgRoles.QAPersonnel,
            ["qa_personnel"] = OrgRoles.QAPersonnel,
            ["qapersonnel"] = OrgRoles.QAPersonnel,
            ["qa_staff"] = OrgRoles.QAPersonnel,
            ["qastaff"] = OrgRoles.QAPersonnel,
            ["qa_manager"] = OrgRoles.QAPersonnel,
            ["qamanager"] = OrgRoles.QAPersonnel,
            ["qa manager"] = OrgRoles.QAPersonnel,
            ["quality_assurance"] = OrgRoles.QAPersonnel,

            ["ecaa"] = OrgRoles.ECAAPersonnel,
            ["ecaa_personnel"] = OrgRoles.ECAAPersonnel,
            ["ecaapersonnel"] = OrgRoles.ECAAPersonnel,
            ["ecaa_team"] = OrgRoles.ECAAPersonnel,
            ["ecaa team"] = OrgRoles.ECAAPersonnel,

            // ===== AMENDED v8 aliases =====
            ["dl"] = OrgRoles.DocumentationTeamLeader,
            ["documentation_tl"] = OrgRoles.DocumentationTeamLeader,
            ["documentationtl"] = OrgRoles.DocumentationTeamLeader,
            ["documentation_team_leader"] = OrgRoles.DocumentationTeamLeader,
            ["documentationteamleader"] = OrgRoles.DocumentationTeamLeader,
            ["documentation team leader"] = OrgRoles.DocumentationTeamLeader,
            ["doc_leader"] = OrgRoles.DocumentationTeamLeader,

            ["documentation_clerk"] = OrgRoles.DocumentationClerk,
            ["documentationclerk"] = OrgRoles.DocumentationClerk,
            ["documentation clerk"] = OrgRoles.DocumentationClerk,
            ["doc_clerk"] = OrgRoles.DocumentationClerk,
            ["clerk"] = OrgRoles.DocumentationClerk,

            ["hr_specialist"] = OrgRoles.HRSpecialist,
            ["hrspecialist"] = OrgRoles.HRSpecialist,
            ["hr specialist"] = OrgRoles.HRSpecialist,
            ["hr"] = OrgRoles.HRSpecialist,

            ["hr_manager"] = OrgRoles.HRManager,
            ["hrmanager"] = OrgRoles.HRManager,
            ["hr manager"] = OrgRoles.HRManager,

            ["inspector"] = OrgRoles.Inspector,
            ["inspection"] = OrgRoles.Inspector,
            ["inspection_staff"] = OrgRoles.Inspector
        };

        /// <summary>
        /// Every spelling of a canonical role that may legitimately sit in the
        /// Users.Role column. Server queries MUST filter with this list.
        /// </summary>
        private static readonly Dictionary<string, string[]> VariantsByCanonical =
            AllRoles.ToDictionary(
                role => role,
                role => new[] { role, role.ToLowerInvariant() }
                    .Concat(Aliases.Where(kv => string.Equals(kv.Value, role, StringComparison.OrdinalIgnoreCase))
                                   .Select(kv => kv.Key))
                    .Distinct(StringComparer.Ordinal)
                    .ToArray(),
                StringComparer.OrdinalIgnoreCase);

        /// <summary>v6 - roles only the Admin may create.</summary>
        public static readonly string[] AdminOnlyRoles =
        {
            OrgRoles.Director,
            OrgRoles.SpecialTeamLeader
        };

        /// <summary>v6 - the shop layer owned by the department Manager.</summary>
        public static readonly string[] ManagerDelegatedRoles =
        {
            OrgRoles.ShopManager,
            OrgRoles.TeamLeader
        };

        /// <summary>v6 - roles that belong to the department and sit ABOVE the Manager.</summary>
        public static readonly string[] DepartmentLevelRoles =
        {
            OrgRoles.Director
        };

        /// <summary>v7 - individual personnel. They create nobody.</summary>
        public static readonly string[] IndividualPersonnelRoles =
        {
            OrgRoles.Engineer,
            OrgRoles.Technician,
            OrgRoles.CertifyingStaff,
            OrgRoles.QAPersonnel,
            OrgRoles.ECAAPersonnel,
            OrgRoles.Inspector,             // v8
            OrgRoles.DocumentationClerk,    // v8
            OrgRoles.HRSpecialist           // v8
        };

        /// <summary>v7 - roles whose data scope is the whole shop.</summary>
        public static readonly string[] ShopGroupRoles =
        {
            OrgRoles.ShopManager,
            OrgRoles.TeamLeader
        };

        /// <summary>AMENDED v8 - the Documentation Team (MNT-1420A routing).</summary>
        public static readonly string[] DocumentationRoles =
        {
            OrgRoles.DocumentationTeamLeader,
            OrgRoles.DocumentationClerk
        };

        /// <summary>AMENDED v8 - the HR Team (training verification routing).</summary>
        public static readonly string[] HRRoles =
        {
            OrgRoles.HRManager,
            OrgRoles.HRSpecialist
        };

        /// <summary>
        /// AMENDED v8 - every role that belongs to a central functional unit rather
        /// than to a shop. Their inbox is the unit queue.
        /// </summary>
        public static readonly string[] FunctionalUnitRoles =
            DocumentationRoles.Concat(HRRoles).ToArray();

        /// <summary>v7 - roles allowed to adjust another user's privileges.</summary>
        public static readonly string[] PrivilegeGrantorRoles =
        {
            OrgRoles.Admin,
            OrgRoles.Director,
            OrgRoles.SpecialTeamLeader,
            OrgRoles.Manager,
            OrgRoles.HRManager,
            OrgRoles.DocumentationTeamLeader,
            OrgRoles.ShopManager,
            OrgRoles.TeamLeader
        };

        /// <summary>
        /// v7 - roles allowed to delegate a pending approval stage, i.e. to hand the
        /// APPROVAL ITSELF to a lower tier (Permissions.DelegateForm).
        ///
        /// AMENDED v14 - deliberately NOT extended with QAPersonnel / ECAAPersonnel: the
        /// 918 / 918A requirement keeps the approval with them and lets them borrow only a
        /// REVIEWER. That capability lives in
        /// <see cref="DelegatedReviewRequesterRoles"/>.
        /// </summary>
        public static readonly string[] DelegationRoles =
        {
            OrgRoles.Admin,
            OrgRoles.Director,
            OrgRoles.SpecialTeamLeader,
            OrgRoles.Manager,
            OrgRoles.HRManager,
            OrgRoles.DocumentationTeamLeader,
            OrgRoles.ShopManager,
            OrgRoles.TeamLeader
        };

        /// <summary>
        /// AMENDED v14 - roles that may DELEGATE A REVIEW while KEEPING the approval.
        ///
        /// Requirement, verbatim:
        ///   "FAA Form 918 &amp; CAA Form 918A: These forms are originally approved by the
        ///    Director, ECAA, or QA Manager. ... the system must allow these managers to
        ///    delegate a review assignment to a designated employee in their department."
        ///   "Service Bulletins ... the system should allow the Team Leader to assign the
        ///    form to a Documentation Clerk for review."
        ///   "Training Verification ... allow the HR Manager to delegate the initial review
        ///    to an HR Specialist."
        ///
        /// Hence: Director, QAPersonnel (= QA Manager), ECAAPersonnel,
        /// DocumentationTeamLeader, HRManager. Manager is included because the periodic
        /// self-audit and the training-verification MGR tier reuse the same mechanism.
        /// Admin may always act.
        ///
        /// A role in this set still needs the STEP to declare AllowsDelegatedReview, and the
        /// actor still needs to be an eligible executor of that step: see
        /// FormWorkflowCatalog.CanRequestDelegatedReview.
        /// </summary>
        public static readonly string[] DelegatedReviewRequesterRoles =
        {
            OrgRoles.Admin,
            OrgRoles.Director,
            OrgRoles.Manager,
            OrgRoles.HRManager,
            OrgRoles.DocumentationTeamLeader,
            OrgRoles.QAPersonnel,
            OrgRoles.ECAAPersonnel
        };

        /// <summary>
        /// AMENDED v14 - roles that may act AS a delegated reviewer and CONFIRM the review,
        /// which routes the step back to its original approver.
        ///
        /// This is the union of every pool the catalog declares:
        ///   WorkflowRoleSets.DeptEmployees    (918 / 918A Director + QA Manager)
        ///   WorkflowRoleSets.EcaaReviewPool   (918A ECAA endorsement)
        ///   WorkflowRoleSets.HrSpecialistOnly (training verification)
        ///   WorkflowRoleSets.DocumentationClerkOnly (MNT-1420A SB sign-off)
        ///
        /// Membership here is NECESSARY but not SUFFICIENT: the concrete pool of the concrete
        /// step always wins (FormWorkflowCatalog.DelegatedReviewRolesFor).
        /// </summary>
        public static readonly string[] DelegatedReviewerRoles =
        {
            OrgRoles.Manager,
            OrgRoles.ShopManager,
            OrgRoles.TeamLeader,
            OrgRoles.Engineer,
            OrgRoles.CertifyingStaff,
            OrgRoles.Inspector,
            OrgRoles.Technician,
            OrgRoles.QAPersonnel,
            OrgRoles.HRSpecialist,
            OrgRoles.DocumentationClerk
        };

        /// <summary>
        /// AMENDED v8 - roles that may SKIP a conditional step.
        /// "Conditional in-house steps can be dynamically skipped by the user" and
        /// "Dynamic 'Optional / May Skip Now' flag based on regulatory target dates".
        /// </summary>
        public static readonly string[] SkipAuthorityRoles =
        {
            OrgRoles.Admin,
            OrgRoles.Director,
            OrgRoles.Manager,
            OrgRoles.SpecialTeamLeader,
            OrgRoles.TeamLeader,
            OrgRoles.ShopManager
        };

        // ===================== NORMALISATION =====================

        public static string? Normalize(string? role)
        {
            if (string.IsNullOrWhiteSpace(role)) return null;
            var key = role.Trim();
            return Aliases.TryGetValue(key, out var canonical) ? canonical : null;
        }

        public static string Label(string? role)
        {
            var canonical = Normalize(role);
            if (canonical is not null) return DisplayNames[canonical];
            return string.IsNullOrWhiteSpace(role) ? "-" : role!.Trim();
        }

        public static string[] PersistedVariants(string? role)
        {
            var canonical = Normalize(role);
            if (canonical is null)
                return string.IsNullOrWhiteSpace(role) ? Array.Empty<string>() : new[] { role!.Trim() };

            return VariantsByCanonical.TryGetValue(canonical, out var variants)
                ? variants
                : new[] { canonical };
        }

        public static string[] PersistedVariants(IEnumerable<string>? roles)
        {
            if (roles is null) return Array.Empty<string>();
            return roles
                .SelectMany(PersistedVariants)
                .Distinct(StringComparer.Ordinal)
                .ToArray();
        }

        /// <summary>Seniority index; lower is more senior. Unknown roles sort last.</summary>
        public static int RankOf(string? role)
        {
            var canonical = Normalize(role);
            if (canonical is null) return int.MaxValue;
            var index = Array.IndexOf(AllRoles, canonical);
            return index < 0 ? int.MaxValue : index;
        }

        public static bool IsAdminOnly(string? role)
        {
            var canonical = Normalize(role);
            return canonical is not null
                && AdminOnlyRoles.Contains(canonical, StringComparer.OrdinalIgnoreCase);
        }

        public static bool IsManagerDelegated(string? role)
        {
            var canonical = Normalize(role);
            return canonical is not null
                && ManagerDelegatedRoles.Contains(canonical, StringComparer.OrdinalIgnoreCase);
        }

        public static bool IsDepartmentLevel(string? role)
        {
            var canonical = Normalize(role);
            return canonical is not null
                && DepartmentLevelRoles.Contains(canonical, StringComparer.OrdinalIgnoreCase);
        }

        public static bool IsIndividualPersonnel(string? role)
        {
            var canonical = Normalize(role);
            return canonical is not null
                && IndividualPersonnelRoles.Contains(canonical, StringComparer.OrdinalIgnoreCase);
        }

        public static bool SharesShopScope(string? role)
        {
            var canonical = Normalize(role);
            return canonical is not null
                && ShopGroupRoles.Contains(canonical, StringComparer.OrdinalIgnoreCase);
        }

        /// <summary>AMENDED v8 - the functional unit of a role, or null for shop roles.</summary>
        public static string? FunctionalUnitOf(string? role) => RuleFor(role)?.FunctionalUnit;

        /// <summary>AMENDED v8 - true when the role leads its functional unit (DL, HR Manager).</summary>
        public static bool LeadsFunctionalUnit(string? role) => RuleFor(role)?.LeadsFunctionalUnit == true;

        /// <summary>AMENDED v8 - true when the role may skip a conditional / optional step.</summary>
        public static bool CanSkipSteps(string? role)
        {
            var canonical = Normalize(role);
            return canonical is not null
                && SkipAuthorityRoles.Contains(canonical, StringComparer.OrdinalIgnoreCase);
        }

        /// <summary>
        /// AMENDED v14 - true when the role is, in principle, allowed to borrow a delegated
        /// reviewer. The STEP must additionally declare AllowsDelegatedReview: use
        /// FormWorkflowCatalog.CanRequestDelegatedReview for the full decision.
        /// </summary>
        public static bool CanRequestDelegatedReview(string? role)
        {
            var canonical = Normalize(role);
            return canonical is not null
                && DelegatedReviewRequesterRoles.Contains(canonical, StringComparer.OrdinalIgnoreCase);
        }

        /// <summary>
        /// AMENDED v14 - true when the role may, in principle, act as a delegated reviewer.
        /// The STEP's own DelegatedReviewRoles pool must additionally contain it: use
        /// FormWorkflowCatalog.CanActAsDelegatedReviewer for the full decision.
        /// </summary>
        public static bool CanConfirmDelegatedReview(string? role)
        {
            var canonical = Normalize(role);
            if (canonical is null) return false;
            if (canonical == OrgRoles.Admin) return true;
            return DelegatedReviewerRoles.Contains(canonical, StringComparer.OrdinalIgnoreCase);
        }

        // ===================== CREATION MATRIX =====================

        /// <summary>
        /// THE CREATION MATRIX - who may create whom. Enforced server side.
        ///
        ///   Admin              -> every role
        ///   Director           -> Manager, HR Manager, Documentation Team Leader, and the
        ///                         shop layer ONLY while the department has no active Manager
        ///   SpecialTeamLeader  -> Engineer
        ///   Manager            -> SpecialAdmin, ShopManager, TeamLeader
        ///   ShopManager        -> TeamLeader, CertifyingStaff
        ///   TeamLeader (STL)   -> Technician, CertifyingStaff, QAPersonnel, Inspector, ECAAPersonnel
        ///   DocumentationTeamLeader -> DocumentationClerk           (v8)
        ///   HRManager               -> HRSpecialist                 (v8)
        /// </summary>
        public static readonly Dictionary<string, string[]> CreationMatrix = new(StringComparer.OrdinalIgnoreCase)
        {
            [OrgRoles.Admin] = new[]
            {
                OrgRoles.SpecialAdmin,
                OrgRoles.Director,
                OrgRoles.SpecialTeamLeader,
                OrgRoles.Manager,
                OrgRoles.HRManager,
                OrgRoles.DocumentationTeamLeader,
                OrgRoles.ShopManager,
                OrgRoles.TeamLeader,
                OrgRoles.HRSpecialist,
                OrgRoles.DocumentationClerk,
                OrgRoles.Engineer,
                OrgRoles.Inspector,
                OrgRoles.Technician,
                OrgRoles.CertifyingStaff,
                OrgRoles.QAPersonnel,
                OrgRoles.ECAAPersonnel,
                OrgRoles.Admin
            },
            [OrgRoles.Director] = new[]
            {
                OrgRoles.Manager,
                OrgRoles.HRManager,
                OrgRoles.DocumentationTeamLeader,
                OrgRoles.ShopManager,
                OrgRoles.TeamLeader
            },
            [OrgRoles.SpecialTeamLeader] = new[]
            {
                OrgRoles.Engineer
            },
            [OrgRoles.Manager] = new[]
            {
                OrgRoles.SpecialAdmin,
                OrgRoles.ShopManager,
                OrgRoles.TeamLeader
            },
            [OrgRoles.ShopManager] = new[]
            {
                OrgRoles.TeamLeader,
                OrgRoles.CertifyingStaff
            },
            [OrgRoles.TeamLeader] = new[]
            {
                OrgRoles.Technician,
                OrgRoles.CertifyingStaff,
                OrgRoles.QAPersonnel,
                OrgRoles.Inspector,
                OrgRoles.ECAAPersonnel
            },

            // ===== AMENDED v8 =====
            [OrgRoles.DocumentationTeamLeader] = new[] { OrgRoles.DocumentationClerk },
            [OrgRoles.HRManager] = new[] { OrgRoles.HRSpecialist },

            [OrgRoles.Engineer] = Array.Empty<string>(),
            [OrgRoles.Technician] = Array.Empty<string>(),
            [OrgRoles.CertifyingStaff] = Array.Empty<string>(),
            [OrgRoles.QAPersonnel] = Array.Empty<string>(),
            [OrgRoles.ECAAPersonnel] = Array.Empty<string>(),
            [OrgRoles.Inspector] = Array.Empty<string>(),
            [OrgRoles.DocumentationClerk] = Array.Empty<string>(),
            [OrgRoles.HRSpecialist] = Array.Empty<string>()
        };

        /// <summary>Structural rules per role.</summary>
        public static readonly Dictionary<string, RoleRule> Rules = new(StringComparer.OrdinalIgnoreCase)
        {
            [OrgRoles.Admin] = new RoleRule
            {
                Role = OrgRoles.Admin,
                Description = "Top-level authority with strategic oversight. Creates Directors and Special Team Leaders and may bootstrap any branch of the organisation.",
                AllowedSupervisorRoles = new[] { OrgRoles.Admin },
                AdminOnly = true
            },
            [OrgRoles.SpecialAdmin] = new RoleRule
            {
                Role = OrgRoles.SpecialAdmin,
                Description = "Training Documents reviewer and approver for Training Verification (Inspection), Training Verification (Technician), and Competency Assessment (MNT 3.14-020) only.",
                RequiresDepartment = true,
                AllowedSupervisorRoles = new[] { OrgRoles.Manager, OrgRoles.Admin },
                PreferredSupervisorRoles = new[] { OrgRoles.Manager }
            },
            [OrgRoles.Director] = new RoleRule
            {
                Role = OrgRoles.Director,
                Description = "One per department, assigned ONLY by the Admin. Final sign-off of Amendment Requests (MNT-918) and Letters of Confirmation, and entry point of the joint 918 / 918A approval path. AMENDED v14: may delegate a REVIEW of the 918 / 918A approval to a designated employee of his department and still signs the approval himself.",
                RequiresDepartment = true,
                AllowedSupervisorRoles = new[] { OrgRoles.Admin },
                PreferredSupervisorRoles = new[] { OrgRoles.Admin },
                AdminOnly = true
            },
            [OrgRoles.SpecialTeamLeader] = new RoleRule
            {
                Role = OrgRoles.SpecialTeamLeader,
                Description = "Created by the Admin UNDER a Director. Approves TNA (MNT-1229B) after the Manager, approves alternate-tool pathways, assigns Engineers, and may assign ATA records or update entries directly.",
                RequiresSupervisor = true,
                AllowedSupervisorRoles = new[] { OrgRoles.Director, OrgRoles.Admin },
                PreferredSupervisorRoles = new[] { OrgRoles.Director },
                AdminOnly = true
            },
            [OrgRoles.Manager] = new RoleRule
            {
                Role = OrgRoles.Manager,
                Description = "Reports to the Director. Runs a department section (ACS, MCS, NDT, Standard ...). First approval of the standard TNA sequence and first tier of the Letter of Confirmation escalation. Owns the shop layer.",
                RequiresDepartment = true,
                AllowedSupervisorRoles = new[] { OrgRoles.Director, OrgRoles.Admin },
                PreferredSupervisorRoles = new[] { OrgRoles.Director }
            },
            [OrgRoles.HRManager] = new RoleRule
            {
                Role = OrgRoles.HRManager,
                Description = "AMENDED v8. Leads the HR Team. Approves the training package after HR Specialist verification, then the record returns to the requesting Shop Team Leader. AMENDED v14: may delegate the INITIAL REVIEW of the training verification to an HR Specialist and still provides the final approval himself.",
                RequiresDepartment = false,
                AllowedSupervisorRoles = new[] { OrgRoles.Director, OrgRoles.Admin },
                PreferredSupervisorRoles = new[] { OrgRoles.Director },
                FunctionalUnit = FunctionalUnits.HumanResources,
                LeadsFunctionalUnit = true
            },
            [OrgRoles.DocumentationTeamLeader] = new RoleRule
            {
                Role = OrgRoles.DocumentationTeamLeader,
                Description = "AMENDED v8. Documentation Team Leader (DL). Receives SB/SL/SIL (MNT-1420A), assigns an available Documentation Clerk, and performs the final review and sign-off. AMENDED v14: may additionally send the sign-off step to a Documentation Clerk for review and then issue the final approval himself.",
                RequiresDepartment = false,
                AllowedSupervisorRoles = new[] { OrgRoles.Director, OrgRoles.Manager, OrgRoles.Admin },
                PreferredSupervisorRoles = new[] { OrgRoles.Director },
                FunctionalUnit = FunctionalUnits.Documentation,
                LeadsFunctionalUnit = true
            },
            [OrgRoles.ShopManager] = new RoleRule
            {
                Role = OrgRoles.ShopManager,
                Description = "Reports to the department Manager. Oversees shop-level operations and sees all Shop Team Leaders of the shop as one group.",
                RequiresShop = true,
                AllowedSupervisorRoles = new[] { OrgRoles.Manager, OrgRoles.Director, OrgRoles.Admin },
                PreferredSupervisorRoles = new[] { OrgRoles.Manager },
                ManagerDelegated = true,
                SharesShopScope = true
            },
            [OrgRoles.TeamLeader] = new RoleRule
            {
                Role = OrgRoles.TeamLeader,
                Description = "Shop Team Leader (STL). Drafts New ATA Records, manually assigns them to a Certifying Staff member, reassigns to lower-tier staff when workload is high, holds sole authority over AD (MNT-1420B), drafts TNA (MNT-1229B) or assigns it to an Engineer, and enrols employees of HIS OWN SHOP ONLY for training.",
                RequiresShop = true,
                AllowedSupervisorRoles = new[] { OrgRoles.ShopManager, OrgRoles.Manager, OrgRoles.Director, OrgRoles.Admin },
                PreferredSupervisorRoles = new[] { OrgRoles.ShopManager, OrgRoles.Manager },
                ManagerDelegated = true,
                SharesShopScope = true
            },
            [OrgRoles.HRSpecialist] = new RoleRule
            {
                Role = OrgRoles.HRSpecialist,
                Description = "AMENDED v8. Verifies training enrolments submitted by a Shop Team Leader, updates training status records, filters eligible employees and forwards the package to the HR Manager. AMENDED v14: may also be picked by the HR Manager as the delegated REVIEWER of the training-verification approval step; confirming the review returns the step to the HR Manager.",
                AllowedSupervisorRoles = new[] { OrgRoles.HRManager, OrgRoles.Director, OrgRoles.Admin },
                PreferredSupervisorRoles = new[] { OrgRoles.HRManager },
                IsIndividualPersonnel = true,
                FunctionalUnit = FunctionalUnits.HumanResources
            },
            [OrgRoles.DocumentationClerk] = new RoleRule
            {
                Role = OrgRoles.DocumentationClerk,
                Description = "AMENDED v8. Processes the SB/SL/SIL entry assigned by the Documentation Team Leader and returns it to the DL for sign-off. AMENDED v14: may also be picked by the DL as the delegated REVIEWER of the sign-off step; confirming the review returns the step to the DL.",
                AllowedSupervisorRoles = new[] { OrgRoles.DocumentationTeamLeader, OrgRoles.Director, OrgRoles.Admin },
                PreferredSupervisorRoles = new[] { OrgRoles.DocumentationTeamLeader },
                IsIndividualPersonnel = true,
                FunctionalUnit = FunctionalUnits.Documentation
            },
            [OrgRoles.Engineer] = new RoleRule
            {
                Role = OrgRoles.Engineer,
                Description = "Assigned by a Special Team Leader or an STL. Creates ATA Record drafts, drafts TNA (MNT-1229B) and the alternate-tool pathway which routes to the Special Team Leader for approval.",
                AllowedSupervisorRoles = new[] { OrgRoles.SpecialTeamLeader, OrgRoles.TeamLeader, OrgRoles.Director, OrgRoles.Admin },
                PreferredSupervisorRoles = new[] { OrgRoles.SpecialTeamLeader },
                IsIndividualPersonnel = true
            },
            [OrgRoles.Inspector] = new RoleRule
            {
                Role = OrgRoles.Inspector,
                Description = "AMENDED v8. Designated Inspector. Inspection Proficiency (MNT-1378) is routed EXCLUSIVELY to this role for sequential review and final approval.",
                RequiresShop = true,
                AllowedSupervisorRoles = new[] { OrgRoles.TeamLeader, OrgRoles.ShopManager, OrgRoles.Manager, OrgRoles.Admin },
                PreferredSupervisorRoles = new[] { OrgRoles.TeamLeader, OrgRoles.ShopManager },
                IsIndividualPersonnel = true
            },
            [OrgRoles.CertifyingStaff] = new RoleRule
            {
                Role = OrgRoles.CertifyingStaff,
                Description = "Certifying Staff. Receives New ATA Records manually assigned by the STL, certifies and approves shop forms.",
                RequiresShop = true,
                AllowedSupervisorRoles = new[] { OrgRoles.TeamLeader, OrgRoles.ShopManager, OrgRoles.Manager, OrgRoles.Admin },
                PreferredSupervisorRoles = new[] { OrgRoles.TeamLeader, OrgRoles.ShopManager },
                IsIndividualPersonnel = true
            },
            [OrgRoles.QAPersonnel] = new RoleRule
            {
                Role = OrgRoles.QAPersonnel,
                Description = "Quality assurance (the \"QA Manager\" of the 918 requirement). Second stage of the joint 918 / 918A path: signs Form MNT-918 after the Director. AMENDED v14: may delegate a REVIEW of that approval to a designated employee of the department and still signs the approval himself.",
                RequiresShop = true,
                AllowedSupervisorRoles = new[] { OrgRoles.TeamLeader, OrgRoles.ShopManager, OrgRoles.Manager, OrgRoles.Admin },
                PreferredSupervisorRoles = new[] { OrgRoles.TeamLeader, OrgRoles.ShopManager },
                IsIndividualPersonnel = true,
                FunctionalUnit = FunctionalUnits.QualityAssurance
            },
            [OrgRoles.Technician] = new RoleRule
            {
                Role = OrgRoles.Technician,
                Description = "Shop floor personnel promoted by a Shop Team Leader. Competency Assessment (MNT 3.14-020 / MNT-922C) is routed directly to the Technician for review and task completion sign-off.",
                RequiresShop = true,
                AllowedSupervisorRoles = new[] { OrgRoles.TeamLeader, OrgRoles.ShopManager, OrgRoles.Manager, OrgRoles.Admin },
                PreferredSupervisorRoles = new[] { OrgRoles.TeamLeader, OrgRoles.ShopManager },
                IsIndividualPersonnel = true
            },
            [OrgRoles.ECAAPersonnel] = new RoleRule
            {
                Role = OrgRoles.ECAAPersonnel,
                Description = "ECAA Team. Final stage of the joint 918 / 918A path: endorses Form MNT-918A. AMENDED v14: may delegate a REVIEW of that endorsement to a designated employee and still endorses the form himself.",
                RequiresShop = false,
                AllowedSupervisorRoles = new[] { OrgRoles.TeamLeader, OrgRoles.ShopManager, OrgRoles.Manager, OrgRoles.Director, OrgRoles.Admin },
                PreferredSupervisorRoles = new[] { OrgRoles.TeamLeader, OrgRoles.ShopManager },
                IsIndividualPersonnel = true,
                FunctionalUnit = FunctionalUnits.Authority
            }
        };

        public static bool CanCreate(string? creatorRole, string? targetRole)
        {
            var creator = Normalize(creatorRole);
            var target = Normalize(targetRole);
            if (creator is null || target is null) return false;
            if (IsAdminOnly(target) && creator != OrgRoles.Admin) return false;

            return CreationMatrix.TryGetValue(creator, out var allowed)
                && allowed.Contains(target, StringComparer.OrdinalIgnoreCase);
        }

        public static string[] CreatableRoles(string? creatorRole)
        {
            var creator = Normalize(creatorRole);
            if (creator is null) return Array.Empty<string>();
            if (!CreationMatrix.TryGetValue(creator, out var allowed)) return Array.Empty<string>();
            if (creator == OrgRoles.Admin) return allowed;
            return allowed.Where(r => !IsAdminOnly(r)).ToArray();
        }

        public static string[] CreatableRoles(string? creatorRole, bool departmentHasActiveManager)
        {
            var allowed = CreatableRoles(creatorRole);
            if (!departmentHasActiveManager) return allowed;
            return allowed
                .Where(r => !IsBlockedByManagerDelegation(creatorRole, r, true))
                .ToArray();
        }

        public static RoleRule? RuleFor(string? role)
        {
            var canonical = Normalize(role);
            if (canonical is null) return null;
            return Rules.TryGetValue(canonical, out var rule) ? rule : null;
        }

        public static bool CanSupervise(string? supervisorRole, string? targetRole)
        {
            var supervisor = Normalize(supervisorRole);
            var rule = RuleFor(targetRole);
            if (supervisor is null || rule is null) return false;
            if (supervisor == OrgRoles.Admin) return true;
            return rule.AllowedSupervisorRoles.Contains(supervisor, StringComparer.OrdinalIgnoreCase);
        }

        public static bool IsBlockedByManagerDelegation(
            string? creatorRole,
            string? targetRole,
            bool departmentHasActiveManager)
        {
            if (!departmentHasActiveManager) return false;
            var creator = Normalize(creatorRole);
            if (creator is null || creator == OrgRoles.Admin) return false;
            return IsDepartmentLevel(creator) && IsManagerDelegated(targetRole);
        }

        // ===================== DEFAULT PERMISSIONS =====================

        /// <summary>
        /// Default permission set per canonical role - AMENDED v14.
        /// The effective set is (defaults + AdditionalPermissions) - RevokedPermissions.
        ///
        /// v14 additions, and ONLY these:
        ///   Permissions.RequestDelegatedReview -> Admin, Director, Manager, HRManager,
        ///                                         DocumentationTeamLeader, QAPersonnel,
        ///                                         ECAAPersonnel
        ///   Permissions.ConfirmDelegatedReview -> Admin, Manager, ShopManager, TeamLeader,
        ///                                         Engineer, CertifyingStaff, Inspector,
        ///                                         Technician, QAPersonnel, HRSpecialist,
        ///                                         DocumentationClerk
        ///
        /// WITHOUT these two grants WorkflowPermissionMatrix.Validate() reports every
        /// delegated-review row as "eligible but the default permission set does not contain
        /// the required permission", i.e. the step would be unreachable in production.
        /// </summary>
        public static readonly Dictionary<string, string[]> DefaultPermissions = new(StringComparer.OrdinalIgnoreCase)
        {
            [OrgRoles.Admin] = new[]
            {
                Permissions.CreateShop, Permissions.EditShop, Permissions.DeleteShop, Permissions.ViewShop,
                Permissions.CreateATARecord, Permissions.EditATARecord, Permissions.DeleteATARecord, Permissions.ViewATARecord,
                Permissions.SubmitATARecord, Permissions.ApproveATARecord, Permissions.RejectATARecord,
                Permissions.AssignATARecord, Permissions.DirectUpdateATARecord,
                Permissions.CreateForm, Permissions.EditForm, Permissions.DeleteForm, Permissions.ViewForm,
                Permissions.SubmitForm, Permissions.ApproveForm, Permissions.RejectForm, Permissions.DelegateForm,
                Permissions.ReturnForm, Permissions.SkipFormStep, Permissions.AssignFormStep, Permissions.SignOffForm,
                Permissions.RequestDelegatedReview, Permissions.ConfirmDelegatedReview,
                Permissions.GrantUploadPrivilege,
                Permissions.CreateFolder, Permissions.EditFolder, Permissions.ViewFolder,
                Permissions.CompleteFolder, Permissions.LockFolder, Permissions.GenerateFolderReport,
                Permissions.AssignDocumentationClerk, Permissions.SignOffDocumentation,
                Permissions.EnrollTraining, Permissions.VerifyTraining, Permissions.ApproveTraining,
                Permissions.AmendExpiredRecord, Permissions.TriggerRevision, Permissions.ApproveRevision,
                Permissions.ViewMatrix, Permissions.EditMatrix,
                Permissions.ViewNotification, Permissions.ViewWorkflowAudit,
                Permissions.UploadFile, Permissions.DeleteFile, Permissions.ViewFile, Permissions.ApproveFile,
                Permissions.CreateUser, Permissions.EditUser, Permissions.DeleteUser, Permissions.ViewUser, Permissions.AssignRole,
                Permissions.CreateDepartment, Permissions.EditDepartment, Permissions.ViewDepartment
            },
            [OrgRoles.SpecialAdmin] = new[]
            {
                Permissions.ViewForm, Permissions.EditForm, Permissions.ApproveForm,
                Permissions.RejectForm, Permissions.ReturnForm, Permissions.SignOffForm,
                Permissions.ViewNotification, Permissions.ViewWorkflowAudit,
                Permissions.ViewFile, Permissions.ApproveFile
            },
            [OrgRoles.Director] = new[]
            {
                Permissions.CreateShop, Permissions.EditShop, Permissions.ViewShop,
                Permissions.ViewATARecord, Permissions.EditATARecord, Permissions.ApproveATARecord, Permissions.RejectATARecord,
                Permissions.ViewForm, Permissions.EditForm, Permissions.ApproveForm, Permissions.RejectForm,
                Permissions.DelegateForm, Permissions.ReturnForm, Permissions.SkipFormStep, Permissions.SignOffForm,
                // AMENDED v14 - 918 / 918A: borrow a departmental reviewer, keep the approval.
                Permissions.RequestDelegatedReview,
                Permissions.ViewFolder, Permissions.EditFolder, Permissions.CompleteFolder, Permissions.LockFolder,
                Permissions.GenerateFolderReport,
                Permissions.ApproveTraining, Permissions.ApproveRevision, Permissions.TriggerRevision,
                Permissions.ViewMatrix, Permissions.ViewNotification, Permissions.ViewWorkflowAudit,
                Permissions.ViewFile, Permissions.ApproveFile,
                Permissions.CreateUser, Permissions.EditUser, Permissions.DeleteUser, Permissions.ViewUser, Permissions.AssignRole,
                Permissions.CreateDepartment, Permissions.EditDepartment, Permissions.ViewDepartment
            },
            [OrgRoles.SpecialTeamLeader] = new[]
            {
                Permissions.ViewShop,
                Permissions.ViewATARecord, Permissions.EditATARecord, Permissions.ApproveATARecord, Permissions.RejectATARecord,
                Permissions.AssignATARecord, Permissions.DirectUpdateATARecord,
                Permissions.ViewForm, Permissions.EditForm, Permissions.ApproveForm, Permissions.RejectForm,
                Permissions.DelegateForm, Permissions.ReturnForm, Permissions.SkipFormStep,
                Permissions.AssignFormStep, Permissions.SignOffForm,
                Permissions.ViewFolder, Permissions.GenerateFolderReport,
                Permissions.ViewMatrix, Permissions.ViewNotification, Permissions.ViewWorkflowAudit,
                Permissions.ViewFile, Permissions.ApproveFile,
                Permissions.CreateUser, Permissions.EditUser, Permissions.ViewUser, Permissions.AssignRole
            },
            [OrgRoles.Manager] = new[]
            {
                Permissions.ViewShop, Permissions.EditShop,
                Permissions.ViewATARecord, Permissions.EditATARecord, Permissions.ApproveATARecord, Permissions.RejectATARecord,
                Permissions.ViewForm, Permissions.EditForm, Permissions.ApproveForm, Permissions.RejectForm,
                Permissions.DelegateForm, Permissions.ReturnForm, Permissions.SkipFormStep, Permissions.SignOffForm,
                // AMENDED v14 - a Manager both borrows reviewers (own approval tiers) and may
                // BE picked as the delegated reviewer of a Director / QA 918 step.
                Permissions.RequestDelegatedReview, Permissions.ConfirmDelegatedReview,
                Permissions.ViewFolder, Permissions.EditFolder, Permissions.GenerateFolderReport,
                Permissions.ApproveTraining, Permissions.ApproveRevision,
                Permissions.ViewMatrix, Permissions.ViewNotification, Permissions.ViewWorkflowAudit,
                Permissions.ViewFile, Permissions.ApproveFile,
                Permissions.CreateUser, Permissions.EditUser, Permissions.ViewUser, Permissions.AssignRole,
                Permissions.ViewDepartment
            },
            [OrgRoles.HRManager] = new[]
            {
                Permissions.ViewShop, Permissions.ViewATARecord,
                Permissions.ViewForm, Permissions.EditForm, Permissions.ApproveForm, Permissions.RejectForm,
                Permissions.DelegateForm, Permissions.ReturnForm, Permissions.AssignFormStep, Permissions.SignOffForm,
                // AMENDED v14 - Training Verification: delegate the initial review to an HR
                // Specialist, then provide the final approval personally.
                Permissions.RequestDelegatedReview,
                Permissions.ViewFolder,
                Permissions.VerifyTraining, Permissions.ApproveTraining,
                Permissions.AmendExpiredRecord, Permissions.ViewMatrix, Permissions.EditMatrix,
                Permissions.ViewNotification, Permissions.ViewWorkflowAudit,
                Permissions.ViewFile, Permissions.ApproveFile,
                Permissions.CreateUser, Permissions.EditUser, Permissions.ViewUser
            },
            [OrgRoles.DocumentationTeamLeader] = new[]
            {
                Permissions.ViewShop, Permissions.ViewATARecord,
                Permissions.CreateForm, Permissions.EditForm, Permissions.ViewForm, Permissions.SubmitForm,
                Permissions.ApproveForm, Permissions.RejectForm, Permissions.DelegateForm, Permissions.ReturnForm,
                Permissions.AssignFormStep, Permissions.SignOffForm,
                // AMENDED v14 - Service Bulletins: assign the sign-off to a clerk for review,
                // then issue the final approval personally.
                Permissions.RequestDelegatedReview,
                Permissions.AssignDocumentationClerk, Permissions.SignOffDocumentation,
                Permissions.ViewFolder, Permissions.ViewMatrix,
                Permissions.ViewNotification, Permissions.ViewWorkflowAudit,
                Permissions.UploadFile, Permissions.ViewFile, Permissions.ApproveFile,
                Permissions.CreateUser, Permissions.EditUser, Permissions.ViewUser
            },
            [OrgRoles.ShopManager] = new[]
            {
                Permissions.ViewShop, Permissions.EditShop,
                Permissions.CreateATARecord, Permissions.EditATARecord, Permissions.ViewATARecord,
                Permissions.SubmitATARecord, Permissions.ApproveATARecord, Permissions.RejectATARecord,
                Permissions.AssignATARecord,
                Permissions.CreateForm, Permissions.EditForm, Permissions.ViewForm,
                Permissions.SubmitForm, Permissions.ApproveForm, Permissions.RejectForm,
                Permissions.DelegateForm, Permissions.ReturnForm, Permissions.SkipFormStep,
                Permissions.AssignFormStep, Permissions.SignOffForm,
                // AMENDED v14 - eligible delegated reviewer of a 918 / 918A departmental review.
                Permissions.ConfirmDelegatedReview,
                Permissions.CreateFolder, Permissions.EditFolder, Permissions.ViewFolder,
                Permissions.CompleteFolder, Permissions.GenerateFolderReport,
                Permissions.EnrollTraining, Permissions.AmendExpiredRecord, Permissions.TriggerRevision,
                Permissions.ViewMatrix, Permissions.EditMatrix,
                Permissions.ViewNotification, Permissions.ViewWorkflowAudit,
                Permissions.UploadFile, Permissions.ViewFile, Permissions.ApproveFile,
                Permissions.CreateUser, Permissions.EditUser, Permissions.ViewUser, Permissions.AssignRole
            },
            [OrgRoles.TeamLeader] = new[]
            {
                Permissions.ViewShop, Permissions.EditShop,
                Permissions.CreateATARecord, Permissions.EditATARecord, Permissions.ViewATARecord,
                Permissions.SubmitATARecord, Permissions.ApproveATARecord, Permissions.RejectATARecord,
                Permissions.AssignATARecord,
                Permissions.CreateForm, Permissions.EditForm, Permissions.ViewForm,
                Permissions.SubmitForm, Permissions.ApproveForm, Permissions.RejectForm,
                Permissions.DelegateForm, Permissions.ReturnForm, Permissions.SkipFormStep,
                Permissions.AssignFormStep, Permissions.SignOffForm,
                // AMENDED v14 - eligible delegated reviewer of a 918 / 918A departmental review.
                Permissions.ConfirmDelegatedReview,
                Permissions.CreateFolder, Permissions.EditFolder, Permissions.ViewFolder,
                Permissions.CompleteFolder, Permissions.GenerateFolderReport,
                Permissions.EnrollTraining, Permissions.AmendExpiredRecord, Permissions.TriggerRevision,
                Permissions.ViewMatrix, Permissions.EditMatrix,
                Permissions.ViewNotification, Permissions.ViewWorkflowAudit,
                Permissions.UploadFile, Permissions.DeleteFile, Permissions.ViewFile, Permissions.ApproveFile,
                Permissions.CreateUser, Permissions.EditUser, Permissions.ViewUser, Permissions.AssignRole
            },
            [OrgRoles.HRSpecialist] = new[]
            {
                Permissions.ViewShop, Permissions.ViewATARecord,
                Permissions.EditForm, Permissions.ViewForm, Permissions.SubmitForm, Permissions.ApproveForm,
                Permissions.ReturnForm,
                // AMENDED v14 - Training Verification: act as the HR Manager's delegated reviewer.
                Permissions.ConfirmDelegatedReview,
                Permissions.ViewFolder,
                Permissions.VerifyTraining,
                Permissions.ViewMatrix, Permissions.EditMatrix,
                Permissions.ViewNotification,
                Permissions.UploadFile, Permissions.ViewFile
            },
            [OrgRoles.DocumentationClerk] = new[]
            {
                Permissions.ViewShop, Permissions.ViewATARecord,
                Permissions.EditForm, Permissions.ViewForm, Permissions.SubmitForm, Permissions.ReturnForm,
                // AMENDED v14 - Service Bulletins: act as the DL's delegated reviewer.
                Permissions.ConfirmDelegatedReview,
                Permissions.ViewFolder,
                Permissions.ViewNotification,
                Permissions.UploadFile, Permissions.ViewFile
            },
            [OrgRoles.Engineer] = new[]
            {
                Permissions.ViewShop,
                Permissions.CreateATARecord, Permissions.EditATARecord, Permissions.ViewATARecord, Permissions.SubmitATARecord,
                Permissions.CreateForm, Permissions.EditForm, Permissions.ViewForm, Permissions.SubmitForm,
                Permissions.ApproveForm, Permissions.RejectForm, Permissions.ReturnForm, Permissions.SkipFormStep,
                // AMENDED v14 - eligible delegated reviewer (918 / 918A, ECAA pool).
                Permissions.ConfirmDelegatedReview,
                Permissions.ViewFolder,
                Permissions.ViewMatrix, Permissions.ViewNotification,
                Permissions.UploadFile, Permissions.ViewFile
            },
            [OrgRoles.Inspector] = new[]
            {
                Permissions.ViewShop, Permissions.ViewATARecord,
                Permissions.EditForm, Permissions.ViewForm, Permissions.SubmitForm,
                Permissions.ApproveForm, Permissions.RejectForm, Permissions.ReturnForm, Permissions.SignOffForm,
                // AMENDED v14 - eligible delegated reviewer (918 / 918A, ECAA pool).
                Permissions.ConfirmDelegatedReview,
                Permissions.ViewFolder,
                Permissions.ViewMatrix, Permissions.ViewNotification,
                Permissions.UploadFile, Permissions.ViewFile, Permissions.ApproveFile
            },
            [OrgRoles.CertifyingStaff] = new[]
            {
                Permissions.ViewShop,
                Permissions.ViewATARecord, Permissions.EditATARecord, Permissions.SubmitATARecord,
                Permissions.EditForm, Permissions.ViewForm, Permissions.SubmitForm,
                Permissions.ApproveForm, Permissions.ReturnForm, Permissions.SignOffForm,
                // AMENDED v14 - eligible delegated reviewer (918 / 918A, ECAA pool).
                Permissions.ConfirmDelegatedReview,
                Permissions.ViewFolder,
                Permissions.ViewMatrix, Permissions.ViewNotification,
                Permissions.UploadFile, Permissions.ViewFile, Permissions.ApproveFile
            },
            [OrgRoles.QAPersonnel] = new[]
            {
                Permissions.ViewShop,
                Permissions.ViewATARecord, Permissions.ApproveATARecord, Permissions.RejectATARecord,
                Permissions.ViewForm, Permissions.ApproveForm, Permissions.RejectForm,
                Permissions.ReturnForm, Permissions.SignOffForm,
                // AMENDED v14 - the QA Manager BOTH borrows a reviewer for his own MNT-918
                // approval AND may be picked as the ECAA Team's delegated reviewer on MNT-918A.
                Permissions.RequestDelegatedReview, Permissions.ConfirmDelegatedReview,
                Permissions.ViewFolder, Permissions.GenerateFolderReport,
                Permissions.ViewMatrix, Permissions.ViewNotification, Permissions.ViewWorkflowAudit,
                Permissions.ViewFile, Permissions.ApproveFile,
                Permissions.ViewUser, Permissions.ViewDepartment
            },
            [OrgRoles.Technician] = new[]
            {
                Permissions.ViewShop,
                Permissions.ViewATARecord,
                Permissions.EditForm, Permissions.ViewForm, Permissions.SubmitForm,
                Permissions.ApproveForm, Permissions.SignOffForm,
                // AMENDED v14 - eligible delegated reviewer (918 / 918A departmental pool).
                Permissions.ConfirmDelegatedReview,
                Permissions.ViewFolder,
                Permissions.ViewNotification,
                Permissions.UploadFile, Permissions.ViewFile
            },
            [OrgRoles.ECAAPersonnel] = new[]
            {
                Permissions.ViewShop,
                Permissions.ViewATARecord,
                Permissions.ViewForm, Permissions.ApproveForm, Permissions.RejectForm, Permissions.SignOffForm,
                // AMENDED v14 - MNT-918A: borrow a reviewer, keep the endorsement.
                Permissions.RequestDelegatedReview,
                Permissions.ViewFolder,
                Permissions.ViewNotification,
                Permissions.ViewFile
            }
        };

        public static readonly string[] AllPermissions =
            DefaultPermissions.Values
                .SelectMany(v => v)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(p => p, StringComparer.OrdinalIgnoreCase)
                .ToArray();

        public static HashSet<string> EffectivePermissions(string? role, string? additionalCsv, string? revokedCsv)
        {
            var canonical = Normalize(role);
            var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            if (canonical is not null && DefaultPermissions.TryGetValue(canonical, out var defaults))
            {
                foreach (var p in defaults) result.Add(p);
            }

            foreach (var p in SplitCsv(additionalCsv)) result.Add(p);
            foreach (var p in SplitCsv(revokedCsv)) result.Remove(p);

            return result;
        }

        public static bool HasPermission(string? role, string? additionalCsv, string? revokedCsv, string permission)
            => EffectivePermissions(role, additionalCsv, revokedCsv).Contains(permission);

        private static IEnumerable<string> SplitCsv(string? csv)
        {
            if (string.IsNullOrWhiteSpace(csv)) return Array.Empty<string>();
            return csv.Split(',', StringSplitOptions.RemoveEmptyEntries)
                      .Select(x => x.Trim())
                      .Where(x => x.Length > 0);
        }

        // ============ PRIVILEGE DELEGATION ============

        public static bool CanGrantPrivileges(string? grantorRole)
        {
            var canonical = Normalize(grantorRole);
            return canonical is not null
                && PrivilegeGrantorRoles.Contains(canonical, StringComparer.OrdinalIgnoreCase);
        }

        public static string[] GrantablePermissions(string? grantorRole)
        {
            var canonical = Normalize(grantorRole);
            if (canonical is null || !CanGrantPrivileges(canonical)) return Array.Empty<string>();
            if (canonical == OrgRoles.Admin) return AllPermissions;

            return DefaultPermissions.TryGetValue(canonical, out var own)
                ? own.Distinct(StringComparer.OrdinalIgnoreCase)
                     .OrderBy(p => p, StringComparer.OrdinalIgnoreCase)
                     .ToArray()
                : Array.Empty<string>();
        }

        public static bool CanAdjustPrivilegesOf(string? grantorRole, string? targetRole)
        {
            var grantor = Normalize(grantorRole);
            var target = Normalize(targetRole);
            if (grantor is null || target is null) return false;
            if (!CanGrantPrivileges(grantor)) return false;
            if (grantor == OrgRoles.Admin) return true;
            if (grantor == OrgRoles.Manager && target == OrgRoles.SpecialAdmin) return true;
            if (IsAdminOnly(target)) return false;
            return RankOf(target) > RankOf(grantor);
        }

        public static bool CanGrantPermission(string? grantorRole, string? targetRole, string permission)
        {
            if (!CanAdjustPrivilegesOf(grantorRole, targetRole)) return false;
            if (string.IsNullOrWhiteSpace(permission)) return false;
            return GrantablePermissions(grantorRole)
                .Contains(permission.Trim(), StringComparer.OrdinalIgnoreCase);
        }

        // ===================== DEFAULT APPROVAL ROUTING =====================
        // AMENDED v8: this is now only the FALLBACK chain, used when a form type has
        // no entry in FormWorkflowCatalog. Per-form chains (SB/AD/TNA/Training/918/
        // Amendment/Letter) live in CMT.Domain.Models.Workflow.FormWorkflowCatalog.

        public sealed class ApprovalStage
        {
            public ApprovalStatus Status { get; init; }
            public string[] ApproverRoles { get; init; } = Array.Empty<string>();
            public string Title { get; init; } = string.Empty;
        }

        /// <summary>
        /// DEFAULT chain: Shop Team Leader review -> QA / Certifying Staff ->
        /// Manager -> Director -> Approved.
        /// </summary>
        public static readonly ApprovalStage[] StandardChain =
        {
            new ApprovalStage
            {
                Status = ApprovalStatus.PendingTeamLeaderReview,
                Title = "Shop Team Leader / Engineer review",
                ApproverRoles = new[]
                {
                    OrgRoles.TeamLeader, OrgRoles.ShopManager,
                    OrgRoles.SpecialTeamLeader, OrgRoles.Engineer, OrgRoles.Admin
                }
            },
            new ApprovalStage
            {
                Status = ApprovalStatus.PendingQAApproval,
                Title = "QA / Certifying Staff approval",
                ApproverRoles = new[]
                {
                    OrgRoles.QAPersonnel, OrgRoles.CertifyingStaff,
                    OrgRoles.ECAAPersonnel, OrgRoles.Admin
                }
            },
            new ApprovalStage
            {
                Status = ApprovalStatus.PendingManagerApproval,
                Title = "Department Manager approval",
                ApproverRoles = new[] { OrgRoles.Manager, OrgRoles.ShopManager, OrgRoles.Admin }
            },
            new ApprovalStage
            {
                Status = ApprovalStatus.PendingDirectorApproval,
                Title = "Director approval",
                ApproverRoles = new[] { OrgRoles.Director, OrgRoles.SpecialTeamLeader, OrgRoles.Admin }
            }
        };

        /// <summary>
        /// AMENDED v8 - roles allowed to act while a record sits in ANY status,
        /// including all v8 statuses. This is the role gate used when a workflow
        /// instance is not available (legacy call sites).
        /// </summary>
        public static string[] ApproverRolesFor(ApprovalStatus status)
        {
            var stage = StandardChain.FirstOrDefault(s => s.Status == status);
            if (stage is not null) return stage.ApproverRoles;

            return status switch
            {
                ApprovalStatus.PendingAssignment => new[] { OrgRoles.TeamLeader, OrgRoles.ShopManager, OrgRoles.SpecialTeamLeader, OrgRoles.DocumentationTeamLeader, OrgRoles.HRManager, OrgRoles.Admin },
                ApprovalStatus.PendingCertifyingStaffAction => new[] { OrgRoles.CertifyingStaff, OrgRoles.TeamLeader, OrgRoles.Admin },
                ApprovalStatus.PendingEngineerAction => new[] { OrgRoles.Engineer, OrgRoles.SpecialTeamLeader, OrgRoles.Admin },
                ApprovalStatus.PendingDocumentationTeam => new[] { OrgRoles.DocumentationTeamLeader, OrgRoles.Admin },
                ApprovalStatus.PendingDocumentationClerk => new[] { OrgRoles.DocumentationClerk, OrgRoles.DocumentationTeamLeader, OrgRoles.Admin },
                ApprovalStatus.PendingDocumentationLeaderSignOff => new[] { OrgRoles.DocumentationTeamLeader, OrgRoles.Admin },
                ApprovalStatus.PendingShopTeamLeaderIssue => new[] { OrgRoles.TeamLeader, OrgRoles.Admin },
                ApprovalStatus.PendingSpecialTeamLeaderApproval => new[] { OrgRoles.SpecialTeamLeader, OrgRoles.Admin },
                ApprovalStatus.PendingInhouseProcess => new[] { OrgRoles.Engineer, OrgRoles.TeamLeader, OrgRoles.SpecialTeamLeader, OrgRoles.Admin },
                ApprovalStatus.PendingHRVerification => new[] { OrgRoles.HRSpecialist, OrgRoles.HRManager, OrgRoles.Admin },
                ApprovalStatus.PendingHRManagerApproval => new[] { OrgRoles.HRManager, OrgRoles.Admin },
                ApprovalStatus.PendingRequesterVerification => new[] { OrgRoles.TeamLeader, OrgRoles.ShopManager, OrgRoles.Admin },
                ApprovalStatus.PendingInspectorReview => new[] { OrgRoles.Inspector, OrgRoles.Admin },
                ApprovalStatus.PendingInspectorApproval => new[] { OrgRoles.Inspector, OrgRoles.Admin },
                ApprovalStatus.PendingTechnicianSignOff => new[] { OrgRoles.Technician, OrgRoles.Admin },
                ApprovalStatus.PendingECAAEndorsement => new[] { OrgRoles.ECAAPersonnel, OrgRoles.Admin },
                ApprovalStatus.PendingSelfAuditCheck => new[] { OrgRoles.QAPersonnel, OrgRoles.TeamLeader, OrgRoles.ShopManager, OrgRoles.Admin },
                ApprovalStatus.PendingFinalSignOff => new[] { OrgRoles.Director, OrgRoles.Manager, OrgRoles.Admin },
                ApprovalStatus.PendingAmendmentApproval => new[] { OrgRoles.TeamLeader, OrgRoles.ShopManager, OrgRoles.Manager, OrgRoles.HRManager, OrgRoles.Admin },

                // AMENDED v14 - read-path FALLBACK for the delegated-review excursion.
                //
                // While a step sits in PendingDelegatedReview the actor is the delegated
                // REVIEWER, not the approver. TableOfContentController.ResolveApproverAsync
                // calls THIS method directly, so returning Array.Empty here made the approver
                // vanish from the inbox (the v12 "disappearing approver" bug).
                //
                // v12 fixed that by returning a hand-written union that ALSO contained roles
                // no reviewer pool ever declares, which produced the opposite defect: a
                // Documentation Clerk was offered as the reviewer of a 918A ECAA endorsement.
                // v14 therefore returns exactly DelegatedReviewerRoles - the union of the pools
                // the catalog really declares - plus Admin.
                //
                // For a CATALOGUED form the precise per-step pool from
                // FormWorkflowCatalog.ApproverRolesFor(formType, status) still wins; this
                // fallback only guarantees the legacy read path never yields an empty set.
                ApprovalStatus.PendingDelegatedReview =>
                    DelegatedReviewerRoles.Append(OrgRoles.Admin).ToArray(),

                _ => Array.Empty<string>()
            };
        }

        public static ApprovalStage? StageOf(ApprovalStatus status)
            => StandardChain.FirstOrDefault(s => s.Status == status);

        public static bool CanActOn(string? role, ApprovalStatus status)
        {
            var canonical = Normalize(role);
            if (canonical is null) return false;
            if (canonical == OrgRoles.Admin) return true;
            return ApproverRolesFor(status).Contains(canonical, StringComparer.OrdinalIgnoreCase);
        }

        public static bool CanDelegate(string? role, ApprovalStatus status)
        {
            var canonical = Normalize(role);
            if (canonical is null) return false;
            if (canonical == OrgRoles.Admin) return true;

            return DelegationRoles.Contains(canonical, StringComparer.OrdinalIgnoreCase)
                && CanActOn(canonical, status);
        }

        public static ApprovalStatus NextStatusAfterApproval(ApprovalStatus current)
        {
            var index = Array.FindIndex(StandardChain, s => s.Status == current);
            if (index < 0) return ApprovalStatus.Approved;
            if (index >= StandardChain.Length - 1) return ApprovalStatus.Approved;
            return StandardChain[index + 1].Status;
        }

        public static ApprovalStatus StatusAfterRejection(ApprovalStatus current) => ApprovalStatus.Rejected;

        public static ApprovalStatus StatusAfterReturn(ApprovalStatus current)
        {
            var index = Array.FindIndex(StandardChain, s => s.Status == current);
            if (index <= 0) return ApprovalStatus.Returned;
            return StandardChain[index - 1].Status;
        }

        public static ApprovalStatus FirstStatusAfterSubmit() => StandardChain[0].Status;

        public static bool IsPending(ApprovalStatus status)
            => ApprovalStatusInfo.StateOf(status) == FormLifecycleState.Pending;

        public static bool IsWithOriginator(ApprovalStatus status)
            => ApprovalStatusInfo.IsWithOriginator(status);

        public static IEnumerable<(string Status, string Approvers)> RoutingReference()
        {
            foreach (var stage in StandardChain)
            {
                yield return (stage.Status.ToString(), string.Join(" | ", stage.ApproverRoles));
            }
            yield return (ApprovalStatus.Approved.ToString(), "-");
            yield return (ApprovalStatus.Returned.ToString(), "Originator must correct and resubmit");
            yield return (ApprovalStatus.Rejected.ToString(), "Originator must revise and resubmit");
            yield return (ApprovalStatus.PendingDelegatedReview.ToString(),
                "Delegated reviewer confirms, then the SAME step returns to its original approver");
        }
    }
}