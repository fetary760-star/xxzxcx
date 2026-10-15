using System;
using System.Collections.Generic;
using System.Linq;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.Workflow
{
    // =====================================================================================
    // AMENDED v12 - WorkflowPermissionMatrix.cs   (NEW FILE)
    // Copy to: CMT.Domain/Models/Workflow/WorkflowPermissionMatrix.cs
    //
    // WHY THIS FILE EXISTS
    // --------------------
    // v10 introduced DocumentationPermissionMatrix.cs, which answers "may THIS user act on
    // THIS documentation ticket right now". It solved the problem for exactly ONE section.
    // Every other section of the Table of Contents (Regulatory 918/918A, Amendment Request,
    // Letter of Confirmation, Training x8, Tools x7, Facility x3, Consumables, ATA record,
    // folder sign-off, amendment cycle, revision cycle) has NO equivalent, therefore today:
    //
    //   - the controllers of those sections must re-implement ownership, shop-scope and
    //     permission checks by hand - exactly how the DOCUMENTATION routing went wrong
    //     before v10;
    //   - the API cannot fill WorkflowStepResponse.CanIAct / CanIAssign / CanIDelegate /
    //     CanISkip (declared in v9), so the frontend is pushed back into re-implementing
    //     the rules;
    //   - nothing verifies that a role declared ELIGIBLE by the catalog actually HOLDS the
    //     permission its step demands, so a step can be silently unreachable in production.
    //
    // WHAT IT IS
    //   The SINGLE role-permission matrix of the whole solution, for every catalogued form:
    //     * GENERATED from FormWorkflowCatalog, so it can never drift from the executed
    //       step tables;
    //     * enriched with the two columns the catalog does not carry - the required
    //       Permissions constant and the SCOPE rule;
    //     * plus pure decision functions returning a machine readable code.
    //
    // RELATIONSHIP WITH DocumentationPermissionMatrix
    //   This file is the GENERIC layer; DocumentationPermissionMatrix stays the SPECIALISED
    //   layer for Documentation Team ticket facts (clerk ownership, clerk availability,
    //   register lock). Nothing here duplicates or contradicts it:
    //     Documentation endpoints -> DocumentationPermissionMatrix (more specific wins)
    //     every other endpoint    -> WorkflowPermissionMatrix
    //   Both consume RoleHierarchy + FormWorkflowCatalog and never each other, so there is
    //   no circular dependency.
    //
    // NOT MODIFIED
    //   ApprovalStatus.cs, RoleHierarchy.cs, Enums.cs, WorkflowContracts.cs,
    //   WorkflowEntities.cs, WorkflowApiContracts.cs and every FormWorkflowCatalog part
    //   file. This file only CONSUMES them. Pure decisions: no EF, no DbContext, no I/O.
    // =====================================================================================

    /// <summary>
    /// Machine readable outcomes of a generic workflow access decision. The values are
    /// deliberately identical to CMT.Application.SelfEvaluation.Contracts.Workflow.WorkflowErrorCodes, so a
    /// controller returns them untranslated and the frontend has ONE code vocabulary.
    /// </summary>
    public static class WorkflowDecisionCodes
    {
        public const string Allowed = "ALLOWED";
        public const string FormNotCatalogued = "FORM_NOT_CATALOGUED";
        public const string NotDraftRole = "NOT_DRAFT_ROLE";
        public const string RoleNotEligible = "ROLE_NOT_ELIGIBLE";
        public const string NotAssignee = "NOT_ASSIGNEE";
        public const string StepNotActive = "STEP_NOT_ACTIVE";
        public const string AssignmentRequired = "ASSIGNMENT_REQUIRED";
        public const string AssigneeInvalidRole = "ASSIGNEE_INVALID_ROLE";
        public const string AssigneeOutsideShop = "ASSIGNEE_OUTSIDE_SHOP";
        public const string DelegateNotLowerTier = "DELEGATE_NOT_LOWER_TIER";
        public const string DelegationNotAllowed = "DELEGATION_NOT_ALLOWED";
        public const string StepNotSkippable = "STEP_NOT_SKIPPABLE";
        public const string SkipNotPermitted = "SKIP_NOT_PERMITTED";
        public const string RegulatoryDateReached = "REGULATORY_DATE_REACHED";
        public const string CommentsRequired = "COMMENTS_REQUIRED";
        public const string RequiredFieldsMissing = "REQUIRED_FIELDS_MISSING";
        public const string ChecklistIncomplete = "CHECKLIST_INCOMPLETE";
        public const string OutsideOwnShop = "OUTSIDE_OWN_SHOP";
        public const string OutsideFunctionalUnit = "OUTSIDE_FUNCTIONAL_UNIT";
        public const string PermissionDenied = "PERMISSION_DENIED";
        public const string InstanceLocked = "INSTANCE_LOCKED";
        public const string AlreadyCompleted = "ALREADY_COMPLETED";
        public const string ExclusiveDesignation = "EXCLUSIVE_DESIGNATION";
    }

    /// <summary>Result of one generic access decision.</summary>
    public sealed class WorkflowAccessDecision
    {
        public bool Allowed { get; init; }

        /// <summary>WorkflowDecisionCodes value.</summary>
        public string Code { get; init; } = WorkflowDecisionCodes.Allowed;

        /// <summary>Message safe to surface in the UI.</summary>
        public string Reason { get; init; } = string.Empty;

        public static WorkflowAccessDecision Allow() => new()
        {
            Allowed = true,
            Code = WorkflowDecisionCodes.Allowed
        };

        public static WorkflowAccessDecision Deny(string code, string reason) => new()
        {
            Allowed = false,
            Code = code,
            Reason = reason
        };

        public static implicit operator bool(WorkflowAccessDecision decision) => decision.Allowed;
    }

    /// <summary>
    /// Everything the matrix needs to know about the CALLING user. Built once per request
    /// from the JWT plus the Users row. Every user id is long, never Guid.
    /// </summary>
    public sealed class WorkflowActorContext
    {
        public long UserId { get; init; }

        /// <summary>Raw role value from the JWT / Users row; may be a legacy alias.</summary>
        public string? Role { get; init; }

        public Guid? ShopId { get; init; }
        public Guid? DepartmentId { get; init; }

        /// <summary>Users.AdditionalPermissions CSV.</summary>
        public string? AdditionalPermissionsCsv { get; init; }

        /// <summary>Users.RevokedPermissions CSV.</summary>
        public string? RevokedPermissionsCsv { get; init; }

        public string? CanonicalRole => RoleHierarchy.Normalize(Role);

        public bool IsAdmin => CanonicalRole == OrgRoles.Admin;

        public string? FunctionalUnit => RoleHierarchy.FunctionalUnitOf(Role);

        public bool LeadsFunctionalUnit => RoleHierarchy.LeadsFunctionalUnit(Role);

        public int Rank => RoleHierarchy.RankOf(Role);

        public HashSet<string> EffectivePermissions =>
            RoleHierarchy.EffectivePermissions(Role, AdditionalPermissionsCsv, RevokedPermissionsCsv);

        public bool Has(string permission) => IsAdmin || EffectivePermissions.Contains(permission);

        public bool IsInUnit(string? unit) =>
            !string.IsNullOrWhiteSpace(unit)
            && string.Equals(FunctionalUnit, unit, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>The facts of one running instance the generic matrix reasons about.</summary>
    public sealed class WorkflowInstanceFacts
    {
        public Guid InstanceId { get; init; }

        /// <summary>FormNodeTypes value or a catalog virtual form type.</summary>
        public string FormType { get; init; } = string.Empty;

        public ApprovalStatus Status { get; init; }

        /// <summary>Currently pending step.</summary>
        public int CurrentStepNo { get; init; }

        /// <summary>Resolved assignee of the pending step, when one was chosen.</summary>
        public long? CurrentAssigneeUserId { get; init; }

        /// <summary>Unit owning the pending step, when it is a central unit queue.</summary>
        public string? CurrentAssignmentUnit { get; init; }

        public long OriginatorUserId { get; init; }

        /// <summary>Shop of the originator, frozen at draft time.</summary>
        public Guid? OriginatorShopId { get; init; }

        public Guid? EvaluationFolderId { get; init; }

        public bool IsComplete { get; init; }
        public bool IsLocked { get; init; }

        /// <summary>Regulatory target date of the 918 / 918A "Optional / May Skip Now" flag.</summary>
        public DateTime? RegulatoryTargetDate { get; init; }

        /// <summary>
        /// Exclusive designation of the pending step (designated Inspector of MNT-1378,
        /// Technician of MNT-922C). When set, only this user may execute the step.
        /// </summary>
        public long? DesignatedUserId { get; init; }

        /// <summary>Mandatory checklist items still unverified on a Gate step.</summary>
        public int OutstandingChecklistItems { get; init; }
    }

    /// <summary>
    /// The global role-permission matrix. One place, one rule set, consumed by every
    /// controller, the engine and the response builders.
    /// </summary>
    public static class WorkflowPermissionMatrix
    {
        // =================================================================================
        // 1. SCOPE RULES
        // =================================================================================

        /// <summary>Scope rule labels used by <see cref="MatrixRow.Scope"/>.</summary>
        public static class Scopes
        {
            /// <summary>The actor must belong to the originator's shop.</summary>
            public const string OwnShop = "OWN_SHOP";

            /// <summary>The actor must belong to the central functional unit of the step.</summary>
            public const string FunctionalUnit = "FUNCTIONAL_UNIT";

            /// <summary>Only the personally assigned user may act.</summary>
            public const string AssignedOnly = "ASSIGNED_ONLY";

            /// <summary>Only the exclusively designated user may act (MNT-1378 / MNT-922C).</summary>
            public const string DesignatedOnly = "DESIGNATED_ONLY";

            /// <summary>Department tier (Manager / Director) of the owning department.</summary>
            public const string Department = "DEPARTMENT";

            /// <summary>No scope restriction beyond role and permission.</summary>
            public const string Global = "GLOBAL";
        }

        // =================================================================================
        // 2. THE DECLARATIVE MATRIX  (served verbatim by GET /api/workflow/matrix)
        // =================================================================================

        /// <summary>One row of the printed role-permission matrix.</summary>
        public sealed class MatrixRow
        {
            /// <summary>Printed form number, e.g. "MNT-1229B".</summary>
            public string FormNo { get; init; } = string.Empty;

            public string FormType { get; init; } = string.Empty;

            /// <summary>ToCSections code.</summary>
            public string Section { get; init; } = string.Empty;

            public string SectionTitle { get; init; } = string.Empty;

            /// <summary>0 = drafting.</summary>
            public int StepNo { get; init; }

            public string Capability { get; init; } = string.Empty;

            /// <summary>Status the record sits in while the step is pending.</summary>
            public string PendingStatus { get; init; } = string.Empty;

            /// <summary>Canonical OrgRoles values allowed. Admin is always additionally allowed.</summary>
            public string[] Roles { get; init; } = Array.Empty<string>();

            /// <summary>Printed role labels, for the exported matrix.</summary>
            public string[] RoleLabels { get; init; } = Array.Empty<string>();

            /// <summary>Permissions constant that must also be held.</summary>
            public string RequiredPermission { get; init; } = string.Empty;

            /// <summary>Scope rule applied on top of role and permission.</summary>
            public string Scope { get; init; } = string.Empty;

            /// <summary>Signature line filled in by the step, or empty.</summary>
            public string SignatureCaption { get; init; } = string.Empty;

            public string SkipMode { get; init; } = string.Empty;

            public string Notes { get; init; } = string.Empty;
        }

        /// <summary>
        /// The authoritative matrix, generated ONCE from the catalog so it can never drift
        /// from the executed step tables.
        /// </summary>
        public static readonly MatrixRow[] Rows = BuildRows();

        private static MatrixRow[] BuildRows()
        {
            var rows = new List<MatrixRow>();

            foreach (var form in FormWorkflowCatalog.All)
            {
                var sectionTitle = ToCSections.TitleOf(form.Section);

                // ---------- drafting row ----------
                if (form.IsGeneratedByJointApproval)
                {
                    rows.Add(new MatrixRow
                    {
                        FormNo = form.FormNo,
                        FormType = form.FormType,
                        Section = form.Section,
                        SectionTitle = sectionTitle,
                        StepNo = 0,
                        Capability = "Generated by the joint approval path (never drafted manually)",
                        PendingStatus = ApprovalStatusInfo.Label(ApprovalStatus.Draft),
                        Scope = Scopes.Global,
                        SkipMode = SkipMode.NotSkippable.ToString(),
                        Notes = "Auto-generated when the joint approval path is enabled."
                    });
                }
                else
                {
                    rows.Add(new MatrixRow
                    {
                        FormNo = form.FormNo,
                        FormType = form.FormType,
                        Section = form.Section,
                        SectionTitle = sectionTitle,
                        StepNo = 0,
                        Capability = form.DraftStep?.Title ?? "Create the draft",
                        PendingStatus = ApprovalStatusInfo.Label(ApprovalStatus.Draft),
                        Roles = form.DraftRoles,
                        RoleLabels = form.DraftRoles.Select(RoleHierarchy.Label).ToArray(),
                        RequiredPermission = Permissions.CreateForm,
                        Scope = form.DraftStep?.RestrictToOriginatorShop == true
                            ? Scopes.OwnShop
                            : Scopes.Global,
                        SignatureCaption =
                            FormWorkflowCatalog.SignatureCaption(SignatureBlockType.PreparedBy),
                        SkipMode = SkipMode.NotSkippable.ToString(),
                        Notes = DraftNotes(form)
                    });
                }

                // ---------- one row per executed step ----------
                foreach (var step in form.ApprovalSteps.OrderBy(s => s.StepNo))
                {
                    rows.Add(new MatrixRow
                    {
                        FormNo = form.FormNo,
                        FormType = form.FormType,
                        Section = form.Section,
                        SectionTitle = sectionTitle,
                        StepNo = step.StepNo,
                        Capability = step.Title,
                        PendingStatus = ApprovalStatusInfo.Label(step.Status),
                        Roles = step.EligibleRoles,
                        RoleLabels = step.EligibleRoles.Select(RoleHierarchy.Label).ToArray(),
                        RequiredPermission = PermissionForStep(step),
                        Scope = ScopeForStep(step),
                        SignatureCaption = FormWorkflowCatalog.SignatureCaption(step.Signature),
                        SkipMode = step.Skip.ToString(),
                        Notes = NotesForStep(form, step)
                    });

                    // ---------- assignment authority of that step ----------
                    if (step.RequiresManualAssignment)
                    {
                        var assigners = step.AssignerRoles.Length > 0
                            ? step.AssignerRoles
                            : step.EligibleRoles;

                        rows.Add(new MatrixRow
                        {
                            FormNo = form.FormNo,
                            FormType = form.FormType,
                            Section = form.Section,
                            SectionTitle = sectionTitle,
                            StepNo = step.StepNo,
                            Capability = "Assign / re-assign step " + step.StepNo,
                            PendingStatus =
                                ApprovalStatusInfo.Label(ApprovalStatus.PendingAssignment),
                            Roles = assigners,
                            RoleLabels = assigners.Select(RoleHierarchy.Label).ToArray(),
                            RequiredPermission = AssignPermissionForStep(step),
                            Scope = ScopeForStep(step),
                            SkipMode = step.Skip.ToString(),
                            Notes = step.AssignmentUnit is null
                                ? "The assignee must belong to the originator's shop and be eligible for the step."
                                : "The assignee must belong to the " + step.AssignmentUnit + " unit."
                        });
                    }

                    // ---------- skip authority of that step ----------
                    if (step.Skip is SkipMode.Manual or SkipMode.ManualOrAuto or SkipMode.RegulatoryDate)
                    {
                        rows.Add(new MatrixRow
                        {
                            FormNo = form.FormNo,
                            FormType = form.FormType,
                            Section = form.Section,
                            SectionTitle = sectionTitle,
                            StepNo = step.StepNo,
                            Capability = "Skip step " + step.StepNo,
                            PendingStatus = ApprovalStatusInfo.Label(ApprovalStatus.Skipped),
                            Roles = RoleHierarchy.SkipAuthorityRoles,
                            RoleLabels = RoleHierarchy.SkipAuthorityRoles
                                .Select(RoleHierarchy.Label).ToArray(),
                            RequiredPermission = Permissions.SkipFormStep,
                            Scope = ScopeForStep(step),
                            SkipMode = step.Skip.ToString(),
                            Notes = step.Skip == SkipMode.RegulatoryDate
                                ? "Only while the regulatory target date is still in the future."
                                : "Auto-allocated from '" + step.SkipConditionField + "' = '"
                                  + step.SkipWhenValue + "'."
                        });
                    }
                }
            }

            return rows.ToArray();
        }

        private static string DraftNotes(FormWorkflowDefinition form)
        {
            var notes = new List<string>();

            if (form.RequiredDraftFields.Length > 0)
                notes.Add("Required draft fields: " + string.Join(", ", form.RequiredDraftFields) + ".");

            if (form.BypassesLowerTiers)
                notes.Add("Bypasses the lower management tiers by design.");

            if (form.IsOptionalByRegulatoryDate)
                notes.Add("May be flagged Optional / May Skip Now until the regulatory target date.");

            if (form.IsFinalReleaseGate)
                notes.Add("Presented step-by-step before the final release.");

            if (form.ExpiryMonths.HasValue)
                notes.Add("Validity " + form.ExpiryMonths.Value + " months.");

            return string.Join(" ", notes);
        }

        /// <summary>The permission a step demands, derived from what the step DOES.</summary>
        public static string PermissionForStep(WorkflowStepDefinition step) => step.Kind switch
        {
            WorkflowStepKind.Draft => Permissions.CreateForm,
            WorkflowStepKind.Assignment => Permissions.AssignFormStep,
            WorkflowStepKind.Processing => Permissions.EditForm,
            WorkflowStepKind.Verification when step.Status == ApprovalStatus.PendingHRVerification
                => Permissions.VerifyTraining,
            WorkflowStepKind.Verification => Permissions.EditForm,
            WorkflowStepKind.Review => Permissions.ApproveForm,
            WorkflowStepKind.Approval when step.Status == ApprovalStatus.PendingHRManagerApproval
                => Permissions.ApproveTraining,
            WorkflowStepKind.Approval when step.Status == ApprovalStatus.PendingAmendmentApproval
                => Permissions.AmendExpiredRecord,
            WorkflowStepKind.Approval => Permissions.ApproveForm,
            WorkflowStepKind.SignOff when step.Status == ApprovalStatus.PendingDocumentationLeaderSignOff
                => Permissions.SignOffDocumentation,
            WorkflowStepKind.SignOff => Permissions.SignOffForm,
            WorkflowStepKind.Endorsement => Permissions.ApproveForm,
            WorkflowStepKind.Gate => Permissions.ApproveForm,
            WorkflowStepKind.Conditional => Permissions.EditForm,
            _ => Permissions.ApproveForm
        };

        /// <summary>The permission the ASSIGNER of a step must hold.</summary>
        public static string AssignPermissionForStep(WorkflowStepDefinition step) =>
            string.Equals(step.AssignmentUnit, FunctionalUnits.Documentation,
                StringComparison.OrdinalIgnoreCase)
                ? Permissions.AssignDocumentationClerk
                : Permissions.AssignFormStep;

        /// <summary>The scope rule of a step.</summary>
        public static string ScopeForStep(WorkflowStepDefinition step)
        {
            if (!string.IsNullOrWhiteSpace(step.AssignmentUnit))
            {
                if (step.RequiresManualAssignment) return Scopes.FunctionalUnit;

                return step.Kind is WorkflowStepKind.Processing or WorkflowStepKind.Verification
                    ? Scopes.AssignedOnly
                    : Scopes.FunctionalUnit;
            }

            if (step.Status is ApprovalStatus.PendingInspectorReview
                or ApprovalStatus.PendingInspectorApproval
                or ApprovalStatus.PendingTechnicianSignOff)
            {
                return Scopes.DesignatedOnly;
            }

            if (step.RestrictToOriginatorShop) return Scopes.OwnShop;

            if (step.Status is ApprovalStatus.PendingManagerApproval
                or ApprovalStatus.PendingDirectorApproval
                or ApprovalStatus.PendingFinalSignOff)
            {
                return Scopes.Department;
            }

            return Scopes.Global;
        }

        private static string NotesForStep(FormWorkflowDefinition form, WorkflowStepDefinition step)
        {
            var notes = new List<string>();

            if (step.EligibleRoles.Length == 1)
                notes.Add("Exclusive to " + RoleHierarchy.Label(step.EligibleRoles[0]) + ".");

            if (!step.AllowsDelegation)
                notes.Add("Not delegable.");

            if (step.RequiresComments)
                notes.Add("Comments mandatory.");

            if (step.IsStepByStepChecklist)
                notes.Add("Verified item by item; no bulk approval.");

            if (step.RequiredFields.Length > 0)
                notes.Add("Required fields: " + string.Join(", ", step.RequiredFields) + ".");

            if (step.Skip != SkipMode.NotSkippable)
                notes.Add("Skippable (" + step.Skip + ").");

            if (form.BypassesLowerTiers && step.StepNo == 1)
                notes.Add("Lower management tiers are bypassed: this is the FIRST approval stage.");

            return string.Join(" ", notes);
        }

        /// <summary>Matrix rows of one form, in step order.</summary>
        public static MatrixRow[] RowsFor(string? formType) =>
            Rows.Where(r => string.Equals(r.FormType, formType, StringComparison.OrdinalIgnoreCase))
                .OrderBy(r => r.StepNo)
                .ToArray();

        /// <summary>Matrix rows of one Table Of Contents section.</summary>
        public static MatrixRow[] RowsForSection(string? sectionCode) =>
            Rows.Where(r => string.Equals(r.Section, sectionCode, StringComparison.OrdinalIgnoreCase))
                .ToArray();

        /// <summary>Matrix rows in which a role appears, i.e. "what may I do".</summary>
        public static MatrixRow[] RowsForRole(string? role)
        {
            var canonical = RoleHierarchy.Normalize(role);
            if (canonical is null) return Array.Empty<MatrixRow>();
            if (canonical == OrgRoles.Admin) return Rows;

            return Rows
                .Where(r => r.Roles.Contains(canonical, StringComparer.OrdinalIgnoreCase))
                .ToArray();
        }

        // =================================================================================
        // 3. DECISION FUNCTIONS
        // =================================================================================

        /// <summary>May the actor create a draft of this form?</summary>
        public static WorkflowAccessDecision CanDraft(
            WorkflowActorContext actor,
            string? formType,
            IReadOnlyDictionary<string, string?>? formFields = null)
        {
            if (!FormWorkflowCatalog.IsCatalogued(formType))
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.FormNotCatalogued,
                    "The form type is not catalogued.");
            }

            if (!FormWorkflowCatalog.CanDraft(actor.CanonicalRole, formType))
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.NotDraftRole,
                    RoleHierarchy.Label(actor.Role) + " may not draft "
                    + FormWorkflowCatalog.FormNoOf(formType) + ".");
            }

            if (!actor.Has(Permissions.CreateForm))
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.PermissionDenied,
                    "The '" + Permissions.CreateForm + "' permission is missing.");
            }

            if (formFields is not null)
            {
                var missing = FormWorkflowCatalog.MissingRequiredFields(
                    FormWorkflowCatalog.RequiredDraftFieldsFor(formType), formFields);

                if (missing.Length > 0)
                {
                    return WorkflowAccessDecision.Deny(
                        WorkflowDecisionCodes.RequiredFieldsMissing,
                        "Missing required draft fields: " + string.Join(", ", missing) + ".");
                }
            }

            return WorkflowAccessDecision.Allow();
        }

        /// <summary>
        /// May the actor EXECUTE the pending step? The central gate of the engine:
        /// role + permission + scope + assignment / designation ownership.
        /// </summary>
        public static WorkflowAccessDecision CanActOnStep(
            WorkflowActorContext actor,
            WorkflowInstanceFacts instance,
            int? stepNo = null)
        {
            if (actor.IsAdmin) return WorkflowAccessDecision.Allow();

            var targetStepNo = stepNo ?? instance.CurrentStepNo;
            var step = FormWorkflowCatalog.StepAt(instance.FormType, targetStepNo);

            if (step is null)
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.StepNotActive,
                    "The step does not exist on this form.");
            }

            if (instance.IsLocked)
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.InstanceLocked,
                    "The record is locked. Raise an amendment or revision cycle.");
            }

            if (instance.IsComplete)
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.AlreadyCompleted,
                    "The record is already complete.");
            }

            if (targetStepNo != instance.CurrentStepNo)
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.StepNotActive,
                    "Step " + targetStepNo + " is not the pending step (currently "
                    + instance.CurrentStepNo + ").");
            }

            if (!FormWorkflowCatalog.CanActOnStep(actor.CanonicalRole, instance.FormType, step.StepNo))
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.RoleNotEligible,
                    RoleHierarchy.Label(actor.Role) + " is not eligible for step " + step.StepNo
                    + " of " + FormWorkflowCatalog.FormNoOf(instance.FormType) + ".");
            }

            var permission = PermissionForStep(step);
            if (!actor.Has(permission))
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.PermissionDenied,
                    "The '" + permission + "' permission is missing.");
            }

            var scopeDecision = CheckScope(actor, instance, step);
            if (!scopeDecision.Allowed) return scopeDecision;

            if (step.Kind == WorkflowStepKind.Gate && instance.OutstandingChecklistItems > 0)
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.ChecklistIncomplete,
                    instance.OutstandingChecklistItems
                    + " mandatory checklist items are still unverified.");
            }

            return WorkflowAccessDecision.Allow();
        }

        /// <summary>The scope rule of the step, applied to the actor and the record.</summary>
        public static WorkflowAccessDecision CheckScope(
            WorkflowActorContext actor,
            WorkflowInstanceFacts instance,
            WorkflowStepDefinition step)
        {
            if (actor.IsAdmin) return WorkflowAccessDecision.Allow();

            switch (ScopeForStep(step))
            {
                case Scopes.OwnShop:
                    if (instance.OriginatorShopId.HasValue
                        && (!actor.ShopId.HasValue
                            || actor.ShopId.Value != instance.OriginatorShopId.Value))
                    {
                        return WorkflowAccessDecision.Deny(
                            WorkflowDecisionCodes.OutsideOwnShop,
                            "The step is restricted to the originating shop.");
                    }
                    break;

                case Scopes.FunctionalUnit:
                    if (!actor.IsInUnit(step.AssignmentUnit))
                    {
                        return WorkflowAccessDecision.Deny(
                            WorkflowDecisionCodes.OutsideFunctionalUnit,
                            "The step is owned by the " + step.AssignmentUnit + " unit.");
                    }
                    break;

                case Scopes.AssignedOnly:
                    // The unit leader may always intervene on his own unit's record.
                    if (actor.LeadsFunctionalUnit && actor.IsInUnit(step.AssignmentUnit))
                        break;

                    if (!actor.IsInUnit(step.AssignmentUnit))
                    {
                        return WorkflowAccessDecision.Deny(
                            WorkflowDecisionCodes.OutsideFunctionalUnit,
                            "The step is owned by the " + step.AssignmentUnit + " unit.");
                    }

                    if (instance.CurrentAssigneeUserId is null)
                    {
                        return WorkflowAccessDecision.Deny(
                            WorkflowDecisionCodes.AssignmentRequired,
                            "The step has not been assigned yet.");
                    }

                    if (instance.CurrentAssigneeUserId.Value != actor.UserId)
                    {
                        return WorkflowAccessDecision.Deny(
                            WorkflowDecisionCodes.NotAssignee,
                            "The step is assigned to a different user.");
                    }
                    break;

                case Scopes.DesignatedOnly:
                    if (instance.DesignatedUserId is null)
                    {
                        return WorkflowAccessDecision.Deny(
                            WorkflowDecisionCodes.AssignmentRequired,
                            "No designated actor has been chosen yet.");
                    }

                    if (instance.DesignatedUserId.Value != actor.UserId)
                    {
                        return WorkflowAccessDecision.Deny(
                            WorkflowDecisionCodes.ExclusiveDesignation,
                            "This step is routed exclusively to the designated "
                            + RoleHierarchy.Label(step.EligibleRoles.FirstOrDefault()) + ".");
                    }
                    break;
            }

            return WorkflowAccessDecision.Allow();
        }

        /// <summary>May the actor ASSIGN or RE-ASSIGN the pending step?</summary>
        public static WorkflowAccessDecision CanAssignStep(
            WorkflowActorContext actor,
            WorkflowInstanceFacts instance,
            int? stepNo = null)
        {
            if (actor.IsAdmin) return WorkflowAccessDecision.Allow();

            var targetStepNo = stepNo ?? instance.CurrentStepNo;
            var step = FormWorkflowCatalog.StepAt(instance.FormType, targetStepNo);

            if (step is null)
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.StepNotActive,
                    "The step does not exist on this form.");
            }

            if (instance.IsLocked)
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.InstanceLocked,
                    "The record is locked.");
            }

            if (!FormWorkflowCatalog.CanAssignStep(actor.CanonicalRole, instance.FormType, step.StepNo))
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.RoleNotEligible,
                    RoleHierarchy.Label(actor.Role) + " may not assign step " + step.StepNo + ".");
            }

            var permission = AssignPermissionForStep(step);
            if (!actor.Has(permission))
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.PermissionDenied,
                    "The '" + permission + "' permission is missing.");
            }

            // A shop-scoped step may only be assigned from inside the originating shop.
            if (string.IsNullOrWhiteSpace(step.AssignmentUnit)
                && step.RestrictToOriginatorShop
                && instance.OriginatorShopId.HasValue
                && (!actor.ShopId.HasValue || actor.ShopId.Value != instance.OriginatorShopId.Value))
            {
                // "A Special Team Leader can assign records or update entries directly":
                // the Special Team Leader is department scoped, so the shop rule
                // deliberately does not apply to him.
                if (actor.CanonicalRole != OrgRoles.SpecialTeamLeader)
                {
                    return WorkflowAccessDecision.Deny(
                        WorkflowDecisionCodes.OutsideOwnShop,
                        "Assignment is restricted to the originating shop.");
                }
            }

            return WorkflowAccessDecision.Allow();
        }

        /// <summary>
        /// Is the proposed assignee legitimate for the step? Role eligibility plus the shop
        /// rule (shop-scoped step) or the unit rule (central unit step).
        /// </summary>
        public static WorkflowAccessDecision IsValidAssignee(
            WorkflowInstanceFacts instance,
            int stepNo,
            string? assigneeRole,
            Guid? assigneeShopId,
            string? assigneeFunctionalUnit)
        {
            var step = FormWorkflowCatalog.StepAt(instance.FormType, stepNo);
            if (step is null)
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.StepNotActive,
                    "The step does not exist on this form.");
            }

            var canonical = RoleHierarchy.Normalize(assigneeRole);
            if (canonical is null
                || !step.EligibleRoles.Contains(canonical, StringComparer.OrdinalIgnoreCase))
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.AssigneeInvalidRole,
                    "The assignee role is not eligible for step " + stepNo + ".");
            }

            if (!string.IsNullOrWhiteSpace(step.AssignmentUnit))
            {
                if (!string.Equals(assigneeFunctionalUnit, step.AssignmentUnit,
                        StringComparison.OrdinalIgnoreCase))
                {
                    return WorkflowAccessDecision.Deny(
                        WorkflowDecisionCodes.OutsideFunctionalUnit,
                        "The assignee must belong to the " + step.AssignmentUnit + " unit.");
                }

                return WorkflowAccessDecision.Allow();
            }

            if (step.RestrictToOriginatorShop
                && instance.OriginatorShopId.HasValue
                && (!assigneeShopId.HasValue || assigneeShopId.Value != instance.OriginatorShopId.Value))
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.AssigneeOutsideShop,
                    "The assignee must belong to the originating shop.");
            }

            return WorkflowAccessDecision.Allow();
        }

        /// <summary>
        /// May the actor DELEGATE the pending step to lower-tier staff?
        /// "Shop Team Leaders can assign these to lower-tier staff if workload is high."
        /// </summary>
        public static WorkflowAccessDecision CanDelegateStep(
            WorkflowActorContext actor,
            WorkflowInstanceFacts instance,
            string? delegateRole,
            Guid? delegateShopId,
            int? stepNo = null)
        {
            if (actor.IsAdmin) return WorkflowAccessDecision.Allow();

            var targetStepNo = stepNo ?? instance.CurrentStepNo;
            var step = FormWorkflowCatalog.StepAt(instance.FormType, targetStepNo);

            if (step is null)
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.StepNotActive,
                    "The step does not exist on this form.");
            }

            if (!step.AllowsDelegation)
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.DelegationNotAllowed,
                    "Step " + step.StepNo + " of " + FormWorkflowCatalog.FormNoOf(instance.FormType)
                    + " may not be delegated.");
            }

            if (!actor.Has(Permissions.DelegateForm))
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.PermissionDenied,
                    "The '" + Permissions.DelegateForm + "' permission is missing.");
            }

            if (!FormWorkflowCatalog.CanDelegateStep(
                    actor.CanonicalRole, delegateRole, instance.FormType, step.StepNo))
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.DelegateNotLowerTier,
                    "The delegate must be strictly less senior than "
                    + RoleHierarchy.Label(actor.Role) + ".");
            }

            if (string.IsNullOrWhiteSpace(step.AssignmentUnit)
                && step.RestrictToOriginatorShop
                && instance.OriginatorShopId.HasValue
                && (!delegateShopId.HasValue
                    || delegateShopId.Value != instance.OriginatorShopId.Value))
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.AssigneeOutsideShop,
                    "The delegate must belong to the originating shop.");
            }

            return WorkflowAccessDecision.Allow();
        }

        /// <summary>
        /// May the actor SKIP the pending step? Manual skip authority, the step's SkipMode,
        /// and - for SkipMode.RegulatoryDate - the regulatory target date.
        /// </summary>
        public static WorkflowAccessDecision CanSkipStep(
            WorkflowActorContext actor,
            WorkflowInstanceFacts instance,
            DateTime utcNow,
            int? stepNo = null)
        {
            var targetStepNo = stepNo ?? instance.CurrentStepNo;
            var step = FormWorkflowCatalog.StepAt(instance.FormType, targetStepNo);

            if (step is null)
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.StepNotActive,
                    "The step does not exist on this form.");
            }

            if (step.Skip == SkipMode.NotSkippable)
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.StepNotSkippable,
                    "Step " + step.StepNo + " may not be skipped.");
            }

            if (actor.IsAdmin) return WorkflowAccessDecision.Allow();

            if (!FormWorkflowCatalog.CanSkipManually(actor.CanonicalRole, instance.FormType, step.StepNo))
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.SkipNotPermitted,
                    RoleHierarchy.Label(actor.Role) + " does not hold skip authority.");
            }

            if (!actor.Has(Permissions.SkipFormStep))
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.PermissionDenied,
                    "The '" + Permissions.SkipFormStep + "' permission is missing.");
            }

            if (step.Skip == SkipMode.RegulatoryDate
                && !FormWorkflowCatalog.MaySkipByRegulatoryDate(
                    step, instance.RegulatoryTargetDate, utcNow))
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.RegulatoryDateReached,
                    "The regulatory target date has been reached: the step is now mandatory.");
            }

            return WorkflowAccessDecision.Allow();
        }

        /// <summary>Validation of a decision payload: mandatory comments and step fields.</summary>
        public static WorkflowAccessDecision ValidateDecisionPayload(
            WorkflowInstanceFacts instance,
            int stepNo,
            string? comments,
            IReadOnlyDictionary<string, string?>? formFields)
        {
            var step = FormWorkflowCatalog.StepAt(instance.FormType, stepNo);
            if (step is null) return WorkflowAccessDecision.Allow();

            if (step.RequiresComments && string.IsNullOrWhiteSpace(comments))
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.CommentsRequired,
                    "Comments are mandatory on step " + stepNo + ".");
            }

            var missing = FormWorkflowCatalog.MissingRequiredFields(
                FormWorkflowCatalog.RequiredFieldsForStep(instance.FormType, stepNo), formFields);

            if (missing.Length > 0)
            {
                return WorkflowAccessDecision.Deny(
                    WorkflowDecisionCodes.RequiredFieldsMissing,
                    "Missing required fields: " + string.Join(", ", missing) + ".");
            }

            return WorkflowAccessDecision.Allow();
        }

        /// <summary>May the actor SEE the record?</summary>
        public static bool CanView(WorkflowActorContext actor, WorkflowInstanceFacts instance)
        {
            if (actor.IsAdmin) return true;
            if (!actor.Has(Permissions.ViewForm)) return false;
            if (instance.OriginatorUserId == actor.UserId) return true;
            if (instance.CurrentAssigneeUserId == actor.UserId) return true;

            if (actor.IsInUnit(instance.CurrentAssignmentUnit)) return true;

            if (actor.ShopId.HasValue && instance.OriginatorShopId.HasValue
                && actor.ShopId.Value == instance.OriginatorShopId.Value)
            {
                return true;
            }

            // Management and QA oversight.
            return RoleHierarchy.RankOf(actor.CanonicalRole)
                   <= RoleHierarchy.RankOf(OrgRoles.Manager)
                   || actor.CanonicalRole == OrgRoles.QAPersonnel;
        }

        /// <summary>
        /// The capability flags returned on every workflow response, so the frontend
        /// implements no rules at all. Fills WorkflowStepResponse.CanIAct / CanIAssign /
        /// CanIDelegate / CanISkip and InboxItemResponse's equivalents.
        /// </summary>
        public static (bool CanAct, bool CanAssign, bool CanDelegate, bool CanSkip, bool CanView)
            CapabilitiesFor(
                WorkflowActorContext actor,
                WorkflowInstanceFacts instance,
                DateTime utcNow,
                string? candidateDelegateRole = null,
                Guid? candidateDelegateShopId = null)
        {
            var canAct = CanActOnStep(actor, instance).Allowed;
            var canAssign = CanAssignStep(actor, instance).Allowed;
            var canSkip = CanSkipStep(actor, instance, utcNow).Allowed;

            var canDelegate = candidateDelegateRole is null
                ? CanDelegateStepGeneric(actor, instance)
                : CanDelegateStep(actor, instance, candidateDelegateRole,
                    candidateDelegateShopId).Allowed;

            return (canAct, canAssign, canDelegate, canSkip, CanView(actor, instance));
        }

        /// <summary>
        /// "May I delegate at all" without naming a delegate yet: used to render the
        /// Delegate button before the user picks somebody.
        /// </summary>
        public static bool CanDelegateStepGeneric(
            WorkflowActorContext actor,
            WorkflowInstanceFacts instance,
            int? stepNo = null)
        {
            var step = FormWorkflowCatalog.StepAt(
                instance.FormType, stepNo ?? instance.CurrentStepNo);

            if (step is null || !step.AllowsDelegation) return false;
            if (actor.IsAdmin) return true;
            if (!actor.Has(Permissions.DelegateForm)) return false;

            var canonical = actor.CanonicalRole;
            if (canonical is null) return false;

            return RoleHierarchy.DelegationRoles.Contains(canonical, StringComparer.OrdinalIgnoreCase)
                   && FormWorkflowCatalog.CanActOnStep(canonical, instance.FormType, step.StepNo);
        }

        // =================================================================================
        // 4. SELF-CHECK
        // =================================================================================

        /// <summary>
        /// Startup / unit-test assertion: every role named by a matrix row must actually
        /// hold the permission that row demands, otherwise the step is unreachable in
        /// production. Runs the catalog self-check too, so ONE call validates everything.
        /// </summary>
        public static IReadOnlyList<string> Validate()
        {
            var problems = new List<string>();

            foreach (var row in Rows)
            {
                if (string.IsNullOrWhiteSpace(row.RequiredPermission)) continue;

                foreach (var role in row.Roles)
                {
                    var canonical = RoleHierarchy.Normalize(role);
                    if (canonical is null)
                    {
                        problems.Add(row.FormNo + " step " + row.StepNo + ": unknown role '" + role + "'.");
                        continue;
                    }

                    if (canonical == OrgRoles.Admin) continue;

                    if (!RoleHierarchy.DefaultPermissions.TryGetValue(canonical, out var defaults)
                        || !defaults.Contains(row.RequiredPermission, StringComparer.OrdinalIgnoreCase))
                    {
                        problems.Add(
                            row.FormNo + " step " + row.StepNo + " ('" + row.Capability + "'): "
                            + RoleHierarchy.Label(canonical)
                            + " is eligible but its default permission set does not contain '"
                            + row.RequiredPermission + "'.");
                    }
                }
            }

            return problems
                .Concat(FormWorkflowCatalog.Validate())
                .Concat(DocumentationPermissionMatrix.Validate())
                .ToList();
        }
    }
}