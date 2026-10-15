namespace CMT.Domain.Models.Shared
{
    public enum RecordStatus
    {
        Active = 0,
        Inactive = 1,
        Deleted = 2
    }

    public enum CapabilityStatus
    {
        NotAssessed = 0,
        FullCapability = 1,
        LimitedCapability = 2,
        NoCapability = 3,
        UnderDevelopment = 4
    }

    public enum ComplianceStatus
    {
        NotReviewed = 0,
        Compliant = 1,
        NonCompliant = 2,
        PartiallyCompliant = 3,
        NotApplicable = 4
    }

    public enum AuditStatus
    {
        NotStarted = 0,
        InProgress = 1,
        Completed = 2,
        RequiresFollowUp = 3,
        Closed = 4
    }

    public enum ProficiencyLevel
    {
        NotRated = 0,
        Trainee = 1,
        Supervised = 2,
        Competent = 3,
        Expert = 4,
        Instructor = 5
    }

    public enum ToolStatus
    {
        NotRequired = 0,
        Required = 1,
        Available = 2,
        OnOrder = 3,
        NeedsCalibration = 4,
        OutOfService = 5
    }

    public enum WorkflowAction
    {
        Created = 0,
        Updated = 1,
        Submitted = 2,
        Approved = 3,
        Rejected = 4,
        Delegated = 5,
        Completed = 6,
        Archived = 7,
        Added = 8,
        Deleted = 9,
        Amended = 10,
        ReturnedForRevision = 11,
        AssignmentChanged = 12
    }

    public enum DelegationStatus
    {
        Active = 0,
        Revoked = 1,
        Expired = 2
    }

    public enum DirectiveApplicability
    {
        NotDetermined = 0,
        Applicable = 1,
        NotApplicable = 2,
        Superseded = 3
    }

    public enum BulletinCategory
    {
        Mandatory = 0,
        Recommended = 1,
        Optional = 2,
        Alert = 3
    }

    /// <summary>
    /// Facility evaluation type discriminator.
    /// </summary>
    public enum FacilityEvaluationType
    {
        Repair = 0,
        Cleaning = 1,
        Environmental = 2
    }

    /// <summary>
    /// Training record type discriminator.
    /// </summary>
    public enum TrainingRecordType
    {
        ComponentMaintenanceTraining = 0,
        InspectorProficiency = 1,
        CompetencyAssessment = 2
    }

    /// <summary>
    /// Form node types matching the hierarchical tree structure.
    /// Maps to FormSubmission.FormType values.
    /// </summary>
    public static class FormNodeTypes
    {
        public const string CapabilitySelfEvaluation = "capability_self_evaluation";
        public const string PeriodicSelfAudit = "periodic_self_audit";
        public const string ConfirmationLetter = "confirmation_letter";
        public const string RequestLetter = "request_letter";
        public const string TableOfContent = "table_of_content";
        public const string Form918FAA = "918_faa";
        public const string Form918ACAA = "918a_caa";
        public const string SB = "sb";
        public const string AD = "ad";
        public const string ComponentMaintenanceTraining = "component_maintenance_training";
        public const string InspectorProficiency = "inspector_proficiency";
        public const string CompetencyAssessment = "competency_assessment";
        public const string SimilarTechnology = "similar_technology";
        public const string TNA = "tna";
        public const string ToolNeedAnalysisReport = "tool_need_analysis_report";
        public const string AlternateToolsEquivalency = "alternate_tools_equivalency";
        public const string InhouseManufacturedTools = "inhouse_manufactured_tools";
        public const string RepairFacilityEvaluation = "repair_facility_evaluation";
        public const string CleaningFacilityEvaluation = "cleaning_facility_evaluation";
        public const string EnvironmentalFacilityEvaluation = "environmental_facility_evaluation";
        public const string ConsumablesList = "list_of_consumables";
        public const string AlternateConsumableDeclaration = "alternate_consumable_declaration";
        public const string TaskCard = "task_card";

        // ===== AMENDED (revised Table of Contents) — 7 additive values =====
        // Additive only: no existing constant was renamed or removed, so stored
        // FormSubmission.FormType values remain valid.

        // TRAINING DOCUMENT -> MAINTENANCE AND GENERIC COURSES
        public const string TrainingVerificationInspection = "training_verification_inspection";
        public const string TrainingVerificationTechnician = "training_verification_technician";

        // TRAINING DOCUMENT -> SIMILAR TECHNICAL OR SIMPLE TASKS
        public const string SimilarTask = "similar_task";
        public const string SimpleTask = "simple_task";

        // TOOLS AND EQUIPMENT -> IN-HOUSE MANUFACTURING TOOL JIC
        public const string ToolMfgJic = "tool_mfg_jic";
        public const string ToolRiskAssessment = "tool_risk_assessment";
        public const string ToolMfgForm1554 = "tool_mfg_form_1554";
    }
}