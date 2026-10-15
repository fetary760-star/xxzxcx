using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.Workflow
{
    // =====================================================================================
    // AMENDMENT DOCUMENT B - WorkflowStepTableReference.cs   (NEW FILE)
    // Copy to: CMT.Domain/Models/Workflow/WorkflowStepTableReference.cs
    //
    // WHAT THIS FILE IS
    // -----------------
    // Amendment document B asks for "one step table per catalogued form, with step no, kind,
    // pending ApprovalStatus, eligible roles, assigner roles, signature caption, assignment
    // unit and skip mode". This file IS that document, expressed as code instead of prose, so
    // it can never drift from the routing that actually executes.
    //
    // WHY IT IS GENERATED AND NOT HAND-WRITTEN
    //   FormWorkflowCatalog (+ its five part files) already declares every step of every
    //   form. Re-typing those tables into a document guarantees they diverge on the first
    //   routing change. WorkflowStepTableReference therefore PROJECTS the catalog into the
    //   printed shape of amendment document B, adds the two columns the catalog does not
    //   carry itself (RequiredPermission and Scope, both taken from
    //   WorkflowPermissionMatrix so document B and document C agree by construction), and
    //   asserts - in Validate() - that every form amendment document B enumerates really is
    //   catalogued under the printed form number the document prints.
    //
    // THE 33 CATALOGUED FORMS COVERED (see ExpectedForms below)
    //   PERIODIC CAPABILITY SELF-AUDIT ...... MNT-1325                                  (1)
    //   LETTER OF CONFIRMATION .............. MNT-LOC                                   (1)
    //   AMENDMENT REQUEST ................... MNT-918 (Request Letter), SE-AMEND        (2)
    //   REGULATORY 918 / 918A ............... MNT-918, MNT-918A                         (2)
    //   DOCUMENTATION ....................... MNT-1420, 1420A, 1420B, 1420C            (4)
    //   ATA RECORD .......................... ATA-REC                                   (1)
    //   TRAINING ............................ 8 forms incl. MNT-1378 and MNT-922C       (8)
    //   TOOLS AND EQUIPMENT ................. MNT-1229B + alternate-tool + in-house     (7)
    //   FACILITY REQUIREMENT EVALUATION ..... repair / cleaning / environmental         (3)
    //   CONSUMABLES ......................... MNT-CON-01, MNT-CON-02                    (2)
    //   FINAL SIGN-OFF / REVISION ........... SE-SIGNOFF, SE-REV                        (2)
    //                                                                        TOTAL  =  33
    //
    // HARD RULES (identical to every other file of this layer)
    //   - Pure projection: no EF, no DbContext, no services, no I/O, no JSON.
    //   - Nothing is modified: ApprovalStatus.cs, RoleHierarchy.cs, Enums.cs,
    //     WorkflowContracts.cs, every FormWorkflowCatalog part file, WorkflowPermissionMatrix
    //     and DocumentationPermissionMatrix are only CONSUMED.
    //   - No enum member, status, role or permission is added, renamed or renumbered, so this
    //     file produces NO schema difference and NO migration.
    //   - Lazy<T> is NOT needed here: the catalog is already fully aggregated behind its own
    //     Lazy<T>, and this file is a plain static readonly projection of it.
    // =====================================================================================

    /// <summary>
    /// ONE printed row of a form's workflow step table (amendment document B).
    /// StepNo 0 is always the drafting row.
    /// </summary>
    public sealed class WorkflowStepTableRow
    {
        // ---- identity ----------------------------------------------------------------
        public string FormNo { get; init; } = string.Empty;
        public string FormType { get; init; } = string.Empty;
        public string Section { get; init; } = string.Empty;
        public string SectionTitle { get; init; } = string.Empty;

        // ---- step no + kind ----------------------------------------------------------
        public int StepNo { get; init; }
        public string Title { get; init; } = string.Empty;
        public WorkflowStepKind Kind { get; init; }
        public string KindName => Kind.ToString();

        // ---- pending ApprovalStatus ---------------------------------------------------
        public ApprovalStatus PendingStatus { get; init; }
        public string PendingStatusName => PendingStatus.ToString();
        public int PendingStatusValue => (int)PendingStatus;
        public string PendingStatusLabel { get; init; } = string.Empty;
        public string LifecycleState { get; init; } = string.Empty;

        // ---- eligible roles / assigner roles -----------------------------------------
        public string[] EligibleRoles { get; init; } = Array.Empty<string>();
        public string[] EligibleRoleLabels { get; init; } = Array.Empty<string>();
        public string[] AssignerRoles { get; init; } = Array.Empty<string>();
        public string[] AssignerRoleLabels { get; init; } = Array.Empty<string>();

        // ---- signature caption --------------------------------------------------------
        public SignatureBlockType Signature { get; init; }
        public string SignatureCaption { get; init; } = string.Empty;

        // ---- assignment unit ----------------------------------------------------------
        /// <summary>FunctionalUnits value, or null when the queue is the originator's shop.</summary>
        public string? AssignmentUnit { get; init; }

        /// <summary>Printable form of <see cref="AssignmentUnit"/>.</summary>
        public string AssignmentUnitLabel { get; init; } = string.Empty;

        public bool RequiresManualAssignment { get; init; }

        // ---- skip mode ----------------------------------------------------------------
        public SkipMode Skip { get; init; }
        public string SkipModeName => Skip.ToString();
        public string? SkipConditionField { get; init; }
        public string SkipWhenValue { get; init; } = string.Empty;
        public bool SkipWhenFieldMissing { get; init; }
        public string? SkipReasonTemplate { get; init; }

        // ---- guard rails --------------------------------------------------------------
        public bool AllowsDelegation { get; init; }
        public bool RestrictToOriginatorShop { get; init; }
        public bool RequiresComments { get; init; }
        public bool IsStepByStepChecklist { get; init; }
        public string[] RequiredFields { get; init; } = Array.Empty<string>();

        // ---- cross reference to amendment document C ----------------------------------
        /// <summary>Permissions constant the executor must hold (WorkflowPermissionMatrix).</summary>
        public string RequiredPermission { get; init; } = string.Empty;

        /// <summary>Permissions constant the ASSIGNER must hold, when the step is assignable.</summary>
        public string AssignPermission { get; init; } = string.Empty;

        /// <summary>Scope column of amendment document C (OWN_SHOP / FUNCTIONAL_UNIT / ...).</summary>
        public string Scope { get; init; } = string.Empty;
    }

    /// <summary>The complete step table of ONE catalogued form (amendment document B).</summary>
    public sealed class WorkflowStepTable
    {
        public string FormNo { get; init; } = string.Empty;
        public string FormType { get; init; } = string.Empty;
        public string Title { get; init; } = string.Empty;
        public string Section { get; init; } = string.Empty;
        public string SectionTitle { get; init; } = string.Empty;
        public int SectionOrder { get; init; }
        public int OrderInSection { get; init; }

        public string[] DraftRoles { get; init; } = Array.Empty<string>();
        public string[] DraftRoleLabels { get; init; } = Array.Empty<string>();
        public string[] RequiredDraftFields { get; init; } = Array.Empty<string>();

        public bool IncludeInFolder { get; init; }
        public bool IsMandatory { get; init; }
        public bool IsOptionalByRegulatoryDate { get; init; }
        public bool IsGeneratedByJointApproval { get; init; }
        public string? JointApprovalCompanionFormType { get; init; }
        public int? ExpiryMonths { get; init; }
        public bool IsFinalReleaseGate { get; init; }
        public bool BypassesLowerTiers { get; init; }
        public string Remarks { get; init; } = string.Empty;

        /// <summary>Ordered rows, StepNo 0 first.</summary>
        public WorkflowStepTableRow[] Rows { get; init; } = Array.Empty<WorkflowStepTableRow>();

        public WorkflowStepTableRow? DraftRow => Rows.FirstOrDefault(r => r.StepNo == 0);

        public IEnumerable<WorkflowStepTableRow> ApprovalRows => Rows.Where(r => r.StepNo > 0);

        public int ApprovalStepCount => Rows.Count(r => r.StepNo > 0);

        /// <summary>Signature block layout of the printed form, in step order, deduplicated.</summary>
        public string[] SignatureLayout =>
            Rows.OrderBy(r => r.StepNo)
                .Where(r => r.Signature != SignatureBlockType.None)
                .Select(r => r.SignatureCaption)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
    }

    /// <summary>
    /// AMENDMENT DOCUMENT B, as code: the per-form workflow step tables of every catalogued
    /// form, generated from FormWorkflowCatalog and cross-referenced with
    /// WorkflowPermissionMatrix so the routing, the permission and the scope columns can
    /// never contradict each other.
    /// </summary>
    public static class WorkflowStepTableReference
    {
        // =================================================================================
        // 1. THE EXPECTED CATALOGUE OF AMENDMENT DOCUMENT B
        //    Every form the amendment enumerates, with the printed form number it prints.
        //    Validate() fails when a form is missing, renamed or renumbered.
        // =================================================================================

        /// <summary>Number of forms amendment document B catalogues.</summary>
        public const int ExpectedFormCount = 33;

        /// <summary>Form type -> printed form number, exactly as amendment document B prints them.</summary>
        public static readonly (string FormType, string FormNo, string Section, string Group)[] ExpectedForms =
        {
            // ---- PERIODIC CAPABILITY SELF-AUDIT --------------------------------------
            (FormNodeTypes.PeriodicSelfAudit, "MNT-1325", ToCSections.SelfAudit, "Periodic capability self-audit"),

            // ---- LETTER OF CONFIRMATION ----------------------------------------------
            (FormNodeTypes.ConfirmationLetter, "MNT-LOC", ToCSections.LetterOfConfirmation, "Letter of Confirmation"),

            // ---- AMENDMENT REQUEST ---------------------------------------------------
            (FormNodeTypes.RequestLetter, "MNT-918 (Request Letter)", ToCSections.AmendmentRequest, "Amendment request"),
            (FormWorkflowCatalog.AmendmentCycleFormType, FormWorkflowCatalog.FormNoAmendmentCycle, ToCSections.AmendmentRequest, "Expiry amendment cycle"),

            // ---- REGULATORY 918 / 918A -----------------------------------------------
            (FormNodeTypes.Form918FAA, "MNT-918", ToCSections.Form918FAA, "918 FAA"),
            (FormNodeTypes.Form918ACAA, "MNT-918A", ToCSections.Form918ACAA, "918A CAA"),

            // ---- DOCUMENTATION -------------------------------------------------------
            (FormWorkflowCatalog.ATARecordFormType, "ATA-REC", ToCSections.Documentation, "ATA record"),
            (FormWorkflowCatalog.CmmDocumentationFormType, FormWorkflowCatalog.FormNoCMM, ToCSections.Documentation, "Documentation"),
            (FormNodeTypes.SB, FormWorkflowCatalog.FormNoSB, ToCSections.Documentation, "Documentation"),
            (FormNodeTypes.AD, FormWorkflowCatalog.FormNoAD, ToCSections.Documentation, "Documentation"),
            (FormNodeTypes.TaskCard, FormWorkflowCatalog.FormNoTaskCard, ToCSections.Documentation, "Documentation"),

            // ---- TRAINING DOCUMENT (8 forms) ----------------------------------------
            (FormNodeTypes.ComponentMaintenanceTraining, FormWorkflowCatalog.FormNoComponentMaintenanceTraining, ToCSections.Training, "Training"),
            (FormNodeTypes.TrainingVerificationInspection, FormWorkflowCatalog.FormNoTrainingVerificationInspection, ToCSections.Training, "Training"),
            (FormNodeTypes.TrainingVerificationTechnician, FormWorkflowCatalog.FormNoTrainingVerificationTechnician, ToCSections.Training, "Training"),
            (FormNodeTypes.InspectorProficiency, FormWorkflowCatalog.FormNoInspectorProficiency, ToCSections.Training, "Training"),
            (FormNodeTypes.CompetencyAssessment, FormWorkflowCatalog.FormNoCompetencyAssessment, ToCSections.Training, "Training"),
            (FormNodeTypes.SimilarTechnology, FormWorkflowCatalog.FormNoSimilarTechnology, ToCSections.Training, "Training"),
            (FormNodeTypes.SimilarTask, FormWorkflowCatalog.FormNoSimilarTask, ToCSections.Training, "Training"),
            (FormNodeTypes.SimpleTask, FormWorkflowCatalog.FormNoSimpleTask, ToCSections.Training, "Training"),

            // ---- TOOLS AND EQUIPMENT (MNT-1229B + alternate tool + in-house) --------
            (FormNodeTypes.TNA, FormWorkflowCatalog.FormNoTNA, ToCSections.Tools, "Tools"),
            (FormNodeTypes.ToolNeedAnalysisReport, FormWorkflowCatalog.FormNoTNAReport, ToCSections.Tools, "Tools"),
            (FormNodeTypes.AlternateToolsEquivalency, FormWorkflowCatalog.FormNoAlternateTools, ToCSections.Tools, "Tools - alternate tool"),
            (FormNodeTypes.InhouseManufacturedTools, FormWorkflowCatalog.FormNoInhouseTools, ToCSections.Tools, "Tools - in-house"),
            (FormNodeTypes.ToolMfgJic, FormWorkflowCatalog.FormNoToolMfgJic, ToCSections.Tools, "Tools - in-house"),
            (FormNodeTypes.ToolRiskAssessment, FormWorkflowCatalog.FormNoToolRiskAssessment, ToCSections.Tools, "Tools - in-house"),
            (FormNodeTypes.ToolMfgForm1554, FormWorkflowCatalog.FormNoToolMfg1554, ToCSections.Tools, "Tools - in-house"),

            // ---- FACILITY REQUIREMENT EVALUATION (3 forms) -------------------------
            (FormNodeTypes.RepairFacilityEvaluation, FormWorkflowCatalog.FormNoRepairFacility, ToCSections.Facility, "Facility"),
            (FormNodeTypes.CleaningFacilityEvaluation, FormWorkflowCatalog.FormNoCleaningFacility, ToCSections.Facility, "Facility"),
            (FormNodeTypes.EnvironmentalFacilityEvaluation, FormWorkflowCatalog.FormNoEnvironmentalFacility, ToCSections.Facility, "Facility"),

            // ---- CONSUMABLES ---------------------------------------------------------
            (FormNodeTypes.ConsumablesList, FormWorkflowCatalog.FormNoConsumablesList, ToCSections.Consumables, "Consumables"),
            (FormNodeTypes.AlternateConsumableDeclaration, FormWorkflowCatalog.FormNoAlternateConsumable, ToCSections.Consumables, "Consumables"),

            // ---- FOLDER LEVEL --------------------------------------------------------
            (FormWorkflowCatalog.FolderSignOffFormType, FormWorkflowCatalog.FormNoFolderSignOff, ToCSections.FinalSignOff, "Folder sign-off"),
            (FormWorkflowCatalog.RevisionCycleFormType, FormWorkflowCatalog.FormNoRevisionCycle, ToCSections.FinalSignOff, "Folder revision")
        };

        /// <summary>Known central functional units a step may be owned by.</summary>
        public static readonly string[] KnownAssignmentUnits =
        {
            FunctionalUnits.Documentation,
            FunctionalUnits.HumanResources,
            FunctionalUnits.QualityAssurance,
            FunctionalUnits.Authority
        };

        /// <summary>Printable label of an assignment unit; the originator's shop when null.</summary>
        public const string OriginatorShopQueueLabel = "Originator shop";

        // =================================================================================
        // 2. THE GENERATED STEP TABLES
        // =================================================================================

        /// <summary>One step table per catalogued form, in Table-of-Contents order.</summary>
        public static readonly WorkflowStepTable[] Tables = BuildTables();

        /// <summary>Every row of every table, flattened (handy for CSV / API export).</summary>
        public static readonly WorkflowStepTableRow[] Rows =
            Tables.SelectMany(t => t.Rows).ToArray();

        private static WorkflowStepTable[] BuildTables() =>
            FormWorkflowCatalog.All.Select(BuildTable).ToArray();

        private static WorkflowStepTable BuildTable(FormWorkflowDefinition form) => new()
        {
            FormNo = form.FormNo,
            FormType = form.FormType,
            Title = form.Title,
            Section = form.Section,
            SectionTitle = ToCSections.TitleOf(form.Section),
            SectionOrder = ToCSections.OrderOf(form.Section),
            OrderInSection = form.Order,

            DraftRoles = form.DraftRoles,
            DraftRoleLabels = form.DraftRoles.Select(RoleHierarchy.Label).ToArray(),
            RequiredDraftFields = form.RequiredDraftFields,

            IncludeInFolder = form.IncludeInFolder,
            IsMandatory = form.IsMandatory,
            IsOptionalByRegulatoryDate = form.IsOptionalByRegulatoryDate,
            IsGeneratedByJointApproval = form.IsGeneratedByJointApproval,
            JointApprovalCompanionFormType = form.JointApprovalCompanionFormType,
            ExpiryMonths = form.ExpiryMonths,
            IsFinalReleaseGate = form.IsFinalReleaseGate,
            BypassesLowerTiers = form.BypassesLowerTiers,
            Remarks = form.Remarks,

            Rows = form.Steps
                .OrderBy(s => s.StepNo)
                .Select(step => BuildRow(form, step))
                .ToArray()
        };

        private static WorkflowStepTableRow BuildRow(
            FormWorkflowDefinition form,
            WorkflowStepDefinition step) => new()
        {
            FormNo = form.FormNo,
            FormType = form.FormType,
            Section = form.Section,
            SectionTitle = ToCSections.TitleOf(form.Section),

            StepNo = step.StepNo,
            Title = step.Title,
            Kind = step.Kind,

            PendingStatus = step.Status,
            PendingStatusLabel = ApprovalStatusInfo.Label(step.Status),
            LifecycleState = ApprovalStatusInfo.StateOf(step.Status).ToString(),

            EligibleRoles = step.EligibleRoles,
            EligibleRoleLabels = step.EligibleRoles.Select(RoleHierarchy.Label).ToArray(),
            AssignerRoles = step.AssignerRoles,
            AssignerRoleLabels = step.AssignerRoles.Select(RoleHierarchy.Label).ToArray(),

            Signature = step.Signature,
            SignatureCaption = FormWorkflowCatalog.SignatureCaption(step.Signature),

            AssignmentUnit = step.AssignmentUnit,
            AssignmentUnitLabel = string.IsNullOrWhiteSpace(step.AssignmentUnit)
                ? OriginatorShopQueueLabel
                : step.AssignmentUnit!,
            RequiresManualAssignment = step.RequiresManualAssignment,

            Skip = step.Skip,
            SkipConditionField = step.SkipConditionField,
            SkipWhenValue = step.SkipWhenValue,
            SkipWhenFieldMissing = step.SkipWhenFieldMissing,
            SkipReasonTemplate = step.SkipReasonTemplate,

            AllowsDelegation = step.AllowsDelegation,
            RestrictToOriginatorShop = step.RestrictToOriginatorShop,
            RequiresComments = step.RequiresComments,
            IsStepByStepChecklist = step.IsStepByStepChecklist,
            RequiredFields = step.RequiredFields,

            RequiredPermission = WorkflowPermissionMatrix.PermissionForStep(step),
            AssignPermission = step.RequiresManualAssignment
                ? WorkflowPermissionMatrix.AssignPermissionForStep(step)
                : string.Empty,
            Scope = WorkflowPermissionMatrix.ScopeForStep(step)
        };

        // =================================================================================
        // 3. LOOKUP
        // =================================================================================

        public static WorkflowStepTable? TableFor(string? formType) =>
            Tables.FirstOrDefault(t =>
                string.Equals(t.FormType, formType, StringComparison.OrdinalIgnoreCase));

        public static WorkflowStepTable? TableForFormNo(string? formNo) =>
            Tables.FirstOrDefault(t =>
                string.Equals(t.FormNo, formNo, StringComparison.OrdinalIgnoreCase));

        public static WorkflowStepTable[] TablesForSection(string? sectionCode) =>
            Tables.Where(t => string.Equals(t.Section, sectionCode, StringComparison.OrdinalIgnoreCase))
                  .OrderBy(t => t.OrderInSection)
                  .ToArray();

        public static WorkflowStepTableRow[] RowsFor(string? formType) =>
            TableFor(formType)?.Rows ?? Array.Empty<WorkflowStepTableRow>();

        public static WorkflowStepTableRow? RowAt(string? formType, int stepNo) =>
            RowsFor(formType).FirstOrDefault(r => r.StepNo == stepNo);

        /// <summary>Rows in which a role appears as an eligible executor.</summary>
        public static WorkflowStepTableRow[] RowsForRole(string? role)
        {
            var canonical = RoleHierarchy.Normalize(role);
            if (canonical is null) return Array.Empty<WorkflowStepTableRow>();
            if (canonical == OrgRoles.Admin) return Rows;

            return Rows.Where(r => r.EligibleRoles.Contains(canonical, StringComparer.OrdinalIgnoreCase))
                       .ToArray();
        }

        /// <summary>Rows in which a role appears as an assigner of the step.</summary>
        public static WorkflowStepTableRow[] AssignerRowsForRole(string? role)
        {
            var canonical = RoleHierarchy.Normalize(role);
            if (canonical is null) return Array.Empty<WorkflowStepTableRow>();

            return Rows.Where(r => r.RequiresManualAssignment
                                   && (r.AssignerRoles.Length > 0
                                       ? r.AssignerRoles.Contains(canonical, StringComparer.OrdinalIgnoreCase)
                                       : r.EligibleRoles.Contains(canonical, StringComparer.OrdinalIgnoreCase)))
                       .ToArray();
        }

        /// <summary>Every step owned by a central functional unit queue.</summary>
        public static WorkflowStepTableRow[] RowsForUnit(string? unit) =>
            Rows.Where(r => !string.IsNullOrWhiteSpace(r.AssignmentUnit)
                            && string.Equals(r.AssignmentUnit, unit, StringComparison.OrdinalIgnoreCase))
                .ToArray();

        /// <summary>Every skippable step, grouped by the field that drives the skip.</summary>
        public static WorkflowStepTableRow[] SkippableRows() =>
            Rows.Where(r => r.Skip != SkipMode.NotSkippable).ToArray();

        /// <summary>Every step that parks the record in one specific ApprovalStatus.</summary>
        public static WorkflowStepTableRow[] RowsForStatus(ApprovalStatus status) =>
            Rows.Where(r => r.PendingStatus == status).ToArray();

        /// <summary>Statuses declared by the enums but not reachable by any catalogued step.</summary>
        public static ApprovalStatus[] UnreachableStatuses()
        {
            var reachable = Rows.Select(r => r.PendingStatus).Distinct().ToHashSet();

            return Enum.GetValues(typeof(ApprovalStatus))
                       .Cast<ApprovalStatus>()
                       .Where(s => !reachable.Contains(s))
                       .Where(s => s is not (ApprovalStatus.Approved
                           or ApprovalStatus.Rejected
                           or ApprovalStatus.Returned
                           or ApprovalStatus.Skipped
                           or ApprovalStatus.Expired
                           or ApprovalStatus.Completed
                           or ApprovalStatus.Locked
                           or ApprovalStatus.Draft))
                       .ToArray();
        }

        // =================================================================================
        // 4. EXPORT  (served verbatim by GET /api/workflow/step-tables)
        // =================================================================================

        /// <summary>Amendment document B rendered as Markdown: one table per form.</summary>
        public static string ToMarkdown()
        {
            var sb = new StringBuilder();
            sb.AppendLine("# Amendment document B - workflow step tables per form");
            sb.AppendLine();
            sb.AppendLine($"Catalogued forms: {Tables.Length} (expected {ExpectedFormCount}).");
            sb.AppendLine();

            foreach (var sectionCode in ToCSections.Ordered.Select(s => s.Code))
            {
                var tables = TablesForSection(sectionCode);
                if (tables.Length == 0) continue;

                sb.AppendLine($"## {ToCSections.TitleOf(sectionCode)}");
                sb.AppendLine();

                foreach (var table in tables)
                {
                    sb.AppendLine($"### {table.FormNo} - {table.Title}");
                    sb.AppendLine();
                    sb.AppendLine($"- Form type: `{table.FormType}`");
                    sb.AppendLine($"- Draft roles: {Join(table.DraftRoleLabels)}");
                    sb.AppendLine($"- Required draft fields: {Join(table.RequiredDraftFields)}");
                    sb.AppendLine($"- In folder: {YesNo(table.IncludeInFolder)} | Mandatory: {YesNo(table.IsMandatory)}"
                                  + $" | Validity: {(table.ExpiryMonths.HasValue ? table.ExpiryMonths + " months" : "-")}");
                    sb.AppendLine();
                    sb.AppendLine("| Step | Kind | Pending ApprovalStatus | Eligible roles | Assigner roles "
                                  + "| Signature caption | Assignment unit | Skip mode | Scope | Permission |");
                    sb.AppendLine("|---|---|---|---|---|---|---|---|---|---|");

                    foreach (var row in table.Rows)
                    {
                        sb.AppendLine(
                            $"| {row.StepNo} "
                            + $"| {row.KindName} "
                            + $"| {row.PendingStatusName} ({row.PendingStatusValue}) "
                            + $"| {Join(row.EligibleRoleLabels)} "
                            + $"| {Join(row.AssignerRoleLabels)} "
                            + $"| {Dash(row.SignatureCaption)} "
                            + $"| {row.AssignmentUnitLabel} "
                            + $"| {SkipCell(row)} "
                            + $"| {row.Scope} "
                            + $"| {Dash(row.RequiredPermission)} |");
                    }

                    sb.AppendLine();

                    if (!string.IsNullOrWhiteSpace(table.Remarks))
                    {
                        sb.AppendLine($"> {table.Remarks}");
                        sb.AppendLine();
                    }
                }
            }

            return sb.ToString();
        }

        /// <summary>Flat CSV of every row, for the printed appendix of amendment document B.</summary>
        public static string ToCsv()
        {
            var sb = new StringBuilder();
            sb.AppendLine("FormNo,FormType,Section,StepNo,Kind,PendingStatus,PendingStatusValue,"
                          + "EligibleRoles,AssignerRoles,SignatureCaption,AssignmentUnit,SkipMode,"
                          + "SkipConditionField,SkipWhenValue,Scope,RequiredPermission,"
                          + "RequiresManualAssignment,AllowsDelegation,OwnShopOnly,RequiresComments,RequiredFields");

            foreach (var row in Rows)
            {
                sb.AppendLine(string.Join(",", new[]
                {
                    Csv(row.FormNo),
                    Csv(row.FormType),
                    Csv(row.Section),
                    row.StepNo.ToString(),
                    Csv(row.KindName),
                    Csv(row.PendingStatusName),
                    row.PendingStatusValue.ToString(),
                    Csv(string.Join(" | ", row.EligibleRoles)),
                    Csv(string.Join(" | ", row.AssignerRoles)),
                    Csv(row.SignatureCaption),
                    Csv(row.AssignmentUnitLabel),
                    Csv(row.SkipModeName),
                    Csv(row.SkipConditionField ?? string.Empty),
                    Csv(row.SkipWhenValue),
                    Csv(row.Scope),
                    Csv(row.RequiredPermission),
                    YesNo(row.RequiresManualAssignment),
                    YesNo(row.AllowsDelegation),
                    YesNo(row.RestrictToOriginatorShop),
                    YesNo(row.RequiresComments),
                    Csv(string.Join(" | ", row.RequiredFields))
                }));
            }

            return sb.ToString();
        }

        private static string SkipCell(WorkflowStepTableRow row) =>
            row.Skip == SkipMode.NotSkippable
                ? "NotSkippable"
                : string.IsNullOrWhiteSpace(row.SkipConditionField)
                    ? row.SkipModeName
                    : $"{row.SkipModeName} on `{row.SkipConditionField}` = `{row.SkipWhenValue}`";

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
        // 5. SELF-CHECK
        // =================================================================================

        /// <summary>
        /// Startup / unit-test assertion of amendment document B. It fails when the code and
        /// the printed document have drifted apart:
        ///   - a catalogued form of the document is missing or was renumbered,
        ///   - a step table is not consecutive from StepNo 0,
        ///   - an approval step has no eligible role,
        ///   - a manual-assignment step has no assigner role,
        ///   - an automatic skip has no condition field,
        ///   - a step declares an unknown assignment unit,
        ///   - a declared ApprovalStatus is unreachable by every catalogued step.
        /// </summary>
        public static IReadOnlyList<string> Validate()
        {
            var problems = new List<string>();

            // ---- 5.1 the document catalogue must match the code catalogue --------------
            foreach (var expected in ExpectedForms)
            {
                var table = TableFor(expected.FormType);
                if (table is null)
                {
                    problems.Add($"{expected.FormNo}: form type '{expected.FormType}' "
                                 + "is enumerated by amendment document B but is not catalogued.");
                    continue;
                }

                if (!string.Equals(table.FormNo, expected.FormNo, StringComparison.OrdinalIgnoreCase))
                {
                    problems.Add($"{expected.FormType}: printed form number drifted "
                                 + $"(document '{expected.FormNo}', catalog '{table.FormNo}').");
                }

                if (!string.Equals(table.Section, expected.Section, StringComparison.OrdinalIgnoreCase))
                {
                    problems.Add($"{expected.FormNo}: ToC section drifted "
                                 + $"(document '{expected.Section}', catalog '{table.Section}').");
                }
            }

            if (Tables.Length != ExpectedFormCount)
            {
                problems.Add($"Amendment document B catalogues {ExpectedFormCount} forms "
                             + $"but the catalog exposes {Tables.Length}.");
            }

            var documented = ExpectedForms.Select(f => f.FormType)
                                          .ToHashSet(StringComparer.OrdinalIgnoreCase);

            foreach (var table in Tables.Where(t => !documented.Contains(t.FormType)))
            {
                problems.Add($"{table.FormNo} ('{table.FormType}') is catalogued but is not "
                             + "enumerated by amendment document B.");
            }

            // ---- 5.2 structural integrity of every step table --------------------------
            foreach (var table in Tables)
            {
                var expectedStepNo = 0;

                foreach (var row in table.Rows)
                {
                    if (row.StepNo != expectedStepNo)
                    {
                        problems.Add($"{table.FormNo}: step numbers must be consecutive from 0 "
                                     + $"(found {row.StepNo}, expected {expectedStepNo}).");
                    }

                    expectedStepNo = row.StepNo + 1;

                    if (row.StepNo > 0 && row.EligibleRoles.Length == 0)
                        problems.Add($"{table.FormNo} step {row.StepNo}: no eligible role.");

                    if (row.RequiresManualAssignment && row.AssignerRoles.Length == 0)
                        problems.Add($"{table.FormNo} step {row.StepNo}: manual assignment without assigner roles.");

                    if (row.Skip is SkipMode.Auto or SkipMode.ManualOrAuto
                        && string.IsNullOrWhiteSpace(row.SkipConditionField))
                    {
                        problems.Add($"{table.FormNo} step {row.StepNo}: automatic skip without a condition field.");
                    }

                    if (!string.IsNullOrWhiteSpace(row.AssignmentUnit)
                        && !KnownAssignmentUnits.Contains(row.AssignmentUnit!, StringComparer.OrdinalIgnoreCase))
                    {
                        problems.Add($"{table.FormNo} step {row.StepNo}: unknown assignment unit "
                                     + $"'{row.AssignmentUnit}'.");
                    }

                    if (row.Signature != SignatureBlockType.None
                        && string.IsNullOrWhiteSpace(row.SignatureCaption))
                    {
                        problems.Add($"{table.FormNo} step {row.StepNo}: signature block "
                                     + $"{row.Signature} has no printed caption.");
                    }

                    foreach (var role in row.EligibleRoles.Concat(row.AssignerRoles))
                    {
                        if (RoleHierarchy.Normalize(role) is null)
                            problems.Add($"{table.FormNo} step {row.StepNo}: unknown role '{role}'.");
                    }
                }

                if (table.DraftRow is null)
                    problems.Add($"{table.FormNo}: no drafting row (StepNo 0).");

                if (table.ApprovalStepCount == 0)
                    problems.Add($"{table.FormNo}: no approval step.");
            }

            // ---- 5.3 every declared pending status must be reachable -------------------
            foreach (var status in UnreachableStatuses())
            {
                problems.Add($"ApprovalStatus.{status} ({(int)status}) is declared but no catalogued "
                             + "step ever parks a record in it.");
            }

            return problems;
        }

        /// <summary>
        /// ONE call that validates amendment document B together with the catalog and both
        /// permission matrices. Suitable for a startup assertion or a single unit test.
        /// </summary>
        public static IReadOnlyList<string> ValidateAll() =>
            Validate().Concat(WorkflowPermissionMatrix.Validate()).ToList();
    }
}