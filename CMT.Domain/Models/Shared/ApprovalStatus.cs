using System.Collections.Generic;

namespace CMT.Domain.Models.Shared
{
    /// <summary>
    /// Approval status enum for the hierarchical workflow - AMENDED v14.
    ///
    /// ======================== WHAT v14 CHANGES vs v13 ========================
    /// v12 added <see cref="ApprovalStatus.PendingDelegatedReview"/> (= 31) but it added it
    /// as a STATE ONLY: no permission existed to enter or to leave that state, therefore the
    /// three amendment items could never be executed by a real user:
    ///
    ///   (1) "FAA Form 918 &amp; CAA Form 918A ... the system must allow these managers to
    ///        delegate a review assignment to a designated employee in their department."
    ///        The managers named by the requirement are the Director, the ECAA Team and the
    ///        QA Manager. Only the Director held Permissions.DelegateForm; QAPersonnel and
    ///        ECAAPersonnel held NEITHER DelegateForm NOR membership of
    ///        RoleHierarchy.DelegationRoles, so the "delegate a review" action was
    ///        unreachable for two of the three approvers.
    ///
    ///   (2) Re-using Permissions.DelegateForm for the delegated review would have been
    ///        wrong anyway: DelegateForm hands the APPROVAL ITSELF to a lower tier, which is
    ///        exactly what the requirement forbids ("the form will route back to the
    ///        Director, ECAA, or QA Manager for final approval, which will dynamically
    ///        display the approver's name, date and signature").
    ///
    /// v14 therefore adds TWO dedicated, additive permissions:
    ///   - <see cref="Permissions.RequestDelegatedReview"/> - the OWNER of the approval step
    ///     sends it to a delegated reviewer while KEEPING the approval;
    ///   - <see cref="Permissions.ConfirmDelegatedReview"/> - the delegated reviewer confirms
    ///     the review, which returns the step to its original approver.
    ///
    /// NOTHING was renumbered. No existing constant was renamed or removed, so every
    /// persisted ApprovalStatus value and every AdditionalPermissions / RevokedPermissions
    /// CSV written by v1..v13 keeps its exact meaning and no data migration is required.
    ///
    /// v14 also adds the explicit `using System.Collections.Generic;` this file always needed
    /// for <see cref="RolePermissionMap"/> (it compiled only while ImplicitUsings happened to
    /// be enabled on CMT.Domain).
    ///
    /// ======================== WHAT v8..v13 ALREADY DID ========================
    /// v7 only knew ONE generic chain (Team Leader -> QA -> Manager -> Director).
    /// The Functional Workflow Matrix requires a DIFFERENT chain per form:
    ///   - SB / SL / SIL (MNT-1420A) : Documentation Team -> Clerk -> DL sign-off
    ///   - AD (MNT-1420B)            : Shop Team Leader only (draft + issue)
    ///   - TNA (MNT-1229B)           : Manager -> Special Team Leader
    ///   - Training verification      : HR Specialist -> HR Manager -> back to STL
    ///   - Inspector proficiency 1378 : Inspector only
    ///   - Competency 922C / 3.14-020 : Technician sign-off
    ///   - Amendment Request 918       : straight to Director
    ///   - Letter of Confirmation      : Manager -> Director
    ///   - 918 / 918A joint path       : Director -> QA -> ECAA
    ///   - MNT-1325 self-audit check   : step-by-step verification before release
    /// </summary>
    public enum ApprovalStatus
    {
        // ---------- v1..v7 values: DO NOT RENUMBER ----------
        Draft = 0,
        PendingTeamLeaderReview = 1,
        PendingManagerApproval = 2,
        PendingDirectorApproval = 3,
        PendingQAApproval = 4,
        Approved = 5,
        Rejected = 6,
        Returned = 7,

        // ---------- AMENDED v8: lifecycle additions ----------

        /// <summary>The step / form was skipped (skip logic or "Optional / May Skip Now").</summary>
        Skipped = 8,

        /// <summary>An expiry date passed (training verification, calibration, certification).</summary>
        Expired = 9,

        /// <summary>
        /// Drafted and waiting for MANUAL assignment (STL assigns Certifying Staff,
        /// DL assigns a clerk, STL assigns an Engineer).
        /// </summary>
        PendingAssignment = 10,

        // ---------- New ATA Record management ----------

        /// <summary>Assigned to a designated Certifying Staff member for action.</summary>
        PendingCertifyingStaffAction = 11,

        /// <summary>Assigned to an Engineer (ENG) for drafting / technical completion.</summary>
        PendingEngineerAction = 12,

        // ---------- Documentation & AD / SB (MNT-1420A / MNT-1420B) ----------

        /// <summary>Routed to the Documentation Team; the DL must pick a clerk.</summary>
        PendingDocumentationTeam = 13,

        /// <summary>A Documentation Clerk is processing the bulletin entry.</summary>
        PendingDocumentationClerk = 14,

        /// <summary>Back with the Documentation Team Leader for final review and sign-off.</summary>
        PendingDocumentationLeaderSignOff = 15,

        /// <summary>AD (MNT-1420B): the Shop Team Leader must issue the final approval.</summary>
        PendingShopTeamLeaderIssue = 16,

        // ---------- Tools & Equipment (MNT-1229B) ----------

        /// <summary>Standard TNA sequence step 1: department Manager approval.</summary>
        PendingSpecialTeamLeaderApproval = 17,

        /// <summary>In-house manufacturing / risk assessment step (skippable).</summary>
        PendingInhouseProcess = 18,

        // ---------- Training & qualification ----------

        /// <summary>HR Specialist verification of the enrolment / training status.</summary>
        PendingHRVerification = 19,

        /// <summary>HR Manager approval after HR verification.</summary>
        PendingHRManagerApproval = 20,

        /// <summary>Returned to the requesting Shop Team Leader for training verification.</summary>
        PendingRequesterVerification = 21,

        /// <summary>MNT-1378: sequential review by the designated Inspector.</summary>
        PendingInspectorReview = 22,

        /// <summary>MNT-1378: final approval by the designated Inspector.</summary>
        PendingInspectorApproval = 23,

        /// <summary>MNT-922C / MNT 3.14-020: Technician review and task completion sign-off.</summary>
        PendingTechnicianSignOff = 24,

        // ---------- Regulatory compliance 918 / 918A ----------

        /// <summary>Joint approval path: ECAA Team endorsement of MNT-918A.</summary>
        PendingECAAEndorsement = 25,

        /// <summary>MNT-1325 Periodic Capability Self-Audit step-by-step check before release.</summary>
        PendingSelfAuditCheck = 26,

        // ---------- Folder level ----------

        /// <summary>Final sequential sign-off of the whole evaluation folder.</summary>
        PendingFinalSignOff = 27,

        /// <summary>Every task approved: the process is officially complete.</summary>
        Completed = 28,

        /// <summary>Completed AND locked; only a revision / amendment cycle may reopen it.</summary>
        Locked = 29,

        /// <summary>An expired item is being amended and re-approved (amendment cycle).</summary>
        PendingAmendmentApproval = 30,

        /// <summary>
        /// AMENDED v12 - a delegated reviewer is confirming the review; once confirmed the
        /// step returns to its approver (Director / QA / ECAA / HR Manager) for final
        /// approval. 918 / 918A and Training Verification.
        ///
        /// AMENDED v14 - this is a TRANSIENT EXCURSION of ONE step, never a step of its own:
        /// the instance keeps its StepNo, so when the reviewer confirms, the SAME step
        /// resumes with its own Status / EligibleRoles / Signature. That is exactly why the
        /// printed signature block keeps stamping the APPROVER's name, date and signature and
        /// never the reviewer's - the reviewer owns no SignatureBlockType.
        /// Consequently NO catalogued step ever declares this value as its own
        /// WorkflowStepDefinition.Status; see FormWorkflowCatalog.NonRoutingStatuses.
        /// </summary>
        PendingDelegatedReview = 31,

        // ---------- AMENDED v13 ----------

        /// <summary>
        /// An approval was REVOKED after it was granted (audit finding, superseded
        /// revision). The Table Of Contents badge renders "Revoked"; the form returns
        /// to the originator and the upload lock stays applied until a fresh cycle
        /// completes. Additive: no existing member renumbered.
        /// </summary>
        Revoked = 32
    }

    /// <summary>
    /// AMENDED v8 - the five buckets the Table Of Contents renders per form.
    /// Requirement: "live per-form status (Draft / Pending / Approved / Skipped / Expired)".
    /// </summary>
    public enum FormLifecycleState
    {
        Draft = 0,
        Pending = 1,
        Approved = 2,
        Skipped = 3,
        Expired = 4,

        /// <summary>Rejected / returned - still owned by the originator, shown in red.</summary>
        ActionRequired = 5
    }

    /// <summary>
    /// AMENDED v13 - upload capability state of a form.
    ///
    /// Requirement (FACILITY REQUIREMENT EVALUATION + CONSUMABLES, generalised to every
    /// catalogued form): "once the final approval/sign-off is completed, file upload
    /// capabilities are strictly locked. Users cannot upload additional attachments
    /// post-completion unless explicitly granted upload privileges by an Admin."
    /// </summary>
    public enum UploadLockState
    {
        /// <summary>The form is still in flight; uploads follow the normal permission rules.</summary>
        Open = 0,

        /// <summary>
        /// Final approval / sign-off completed: uploads are LOCKED. The only ways back
        /// in are an active FormUploadGrant created by an Admin, or an Admin acting
        /// directly (break-glass).
        /// </summary>
        LockedByCompletion = 1
    }

    /// <summary>
    /// AMENDED v8 - metadata for every <see cref="ApprovalStatus"/> so the UI and the
    /// PDF report share one source of truth instead of duplicating switch statements.
    /// </summary>
    public static class ApprovalStatusInfo
    {
        /// <summary>Human readable label used by the UI, exports and the PDF report.</summary>
        public static string Label(ApprovalStatus status) => status switch
        {
            ApprovalStatus.Draft => "Draft",
            ApprovalStatus.PendingTeamLeaderReview => "Pending Shop Team Leader review",
            ApprovalStatus.PendingManagerApproval => "Pending Manager approval",
            ApprovalStatus.PendingDirectorApproval => "Pending Director approval",
            ApprovalStatus.PendingQAApproval => "Pending QA approval",
            ApprovalStatus.Approved => "Approved",
            ApprovalStatus.Rejected => "Rejected",
            ApprovalStatus.Returned => "Returned for correction",
            ApprovalStatus.Skipped => "Skipped",
            ApprovalStatus.Expired => "Expired",
            ApprovalStatus.PendingAssignment => "Pending assignment",
            ApprovalStatus.PendingCertifyingStaffAction => "Pending Certifying Staff action",
            ApprovalStatus.PendingEngineerAction => "Pending Engineer action",
            ApprovalStatus.PendingDocumentationTeam => "Pending Documentation Team",
            ApprovalStatus.PendingDocumentationClerk => "Pending Documentation Clerk",
            ApprovalStatus.PendingDocumentationLeaderSignOff => "Pending Documentation Team Leader sign-off",
            ApprovalStatus.PendingShopTeamLeaderIssue => "Pending Shop Team Leader issue",
            ApprovalStatus.PendingSpecialTeamLeaderApproval => "Pending Special Admin approval",
            ApprovalStatus.PendingInhouseProcess => "Pending in-house process",
            ApprovalStatus.PendingHRVerification => "Pending HR Specialist verification",
            ApprovalStatus.PendingHRManagerApproval => "Pending HR Manager approval",
            ApprovalStatus.PendingRequesterVerification => "Pending requester (STL) verification",
            ApprovalStatus.PendingInspectorReview => "Pending Inspector review",
            ApprovalStatus.PendingInspectorApproval => "Pending Inspector approval",
            ApprovalStatus.PendingTechnicianSignOff => "Pending Technician sign-off",
            ApprovalStatus.PendingECAAEndorsement => "Pending ECAA endorsement",
            ApprovalStatus.PendingSelfAuditCheck => "Pending MNT-1325 self-audit check",
            ApprovalStatus.PendingFinalSignOff => "Pending final sign-off",
            ApprovalStatus.Completed => "Completed",
            ApprovalStatus.Locked => "Completed and locked",
            ApprovalStatus.PendingAmendmentApproval => "Pending amendment approval",
            ApprovalStatus.PendingDelegatedReview => "Pending delegated review",
            ApprovalStatus.Revoked => "Revoked",
            _ => status.ToString()
        };

        /// <summary>Bucket rendered by the Table Of Contents.</summary>
        public static FormLifecycleState StateOf(ApprovalStatus status) => status switch
        {
            ApprovalStatus.Draft => FormLifecycleState.Draft,
            ApprovalStatus.Skipped => FormLifecycleState.Skipped,
            ApprovalStatus.Expired => FormLifecycleState.Expired,
            ApprovalStatus.Approved => FormLifecycleState.Approved,
            ApprovalStatus.Completed => FormLifecycleState.Approved,
            ApprovalStatus.Locked => FormLifecycleState.Approved,
            ApprovalStatus.Rejected => FormLifecycleState.ActionRequired,
            ApprovalStatus.Returned => FormLifecycleState.ActionRequired,
            ApprovalStatus.Revoked => FormLifecycleState.ActionRequired,
            _ => FormLifecycleState.Pending
        };

        /// <summary>True when no further workflow action is possible without a new cycle.</summary>
        public static bool IsTerminal(ApprovalStatus status) =>
            status == ApprovalStatus.Approved
            || status == ApprovalStatus.Completed
            || status == ApprovalStatus.Locked
            || status == ApprovalStatus.Skipped;

        /// <summary>True when the originator (not an approver) must act next.</summary>
        public static bool IsWithOriginator(ApprovalStatus status) =>
            status == ApprovalStatus.Draft
            || status == ApprovalStatus.Rejected
            || status == ApprovalStatus.Returned
            || status == ApprovalStatus.Expired;

        /// <summary>True when the record counts as "done" for completion tracking.</summary>
        public static bool CountsAsComplete(ApprovalStatus status) =>
            status == ApprovalStatus.Approved
            || status == ApprovalStatus.Completed
            || status == ApprovalStatus.Locked
            || status == ApprovalStatus.Skipped;

        /// <summary>
        /// AMENDED v14 - true while the record sits inside the delegated-review excursion of
        /// its CURRENT step. The Table Of Contents renders it as "Pending" (see StateOf) but
        /// the inbox must route it to the reviewer pool, not to the approver, so the read
        /// paths need this predicate instead of comparing the enum by hand.
        /// </summary>
        public static bool IsAwaitingDelegatedReview(ApprovalStatus status) =>
            status == ApprovalStatus.PendingDelegatedReview;
    }

    /// <summary>
    /// Legacy lowercase role values. KEPT for backwards compatibility: old JWTs and
    /// old rows may still carry them. RoleHierarchy.Normalize() maps them to the
    /// canonical OrgRoles values.
    /// </summary>
    public static class UserRoles
    {
        public const string Admin = "admin";
        public const string Director = "director";
        public const string Manager = "manager";
        public const string ShopManager = "shop_manager";
        public const string TeamLeader = "team_leader";
        public const string ShopTeamLeader = "shop_tl";
        public const string Engineer = "engineer";
        public const string Technician = "technician";
        public const string CertifyingStaff = "certifying_staff";
        public const string QAManager = "qa_manager";

        // ===== AMENDED v8: legacy spellings for the new roles =====
        public const string SpecialTeamLeader = "special_tl";
        public const string DocumentationTeamLeader = "documentation_tl";
        public const string DocumentationClerk = "documentation_clerk";
        public const string HRSpecialist = "hr_specialist";
        public const string HRManager = "hr_manager";
        public const string Inspector = "inspector";
        public const string ECAAPersonnel = "ecaa";
    }

    /// <summary>
    /// Permissions for role-based access control - AMENDED v14.
    /// v14 adds the two delegated-review permissions. All v7..v13 constants are unchanged,
    /// so existing AdditionalPermissions / RevokedPermissions CSV values stored on Users
    /// keep working.
    /// </summary>
    public static class Permissions
    {
        // ===== Shop =====
        public const string CreateShop = "shop.create";
        public const string EditShop = "shop.edit";
        public const string DeleteShop = "shop.delete";
        public const string ViewShop = "shop.view";

        // ===== ATA Record =====
        public const string CreateATARecord = "ata_record.create";
        public const string EditATARecord = "ata_record.edit";
        public const string DeleteATARecord = "ata_record.delete";
        public const string ViewATARecord = "ata_record.view";
        public const string SubmitATARecord = "ata_record.submit";
        public const string ApproveATARecord = "ata_record.approve";
        public const string RejectATARecord = "ata_record.reject";

        /// <summary>AMENDED v8: STL manually assigns the record to a Certifying Staff member.</summary>
        public const string AssignATARecord = "ata_record.assign";

        /// <summary>AMENDED v8: Special Team Leader may update entries directly.</summary>
        public const string DirectUpdateATARecord = "ata_record.direct_update";

        /// <summary>PHASE 1: grant a time-boxed create-right to another user.</summary>
        public const string DelegateATARecordCreation = "ata_record.delegate_creation";

        /// <summary>PHASE 1: route an ATA record to one or more target shops.</summary>
        public const string RouteATARecord = "ata_record.route";

        /// <summary>PHASE 1: read the Engineer record-count metrics (Phase 2 UI).</summary>
        public const string ViewEngineerMetrics = "metrics.view_engineer";

        // ===== Form =====
        public const string CreateForm = "form.create";
        public const string EditForm = "form.edit";
        public const string DeleteForm = "form.delete";
        public const string ViewForm = "form.view";
        public const string SubmitForm = "form.submit";
        public const string ApproveForm = "form.approve";
        public const string RejectForm = "form.reject";

        /// <summary>
        /// Hand the pending APPROVAL ITSELF to lower-tier staff ("Shop Team Leaders can
        /// assign these to lower-tier staff if workload is high"). The delegate then signs
        /// the step. Deliberately NOT used by the delegated review, which keeps the approval
        /// with the manager: see <see cref="RequestDelegatedReview"/>.
        /// </summary>
        public const string DelegateForm = "form.delegate";

        /// <summary>AMENDED v8: return a form to the previous step for rework.</summary>
        public const string ReturnForm = "form.return";

        /// <summary>AMENDED v8: skip a conditional / optional step (skip logic).</summary>
        public const string SkipFormStep = "form.skip";

        /// <summary>AMENDED v8: manually assign or re-assign a pending step.</summary>
        public const string AssignFormStep = "form.assign";

        /// <summary>AMENDED v8: place the legally binding signature on a form.</summary>
        public const string SignOffForm = "form.signoff";

        /// <summary>
        /// AMENDED v14 - the OWNER of an approval step (Director / QA Manager / ECAA Team /
        /// HR Manager / Documentation Team Leader) sends that step to a delegated reviewer
        /// while KEEPING the approval.
        ///
        /// Requirement: "the system must allow these managers to delegate a review assignment
        /// to a designated employee in their department. Once the employee completes the
        /// review and confirms it, the form will route back to the Director, ECAA, or QA
        /// Manager for final approval."
        ///
        /// This is intentionally NOT <see cref="DelegateForm"/>: DelegateForm transfers the
        /// approval, this permission only borrows a reviewer, which is why the printed
        /// "Approved by" line keeps showing the manager's name, date and signature.
        /// </summary>
        public const string RequestDelegatedReview = "form.request_review";

        /// <summary>
        /// AMENDED v14 - the delegated reviewer confirms the review, which routes the step
        /// back to its original approver. Held by the departmental / unit employees that may
        /// appear in WorkflowStepDefinition.DelegatedReviewRoles.
        /// </summary>
        public const string ConfirmDelegatedReview = "form.confirm_review";

        /// <summary>
        /// AMENDED v13 - Admin-only privilege: grant a specific user a time-boxed
        /// upload right on a form whose uploads are locked by completion.
        /// </summary>
        public const string GrantUploadPrivilege = "form.grant_upload";

        // ===== Evaluation folder (Self-Evaluation per ATA / Component) =====
        public const string CreateFolder = "folder.create";
        public const string EditFolder = "folder.edit";
        public const string ViewFolder = "folder.view";
        public const string CompleteFolder = "folder.complete";
        public const string LockFolder = "folder.lock";
        public const string GenerateFolderReport = "folder.report";

        // ===== Documentation team =====
        public const string AssignDocumentationClerk = "documentation.assign_clerk";
        public const string SignOffDocumentation = "documentation.signoff";

        // ===== Training / HR =====
        public const string EnrollTraining = "training.enroll";
        public const string VerifyTraining = "training.verify";
        public const string ApproveTraining = "training.approve";

        // ===== Expiry / revision / matrices =====
        public const string AmendExpiredRecord = "expiry.amend";
        public const string TriggerRevision = "revision.trigger";
        public const string ApproveRevision = "revision.approve";
        public const string ViewMatrix = "matrix.view";
        public const string EditMatrix = "matrix.edit";

        // ===== Notifications & audit =====
        public const string ViewNotification = "notification.view";
        public const string ViewWorkflowAudit = "workflow.view_audit";

        // ===== File =====
        public const string UploadFile = "file.upload";
        public const string DeleteFile = "file.delete";
        public const string ViewFile = "file.view";
        public const string ApproveFile = "file.approve";

        // ===== User management =====
        public const string CreateUser = "user.create";
        public const string EditUser = "user.edit";
        public const string DeleteUser = "user.delete";
        public const string ViewUser = "user.view";
        public const string AssignRole = "user.assign_role";

        // ===== Department =====
        public const string CreateDepartment = "department.create";
        public const string EditDepartment = "department.edit";
        public const string ViewDepartment = "department.view";
    }

    /// <summary>
    /// LEGACY map kept only so old call sites compile. The authoritative matrix is
    /// <see cref="RoleHierarchy.DefaultPermissions"/>; new code must use
    /// RoleHierarchy.EffectivePermissions(...) which also honours the per-user
    /// AdditionalPermissions / RevokedPermissions columns.
    /// </summary>
    public static class RolePermissionMap
    {
        public static readonly Dictionary<string, string[]> RolePermissions = new()
        {
            [UserRoles.Admin] = RoleHierarchy.DefaultPermissions[OrgRoles.Admin],
            [UserRoles.Director] = RoleHierarchy.DefaultPermissions[OrgRoles.Director],
            [UserRoles.Manager] = RoleHierarchy.DefaultPermissions[OrgRoles.Manager],
            [UserRoles.ShopManager] = RoleHierarchy.DefaultPermissions[OrgRoles.ShopManager],
            [UserRoles.TeamLeader] = RoleHierarchy.DefaultPermissions[OrgRoles.TeamLeader],
            [UserRoles.ShopTeamLeader] = RoleHierarchy.DefaultPermissions[OrgRoles.TeamLeader],
            [UserRoles.Engineer] = RoleHierarchy.DefaultPermissions[OrgRoles.Engineer],
            [UserRoles.Technician] = RoleHierarchy.DefaultPermissions[OrgRoles.Technician],
            [UserRoles.CertifyingStaff] = RoleHierarchy.DefaultPermissions[OrgRoles.CertifyingStaff],
            [UserRoles.QAManager] = RoleHierarchy.DefaultPermissions[OrgRoles.QAPersonnel],

            // AMENDED v8
            [UserRoles.SpecialTeamLeader] = RoleHierarchy.DefaultPermissions[OrgRoles.SpecialTeamLeader],
            [UserRoles.DocumentationTeamLeader] = RoleHierarchy.DefaultPermissions[OrgRoles.DocumentationTeamLeader],
            [UserRoles.DocumentationClerk] = RoleHierarchy.DefaultPermissions[OrgRoles.DocumentationClerk],
            [UserRoles.HRSpecialist] = RoleHierarchy.DefaultPermissions[OrgRoles.HRSpecialist],
            [UserRoles.HRManager] = RoleHierarchy.DefaultPermissions[OrgRoles.HRManager],
            [UserRoles.Inspector] = RoleHierarchy.DefaultPermissions[OrgRoles.Inspector],
            [UserRoles.ECAAPersonnel] = RoleHierarchy.DefaultPermissions[OrgRoles.ECAAPersonnel]
        };
    }
}