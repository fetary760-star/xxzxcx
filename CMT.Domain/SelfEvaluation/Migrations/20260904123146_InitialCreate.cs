using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace CMT.Domain.SelfEvaluation.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ArchiveEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ItemKind = table.Column<int>(type: "int", nullable: false),
                    ItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ItemTitle = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ItemReference = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    SectionCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    FormType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ATAChapterCode = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    StatusBeforeArchive = table.Column<int>(type: "int", nullable: false),
                    StatusBeforeArchiveLabel = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RevisionNumberBeforeArchive = table.Column<int>(type: "int", nullable: false),
                    WasApprovedBeforeArchive = table.Column<bool>(type: "bit", nullable: false),
                    Trigger = table.Column<int>(type: "int", nullable: false),
                    ArchivedByUserId = table.Column<long>(type: "bigint", nullable: false),
                    ArchivedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ArchivedByRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    ArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    State = table.Column<int>(type: "int", nullable: false),
                    EditedWhileArchived = table.Column<bool>(type: "bit", nullable: false),
                    LastEditedWhileArchivedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LastEditedWhileArchivedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    LastEditedWhileArchivedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    EditsWhileArchived = table.Column<int>(type: "int", nullable: false),
                    RestoredByUserId = table.Column<long>(type: "bigint", nullable: true),
                    RestoredByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    RestoredByRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    RestoredAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RestoreReason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    StatusAfterRestore = table.Column<int>(type: "int", nullable: true),
                    RevisionNumberAfterRestore = table.Column<int>(type: "int", nullable: true),
                    PurgeRequestedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    PurgeRequestedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    PurgeRequestReason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ArchiveEntries", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ATAChapters",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ChapterNumber = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ATAChapters", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ATARecordCreationDelegations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DelegatorUserId = table.Column<long>(type: "bigint", nullable: false),
                    DelegatorName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    DelegatorRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    DelegateUserId = table.Column<long>(type: "bigint", nullable: false),
                    DelegateName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    DelegateRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    EffectiveFrom = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    MaxRecords = table.Column<int>(type: "int", nullable: false),
                    RecordsCreated = table.Column<int>(type: "int", nullable: false),
                    RevokedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    RevokedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RevokeReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ATARecordCreationDelegations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CompetencyMatrixEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EvaluationFolderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EmployeeUserId = table.Column<long>(type: "bigint", nullable: false),
                    EmployeeName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    EmployeeNo = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    EmployeeRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    TrainingCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    TrainingTitle = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    SourceFormType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    SourceFormSubmissionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    TrainingCompletedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    TrainingExpiryDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Level = table.Column<int>(type: "int", nullable: false),
                    IsEligible = table.Column<bool>(type: "bit", nullable: false),
                    IsExpired = table.Column<bool>(type: "bit", nullable: false),
                    VerifiedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    VerifiedByRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    VerifiedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Remarks = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CompetencyMatrixEntries", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Departments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Code = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    DirectorUserId = table.Column<long>(type: "bigint", nullable: true),
                    ParentDepartmentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Departments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Departments_Departments_ParentDepartmentId",
                        column: x => x.ParentDepartmentId,
                        principalTable: "Departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "DocumentationLibraryLinks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EvaluationFolderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    DocumentKind = table.Column<int>(type: "int", nullable: false),
                    DocumentNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    CurrentRevision = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RevisionDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    PreviousRevision = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    WatchForRevision = table.Column<bool>(type: "bit", nullable: false),
                    LastCheckedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LastRaisedRevisionLogId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    LastRaisedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    SourceFormType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    SourceFormSubmissionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SourceFormWorkflowInstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    Remarks = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DocumentationLibraryLinks", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ExpiryTrackings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EntityType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    EntityId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EvaluationFolderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    FormType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    TrackedItem = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    ValidFrom = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ExpiryMonths = table.Column<int>(type: "int", nullable: false),
                    WarnDaysBefore = table.Column<int>(type: "int", nullable: false),
                    IsExpired = table.Column<bool>(type: "bit", nullable: false),
                    ExpiredAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    FirstNotifiedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LastNotifiedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    NotificationCount = table.Column<int>(type: "int", nullable: false),
                    ResponsibleUserId = table.Column<long>(type: "bigint", nullable: true),
                    ResponsibleRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    AmendmentInstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExpiryTrackings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RegulatoryComplianceRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EvaluationFolderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PrimaryInstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CompanionInstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Form918FAAId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Form918ACAAId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RegulatoryTargetDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    MaySkipNow = table.Column<bool>(type: "bit", nullable: false),
                    WasDeferred = table.Column<bool>(type: "bit", nullable: false),
                    DeferredAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    DeferredByUserId = table.Column<long>(type: "bigint", nullable: true),
                    DeferredByRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    DeferralReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    JointApprovalEnabled = table.Column<bool>(type: "bit", nullable: false),
                    JointApprovalEnabledAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    JointApprovalEnabledByUserId = table.Column<long>(type: "bigint", nullable: true),
                    DirectorApprovedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    DirectorApprovedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    DirectorApprovedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    QaApprovedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    QaApprovedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    QaApprovedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    EcaaEndorsedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    EcaaEndorsedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    EcaaEndorsedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    EcaaReferenceNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ComplianceStatus = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    IsComplete = table.Column<bool>(type: "bit", nullable: false),
                    IsLocked = table.Column<bool>(type: "bit", nullable: false),
                    Remarks = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RegulatoryComplianceRecords", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ToolEquivalencyMatrixEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EvaluationFolderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    OriginalToolPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    OriginalToolDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    AlternateToolPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AlternateToolDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    EquivalencyBasis = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    IsInhouseManufactured = table.Column<bool>(type: "bit", nullable: false),
                    EquivalencyApproved = table.Column<bool>(type: "bit", nullable: false),
                    ApprovedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    ApprovedByRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    ApprovedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CalibrationInterval = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    LastCalibrationDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CalibrationDueDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    SourceFormType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    SourceFormSubmissionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ToolEquivalencyMatrixEntries", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WorkflowAuditLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Action = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    WorkflowAction = table.Column<int>(type: "int", nullable: false),
                    EntityType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    EntityId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PerformedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Details = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    PreviousValues = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    NewValues = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    IpAddress = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Timestamp = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkflowAuditLogs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WorkflowInstances",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormSubmissionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EvaluationFolderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    FormType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    FormNo = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Section = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CurrentStepNo = table.Column<int>(type: "int", nullable: false),
                    CurrentAssigneeUserId = table.Column<long>(type: "bigint", nullable: true),
                    CurrentAssignmentUnit = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    OriginatorUserId = table.Column<long>(type: "bigint", nullable: false),
                    OriginatorRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    OriginatorName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    OriginatorShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SubmittedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsComplete = table.Column<bool>(type: "bit", nullable: false),
                    IsLocked = table.Column<bool>(type: "bit", nullable: false),
                    RegulatoryTargetDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    JointApprovalEnabled = table.Column<bool>(type: "bit", nullable: false),
                    JointApprovalCompanionInstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    FormFieldsSnapshotJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ExpiryMonths = table.Column<int>(type: "int", nullable: true),
                    ExpiresAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RevisionNumber = table.Column<int>(type: "int", nullable: false),
                    SupersedesInstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkflowInstances", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WorkflowNotifications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RecipientUserId = table.Column<long>(type: "bigint", nullable: false),
                    RecipientRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Category = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    Message = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    EntityType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    EntityId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormWorkflowInstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EvaluationFolderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ActionUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    IsRead = table.Column<bool>(type: "bit", nullable: false),
                    ReadAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkflowNotifications", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Shops",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    CertificateNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Address = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    City = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    State = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ZipCode = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Country = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Phone = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Email = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AccountableManager = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    QualityManager = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DepartmentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    TeamLeaderUserId = table.Column<long>(type: "bigint", nullable: true),
                    ShopManagerUserId = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Shops", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Shops_Departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "Departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "BulletinRegisterEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormWorkflowInstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DocumentationRoutingTicketId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SBFormId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EvaluationFolderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    DocumentType = table.Column<int>(type: "int", nullable: false),
                    BulletinNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Revision = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    IssueDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IssuedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ATAChapterCode = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    AffectedPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AffectedSerialNumbers = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Category = table.Column<int>(type: "int", nullable: false),
                    ComplianceStatus = table.Column<int>(type: "int", nullable: false),
                    ComplianceMethod = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    ComplianceDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LibraryReference = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    FiledLocation = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    IsEffective = table.Column<bool>(type: "bit", nullable: false),
                    SupersededByBulletinNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    AffectsCmm = table.Column<bool>(type: "bit", nullable: false),
                    AffectedCmmNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    PreparedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    PreparedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    PreparedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ProcessedByClerkUserId = table.Column<long>(type: "bigint", nullable: true),
                    ProcessedByClerkName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ProcessedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    SignedOffByLeaderUserId = table.Column<long>(type: "bigint", nullable: true),
                    SignedOffByLeaderName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    SignedOffAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsLocked = table.Column<bool>(type: "bit", nullable: false),
                    Remarks = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BulletinRegisterEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BulletinRegisterEntries_WorkflowInstances_FormWorkflowInstanceId",
                        column: x => x.FormWorkflowInstanceId,
                        principalTable: "WorkflowInstances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DirectiveComplianceEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormWorkflowInstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ADFormId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EvaluationFolderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ADNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Revision = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    EffectiveDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IssuingAuthority = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ATAChapterCode = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    AffectedPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AffectedModels = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Applicability = table.Column<int>(type: "int", nullable: false),
                    ComplianceStatus = table.Column<int>(type: "int", nullable: false),
                    ComplianceMethod = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    ComplianceDueDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ComplianceDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsRecurring = table.Column<bool>(type: "bit", nullable: false),
                    RecurringInterval = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    NextRecurrenceDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RelatedBulletinNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    DraftedByStlUserId = table.Column<long>(type: "bigint", nullable: false),
                    DraftedByStlName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    DraftedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ProcessedByStlUserId = table.Column<long>(type: "bigint", nullable: true),
                    ProcessedByStlName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ProcessedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ProcessingComments = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    IssuedByStlUserId = table.Column<long>(type: "bigint", nullable: true),
                    IssuedByStlName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    IssuedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IssueSignatureId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsIssued = table.Column<bool>(type: "bit", nullable: false),
                    IsLocked = table.Column<bool>(type: "bit", nullable: false),
                    Remarks = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DirectiveComplianceEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DirectiveComplianceEntries_WorkflowInstances_FormWorkflowInstanceId",
                        column: x => x.FormWorkflowInstanceId,
                        principalTable: "WorkflowInstances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DocumentationRoutingTickets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TicketNo = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    FormWorkflowInstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormSubmissionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EvaluationFolderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    FormType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    FormNo = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    InitiationCategory = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    OriginShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    OriginDepartmentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    OriginatorUserId = table.Column<long>(type: "bigint", nullable: false),
                    OriginatorName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    OriginatorRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    AssignmentUnit = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    ReceivedByUnitAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    DocumentationLeaderUserId = table.Column<long>(type: "bigint", nullable: true),
                    DocumentationLeaderName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AssignedClerkUserId = table.Column<long>(type: "bigint", nullable: true),
                    AssignedClerkName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AssignedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    AssignedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    ClerkOpenTicketsAtAssignment = table.Column<int>(type: "int", nullable: false),
                    ClerkStartedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ClerkCompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ReassignmentCount = table.Column<int>(type: "int", nullable: false),
                    PreviousClerkUserId = table.Column<long>(type: "bigint", nullable: true),
                    LastReassignReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ReturnedToLeaderAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LeaderSignedOffAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LeaderSignatureId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ReworkCount = table.Column<int>(type: "int", nullable: false),
                    LeaderReviewComments = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    State = table.Column<int>(type: "int", nullable: false),
                    FormStatus = table.Column<int>(type: "int", nullable: false),
                    Priority = table.Column<int>(type: "int", nullable: false),
                    DueDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsOverdue = table.Column<bool>(type: "bit", nullable: false),
                    IsClosed = table.Column<bool>(type: "bit", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DocumentationRoutingTickets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DocumentationRoutingTickets_WorkflowInstances_FormWorkflowInstanceId",
                        column: x => x.FormWorkflowInstanceId,
                        principalTable: "WorkflowInstances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "InhouseToolManufacturingRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormWorkflowInstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ToolNeedAnalysisEntryId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    InhouseManufacturedToolsCardId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EvaluationFolderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ToolPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ToolDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    LocalToolNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    DrawingNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    JicRequired = table.Column<bool>(type: "bit", nullable: false),
                    JicSkipped = table.Column<bool>(type: "bit", nullable: false),
                    JicSkippedAutomatically = table.Column<bool>(type: "bit", nullable: false),
                    JicCompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    JicCompletedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    RiskAssessmentRequired = table.Column<bool>(type: "bit", nullable: false),
                    RiskAssessmentSkipped = table.Column<bool>(type: "bit", nullable: false),
                    RiskAssessmentSkippedAutomatically = table.Column<bool>(type: "bit", nullable: false),
                    RiskAssessmentCompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RiskAssessmentCompletedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    Form1554Required = table.Column<bool>(type: "bit", nullable: false),
                    Form1554Skipped = table.Column<bool>(type: "bit", nullable: false),
                    Form1554SkippedAutomatically = table.Column<bool>(type: "bit", nullable: false),
                    Form1554CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Form1554CompletedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    SkipAuditTrail = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    SpecialTeamLeaderApprovedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    SpecialTeamLeaderApprovedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    SpecialTeamLeaderApprovedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovalSignatureId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsApproved = table.Column<bool>(type: "bit", nullable: false),
                    IsLocked = table.Column<bool>(type: "bit", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Remarks = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InhouseToolManufacturingRecords", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InhouseToolManufacturingRecords_WorkflowInstances_FormWorkflowInstanceId",
                        column: x => x.FormWorkflowInstanceId,
                        principalTable: "WorkflowInstances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProficiencyAssessmentAssignments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormWorkflowInstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    FormNo = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    EvaluationFolderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EmployeeProficiencyRecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    DesignatedUserId = table.Column<long>(type: "bigint", nullable: false),
                    DesignatedName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    DesignatedRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    DesignatedByUserId = table.Column<long>(type: "bigint", nullable: false),
                    DesignatedByRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    DesignatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    AssessedUserId = table.Column<long>(type: "bigint", nullable: false),
                    AssessedName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AssessedRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    AssessedTask = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    ReviewedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    AwardedLevel = table.Column<int>(type: "int", nullable: false),
                    Outcome = table.Column<int>(type: "int", nullable: false),
                    TaskCompletionSignedOff = table.Column<bool>(type: "bit", nullable: false),
                    TaskCompletionSignedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    SignatureId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ValidUntil = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ExpiryTrackingId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Findings = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    Remarks = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProficiencyAssessmentAssignments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProficiencyAssessmentAssignments_WorkflowInstances_FormWorkflowInstanceId",
                        column: x => x.FormWorkflowInstanceId,
                        principalTable: "WorkflowInstances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SelfAuditVerificationItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormWorkflowInstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StepNo = table.Column<int>(type: "int", nullable: false),
                    EvaluationFolderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PeriodicSelfAuditId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Kind = table.Column<int>(type: "int", nullable: false),
                    ItemCode = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    SequenceNo = table.Column<int>(type: "int", nullable: false),
                    IsMandatory = table.Column<bool>(type: "bit", nullable: false),
                    EvaluationFolderItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ToolEquivalencyMatrixEntryId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ExpectedValue = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    ActualValue = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    Outcome = table.Column<int>(type: "int", nullable: false),
                    IsVerified = table.Column<bool>(type: "bit", nullable: false),
                    VerifiedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    VerifiedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    VerifiedByRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    VerifiedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Finding = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    CorrectiveAction = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    FindingClosed = table.Column<bool>(type: "bit", nullable: false),
                    FindingClosedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SelfAuditVerificationItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SelfAuditVerificationItems_WorkflowInstances_FormWorkflowInstanceId",
                        column: x => x.FormWorkflowInstanceId,
                        principalTable: "WorkflowInstances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ToolNeedAnalysisEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormWorkflowInstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ToolNeedAnalysisReportId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EvaluationFolderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RequiredToolPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    RequiredToolDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    CmmReference = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    DraftedByUserId = table.Column<long>(type: "bigint", nullable: false),
                    DraftedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    DraftedByRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    AssignedToEngineer = table.Column<bool>(type: "bit", nullable: false),
                    AssignedEngineerUserId = table.Column<long>(type: "bigint", nullable: true),
                    AssignedEngineerName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    EngineerCompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    AlternateToolUsed = table.Column<bool>(type: "bit", nullable: false),
                    InhouseManufacturingRequired = table.Column<bool>(type: "bit", nullable: false),
                    InhouseStepsSkipped = table.Column<bool>(type: "bit", nullable: false),
                    InhouseStepsSkippedAutomatically = table.Column<bool>(type: "bit", nullable: false),
                    InhouseSkipReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    AlternateToolPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AlternateToolDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    EquivalencyBasis = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    ToolEquivalencyMatrixEntryId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ManagerApprovedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    ManagerApprovedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ManagerApprovedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    SpecialTeamLeaderApprovedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    SpecialTeamLeaderApprovedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    SpecialTeamLeaderApprovedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovalSignatureId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsApproved = table.Column<bool>(type: "bit", nullable: false),
                    IsLocked = table.Column<bool>(type: "bit", nullable: false),
                    CalibrationInterval = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    LastCalibrationDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CalibrationDueDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ExpiryTrackingId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Remarks = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ToolNeedAnalysisEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ToolNeedAnalysisEntries_WorkflowInstances_FormWorkflowInstanceId",
                        column: x => x.FormWorkflowInstanceId,
                        principalTable: "WorkflowInstances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TrainingEnrollments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormWorkflowInstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TrainingRecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EvaluationFolderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RequesterShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequesterUserId = table.Column<long>(type: "bigint", nullable: false),
                    RequesterName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    RequesterRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    EmployeeUserId = table.Column<long>(type: "bigint", nullable: false),
                    EmployeeName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    EmployeeNo = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    EmployeeRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    EmployeeShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    FormType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    TrainingCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    TrainingTitle = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    TrainingProvider = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    TrainingRequired = table.Column<bool>(type: "bit", nullable: false),
                    NotRequiredJustification = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    State = table.Column<int>(type: "int", nullable: false),
                    VerifiedByHRUserId = table.Column<long>(type: "bigint", nullable: true),
                    VerifiedByHRName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    VerifiedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    TrainingStatus = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    TrainingCompletedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    TrainingExpiryDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Level = table.Column<int>(type: "int", nullable: false),
                    IsEligible = table.Column<bool>(type: "bit", nullable: false),
                    IneligibleReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ApprovedByHRManagerUserId = table.Column<long>(type: "bigint", nullable: true),
                    ApprovedByHRManagerName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    HRManagerApprovedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ReturnedToRequesterAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RequesterVerifiedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    RequesterVerifiedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsExpired = table.Column<bool>(type: "bit", nullable: false),
                    ExpiryTrackingId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CompetencyMatrixEntryId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Remarks = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TrainingEnrollments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TrainingEnrollments_WorkflowInstances_FormWorkflowInstanceId",
                        column: x => x.FormWorkflowInstanceId,
                        principalTable: "WorkflowInstances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WorkflowDelegationLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormWorkflowInstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormWorkflowStepId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    StepNo = table.Column<int>(type: "int", nullable: false),
                    FormType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    EvaluationFolderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    DelegatedByUserId = table.Column<long>(type: "bigint", nullable: false),
                    DelegatedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    DelegatedByRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    DelegatedToUserId = table.Column<long>(type: "bigint", nullable: false),
                    DelegatedToName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    DelegatedToRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    DelegateRank = table.Column<int>(type: "int", nullable: false),
                    Reason = table.Column<int>(type: "int", nullable: false),
                    ReasonText = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    DelegatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    RevokedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RevokedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkflowDelegationLogs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkflowDelegationLogs_WorkflowInstances_FormWorkflowInstanceId",
                        column: x => x.FormWorkflowInstanceId,
                        principalTable: "WorkflowInstances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Components",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PartNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Manufacturer = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ModelSeries = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ATAChapterId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Components", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Components_ATAChapters_ATAChapterId",
                        column: x => x.ATAChapterId,
                        principalTable: "ATAChapters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Components_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "EmployeeProficiencyRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EmployeeName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    EmployeeId = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    JobTitle = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Department = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Certifications = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ProficiencyLevel = table.Column<int>(type: "int", nullable: false),
                    SkillAreas = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    LastTrainingDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    NextTrainingDue = table.Column<DateTime>(type: "datetime2", nullable: true),
                    TrainingHistory = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmployeeProficiencyRecords", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EmployeeProficiencyRecords_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ResponsibilityDelegations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DelegatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    DelegatedTo = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Responsibility = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Scope = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Conditions = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    EffectiveDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ExpirationDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ResponsibilityDelegations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ResponsibilityDelegations_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SelfAuditChecklists",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Section = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ItemNumber = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Question = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    RegulatoryReference = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ComplianceStatus = table.Column<int>(type: "int", nullable: false),
                    Findings = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CorrectiveAction = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    DueDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CompletionDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    AssignedTo = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AuditStatus = table.Column<int>(type: "int", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SelfAuditChecklists", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SelfAuditChecklists_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Username = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Email = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    FullName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    PasswordHash = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Role = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ManagerId = table.Column<long>(type: "bigint", nullable: true),
                    PersonnelType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    RefreshToken = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    RefreshTokenExpiryTime = table.Column<DateTime>(type: "datetime2", nullable: true),
                    DepartmentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SupervisorUserId = table.Column<long>(type: "bigint", nullable: true),
                    JobTitle = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    AdditionalPermissions = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    RevokedPermissions = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    SupervisorId = table.Column<long>(type: "bigint", nullable: true),
                    RecordStatus = table.Column<int>(type: "int", nullable: false),
                    RegisteredBy = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    LastUpdateDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    LastUpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Users_Departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "Departments",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Users_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Users_Users_ManagerId",
                        column: x => x.ManagerId,
                        principalTable: "Users",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Users_Users_SupervisorId",
                        column: x => x.SupervisorId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "DocumentationAssignmentHistories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DocumentationRoutingTicketId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Sequence = table.Column<int>(type: "int", nullable: false),
                    Action = table.Column<int>(type: "int", nullable: false),
                    StepNo = table.Column<int>(type: "int", nullable: false),
                    FromUserId = table.Column<long>(type: "bigint", nullable: true),
                    FromUserName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    FromUserRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    ToUserId = table.Column<long>(type: "bigint", nullable: true),
                    ToUserName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ToUserRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    ActedByUserId = table.Column<long>(type: "bigint", nullable: false),
                    ActedByRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    ActedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    StateBefore = table.Column<int>(type: "int", nullable: false),
                    StateAfter = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DocumentationAssignmentHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DocumentationAssignmentHistories_DocumentationRoutingTickets_DocumentationRoutingTicketId",
                        column: x => x.DocumentationRoutingTicketId,
                        principalTable: "DocumentationRoutingTickets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AirworthinessDirectives",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ADNumber = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    EffectiveDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Applicability = table.Column<int>(type: "int", nullable: false),
                    ComplianceStatus = table.Column<int>(type: "int", nullable: false),
                    ComplianceMethod = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    ComponentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AirworthinessDirectives", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AirworthinessDirectives_Components_ComponentId",
                        column: x => x.ComponentId,
                        principalTable: "Components",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ATARecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    PartNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    SelfEvaluationDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Manufacturer = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ATAChapterCode = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    CMMRevDate = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RevNo = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    CMMPdfUrl = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    Aircraft = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ECAAShop = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    FAAShop = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    LetterRefNo = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    EASA = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Authority = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ResponsibleWorkshop = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATAChapterId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ComponentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RequiresQAApproval = table.Column<bool>(type: "bit", nullable: false),
                    RequiresDirectorApproval = table.Column<bool>(type: "bit", nullable: false),
                    RequiresECAAEndorsement = table.Column<bool>(type: "bit", nullable: false),
                    ApprovalStatus = table.Column<int>(type: "int", nullable: false),
                    AssignedToUserId = table.Column<long>(type: "bigint", nullable: true),
                    ApprovedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    ApprovalDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RejectionReason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    RevisionNumber = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    CreatedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    CreatorRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ATARecords", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ATARecords_ATAChapters_ATAChapterId",
                        column: x => x.ATAChapterId,
                        principalTable: "ATAChapters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ATARecords_Components_ComponentId",
                        column: x => x.ComponentId,
                        principalTable: "Components",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ATARecords_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CapabilityAssessments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ComponentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Justification = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    HasRequiredTooling = table.Column<bool>(type: "bit", nullable: false),
                    HasRequiredTraining = table.Column<bool>(type: "bit", nullable: false),
                    HasTechnicalData = table.Column<bool>(type: "bit", nullable: false),
                    HasRequiredFacilities = table.Column<bool>(type: "bit", nullable: false),
                    Limitations = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CorrectiveActions = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    AssessmentDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    NextReviewDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    AssessedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ApprovedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CapabilityAssessments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CapabilityAssessments_Components_ComponentId",
                        column: x => x.ComponentId,
                        principalTable: "Components",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CapabilityAssessments_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ServiceBulletins",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SBNumber = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    IssueDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RevisionDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Revision = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Category = table.Column<int>(type: "int", nullable: false),
                    ComplianceStatus = table.Column<int>(type: "int", nullable: false),
                    ComplianceNotes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    ComponentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ServiceBulletins", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ServiceBulletins_Components_ComponentId",
                        column: x => x.ComponentId,
                        principalTable: "Components",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ToolNeedsAnalyses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ToolName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ToolPartNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Manufacturer = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CalibrationDueDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CalibrationInterval = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    StorageLocation = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    QuantityRequired = table.Column<int>(type: "int", nullable: false),
                    QuantityAvailable = table.Column<int>(type: "int", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    ComponentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ToolNeedsAnalyses", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ToolNeedsAnalyses_Components_ComponentId",
                        column: x => x.ComponentId,
                        principalTable: "Components",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ToolNeedsAnalyses_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "DocumentationClerkWorkloads",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ClerkUserId = table.Column<long>(type: "bigint", nullable: false),
                    ClerkName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ClerkRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    FunctionalUnit = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    IsAvailable = table.Column<bool>(type: "bit", nullable: false),
                    UnavailableReason = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    AbsentFrom = table.Column<DateTime>(type: "datetime2", nullable: true),
                    AbsentTo = table.Column<DateTime>(type: "datetime2", nullable: true),
                    OpenTicketCount = table.Column<int>(type: "int", nullable: false),
                    MaxConcurrentTickets = table.Column<int>(type: "int", nullable: false),
                    CompletedTicketCount = table.Column<int>(type: "int", nullable: false),
                    AverageProcessingHours = table.Column<double>(type: "float", nullable: false),
                    LastAssignedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LastCompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DocumentationClerkWorkloads", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DocumentationClerkWorkloads_Users_ClerkUserId",
                        column: x => x.ClerkUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UserSignatures",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<long>(type: "bigint", nullable: false),
                    UserFullName = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    UserRole = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    FileName = table.Column<string>(type: "nvarchar(260)", maxLength: 260, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    FileKind = table.Column<int>(type: "int", nullable: false),
                    FileSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    StoragePath = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    FileSha256 = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    UploadedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UploadedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    UploadedBy = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    RevokedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RevokedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    Remarks = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    RecordStatus = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedBy = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserSignatures", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserSignatures_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ADForms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RevisionNumber = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    RevisionDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ADNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ADTitle = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ADRevision = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    EffectiveDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IssuingAuthority = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ATAChapterCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    AffectedPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AffectedModels = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Applicability = table.Column<int>(type: "int", nullable: false),
                    ComplianceStatus = table.Column<int>(type: "int", nullable: false),
                    ComplianceMethod = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    ComplianceDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsRecurring = table.Column<bool>(type: "bit", nullable: false),
                    RecurringInterval = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Remarks = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    EvaluatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    EvaluatedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ApprovedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovalStatus = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ADForms", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ADForms_ATARecords_ATARecordId",
                        column: x => x.ATARecordId,
                        principalTable: "ATARecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ADForms_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AlternateConsumableDeclarations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RevisionNumber = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    RevisionDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ATAChapterCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ComponentPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ComponentDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    OriginalConsumableName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    OriginalSpecification = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    OriginalManufacturer = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    OriginalPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AlternateConsumableName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AlternateSpecification = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AlternateManufacturer = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AlternatePartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    EquivalencyBasis = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    TechnicalJustification = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    ReferenceDocument = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    IsApprovedByManufacturer = table.Column<bool>(type: "bit", nullable: false),
                    ManufacturerApprovalReference = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Conditions = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Limitations = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    AlternateConsumablesListJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DeclaredBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    DeclaredDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ReviewedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ReviewedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ApprovedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovalStatus = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AlternateConsumableDeclarations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AlternateConsumableDeclarations_ATARecords_ATARecordId",
                        column: x => x.ATARecordId,
                        principalTable: "ATARecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AlternateConsumableDeclarations_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AlternateToolsEquivalencies",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RevisionNumber = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    RevisionDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ATAChapterCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ComponentPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ComponentDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    OriginalToolPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    OriginalToolDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    OriginalToolManufacturer = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AlternateToolPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AlternateToolDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    AlternateToolManufacturer = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    EquivalencyJustification = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    TechnicalBasis = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CertificateReference = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    CertificateDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsEquivalencyApproved = table.Column<bool>(type: "bit", nullable: false),
                    Conditions = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    AlternateToolsListJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    EvaluatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    EvaluatedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ApprovedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovalStatus = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AlternateToolsEquivalencies", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AlternateToolsEquivalencies_ATARecords_ATARecordId",
                        column: x => x.ATARecordId,
                        principalTable: "ATARecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AlternateToolsEquivalencies_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ATARecordAmendments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Sequence = table.Column<int>(type: "int", nullable: false),
                    RecordRevisionNumber = table.Column<int>(type: "int", nullable: false),
                    FieldName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    FieldLabel = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    OldValue = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                    NewValue = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                    AmendedByUserId = table.Column<long>(type: "bigint", nullable: false),
                    AmendedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AmendedByRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    AmendedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    StatusAtAmendment = table.Column<int>(type: "int", nullable: false),
                    IsPostApproval = table.Column<bool>(type: "bit", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ATARecordAmendments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ATARecordAmendments_ATARecords_ATARecordId",
                        column: x => x.ATARecordId,
                        principalTable: "ATARecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ATARecordAssignments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormWorkflowInstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EvaluationFolderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Sequence = table.Column<int>(type: "int", nullable: false),
                    StepNo = table.Column<int>(type: "int", nullable: false),
                    AssignedByUserId = table.Column<long>(type: "bigint", nullable: false),
                    AssignedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AssignedByRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    AssignedToUserId = table.Column<long>(type: "bigint", nullable: false),
                    AssignedToName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AssignedToRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    AssignedToShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Action = table.Column<int>(type: "int", nullable: false),
                    Reason = table.Column<int>(type: "int", nullable: false),
                    IsLowerTierDelegation = table.Column<bool>(type: "bit", nullable: false),
                    IsSpecialTeamLeaderDirectAction = table.Column<bool>(type: "bit", nullable: false),
                    PreviousAssigneeUserId = table.Column<long>(type: "bigint", nullable: true),
                    SupersedesAssignmentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsCurrent = table.Column<bool>(type: "bit", nullable: false),
                    IsAccepted = table.Column<bool>(type: "bit", nullable: false),
                    AcceptedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    AssignedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ATARecordAssignments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ATARecordAssignments_ATARecords_ATARecordId",
                        column: x => x.ATARecordId,
                        principalTable: "ATARecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ATARecordShopRoutings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TargetShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TargetShopName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    IsPrimaryTarget = table.Column<bool>(type: "bit", nullable: false),
                    ResolvedTeamLeaderUserId = table.Column<long>(type: "bigint", nullable: true),
                    ResolvedTeamLeaderName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    HasActiveTeamLeader = table.Column<bool>(type: "bit", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    RoutedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    RoutedByUserId = table.Column<long>(type: "bigint", nullable: false),
                    AcknowledgedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    AcknowledgedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CompletedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    IsComplete = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ATARecordShopRoutings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ATARecordShopRoutings_ATARecords_ATARecordId",
                        column: x => x.ATARecordId,
                        principalTable: "ATARecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ATARecordSignatures",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StageOrder = table.Column<int>(type: "int", nullable: false),
                    StageStatus = table.Column<int>(type: "int", nullable: false),
                    ResultingStatus = table.Column<int>(type: "int", nullable: false),
                    Block = table.Column<int>(type: "int", nullable: false),
                    BlockCaption = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    UserId = table.Column<long>(type: "bigint", nullable: true),
                    PersonName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    PersonRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    PersonRoleLabel = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    SignedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UserSignatureId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SignatureStoragePath = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    SignatureFileName = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    SignatureContentType = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    SignatureFileSha256 = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    SignatureImageApplied = table.Column<bool>(type: "bit", nullable: false),
                    SignatureHash = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    ActionTaken = table.Column<int>(type: "int", nullable: false),
                    Comments = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    IsCurrent = table.Column<bool>(type: "bit", nullable: false),
                    SupersededAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    SupersededReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    RecordRevisionNumber = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ATARecordSignatures", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ATARecordSignatures_ATARecords_ATARecordId",
                        column: x => x.ATARecordId,
                        principalTable: "ATARecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ConsumablesLists",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RevisionNumber = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    RevisionDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ATAChapterCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ComponentPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ComponentDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    CMMReference = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ConsumableItemsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TotalItems = table.Column<int>(type: "int", nullable: false),
                    ItemsAvailable = table.Column<int>(type: "int", nullable: false),
                    ItemsOnOrder = table.Column<int>(type: "int", nullable: false),
                    ItemsExpired = table.Column<int>(type: "int", nullable: false),
                    Summary = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    ProcurementNotes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    PreparedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    PreparedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ReviewedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ReviewedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ApprovedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovalStatus = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsumablesLists", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ConsumablesLists_ATARecords_ATARecordId",
                        column: x => x.ATARecordId,
                        principalTable: "ATARecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ConsumablesLists_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "EvaluationFolders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    DepartmentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    FolderCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    ATAChapterCode = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    PartNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    TotalItems = table.Column<int>(type: "int", nullable: false),
                    ApprovedItems = table.Column<int>(type: "int", nullable: false),
                    SkippedItems = table.Column<int>(type: "int", nullable: false),
                    PendingItems = table.Column<int>(type: "int", nullable: false),
                    ExpiredItems = table.Column<int>(type: "int", nullable: false),
                    CompletionPercent = table.Column<int>(type: "int", nullable: false),
                    IsComplete = table.Column<bool>(type: "bit", nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CompletedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    IsLocked = table.Column<bool>(type: "bit", nullable: false),
                    LockedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LockedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    SignOffInstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ReportStoragePath = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    ReportFileName = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ReportGeneratedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RevisionNumber = table.Column<int>(type: "int", nullable: false),
                    RevisionDueDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LastRevisedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LinkedCmmRevision = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    LinkedComponentTaskRevision = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    LinkedTaskCardRevision = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EvaluationFolders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EvaluationFolders_ATARecords_ATARecordId",
                        column: x => x.ATARecordId,
                        principalTable: "ATARecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "FacilityEvaluations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RevisionNumber = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    RevisionDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    FacilityType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    FacilityName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    FacilityLocation = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ATAChapterCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ComponentPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ComponentDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    RequirementsDescription = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CurrentCapabilities = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    GapAnalysis = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    TemperatureRequirements = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    HumidityRequirements = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    VentilationRequirements = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    LightingRequirements = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    CleanlinessRequirements = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    CleaningMethodRequired = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    CleaningEquipmentRequired = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    ChemicalsRequired = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    RepairEquipmentRequired = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    RepairProcessCapability = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    EvaluationItemsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    OverallComplianceStatus = table.Column<int>(type: "int", nullable: false),
                    CorrectiveActions = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Remarks = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    EvaluatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    EvaluatedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ApprovedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovalStatus = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FacilityEvaluations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FacilityEvaluations_ATARecords_ATARecordId",
                        column: x => x.ATARecordId,
                        principalTable: "ATARecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_FacilityEvaluations_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Form918ACAAs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RevisionNumber = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    RevisionDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    OrganizationName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ApprovalReference = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Address = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ATAChapterCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ComponentDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    PartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Manufacturer = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ModelDesignation = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    HasOverhaul = table.Column<bool>(type: "bit", nullable: false),
                    HasRepair = table.Column<bool>(type: "bit", nullable: false),
                    HasInspection = table.Column<bool>(type: "bit", nullable: false),
                    HasModification = table.Column<bool>(type: "bit", nullable: false),
                    LimitationsRemarks = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    SpecialEquipment = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    TechnicalData = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    AccountableManager = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    QualityManager = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    PreparedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    PreparedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ApprovedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovalStatus = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Form918ACAAs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Form918ACAAs_ATARecords_ATARecordId",
                        column: x => x.ATARecordId,
                        principalTable: "ATARecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Form918ACAAs_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Form918FAAs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RevisionNumber = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    RevisionDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RepairStationName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    CertificateNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Address = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ATAChapterCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ComponentDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    PartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Manufacturer = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ModelDesignation = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    HasOverhaul = table.Column<bool>(type: "bit", nullable: false),
                    HasRepair = table.Column<bool>(type: "bit", nullable: false),
                    HasInspection = table.Column<bool>(type: "bit", nullable: false),
                    HasModification = table.Column<bool>(type: "bit", nullable: false),
                    LimitationsRemarks = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    SpecialEquipment = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    TechnicalData = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    PreparedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    PreparedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ApprovedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovalStatus = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Form918FAAs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Form918FAAs_ATARecords_ATARecordId",
                        column: x => x.ATARecordId,
                        principalTable: "ATARecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Form918FAAs_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "FormSubmissions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    FormType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    FormNo = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    RevNo = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    RevDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    FormDataJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ApprovalStatus = table.Column<int>(type: "int", nullable: false),
                    SubmittedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    SubmittedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ReviewedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    ReviewedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ReviewComments = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    ApprovedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    ApprovedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RejectionReason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    CurrentApproverUserId = table.Column<long>(type: "bigint", nullable: true),
                    UploadLock = table.Column<int>(type: "int", nullable: false),
                    UploadLockedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UploadLockedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    ApprovalSignatureHash = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    DelegatedToUserId = table.Column<long>(type: "bigint", nullable: true),
                    DelegatedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    DelegationReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    RevisionNumber = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FormSubmissions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FormSubmissions_ATARecords_ATARecordId",
                        column: x => x.ATARecordId,
                        principalTable: "ATARecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "InhouseManufacturedToolsCards",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RevisionNumber = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    RevisionDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    JobCardNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ATAChapterCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ToolName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ToolPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ToolDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ToolDrawingReference = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    MaterialSpecification = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ManufacturingProcess = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    QualityRequirements = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    InspectionCriteria = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    AcceptanceCriteria = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    RequiresCalibration = table.Column<bool>(type: "bit", nullable: false),
                    CalibrationInterval = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    CalibrationMethod = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    InstructionStepsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ManufacturedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ManufacturedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    InspectedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    InspectedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ApprovedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovalStatus = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InhouseManufacturedToolsCards", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InhouseManufacturedToolsCards_ATARecords_ATARecordId",
                        column: x => x.ATARecordId,
                        principalTable: "ATARecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_InhouseManufacturedToolsCards_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PeriodicSelfAudits",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RevisionNumber = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    RevisionDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    AuditTitle = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AuditDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    NextAuditDueDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    AuditorName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AuditorId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ShopName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ATAChapterCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ComponentPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ChecklistItemsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AuditStatus = table.Column<int>(type: "int", nullable: false),
                    TotalItems = table.Column<int>(type: "int", nullable: false),
                    CompliantItems = table.Column<int>(type: "int", nullable: false),
                    NonCompliantItems = table.Column<int>(type: "int", nullable: false),
                    NotApplicableItems = table.Column<int>(type: "int", nullable: false),
                    Findings = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CorrectiveActions = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Recommendations = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    ReviewedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ReviewedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ApprovedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovalStatus = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PeriodicSelfAudits", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PeriodicSelfAudits_ATARecords_ATARecordId",
                        column: x => x.ATARecordId,
                        principalTable: "ATARecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PeriodicSelfAudits_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "RequestLetters",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RevisionNumber = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    RevisionDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LetterReferenceNo = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    LetterDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    AddressedTo = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AddressedToTitle = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AddressedToOrganization = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Subject = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Body = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: false),
                    RequestedCapability = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ATAChapterCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ComponentPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ComponentDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Manufacturer = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    SenderName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    SenderTitle = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    SenderSignature = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    SentDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ApprovedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovalStatus = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RequestLetters", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RequestLetters_ATARecords_ATARecordId",
                        column: x => x.ATARecordId,
                        principalTable: "ATARecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_RequestLetters_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SBForms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RevisionNumber = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    RevisionDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    SBNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    SBTitle = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    SBRevision = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    SBDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IssuedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ATAChapterCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    AffectedPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AffectedSerialNumbers = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Category = table.Column<int>(type: "int", nullable: false),
                    ComplianceStatus = table.Column<int>(type: "int", nullable: false),
                    ComplianceMethod = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    ComplianceDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Remarks = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    EvaluatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    EvaluatedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ApprovedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovalStatus = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SBForms", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SBForms_ATARecords_ATARecordId",
                        column: x => x.ATARecordId,
                        principalTable: "ATARecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SBForms_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SimilarTechnologyEvaluations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RevisionNumber = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    RevisionDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    EvaluationTitle = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ATAChapterCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ComponentPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ComponentDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Manufacturer = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ReferenceComponentPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ReferenceComponentDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ReferenceManufacturer = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    SimilarityJustification = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    TechnologyComparison = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    MaterialsComparison = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    ProcessComparison = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    ToolingComparison = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    IsSimpleTask = table.Column<bool>(type: "bit", nullable: false),
                    SimpleTaskJustification = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    IsSimilarTechnologyApplicable = table.Column<bool>(type: "bit", nullable: false),
                    Limitations = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    AdditionalRequirements = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    EvaluatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    EvaluatedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ApprovedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovalStatus = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SimilarTechnologyEvaluations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SimilarTechnologyEvaluations_ATARecords_ATARecordId",
                        column: x => x.ATARecordId,
                        principalTable: "ATARecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SimilarTechnologyEvaluations_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TableOfContents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RevisionNumber = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    RevisionDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ATAChapterCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ComponentPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ComponentDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    CMMDocumentNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    CMMRevision = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    CMMRevisionDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CMMPublisher = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    CMMStatus = table.Column<int>(type: "int", nullable: false),
                    CMMRemarks = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    TaskCardsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    OtherDocumentsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ContentItemsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PreparedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    PreparedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ReviewedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ReviewedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ApprovedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    PreparedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    SubmittedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    SubmittedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ReviewedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    ApprovedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    CurrentApproverUserId = table.Column<long>(type: "bigint", nullable: true),
                    ReviewComments = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    RejectionReason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    DelegatedToUserId = table.Column<long>(type: "bigint", nullable: true),
                    DelegatedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    DelegationReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ApprovalStatus = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TableOfContents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TableOfContents_ATARecords_ATARecordId",
                        column: x => x.ATARecordId,
                        principalTable: "ATARecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TableOfContents_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TaskCardDocuments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PartNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ATAChapterCode = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    TaskCode = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    TaskDefinitionCode = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    TaskDefinitionName = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    TaskDefinitionUrl = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    SourcePdfUrl = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    SourceSystem = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    FileName = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    StoragePath = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    FileSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    FileSha256 = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    RevisionNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    IsLatest = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    Remarks = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    FetchedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    FetchedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskCardDocuments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TaskCardDocuments_ATARecords_ATARecordId",
                        column: x => x.ATARecordId,
                        principalTable: "ATARecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ToolNeedAnalysisReports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RevisionNumber = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    RevisionDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ReportTitle = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ATAChapterCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ComponentPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ComponentDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    CMMReference = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ToolItemsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TotalToolsRequired = table.Column<int>(type: "int", nullable: false),
                    ToolsAvailable = table.Column<int>(type: "int", nullable: false),
                    ToolsOnOrder = table.Column<int>(type: "int", nullable: false),
                    ToolsNeedingCalibration = table.Column<int>(type: "int", nullable: false),
                    Summary = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Recommendations = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    PreparedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    PreparedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ReviewedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ReviewedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ApprovedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovalStatus = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ToolNeedAnalysisReports", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ToolNeedAnalysisReports_ATARecords_ATARecordId",
                        column: x => x.ATARecordId,
                        principalTable: "ATARecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ToolNeedAnalysisReports_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TrainingRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RevisionNumber = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    RevisionDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    TrainingType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    TrainingTitle = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ATAChapterCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ComponentPartNumber = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ComponentDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    EmployeeName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    EmployeeId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    EmployeeTitle = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Department = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    CourseName = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    CourseProvider = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    CertificateNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    TrainingStartDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    TrainingEndDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ExpiryDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    TrainingHours = table.Column<int>(type: "int", nullable: false),
                    ProficiencyLevel = table.Column<int>(type: "int", nullable: false),
                    AssessmentCriteria = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    AssessmentResults = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    IsCompetent = table.Column<bool>(type: "bit", nullable: false),
                    CompetencyDeclaration = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    InspectionAuthority = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    InspectionScope = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    TrainingHistoryJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AssessedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AssessedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ApprovedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovalStatus = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UpdatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TrainingRecords", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TrainingRecords_ATARecords_ATARecordId",
                        column: x => x.ATARecordId,
                        principalTable: "ATARecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TrainingRecords_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "FormSignatures",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormWorkflowInstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserSignatureId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SignatureStoragePath = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    SignatureImageApplied = table.Column<bool>(type: "bit", nullable: false),
                    SignatureFileName = table.Column<string>(type: "nvarchar(260)", maxLength: 260, nullable: true),
                    SignatureContentType = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    SignatureFileSha256 = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    FormSubmissionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EvaluationFolderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Block = table.Column<int>(type: "int", nullable: false),
                    BlockCaption = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    StepNo = table.Column<int>(type: "int", nullable: false),
                    UserId = table.Column<long>(type: "bigint", nullable: true),
                    PersonName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    PersonRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    PersonRoleLabel = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    SignedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    SignatureHash = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    Remarks = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FormSignatures", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FormSignatures_UserSignatures_UserSignatureId",
                        column: x => x.UserSignatureId,
                        principalTable: "UserSignatures",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FormSignatures_WorkflowInstances_FormWorkflowInstanceId",
                        column: x => x.FormWorkflowInstanceId,
                        principalTable: "WorkflowInstances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WorkflowSteps",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormWorkflowInstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserSignatureId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SignatureStoragePath = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    SignatureImageApplied = table.Column<bool>(type: "bit", nullable: false),
                    StepNo = table.Column<int>(type: "int", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    PendingStatus = table.Column<int>(type: "int", nullable: false),
                    Kind = table.Column<int>(type: "int", nullable: false),
                    SignatureBlock = table.Column<int>(type: "int", nullable: false),
                    EligibleRolesCsv = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    AssignerRolesCsv = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    AssignmentUnit = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    RequiresManualAssignment = table.Column<bool>(type: "bit", nullable: false),
                    RestrictToOriginatorShop = table.Column<bool>(type: "bit", nullable: false),
                    AllowsDelegation = table.Column<bool>(type: "bit", nullable: false),
                    RequiresComments = table.Column<bool>(type: "bit", nullable: false),
                    IsStepByStepChecklist = table.Column<bool>(type: "bit", nullable: false),
                    SkipMode = table.Column<int>(type: "int", nullable: false),
                    SkipConditionField = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    SkipWhenValue = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    SkipWhenFieldMissing = table.Column<bool>(type: "bit", nullable: false),
                    SkipReasonTemplate = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    State = table.Column<int>(type: "int", nullable: false),
                    ActionTaken = table.Column<int>(type: "int", nullable: false),
                    AssignedToUserId = table.Column<long>(type: "bigint", nullable: true),
                    AssignedToName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AssignedToRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    AssignedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    AssignedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ActedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    ActedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ActedByRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    ActedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Comments = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    WasDelegated = table.Column<bool>(type: "bit", nullable: false),
                    DelegatedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    DelegationReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    IsSkipped = table.Column<bool>(type: "bit", nullable: false),
                    SkippedAutomatically = table.Column<bool>(type: "bit", nullable: false),
                    SkipReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ChecklistTotalItems = table.Column<int>(type: "int", nullable: false),
                    ChecklistVerifiedItems = table.Column<int>(type: "int", nullable: false),
                    ChecklistItemsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SignatureName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    SignatureRole = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    SignatureDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    SignatureHash = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkflowSteps", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkflowSteps_UserSignatures_UserSignatureId",
                        column: x => x.UserSignatureId,
                        principalTable: "UserSignatures",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WorkflowSteps_WorkflowInstances_FormWorkflowInstanceId",
                        column: x => x.FormWorkflowInstanceId,
                        principalTable: "WorkflowInstances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EvaluationFolderItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EvaluationFolderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SectionCode = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    SectionTitle = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    SectionOrder = table.Column<int>(type: "int", nullable: false),
                    ItemOrder = table.Column<int>(type: "int", nullable: false),
                    FormType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    FormNo = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    FormTitle = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    IsMandatory = table.Column<bool>(type: "bit", nullable: false),
                    IsOptionalByRegulatoryDate = table.Column<bool>(type: "bit", nullable: false),
                    IsGeneratedByJointApproval = table.Column<bool>(type: "bit", nullable: false),
                    FormSubmissionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    FormWorkflowInstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    LifecycleState = table.Column<int>(type: "int", nullable: false),
                    StatusLabel = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    TotalSteps = table.Column<int>(type: "int", nullable: false),
                    CompletedSteps = table.Column<int>(type: "int", nullable: false),
                    CurrentStepTitle = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    CurrentAssigneeUserId = table.Column<long>(type: "bigint", nullable: true),
                    CurrentAssigneeName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ExpiryMonths = table.Column<int>(type: "int", nullable: true),
                    ExpiresAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsExpired = table.Column<bool>(type: "bit", nullable: false),
                    Remarks = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EvaluationFolderItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EvaluationFolderItems_EvaluationFolders_EvaluationFolderId",
                        column: x => x.EvaluationFolderId,
                        principalTable: "EvaluationFolders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FolderRevisionLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EvaluationFolderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RevisionNumber = table.Column<int>(type: "int", nullable: false),
                    Trigger = table.Column<int>(type: "int", nullable: false),
                    TriggerReference = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    PreviousRevision = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    NewRevision = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RevisionInstanceId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    RaisedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ClosedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RaisedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    ClosedByUserId = table.Column<long>(type: "bigint", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FolderRevisionLogs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FolderRevisionLogs_EvaluationFolders_EvaluationFolderId",
                        column: x => x.EvaluationFolderId,
                        principalTable: "EvaluationFolders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FormFileAttachments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ATARecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    FormSubmissionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    FileName = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    FileSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    StoragePath = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    FormType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ApprovalStatus = table.Column<int>(type: "int", nullable: false),
                    ApprovedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ApprovedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovalComments = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    UploadedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UploadedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FormFileAttachments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FormFileAttachments_ATARecords_ATARecordId",
                        column: x => x.ATARecordId,
                        principalTable: "ATARecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FormFileAttachments_FormSubmissions_FormSubmissionId",
                        column: x => x.FormSubmissionId,
                        principalTable: "FormSubmissions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "FormUploadGrants",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FormSubmissionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ForUserId = table.Column<long>(type: "bigint", nullable: false),
                    ForUserName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    GrantedByUserId = table.Column<long>(type: "bigint", nullable: false),
                    GrantedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FormUploadGrants", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FormUploadGrants_FormSubmissions_FormSubmissionId",
                        column: x => x.FormSubmissionId,
                        principalTable: "FormSubmissions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "Users",
                columns: new[] { "Id", "AdditionalPermissions", "CreatedDate", "DepartmentId", "Email", "FullName", "IsActive", "JobTitle", "LastUpdateDate", "LastUpdatedBy", "ManagerId", "PasswordHash", "PersonnelType", "RecordStatus", "RefreshToken", "RefreshTokenExpiryTime", "RegisteredBy", "RevokedPermissions", "Role", "ShopId", "SupervisorId", "SupervisorUserId", "Username" },
                values: new object[,]
                {
                    { 1L, null, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "team_leader@se.com", "Team Leader", true, null, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, null, "$2a$12$8U018BcnRBqsdUX8l1zHUOr0te4UeSRE09WMM4JjgG6bAqdM.uAbK", null, 0, null, null, "system", null, "team_leader", null, null, null, "team_leader" },
                    { 2L, null, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "director@se.com", "Director", true, null, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, null, "$2a$12$8U018BcnRBqsdUX8l1zHUOr0te4UeSRE09WMM4JjgG6bAqdM.uAbK", null, 0, null, null, "system", null, "director", null, null, null, "director" },
                    { 4L, null, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "shop_tl@se.com", "Shop Team Leader", true, null, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, null, "$2a$12$8U018BcnRBqsdUX8l1zHUOr0te4UeSRE09WMM4JjgG6bAqdM.uAbK", null, 0, null, null, "system", null, "shop_tl", null, null, null, "shop_tl" },
                    { 100L, null, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "santa@se.com", "Santa (Admin)", true, null, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, null, "$2a$12$8U018BcnRBqsdUX8l1zHUOr0te4UeSRE09WMM4JjgG6bAqdM.uAbK", null, 0, null, null, "system", null, "admin", null, null, null, "santa" },
                    { 3L, null, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "engineer@se.com", "Engineer", true, null, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, 1L, "$2a$12$8U018BcnRBqsdUX8l1zHUOr0te4UeSRE09WMM4JjgG6bAqdM.uAbK", null, 0, null, null, "system", null, "engineer", null, null, null, "engineer" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_ADForms_ADNumber",
                table: "ADForms",
                column: "ADNumber");

            migrationBuilder.CreateIndex(
                name: "IX_ADForms_ATARecordId",
                table: "ADForms",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_ADForms_ShopId",
                table: "ADForms",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_AirworthinessDirectives_ADNumber",
                table: "AirworthinessDirectives",
                column: "ADNumber");

            migrationBuilder.CreateIndex(
                name: "IX_AirworthinessDirectives_ComponentId",
                table: "AirworthinessDirectives",
                column: "ComponentId");

            migrationBuilder.CreateIndex(
                name: "IX_AlternateConsumableDeclarations_ATARecordId",
                table: "AlternateConsumableDeclarations",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_AlternateConsumableDeclarations_ShopId",
                table: "AlternateConsumableDeclarations",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_AlternateToolsEquivalencies_ATARecordId",
                table: "AlternateToolsEquivalencies",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_AlternateToolsEquivalencies_ShopId",
                table: "AlternateToolsEquivalencies",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_ArchiveEntries_ArchivedBy",
                table: "ArchiveEntries",
                column: "ArchivedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ArchiveEntries_ATARecordId",
                table: "ArchiveEntries",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_ArchiveEntries_Item",
                table: "ArchiveEntries",
                columns: new[] { "ItemKind", "ItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_ArchiveEntries_State_ArchivedAt",
                table: "ArchiveEntries",
                columns: new[] { "State", "ArchivedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ATAChapters_ChapterNumber",
                table: "ATAChapters",
                column: "ChapterNumber");

            migrationBuilder.CreateIndex(
                name: "IX_ATARecordAmendments_AmendedBy",
                table: "ATARecordAmendments",
                column: "AmendedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ATARecordAmendments_Record_Sequence",
                table: "ATARecordAmendments",
                columns: new[] { "ATARecordId", "Sequence" });

            migrationBuilder.CreateIndex(
                name: "IX_ATARecordAssignments_Action",
                table: "ATARecordAssignments",
                column: "Action");

            migrationBuilder.CreateIndex(
                name: "IX_ATARecordAssignments_AssignedAt",
                table: "ATARecordAssignments",
                column: "AssignedAt");

            migrationBuilder.CreateIndex(
                name: "IX_ATARecordAssignments_AssignedByUserId",
                table: "ATARecordAssignments",
                column: "AssignedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ATARecordAssignments_AssignedToShopId",
                table: "ATARecordAssignments",
                column: "AssignedToShopId");

            migrationBuilder.CreateIndex(
                name: "IX_ATARecordAssignments_Assignee",
                table: "ATARecordAssignments",
                columns: new[] { "AssignedToUserId", "IsCurrent" });

            migrationBuilder.CreateIndex(
                name: "IX_ATARecordAssignments_EvaluationFolderId",
                table: "ATARecordAssignments",
                column: "EvaluationFolderId");

            migrationBuilder.CreateIndex(
                name: "IX_ATARecordAssignments_FormWorkflowInstanceId",
                table: "ATARecordAssignments",
                column: "FormWorkflowInstanceId");

            migrationBuilder.CreateIndex(
                name: "IX_ATARecordAssignments_Reason",
                table: "ATARecordAssignments",
                column: "Reason");

            migrationBuilder.CreateIndex(
                name: "IX_ATARecordAssignments_ShopId",
                table: "ATARecordAssignments",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_ATARecordAssignments_SupersedesAssignmentId",
                table: "ATARecordAssignments",
                column: "SupersedesAssignmentId");

            migrationBuilder.CreateIndex(
                name: "UX_ATARecordAssignments_Current",
                table: "ATARecordAssignments",
                column: "ATARecordId",
                unique: true,
                filter: "[IsCurrent] = 1");

            migrationBuilder.CreateIndex(
                name: "UX_ATARecordAssignments_Record_Sequence",
                table: "ATARecordAssignments",
                columns: new[] { "ATARecordId", "Sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ATARecordCreationDelegations_Delegate_Status",
                table: "ATARecordCreationDelegations",
                columns: new[] { "DelegateUserId", "Status", "ExpiresAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ATARecordCreationDelegations_Delegator_Status",
                table: "ATARecordCreationDelegations",
                columns: new[] { "DelegatorUserId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_ATARecords_ApprovalStatus",
                table: "ATARecords",
                column: "ApprovalStatus");

            migrationBuilder.CreateIndex(
                name: "IX_ATARecords_ATAChapterId",
                table: "ATARecords",
                column: "ATAChapterId");

            migrationBuilder.CreateIndex(
                name: "IX_ATARecords_ComponentId",
                table: "ATARecords",
                column: "ComponentId");

            migrationBuilder.CreateIndex(
                name: "IX_ATARecords_CreatedByUserId_CreatedAt",
                table: "ATARecords",
                columns: new[] { "CreatedByUserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ATARecords_CreatorRole",
                table: "ATARecords",
                column: "CreatorRole");

            migrationBuilder.CreateIndex(
                name: "IX_ATARecords_ShopId",
                table: "ATARecords",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_ATARecordShopRoutings_Shop_Active",
                table: "ATARecordShopRoutings",
                columns: new[] { "TargetShopId", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_ATARecordShopRoutings_STL_Inbox",
                table: "ATARecordShopRoutings",
                columns: new[] { "ResolvedTeamLeaderUserId", "Status", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "UX_ATARecordShopRoutings_Record_Shop",
                table: "ATARecordShopRoutings",
                columns: new[] { "ATARecordId", "TargetShopId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ATARecordSignatures_Record_Block_Current",
                table: "ATARecordSignatures",
                columns: new[] { "ATARecordId", "Block", "IsCurrent" });

            migrationBuilder.CreateIndex(
                name: "IX_ATARecordSignatures_Record_Stage",
                table: "ATARecordSignatures",
                columns: new[] { "ATARecordId", "StageOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_ATARecordSignatures_UserId",
                table: "ATARecordSignatures",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_BulletinRegisterEntries_AffectedPartNumber",
                table: "BulletinRegisterEntries",
                column: "AffectedPartNumber");

            migrationBuilder.CreateIndex(
                name: "IX_BulletinRegisterEntries_ATAChapterCode",
                table: "BulletinRegisterEntries",
                column: "ATAChapterCode");

            migrationBuilder.CreateIndex(
                name: "IX_BulletinRegisterEntries_ATARecordId",
                table: "BulletinRegisterEntries",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_BulletinRegisterEntries_BulletinNumber",
                table: "BulletinRegisterEntries",
                column: "BulletinNumber");

            migrationBuilder.CreateIndex(
                name: "IX_BulletinRegisterEntries_Category",
                table: "BulletinRegisterEntries",
                column: "Category");

            migrationBuilder.CreateIndex(
                name: "IX_BulletinRegisterEntries_CmmImpact",
                table: "BulletinRegisterEntries",
                columns: new[] { "AffectsCmm", "AffectedCmmNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_BulletinRegisterEntries_ComplianceStatus",
                table: "BulletinRegisterEntries",
                column: "ComplianceStatus");

            migrationBuilder.CreateIndex(
                name: "IX_BulletinRegisterEntries_DocumentationRoutingTicketId",
                table: "BulletinRegisterEntries",
                column: "DocumentationRoutingTicketId");

            migrationBuilder.CreateIndex(
                name: "IX_BulletinRegisterEntries_DocumentType",
                table: "BulletinRegisterEntries",
                column: "DocumentType");

            migrationBuilder.CreateIndex(
                name: "IX_BulletinRegisterEntries_EvaluationFolderId",
                table: "BulletinRegisterEntries",
                column: "EvaluationFolderId");

            migrationBuilder.CreateIndex(
                name: "IX_BulletinRegisterEntries_IsEffective",
                table: "BulletinRegisterEntries",
                column: "IsEffective");

            migrationBuilder.CreateIndex(
                name: "IX_BulletinRegisterEntries_IsLocked",
                table: "BulletinRegisterEntries",
                column: "IsLocked");

            migrationBuilder.CreateIndex(
                name: "IX_BulletinRegisterEntries_Register",
                table: "BulletinRegisterEntries",
                columns: new[] { "ShopId", "BulletinNumber", "Revision" });

            migrationBuilder.CreateIndex(
                name: "IX_BulletinRegisterEntries_SBFormId",
                table: "BulletinRegisterEntries",
                column: "SBFormId");

            migrationBuilder.CreateIndex(
                name: "UX_BulletinRegisterEntries_Instance",
                table: "BulletinRegisterEntries",
                column: "FormWorkflowInstanceId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CapabilityAssessments_ComponentId",
                table: "CapabilityAssessments",
                column: "ComponentId");

            migrationBuilder.CreateIndex(
                name: "IX_CapabilityAssessments_ShopId",
                table: "CapabilityAssessments",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_CompetencyMatrixEntries_Eligibility",
                table: "CompetencyMatrixEntries",
                columns: new[] { "ShopId", "IsEligible", "IsExpired" });

            migrationBuilder.CreateIndex(
                name: "IX_CompetencyMatrixEntries_EmployeeNo",
                table: "CompetencyMatrixEntries",
                column: "EmployeeNo");

            migrationBuilder.CreateIndex(
                name: "IX_CompetencyMatrixEntries_EmployeeUserId",
                table: "CompetencyMatrixEntries",
                column: "EmployeeUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CompetencyMatrixEntries_Level",
                table: "CompetencyMatrixEntries",
                column: "Level");

            migrationBuilder.CreateIndex(
                name: "IX_CompetencyMatrixEntries_SourceFormSubmissionId",
                table: "CompetencyMatrixEntries",
                column: "SourceFormSubmissionId");

            migrationBuilder.CreateIndex(
                name: "IX_CompetencyMatrixEntries_TrainingCode",
                table: "CompetencyMatrixEntries",
                column: "TrainingCode");

            migrationBuilder.CreateIndex(
                name: "IX_CompetencyMatrixEntries_TrainingExpiryDate",
                table: "CompetencyMatrixEntries",
                column: "TrainingExpiryDate");

            migrationBuilder.CreateIndex(
                name: "UX_CompetencyMatrixEntries_Folder_Employee_Training",
                table: "CompetencyMatrixEntries",
                columns: new[] { "EvaluationFolderId", "EmployeeUserId", "TrainingCode" },
                unique: true,
                filter: "[EvaluationFolderId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Components_ATAChapterId",
                table: "Components",
                column: "ATAChapterId");

            migrationBuilder.CreateIndex(
                name: "IX_Components_PartNumber",
                table: "Components",
                column: "PartNumber");

            migrationBuilder.CreateIndex(
                name: "IX_Components_ShopId",
                table: "Components",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsumablesLists_ATARecordId",
                table: "ConsumablesLists",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsumablesLists_ShopId",
                table: "ConsumablesLists",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_Departments_Code",
                table: "Departments",
                column: "Code");

            migrationBuilder.CreateIndex(
                name: "IX_Departments_ParentDepartmentId",
                table: "Departments",
                column: "ParentDepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_DirectiveComplianceEntries_ADFormId",
                table: "DirectiveComplianceEntries",
                column: "ADFormId");

            migrationBuilder.CreateIndex(
                name: "IX_DirectiveComplianceEntries_ADNumber",
                table: "DirectiveComplianceEntries",
                column: "ADNumber");

            migrationBuilder.CreateIndex(
                name: "IX_DirectiveComplianceEntries_AffectedPartNumber",
                table: "DirectiveComplianceEntries",
                column: "AffectedPartNumber");

            migrationBuilder.CreateIndex(
                name: "IX_DirectiveComplianceEntries_Applicability",
                table: "DirectiveComplianceEntries",
                column: "Applicability");

            migrationBuilder.CreateIndex(
                name: "IX_DirectiveComplianceEntries_ATAChapterCode",
                table: "DirectiveComplianceEntries",
                column: "ATAChapterCode");

            migrationBuilder.CreateIndex(
                name: "IX_DirectiveComplianceEntries_ATARecordId",
                table: "DirectiveComplianceEntries",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_DirectiveComplianceEntries_ComplianceDueDate",
                table: "DirectiveComplianceEntries",
                column: "ComplianceDueDate");

            migrationBuilder.CreateIndex(
                name: "IX_DirectiveComplianceEntries_ComplianceStatus",
                table: "DirectiveComplianceEntries",
                column: "ComplianceStatus");

            migrationBuilder.CreateIndex(
                name: "IX_DirectiveComplianceEntries_DraftedByStlUserId",
                table: "DirectiveComplianceEntries",
                column: "DraftedByStlUserId");

            migrationBuilder.CreateIndex(
                name: "IX_DirectiveComplianceEntries_EvaluationFolderId",
                table: "DirectiveComplianceEntries",
                column: "EvaluationFolderId");

            migrationBuilder.CreateIndex(
                name: "IX_DirectiveComplianceEntries_IsIssued",
                table: "DirectiveComplianceEntries",
                column: "IsIssued");

            migrationBuilder.CreateIndex(
                name: "IX_DirectiveComplianceEntries_IsLocked",
                table: "DirectiveComplianceEntries",
                column: "IsLocked");

            migrationBuilder.CreateIndex(
                name: "IX_DirectiveComplianceEntries_IssueSignatureId",
                table: "DirectiveComplianceEntries",
                column: "IssueSignatureId");

            migrationBuilder.CreateIndex(
                name: "IX_DirectiveComplianceEntries_Recurrence",
                table: "DirectiveComplianceEntries",
                columns: new[] { "IsRecurring", "NextRecurrenceDate" });

            migrationBuilder.CreateIndex(
                name: "UX_DirectiveComplianceEntries_Instance",
                table: "DirectiveComplianceEntries",
                column: "FormWorkflowInstanceId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UX_DirectiveComplianceEntries_Shop_AD_Revision",
                table: "DirectiveComplianceEntries",
                columns: new[] { "ShopId", "ADNumber", "Revision" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationAssignmentHistories_ActedAt",
                table: "DocumentationAssignmentHistories",
                column: "ActedAt");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationAssignmentHistories_ActedByUserId",
                table: "DocumentationAssignmentHistories",
                column: "ActedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationAssignmentHistories_Action",
                table: "DocumentationAssignmentHistories",
                column: "Action");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationAssignmentHistories_StateAfter",
                table: "DocumentationAssignmentHistories",
                column: "StateAfter");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationAssignmentHistories_ToUserId",
                table: "DocumentationAssignmentHistories",
                column: "ToUserId");

            migrationBuilder.CreateIndex(
                name: "UX_DocumentationAssignmentHistories_Ticket_Sequence",
                table: "DocumentationAssignmentHistories",
                columns: new[] { "DocumentationRoutingTicketId", "Sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationClerkWorkloads_Availability",
                table: "DocumentationClerkWorkloads",
                columns: new[] { "FunctionalUnit", "IsAvailable", "OpenTicketCount" });

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationClerkWorkloads_LastAssignedAt",
                table: "DocumentationClerkWorkloads",
                column: "LastAssignedAt");

            migrationBuilder.CreateIndex(
                name: "UX_DocumentationClerkWorkloads_ClerkUserId",
                table: "DocumentationClerkWorkloads",
                column: "ClerkUserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationLibraryLinks_ATARecordId",
                table: "DocumentationLibraryLinks",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationLibraryLinks_DocumentKind",
                table: "DocumentationLibraryLinks",
                column: "DocumentKind");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationLibraryLinks_DocumentNumber",
                table: "DocumentationLibraryLinks",
                column: "DocumentNumber");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationLibraryLinks_LastRaisedRevisionLogId",
                table: "DocumentationLibraryLinks",
                column: "LastRaisedRevisionLogId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationLibraryLinks_ShopId",
                table: "DocumentationLibraryLinks",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationLibraryLinks_SourceFormSubmissionId",
                table: "DocumentationLibraryLinks",
                column: "SourceFormSubmissionId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationLibraryLinks_SourceFormWorkflowInstanceId",
                table: "DocumentationLibraryLinks",
                column: "SourceFormWorkflowInstanceId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationLibraryLinks_Watch",
                table: "DocumentationLibraryLinks",
                columns: new[] { "IsActive", "WatchForRevision", "LastCheckedAt" });

            migrationBuilder.CreateIndex(
                name: "UX_DocumentationLibraryLinks_Folder_Kind_Number",
                table: "DocumentationLibraryLinks",
                columns: new[] { "EvaluationFolderId", "DocumentKind", "DocumentNumber" },
                unique: true,
                filter: "[EvaluationFolderId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationRoutingTickets_ATARecordId",
                table: "DocumentationRoutingTickets",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationRoutingTickets_ClerkQueue",
                table: "DocumentationRoutingTickets",
                columns: new[] { "AssignedClerkUserId", "IsClosed", "State" });

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationRoutingTickets_DocumentationLeaderUserId",
                table: "DocumentationRoutingTickets",
                column: "DocumentationLeaderUserId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationRoutingTickets_DueDate",
                table: "DocumentationRoutingTickets",
                column: "DueDate");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationRoutingTickets_EvaluationFolderId",
                table: "DocumentationRoutingTickets",
                column: "EvaluationFolderId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationRoutingTickets_FormStatus",
                table: "DocumentationRoutingTickets",
                column: "FormStatus");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationRoutingTickets_FormSubmissionId",
                table: "DocumentationRoutingTickets",
                column: "FormSubmissionId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationRoutingTickets_FormType",
                table: "DocumentationRoutingTickets",
                column: "FormType");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationRoutingTickets_InitiationCategory",
                table: "DocumentationRoutingTickets",
                column: "InitiationCategory");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationRoutingTickets_IsOverdue",
                table: "DocumentationRoutingTickets",
                column: "IsOverdue");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationRoutingTickets_LeaderSignatureId",
                table: "DocumentationRoutingTickets",
                column: "LeaderSignatureId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationRoutingTickets_OriginatorUserId",
                table: "DocumentationRoutingTickets",
                column: "OriginatorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationRoutingTickets_OriginDepartmentId",
                table: "DocumentationRoutingTickets",
                column: "OriginDepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationRoutingTickets_OriginShopId",
                table: "DocumentationRoutingTickets",
                column: "OriginShopId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationRoutingTickets_State",
                table: "DocumentationRoutingTickets",
                column: "State");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentationRoutingTickets_UnitQueue",
                table: "DocumentationRoutingTickets",
                columns: new[] { "AssignmentUnit", "IsClosed", "State", "Priority" });

            migrationBuilder.CreateIndex(
                name: "UX_DocumentationRoutingTickets_Instance",
                table: "DocumentationRoutingTickets",
                column: "FormWorkflowInstanceId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UX_DocumentationRoutingTickets_TicketNo",
                table: "DocumentationRoutingTickets",
                column: "TicketNo",
                unique: true,
                filter: "[TicketNo] <> ''");

            migrationBuilder.CreateIndex(
                name: "IX_EmployeeProficiencyRecords_EmployeeId",
                table: "EmployeeProficiencyRecords",
                column: "EmployeeId");

            migrationBuilder.CreateIndex(
                name: "IX_EmployeeProficiencyRecords_ShopId",
                table: "EmployeeProficiencyRecords",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationFolderItems_CurrentAssigneeUserId",
                table: "EvaluationFolderItems",
                column: "CurrentAssigneeUserId");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationFolderItems_ExpiresAt",
                table: "EvaluationFolderItems",
                column: "ExpiresAt");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationFolderItems_Folder_Order",
                table: "EvaluationFolderItems",
                columns: new[] { "EvaluationFolderId", "SectionOrder", "ItemOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationFolderItems_FormSubmissionId",
                table: "EvaluationFolderItems",
                column: "FormSubmissionId");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationFolderItems_FormWorkflowInstanceId",
                table: "EvaluationFolderItems",
                column: "FormWorkflowInstanceId");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationFolderItems_IsExpired",
                table: "EvaluationFolderItems",
                column: "IsExpired");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationFolderItems_LifecycleState",
                table: "EvaluationFolderItems",
                column: "LifecycleState");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationFolderItems_SectionCode",
                table: "EvaluationFolderItems",
                column: "SectionCode");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationFolderItems_Status",
                table: "EvaluationFolderItems",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "UX_EvaluationFolderItems_Folder_FormType",
                table: "EvaluationFolderItems",
                columns: new[] { "EvaluationFolderId", "FormType" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationFolders_ATAChapterCode",
                table: "EvaluationFolders",
                column: "ATAChapterCode");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationFolders_ATARecordId",
                table: "EvaluationFolders",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationFolders_DepartmentId",
                table: "EvaluationFolders",
                column: "DepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationFolders_IsComplete",
                table: "EvaluationFolders",
                column: "IsComplete");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationFolders_IsLocked",
                table: "EvaluationFolders",
                column: "IsLocked");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationFolders_PartNumber",
                table: "EvaluationFolders",
                column: "PartNumber");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationFolders_RevisionDueDate",
                table: "EvaluationFolders",
                column: "RevisionDueDate");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationFolders_ShopId",
                table: "EvaluationFolders",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationFolders_SignOffInstanceId",
                table: "EvaluationFolders",
                column: "SignOffInstanceId");

            migrationBuilder.CreateIndex(
                name: "IX_EvaluationFolders_Status",
                table: "EvaluationFolders",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "UX_EvaluationFolders_FolderCode",
                table: "EvaluationFolders",
                column: "FolderCode",
                unique: true,
                filter: "[FolderCode] <> ''");

            migrationBuilder.CreateIndex(
                name: "IX_ExpiryTrackings_AmendmentInstanceId",
                table: "ExpiryTrackings",
                column: "AmendmentInstanceId");

            migrationBuilder.CreateIndex(
                name: "IX_ExpiryTrackings_EvaluationFolderId",
                table: "ExpiryTrackings",
                column: "EvaluationFolderId");

            migrationBuilder.CreateIndex(
                name: "IX_ExpiryTrackings_ExpiresAt",
                table: "ExpiryTrackings",
                column: "ExpiresAt");

            migrationBuilder.CreateIndex(
                name: "IX_ExpiryTrackings_FormType",
                table: "ExpiryTrackings",
                column: "FormType");

            migrationBuilder.CreateIndex(
                name: "IX_ExpiryTrackings_ResponsibleUserId",
                table: "ExpiryTrackings",
                column: "ResponsibleUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ExpiryTrackings_ShopId",
                table: "ExpiryTrackings",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_ExpiryTrackings_Status",
                table: "ExpiryTrackings",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_ExpiryTrackings_Sweep",
                table: "ExpiryTrackings",
                columns: new[] { "IsActive", "IsExpired", "ExpiresAt" });

            migrationBuilder.CreateIndex(
                name: "UX_ExpiryTrackings_Entity_Active",
                table: "ExpiryTrackings",
                columns: new[] { "EntityType", "EntityId" },
                unique: true,
                filter: "[IsActive] = 1");

            migrationBuilder.CreateIndex(
                name: "IX_FacilityEvaluations_ATARecordId",
                table: "FacilityEvaluations",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_FacilityEvaluations_FacilityType",
                table: "FacilityEvaluations",
                column: "FacilityType");

            migrationBuilder.CreateIndex(
                name: "IX_FacilityEvaluations_ShopId",
                table: "FacilityEvaluations",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_FolderRevisionLogs_RaisedAt",
                table: "FolderRevisionLogs",
                column: "RaisedAt");

            migrationBuilder.CreateIndex(
                name: "IX_FolderRevisionLogs_RevisionInstanceId",
                table: "FolderRevisionLogs",
                column: "RevisionInstanceId");

            migrationBuilder.CreateIndex(
                name: "IX_FolderRevisionLogs_Status",
                table: "FolderRevisionLogs",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_FolderRevisionLogs_Trigger",
                table: "FolderRevisionLogs",
                column: "Trigger");

            migrationBuilder.CreateIndex(
                name: "UX_FolderRevisionLogs_Folder_Revision",
                table: "FolderRevisionLogs",
                columns: new[] { "EvaluationFolderId", "RevisionNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Form918ACAAs_ATARecordId",
                table: "Form918ACAAs",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_Form918ACAAs_ShopId",
                table: "Form918ACAAs",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_Form918FAAs_ATARecordId",
                table: "Form918FAAs",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_Form918FAAs_ShopId",
                table: "Form918FAAs",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_FormFileAttachments_ATARecordId",
                table: "FormFileAttachments",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_FormFileAttachments_FormSubmissionId",
                table: "FormFileAttachments",
                column: "FormSubmissionId");

            migrationBuilder.CreateIndex(
                name: "IX_FormSignatures_EvaluationFolderId",
                table: "FormSignatures",
                column: "EvaluationFolderId");

            migrationBuilder.CreateIndex(
                name: "IX_FormSignatures_FormSubmissionId",
                table: "FormSignatures",
                column: "FormSubmissionId");

            migrationBuilder.CreateIndex(
                name: "IX_FormSignatures_FormWorkflowInstanceId_Block_StepNo",
                table: "FormSignatures",
                columns: new[] { "FormWorkflowInstanceId", "Block", "StepNo" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FormSignatures_UserId",
                table: "FormSignatures",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_FormSignatures_UserSignatureId",
                table: "FormSignatures",
                column: "UserSignatureId");

            migrationBuilder.CreateIndex(
                name: "IX_FormSubmissions_ApprovalStatus",
                table: "FormSubmissions",
                column: "ApprovalStatus");

            migrationBuilder.CreateIndex(
                name: "IX_FormSubmissions_ATARecordId",
                table: "FormSubmissions",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_FormSubmissions_CurrentApproverUserId",
                table: "FormSubmissions",
                column: "CurrentApproverUserId");

            migrationBuilder.CreateIndex(
                name: "IX_FormSubmissions_DelegatedToUserId",
                table: "FormSubmissions",
                column: "DelegatedToUserId");

            migrationBuilder.CreateIndex(
                name: "IX_FormSubmissions_FormType",
                table: "FormSubmissions",
                column: "FormType");

            migrationBuilder.CreateIndex(
                name: "IX_FormSubmissions_ShopId",
                table: "FormSubmissions",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_FormSubmissions_SubmittedByUserId",
                table: "FormSubmissions",
                column: "SubmittedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_FormSubmissions_UploadLock",
                table: "FormSubmissions",
                column: "UploadLock");

            migrationBuilder.CreateIndex(
                name: "IX_FormUploadGrants_ExpiresAt",
                table: "FormUploadGrants",
                column: "ExpiresAt");

            migrationBuilder.CreateIndex(
                name: "IX_FormUploadGrants_FormSubmissionId_ForUserId_IsActive",
                table: "FormUploadGrants",
                columns: new[] { "FormSubmissionId", "ForUserId", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_InhouseManufacturedToolsCards_ATARecordId",
                table: "InhouseManufacturedToolsCards",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_InhouseManufacturedToolsCards_ShopId",
                table: "InhouseManufacturedToolsCards",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_InhouseToolManufacturingRecords_ApprovalSignatureId",
                table: "InhouseToolManufacturingRecords",
                column: "ApprovalSignatureId");

            migrationBuilder.CreateIndex(
                name: "IX_InhouseToolManufacturingRecords_EvaluationFolderId",
                table: "InhouseToolManufacturingRecords",
                column: "EvaluationFolderId");

            migrationBuilder.CreateIndex(
                name: "IX_InhouseToolManufacturingRecords_InhouseManufacturedToolsCardId",
                table: "InhouseToolManufacturingRecords",
                column: "InhouseManufacturedToolsCardId");

            migrationBuilder.CreateIndex(
                name: "IX_InhouseToolManufacturingRecords_IsApproved",
                table: "InhouseToolManufacturingRecords",
                column: "IsApproved");

            migrationBuilder.CreateIndex(
                name: "IX_InhouseToolManufacturingRecords_IsLocked",
                table: "InhouseToolManufacturingRecords",
                column: "IsLocked");

            migrationBuilder.CreateIndex(
                name: "IX_InhouseToolManufacturingRecords_LocalToolNumber",
                table: "InhouseToolManufacturingRecords",
                column: "LocalToolNumber");

            migrationBuilder.CreateIndex(
                name: "IX_InhouseToolManufacturingRecords_ShopId",
                table: "InhouseToolManufacturingRecords",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_InhouseToolManufacturingRecords_SpecialTeamLeaderApprovedByUserId",
                table: "InhouseToolManufacturingRecords",
                column: "SpecialTeamLeaderApprovedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_InhouseToolManufacturingRecords_Status",
                table: "InhouseToolManufacturingRecords",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_InhouseToolManufacturingRecords_ToolNeedAnalysisEntryId",
                table: "InhouseToolManufacturingRecords",
                column: "ToolNeedAnalysisEntryId");

            migrationBuilder.CreateIndex(
                name: "IX_InhouseToolManufacturingRecords_ToolPartNumber",
                table: "InhouseToolManufacturingRecords",
                column: "ToolPartNumber");

            migrationBuilder.CreateIndex(
                name: "UX_InhouseToolManufacturingRecords_Instance_Tool",
                table: "InhouseToolManufacturingRecords",
                columns: new[] { "FormWorkflowInstanceId", "ToolPartNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PeriodicSelfAudits_ATARecordId",
                table: "PeriodicSelfAudits",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_PeriodicSelfAudits_ShopId",
                table: "PeriodicSelfAudits",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_ProficiencyAssessmentAssignments_AssessedUserId",
                table: "ProficiencyAssessmentAssignments",
                column: "AssessedUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ProficiencyAssessmentAssignments_AwardedLevel",
                table: "ProficiencyAssessmentAssignments",
                column: "AwardedLevel");

            migrationBuilder.CreateIndex(
                name: "IX_ProficiencyAssessmentAssignments_Designated",
                table: "ProficiencyAssessmentAssignments",
                columns: new[] { "DesignatedUserId", "FormType" });

            migrationBuilder.CreateIndex(
                name: "IX_ProficiencyAssessmentAssignments_DesignatedRole",
                table: "ProficiencyAssessmentAssignments",
                column: "DesignatedRole");

            migrationBuilder.CreateIndex(
                name: "IX_ProficiencyAssessmentAssignments_EmployeeProficiencyRecordId",
                table: "ProficiencyAssessmentAssignments",
                column: "EmployeeProficiencyRecordId");

            migrationBuilder.CreateIndex(
                name: "IX_ProficiencyAssessmentAssignments_EvaluationFolderId",
                table: "ProficiencyAssessmentAssignments",
                column: "EvaluationFolderId");

            migrationBuilder.CreateIndex(
                name: "IX_ProficiencyAssessmentAssignments_ExpiryTrackingId",
                table: "ProficiencyAssessmentAssignments",
                column: "ExpiryTrackingId");

            migrationBuilder.CreateIndex(
                name: "IX_ProficiencyAssessmentAssignments_Outcome",
                table: "ProficiencyAssessmentAssignments",
                column: "Outcome");

            migrationBuilder.CreateIndex(
                name: "IX_ProficiencyAssessmentAssignments_ShopId",
                table: "ProficiencyAssessmentAssignments",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_ProficiencyAssessmentAssignments_SignatureId",
                table: "ProficiencyAssessmentAssignments",
                column: "SignatureId");

            migrationBuilder.CreateIndex(
                name: "IX_ProficiencyAssessmentAssignments_ValidUntil",
                table: "ProficiencyAssessmentAssignments",
                column: "ValidUntil");

            migrationBuilder.CreateIndex(
                name: "UX_ProficiencyAssessmentAssignments_Instance_Assessed",
                table: "ProficiencyAssessmentAssignments",
                columns: new[] { "FormWorkflowInstanceId", "AssessedUserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RegulatoryComplianceRecords_ATARecordId",
                table: "RegulatoryComplianceRecords",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_RegulatoryComplianceRecords_CompanionInstanceId",
                table: "RegulatoryComplianceRecords",
                column: "CompanionInstanceId");

            migrationBuilder.CreateIndex(
                name: "IX_RegulatoryComplianceRecords_ComplianceStatus",
                table: "RegulatoryComplianceRecords",
                column: "ComplianceStatus");

            migrationBuilder.CreateIndex(
                name: "IX_RegulatoryComplianceRecords_Form918ACAAId",
                table: "RegulatoryComplianceRecords",
                column: "Form918ACAAId");

            migrationBuilder.CreateIndex(
                name: "IX_RegulatoryComplianceRecords_Form918FAAId",
                table: "RegulatoryComplianceRecords",
                column: "Form918FAAId");

            migrationBuilder.CreateIndex(
                name: "IX_RegulatoryComplianceRecords_IsComplete",
                table: "RegulatoryComplianceRecords",
                column: "IsComplete");

            migrationBuilder.CreateIndex(
                name: "IX_RegulatoryComplianceRecords_IsLocked",
                table: "RegulatoryComplianceRecords",
                column: "IsLocked");

            migrationBuilder.CreateIndex(
                name: "IX_RegulatoryComplianceRecords_JointApprovalEnabled",
                table: "RegulatoryComplianceRecords",
                column: "JointApprovalEnabled");

            migrationBuilder.CreateIndex(
                name: "IX_RegulatoryComplianceRecords_MaySkipNow",
                table: "RegulatoryComplianceRecords",
                column: "MaySkipNow");

            migrationBuilder.CreateIndex(
                name: "IX_RegulatoryComplianceRecords_PrimaryInstanceId",
                table: "RegulatoryComplianceRecords",
                column: "PrimaryInstanceId");

            migrationBuilder.CreateIndex(
                name: "IX_RegulatoryComplianceRecords_RegulatoryTargetDate",
                table: "RegulatoryComplianceRecords",
                column: "RegulatoryTargetDate");

            migrationBuilder.CreateIndex(
                name: "IX_RegulatoryComplianceRecords_ShopId",
                table: "RegulatoryComplianceRecords",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_RegulatoryComplianceRecords_Status",
                table: "RegulatoryComplianceRecords",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_RegulatoryComplianceRecords_WasDeferred",
                table: "RegulatoryComplianceRecords",
                column: "WasDeferred");

            migrationBuilder.CreateIndex(
                name: "UX_RegulatoryComplianceRecords_Folder",
                table: "RegulatoryComplianceRecords",
                column: "EvaluationFolderId",
                unique: true,
                filter: "[EvaluationFolderId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_RequestLetters_ATARecordId",
                table: "RequestLetters",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_RequestLetters_ShopId",
                table: "RequestLetters",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_ResponsibilityDelegations_ShopId",
                table: "ResponsibilityDelegations",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_SBForms_ATARecordId",
                table: "SBForms",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_SBForms_SBNumber",
                table: "SBForms",
                column: "SBNumber");

            migrationBuilder.CreateIndex(
                name: "IX_SBForms_ShopId",
                table: "SBForms",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_SelfAuditChecklists_ShopId",
                table: "SelfAuditChecklists",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_SelfAuditVerificationItems_EvaluationFolderId",
                table: "SelfAuditVerificationItems",
                column: "EvaluationFolderId");

            migrationBuilder.CreateIndex(
                name: "IX_SelfAuditVerificationItems_EvaluationFolderItemId",
                table: "SelfAuditVerificationItems",
                column: "EvaluationFolderItemId");

            migrationBuilder.CreateIndex(
                name: "IX_SelfAuditVerificationItems_FindingClosed",
                table: "SelfAuditVerificationItems",
                column: "FindingClosed");

            migrationBuilder.CreateIndex(
                name: "IX_SelfAuditVerificationItems_Gate",
                table: "SelfAuditVerificationItems",
                columns: new[] { "FormWorkflowInstanceId", "IsMandatory", "IsVerified" });

            migrationBuilder.CreateIndex(
                name: "IX_SelfAuditVerificationItems_Kind",
                table: "SelfAuditVerificationItems",
                column: "Kind");

            migrationBuilder.CreateIndex(
                name: "IX_SelfAuditVerificationItems_Outcome",
                table: "SelfAuditVerificationItems",
                column: "Outcome");

            migrationBuilder.CreateIndex(
                name: "IX_SelfAuditVerificationItems_PeriodicSelfAuditId",
                table: "SelfAuditVerificationItems",
                column: "PeriodicSelfAuditId");

            migrationBuilder.CreateIndex(
                name: "IX_SelfAuditVerificationItems_SequenceNo",
                table: "SelfAuditVerificationItems",
                column: "SequenceNo");

            migrationBuilder.CreateIndex(
                name: "IX_SelfAuditVerificationItems_ToolEquivalencyMatrixEntryId",
                table: "SelfAuditVerificationItems",
                column: "ToolEquivalencyMatrixEntryId");

            migrationBuilder.CreateIndex(
                name: "IX_SelfAuditVerificationItems_VerifiedByUserId",
                table: "SelfAuditVerificationItems",
                column: "VerifiedByUserId");

            migrationBuilder.CreateIndex(
                name: "UX_SelfAuditVerificationItems_Instance_Step_Item",
                table: "SelfAuditVerificationItems",
                columns: new[] { "FormWorkflowInstanceId", "StepNo", "ItemCode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ServiceBulletins_ComponentId",
                table: "ServiceBulletins",
                column: "ComponentId");

            migrationBuilder.CreateIndex(
                name: "IX_ServiceBulletins_SBNumber",
                table: "ServiceBulletins",
                column: "SBNumber");

            migrationBuilder.CreateIndex(
                name: "IX_Shops_DepartmentId",
                table: "Shops",
                column: "DepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_SimilarTechnologyEvaluations_ATARecordId",
                table: "SimilarTechnologyEvaluations",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_SimilarTechnologyEvaluations_ShopId",
                table: "SimilarTechnologyEvaluations",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_TableOfContents_ApprovalStatus",
                table: "TableOfContents",
                column: "ApprovalStatus");

            migrationBuilder.CreateIndex(
                name: "IX_TableOfContents_ATARecordId",
                table: "TableOfContents",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_TableOfContents_CurrentApproverUserId",
                table: "TableOfContents",
                column: "CurrentApproverUserId");

            migrationBuilder.CreateIndex(
                name: "IX_TableOfContents_DelegatedToUserId",
                table: "TableOfContents",
                column: "DelegatedToUserId");

            migrationBuilder.CreateIndex(
                name: "IX_TableOfContents_ShopId",
                table: "TableOfContents",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_TableOfContents_SubmittedByUserId",
                table: "TableOfContents",
                column: "SubmittedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_TaskCardDocuments_ATARecordId",
                table: "TaskCardDocuments",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_TaskCardDocuments_PartNumber",
                table: "TaskCardDocuments",
                column: "PartNumber");

            migrationBuilder.CreateIndex(
                name: "IX_TaskCardDocuments_PartNumber_TaskDefinitionCode_IsLatest",
                table: "TaskCardDocuments",
                columns: new[] { "PartNumber", "TaskDefinitionCode", "IsLatest" });

            migrationBuilder.CreateIndex(
                name: "IX_TaskCardDocuments_ShopId",
                table: "TaskCardDocuments",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_TaskCardDocuments_TaskDefinitionCode",
                table: "TaskCardDocuments",
                column: "TaskDefinitionCode");

            migrationBuilder.CreateIndex(
                name: "IX_ToolEquivalencyMatrixEntries_AlternateToolPartNumber",
                table: "ToolEquivalencyMatrixEntries",
                column: "AlternateToolPartNumber");

            migrationBuilder.CreateIndex(
                name: "IX_ToolEquivalencyMatrixEntries_Calibration",
                table: "ToolEquivalencyMatrixEntries",
                columns: new[] { "ShopId", "CalibrationDueDate" });

            migrationBuilder.CreateIndex(
                name: "IX_ToolEquivalencyMatrixEntries_EquivalencyApproved",
                table: "ToolEquivalencyMatrixEntries",
                column: "EquivalencyApproved");

            migrationBuilder.CreateIndex(
                name: "IX_ToolEquivalencyMatrixEntries_EvaluationFolderId",
                table: "ToolEquivalencyMatrixEntries",
                column: "EvaluationFolderId");

            migrationBuilder.CreateIndex(
                name: "IX_ToolEquivalencyMatrixEntries_IsInhouseManufactured",
                table: "ToolEquivalencyMatrixEntries",
                column: "IsInhouseManufactured");

            migrationBuilder.CreateIndex(
                name: "IX_ToolEquivalencyMatrixEntries_OriginalToolPartNumber",
                table: "ToolEquivalencyMatrixEntries",
                column: "OriginalToolPartNumber");

            migrationBuilder.CreateIndex(
                name: "IX_ToolEquivalencyMatrixEntries_SourceFormSubmissionId",
                table: "ToolEquivalencyMatrixEntries",
                column: "SourceFormSubmissionId");

            migrationBuilder.CreateIndex(
                name: "IX_ToolEquivalencyMatrixEntries_Status",
                table: "ToolEquivalencyMatrixEntries",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "UX_ToolEquivalencyMatrixEntries_Folder_Pair",
                table: "ToolEquivalencyMatrixEntries",
                columns: new[] { "EvaluationFolderId", "OriginalToolPartNumber", "AlternateToolPartNumber" },
                unique: true,
                filter: "[EvaluationFolderId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ToolNeedAnalysisEntries_AlternateToolPartNumber",
                table: "ToolNeedAnalysisEntries",
                column: "AlternateToolPartNumber");

            migrationBuilder.CreateIndex(
                name: "IX_ToolNeedAnalysisEntries_AlternateToolUsed",
                table: "ToolNeedAnalysisEntries",
                column: "AlternateToolUsed");

            migrationBuilder.CreateIndex(
                name: "IX_ToolNeedAnalysisEntries_ApprovalSignatureId",
                table: "ToolNeedAnalysisEntries",
                column: "ApprovalSignatureId");

            migrationBuilder.CreateIndex(
                name: "IX_ToolNeedAnalysisEntries_AssignedEngineerUserId",
                table: "ToolNeedAnalysisEntries",
                column: "AssignedEngineerUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ToolNeedAnalysisEntries_ATARecordId",
                table: "ToolNeedAnalysisEntries",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_ToolNeedAnalysisEntries_Calibration",
                table: "ToolNeedAnalysisEntries",
                columns: new[] { "ShopId", "CalibrationDueDate" });

            migrationBuilder.CreateIndex(
                name: "IX_ToolNeedAnalysisEntries_DraftedByUserId",
                table: "ToolNeedAnalysisEntries",
                column: "DraftedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ToolNeedAnalysisEntries_EvaluationFolderId",
                table: "ToolNeedAnalysisEntries",
                column: "EvaluationFolderId");

            migrationBuilder.CreateIndex(
                name: "IX_ToolNeedAnalysisEntries_ExpiryTrackingId",
                table: "ToolNeedAnalysisEntries",
                column: "ExpiryTrackingId");

            migrationBuilder.CreateIndex(
                name: "IX_ToolNeedAnalysisEntries_InhouseManufacturingRequired",
                table: "ToolNeedAnalysisEntries",
                column: "InhouseManufacturingRequired");

            migrationBuilder.CreateIndex(
                name: "IX_ToolNeedAnalysisEntries_IsApproved",
                table: "ToolNeedAnalysisEntries",
                column: "IsApproved");

            migrationBuilder.CreateIndex(
                name: "IX_ToolNeedAnalysisEntries_RequiredToolPartNumber",
                table: "ToolNeedAnalysisEntries",
                column: "RequiredToolPartNumber");

            migrationBuilder.CreateIndex(
                name: "IX_ToolNeedAnalysisEntries_Status",
                table: "ToolNeedAnalysisEntries",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_ToolNeedAnalysisEntries_ToolEquivalencyMatrixEntryId",
                table: "ToolNeedAnalysisEntries",
                column: "ToolEquivalencyMatrixEntryId");

            migrationBuilder.CreateIndex(
                name: "IX_ToolNeedAnalysisEntries_ToolNeedAnalysisReportId",
                table: "ToolNeedAnalysisEntries",
                column: "ToolNeedAnalysisReportId");

            migrationBuilder.CreateIndex(
                name: "UX_ToolNeedAnalysisEntries_Instance_Tool",
                table: "ToolNeedAnalysisEntries",
                columns: new[] { "FormWorkflowInstanceId", "RequiredToolPartNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ToolNeedAnalysisReports_ATARecordId",
                table: "ToolNeedAnalysisReports",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_ToolNeedAnalysisReports_ShopId",
                table: "ToolNeedAnalysisReports",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_ToolNeedsAnalyses_ComponentId",
                table: "ToolNeedsAnalyses",
                column: "ComponentId");

            migrationBuilder.CreateIndex(
                name: "IX_ToolNeedsAnalyses_ShopId",
                table: "ToolNeedsAnalyses",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_TrainingEnrollments_ATARecordId",
                table: "TrainingEnrollments",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_TrainingEnrollments_CompetencyMatrixEntryId",
                table: "TrainingEnrollments",
                column: "CompetencyMatrixEntryId");

            migrationBuilder.CreateIndex(
                name: "IX_TrainingEnrollments_Eligibility",
                table: "TrainingEnrollments",
                columns: new[] { "EmployeeUserId", "IsEligible", "IsExpired" });

            migrationBuilder.CreateIndex(
                name: "IX_TrainingEnrollments_EmployeeShopId",
                table: "TrainingEnrollments",
                column: "EmployeeShopId");

            migrationBuilder.CreateIndex(
                name: "IX_TrainingEnrollments_EvaluationFolderId",
                table: "TrainingEnrollments",
                column: "EvaluationFolderId");

            migrationBuilder.CreateIndex(
                name: "IX_TrainingEnrollments_ExpiryTrackingId",
                table: "TrainingEnrollments",
                column: "ExpiryTrackingId");

            migrationBuilder.CreateIndex(
                name: "IX_TrainingEnrollments_FormType",
                table: "TrainingEnrollments",
                column: "FormType");

            migrationBuilder.CreateIndex(
                name: "IX_TrainingEnrollments_RequesterUserId",
                table: "TrainingEnrollments",
                column: "RequesterUserId");

            migrationBuilder.CreateIndex(
                name: "IX_TrainingEnrollments_ShopScope",
                table: "TrainingEnrollments",
                columns: new[] { "RequesterShopId", "State" });

            migrationBuilder.CreateIndex(
                name: "IX_TrainingEnrollments_State",
                table: "TrainingEnrollments",
                column: "State");

            migrationBuilder.CreateIndex(
                name: "IX_TrainingEnrollments_TrainingCode",
                table: "TrainingEnrollments",
                column: "TrainingCode");

            migrationBuilder.CreateIndex(
                name: "IX_TrainingEnrollments_TrainingExpiryDate",
                table: "TrainingEnrollments",
                column: "TrainingExpiryDate");

            migrationBuilder.CreateIndex(
                name: "IX_TrainingEnrollments_TrainingRecordId",
                table: "TrainingEnrollments",
                column: "TrainingRecordId");

            migrationBuilder.CreateIndex(
                name: "UX_TrainingEnrollments_Instance_Employee",
                table: "TrainingEnrollments",
                columns: new[] { "FormWorkflowInstanceId", "EmployeeUserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TrainingRecords_ATARecordId",
                table: "TrainingRecords",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_TrainingRecords_ShopId",
                table: "TrainingRecords",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_TrainingRecords_TrainingType",
                table: "TrainingRecords",
                column: "TrainingType");

            migrationBuilder.CreateIndex(
                name: "IX_Users_DepartmentId",
                table: "Users",
                column: "DepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_Users_Email",
                table: "Users",
                column: "Email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_ManagerId",
                table: "Users",
                column: "ManagerId");

            migrationBuilder.CreateIndex(
                name: "IX_Users_ShopId",
                table: "Users",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_Users_SupervisorId",
                table: "Users",
                column: "SupervisorId");

            migrationBuilder.CreateIndex(
                name: "IX_Users_Username",
                table: "Users",
                column: "Username",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserSignatures_UploadedAt",
                table: "UserSignatures",
                column: "UploadedAt");

            migrationBuilder.CreateIndex(
                name: "IX_UserSignatures_UserId",
                table: "UserSignatures",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "UX_UserSignatures_UserId_Active",
                table: "UserSignatures",
                columns: new[] { "UserId", "IsActive" },
                unique: true,
                filter: "[IsActive] = 1");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowAuditLogs_EntityId_EntityType",
                table: "WorkflowAuditLogs",
                columns: new[] { "EntityId", "EntityType" });

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowAuditLogs_Timestamp",
                table: "WorkflowAuditLogs",
                column: "Timestamp");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowDelegationLogs_Delegate",
                table: "WorkflowDelegationLogs",
                columns: new[] { "DelegatedToUserId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowDelegationLogs_DelegatedAt",
                table: "WorkflowDelegationLogs",
                column: "DelegatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowDelegationLogs_DelegatedByUserId",
                table: "WorkflowDelegationLogs",
                column: "DelegatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowDelegationLogs_EvaluationFolderId",
                table: "WorkflowDelegationLogs",
                column: "EvaluationFolderId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowDelegationLogs_ExpiresAt",
                table: "WorkflowDelegationLogs",
                column: "ExpiresAt");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowDelegationLogs_FormType",
                table: "WorkflowDelegationLogs",
                column: "FormType");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowDelegationLogs_FormWorkflowInstanceId",
                table: "WorkflowDelegationLogs",
                column: "FormWorkflowInstanceId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowDelegationLogs_FormWorkflowStepId",
                table: "WorkflowDelegationLogs",
                column: "FormWorkflowStepId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowDelegationLogs_ShopId",
                table: "WorkflowDelegationLogs",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowDelegationLogs_Status",
                table: "WorkflowDelegationLogs",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowInstances_ATARecordId",
                table: "WorkflowInstances",
                column: "ATARecordId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowInstances_CurrentAssigneeUserId",
                table: "WorkflowInstances",
                column: "CurrentAssigneeUserId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowInstances_EvaluationFolderId",
                table: "WorkflowInstances",
                column: "EvaluationFolderId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowInstances_ExpiresAt",
                table: "WorkflowInstances",
                column: "ExpiresAt");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowInstances_FormSubmissionId",
                table: "WorkflowInstances",
                column: "FormSubmissionId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowInstances_FormType",
                table: "WorkflowInstances",
                column: "FormType");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowInstances_OriginatorUserId",
                table: "WorkflowInstances",
                column: "OriginatorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowInstances_ShopId",
                table: "WorkflowInstances",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowInstances_Status",
                table: "WorkflowInstances",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowNotifications_Category",
                table: "WorkflowNotifications",
                column: "Category");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowNotifications_CreatedAt",
                table: "WorkflowNotifications",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowNotifications_Entity",
                table: "WorkflowNotifications",
                columns: new[] { "EntityType", "EntityId" });

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowNotifications_EvaluationFolderId",
                table: "WorkflowNotifications",
                column: "EvaluationFolderId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowNotifications_FormWorkflowInstanceId",
                table: "WorkflowNotifications",
                column: "FormWorkflowInstanceId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowNotifications_Inbox",
                table: "WorkflowNotifications",
                columns: new[] { "RecipientUserId", "IsRead", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowNotifications_ShopId",
                table: "WorkflowNotifications",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowSteps_ActedByUserId",
                table: "WorkflowSteps",
                column: "ActedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowSteps_AssignedToUserId",
                table: "WorkflowSteps",
                column: "AssignedToUserId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowSteps_FormWorkflowInstanceId_StepNo",
                table: "WorkflowSteps",
                columns: new[] { "FormWorkflowInstanceId", "StepNo" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowSteps_State",
                table: "WorkflowSteps",
                column: "State");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowSteps_UserSignatureId",
                table: "WorkflowSteps",
                column: "UserSignatureId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ADForms");

            migrationBuilder.DropTable(
                name: "AirworthinessDirectives");

            migrationBuilder.DropTable(
                name: "AlternateConsumableDeclarations");

            migrationBuilder.DropTable(
                name: "AlternateToolsEquivalencies");

            migrationBuilder.DropTable(
                name: "ArchiveEntries");

            migrationBuilder.DropTable(
                name: "ATARecordAmendments");

            migrationBuilder.DropTable(
                name: "ATARecordAssignments");

            migrationBuilder.DropTable(
                name: "ATARecordCreationDelegations");

            migrationBuilder.DropTable(
                name: "ATARecordShopRoutings");

            migrationBuilder.DropTable(
                name: "ATARecordSignatures");

            migrationBuilder.DropTable(
                name: "BulletinRegisterEntries");

            migrationBuilder.DropTable(
                name: "CapabilityAssessments");

            migrationBuilder.DropTable(
                name: "CompetencyMatrixEntries");

            migrationBuilder.DropTable(
                name: "ConsumablesLists");

            migrationBuilder.DropTable(
                name: "DirectiveComplianceEntries");

            migrationBuilder.DropTable(
                name: "DocumentationAssignmentHistories");

            migrationBuilder.DropTable(
                name: "DocumentationClerkWorkloads");

            migrationBuilder.DropTable(
                name: "DocumentationLibraryLinks");

            migrationBuilder.DropTable(
                name: "EmployeeProficiencyRecords");

            migrationBuilder.DropTable(
                name: "EvaluationFolderItems");

            migrationBuilder.DropTable(
                name: "ExpiryTrackings");

            migrationBuilder.DropTable(
                name: "FacilityEvaluations");

            migrationBuilder.DropTable(
                name: "FolderRevisionLogs");

            migrationBuilder.DropTable(
                name: "Form918ACAAs");

            migrationBuilder.DropTable(
                name: "Form918FAAs");

            migrationBuilder.DropTable(
                name: "FormFileAttachments");

            migrationBuilder.DropTable(
                name: "FormSignatures");

            migrationBuilder.DropTable(
                name: "FormUploadGrants");

            migrationBuilder.DropTable(
                name: "InhouseManufacturedToolsCards");

            migrationBuilder.DropTable(
                name: "InhouseToolManufacturingRecords");

            migrationBuilder.DropTable(
                name: "PeriodicSelfAudits");

            migrationBuilder.DropTable(
                name: "ProficiencyAssessmentAssignments");

            migrationBuilder.DropTable(
                name: "RegulatoryComplianceRecords");

            migrationBuilder.DropTable(
                name: "RequestLetters");

            migrationBuilder.DropTable(
                name: "ResponsibilityDelegations");

            migrationBuilder.DropTable(
                name: "SBForms");

            migrationBuilder.DropTable(
                name: "SelfAuditChecklists");

            migrationBuilder.DropTable(
                name: "SelfAuditVerificationItems");

            migrationBuilder.DropTable(
                name: "ServiceBulletins");

            migrationBuilder.DropTable(
                name: "SimilarTechnologyEvaluations");

            migrationBuilder.DropTable(
                name: "TableOfContents");

            migrationBuilder.DropTable(
                name: "TaskCardDocuments");

            migrationBuilder.DropTable(
                name: "ToolEquivalencyMatrixEntries");

            migrationBuilder.DropTable(
                name: "ToolNeedAnalysisEntries");

            migrationBuilder.DropTable(
                name: "ToolNeedAnalysisReports");

            migrationBuilder.DropTable(
                name: "ToolNeedsAnalyses");

            migrationBuilder.DropTable(
                name: "TrainingEnrollments");

            migrationBuilder.DropTable(
                name: "TrainingRecords");

            migrationBuilder.DropTable(
                name: "WorkflowAuditLogs");

            migrationBuilder.DropTable(
                name: "WorkflowDelegationLogs");

            migrationBuilder.DropTable(
                name: "WorkflowNotifications");

            migrationBuilder.DropTable(
                name: "WorkflowSteps");

            migrationBuilder.DropTable(
                name: "DocumentationRoutingTickets");

            migrationBuilder.DropTable(
                name: "EvaluationFolders");

            migrationBuilder.DropTable(
                name: "FormSubmissions");

            migrationBuilder.DropTable(
                name: "UserSignatures");

            migrationBuilder.DropTable(
                name: "WorkflowInstances");

            migrationBuilder.DropTable(
                name: "ATARecords");

            migrationBuilder.DropTable(
                name: "Users");

            migrationBuilder.DropTable(
                name: "Components");

            migrationBuilder.DropTable(
                name: "ATAChapters");

            migrationBuilder.DropTable(
                name: "Shops");

            migrationBuilder.DropTable(
                name: "Departments");
        }
    }
}
