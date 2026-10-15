using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using System.Collections.Generic;
using System.Linq;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.SelfEvaluation.Forms;
using CMT.Domain.Models.Shared;
using CMT.Domain.Models.Workflow;
using User = CMT.Domain.Models.SelfEvaluation.User;

namespace CMT.Domain.SelfEvaluation.Data;

// =========================================================================================
// AMENDED v10 - CMT.Domain/Data/ApplicationDbContext.cs   (AMENDMENT OF THE EXISTING FILE)
//
// FIX FOR THE BUILD ERROR
// -----------------------
//   error CS0260: Missing partial modifier on declaration of type 'ApplicationDbContext';
//                 another partial declaration of this type exists
//
// CAUSE
//   The v9 amendment set introduced the companion file
//       CMT.Domain/Data/ApplicationDbContext.Workflow.cs
//   which declares:
//       public partial class ApplicationDbContext
//   while THIS file still declared:
//       public class ApplicationDbContext : DbContext          <-- no 'partial'
//   C# requires EVERY declaration of a split type to carry the 'partial' modifier.
//
// WHAT CHANGED IN THIS FILE (2 changes only - nothing else was touched)
//   1) line ~24 : 'public class ApplicationDbContext'  ->  'public partial class ApplicationDbContext'
//   2) end of OnModelCreating : added the extension point
//          OnWorkflowModelCreating(modelBuilder);
//      plus its declaration
//          partial void OnWorkflowModelCreating(ModelBuilder modelBuilder);
//      A 'partial void' method whose implementation is absent is simply removed by the
//      compiler, so this file keeps compiling ON ITS OWN even if the companion file is
//      not present yet.
//
// ALL existing DbSets, ALL existing Fluent configurations and ALL existing seed data are
// preserved byte-for-byte. No entity was added, renamed or removed here, therefore this
// change alone produces NO schema difference and NO new migration.
//
// REQUIRED 1-LINE ADJUSTMENT IN THE COMPANION FILE
//   A partial class may contain only ONE 'protected override void OnModelCreating'.
//   If CMT.Domain/Data/ApplicationDbContext.Workflow.cs currently declares its own
//   override, the compiler will now report CS0111 (duplicate member). Rename it there:
//
//       // BEFORE (in ApplicationDbContext.Workflow.cs)
//       protected override void OnModelCreating(ModelBuilder modelBuilder)
//       {
//           ... workflow mapping ...
//       }
//
//       // AFTER
//       partial void OnWorkflowModelCreating(ModelBuilder modelBuilder)
//       {
//           ... workflow mapping ...   // remove any base.OnModelCreating(...) call
//       }
//
//   The workflow DbSets (WorkflowInstances, WorkflowSteps, FormSignatures,
//   EvaluationFolders, EvaluationFolderItems, ExpiryTrackings, WorkflowNotifications,
//   CompetencyMatrixEntries, ToolEquivalencyMatrixEntries, FolderRevisionLogs) stay
//   declared in the companion file - they are intentionally NOT duplicated here.
//
// MIGRATION (run after the solution builds again)
//   dotnet ef migrations add AddWorkflowEngineTables --project CMT.Domain --startup-project CMT.Web.Api.SelfEvaluation
//   dotnet ef database update                        --project CMT.Domain --startup-project CMT.Web.Api.SelfEvaluation
// =========================================================================================

// =========================================================================================
// AMENDED v12 - THIS AMENDMENT (read before running dotnet ef migrations add)
//
// WHAT WAS BROKEN
// ---------------
// Up to v11 this DbContext mapped ONLY four workflow tables:
//     WorkflowInstances, WorkflowSteps, FormSignatures, UserSignatures
// Every other table declared by the two design documents was UNREACHABLE: no DbSet and no
// navigation pointed at it, so EF Core silently ignored the class and
// `dotnet ef migrations add` produced NO table for it.
//
//   Document A - CMT.Domain/Models/Workflow/WorkflowEntities.cs   (7 tables were missing)
//     EvaluationFolder            -> EvaluationFolders
//     EvaluationFolderItem        -> EvaluationFolderItems        (Table of Contents rows)
//     ExpiryTracking              -> ExpiryTrackings
//     WorkflowNotification        -> WorkflowNotifications
//     CompetencyMatrixEntry       -> CompetencyMatrixEntries
//     ToolEquivalencyMatrixEntry  -> ToolEquivalencyMatrixEntries
//     FolderRevisionLog           -> FolderRevisionLogs
//
//   Document B - CMT.Domain/Models/Workflow/DocumentationWorkflowEntities.cs (6 missing)
//     DocumentationRoutingTicket     -> DocumentationRoutingTickets
//     DocumentationClerkWorkload     -> DocumentationClerkWorkloads
//     DocumentationAssignmentHistory -> DocumentationAssignmentHistories
//     BulletinRegisterEntry          -> BulletinRegisterEntries
//     DirectiveComplianceEntry       -> DirectiveComplianceEntries
//     DocumentationLibraryLink       -> DocumentationLibraryLinks
//
// WHAT CHANGED HERE (3 additive changes - nothing was removed, renamed or re-typed)
//   1) 14 new DbSets: the 13 entities above, plus an EXPLICIT DbSet for
//      FormWorkflowInstance (WorkflowInstances). That table was already mapped implicitly
//      through the Instance navigation of WorkflowSteps / FormSignatures, so declaring the
//      DbSet is a QUERY convenience and produces NO schema difference.
//   2) OnModelCreating now ends with two extra calls:
//          ConfigureFolderAndTrackingEntities(modelBuilder);   // document A
//          ConfigureDocumentationEntities(modelBuilder);       // document B
//   3) Those two methods are implemented at the bottom of this file: table name, key,
//      max lengths, bigint user-id columns, enum-to-int columns, relationships and the
//      COMPLETE index list of all 13 tables.
//
// EVERYTHING ELSE IS PRESERVED BYTE-FOR-BYTE: all pre-existing DbSets, all pre-existing
// Fluent blocks, all seed data, and the v11 ConfigureWorkflowEntities method.
//
// BINDING RULES APPLIED (identical to the rest of the solution)
//   * Entity keys are Guid. User ids are long and are declared HasColumnType("bigint"), so
//     the generated migration can never emit "uniqueidentifier" for a user column.
//   * Enums persist as int (EF Core default). No HasConversion<string>() was introduced,
//     therefore DO NOT renumber any enum member after the first migration is applied.
//   * DateTime columns stay datetime2 (provider default). The entities normalise to UTC.
//
// FOREIGN KEYS - DELIBERATE AND MINIMAL
//   Only these relationships become real FKs. Everything else is an INDEXED PLAIN Guid
//   column, which is exactly what the "additive only" design requires: a folder-level
//   virtual form has no FormSubmission row, a register line may exist before its legacy
//   SBForm/ADForm row, and SQL Server would reject several of those links as multiple
//   cascade paths.
//     EvaluationFolders                1--* EvaluationFolderItems            Cascade  (nav)
//     EvaluationFolders                1--* FolderRevisionLogs               Cascade  (shadow)
//     ATARecords                       1--* EvaluationFolders                Restrict (shadow)
//     WorkflowInstances                1--* DocumentationRoutingTickets      Cascade  (shadow)
//     DocumentationRoutingTickets      1--* DocumentationAssignmentHistories Cascade  (nav)
//     WorkflowInstances                1--* BulletinRegisterEntries          Cascade  (shadow)
//     WorkflowInstances                1--* DirectiveComplianceEntries       Cascade  (shadow)
//     Users                            1--* DocumentationClerkWorkloads      Cascade  (shadow)
//   Columns intentionally left WITHOUT an FK (indexed only): EvaluationFolderId on
//   WorkflowInstances / FormSignatures / ExpiryTrackings / WorkflowNotifications /
//   CompetencyMatrixEntries / ToolEquivalencyMatrixEntries / BulletinRegisterEntries /
//   DirectiveComplianceEntries / DocumentationLibraryLinks, plus SignOffInstanceId,
//   SupersedesInstanceId, AmendmentInstanceId, RevisionInstanceId, JointApprovalCompanion-
//   InstanceId, LeaderSignatureId, IssueSignatureId, SBFormId, ADFormId, FormSubmissionId,
//   SourceFormSubmissionId, SourceFormWorkflowInstanceId, LastRaisedRevisionLogId,
//   DocumentationRoutingTicketId on BulletinRegisterEntries, ShopId and DepartmentId
//   everywhere, and every *UserId column except DocumentationClerkWorkloads.ClerkUserId.
//
// FILTERED UNIQUE INDEXES - SQL SERVER SYNTAX
//   Four business invariants are "unique only when populated", because the entities
//   initialise their string keys to string.Empty. Those indexes therefore carry
//   HasFilter(...). If you ever target a provider other than SQL Server, delete the lines
//   flagged "// SQL-SERVER FILTERED INDEX".
//     UX_EvaluationFolders_FolderCode          FolderCode <> ''
//     UX_ExpiryTrackings_Entity_Active         IsActive = 1
//     UX_DocumentationRoutingTickets_TicketNo  TicketNo <> ''
//   Plus two unfiltered unique indexes:
//     UX_DocumentationClerkWorkloads_ClerkUserId          (one workload row per clerk)
//     UX_DocumentationAssignmentHistories_Ticket_Sequence (sequence is 1-based per ticket)
//
// MIGRATION (run on your side - this workspace cannot compile .NET or reach a database)
//   dotnet ef migrations add AddFolderTrackingAndDocumentationTables ^
//       --project CMT.Domain --startup-project CMT.Web.Api.SelfEvaluation
//   dotnet ef database update ^
//       --project CMT.Domain --startup-project CMT.Web.Api.SelfEvaluation
//
// EXPECTED MIGRATION CONTENT: 13 CreateTable operations, 0 DropTable, 0 AlterColumn, and
// no change to any pre-existing table other than the new FK/index objects listed above.
// If you see anything else, STOP and compare the model snapshot before applying.
// =========================================================================================

public partial class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
    : base(options) { }

    public override int SaveChanges()
    {
        AddAutomaticAuditEntries();
        return base.SaveChanges();
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        AddAutomaticAuditEntries();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        AddAutomaticAuditEntries();
        return base.SaveChangesAsync(cancellationToken);
    }

    public override Task<int> SaveChangesAsync(
        bool acceptAllChangesOnSuccess,
        CancellationToken cancellationToken = default)
    {
        AddAutomaticAuditEntries();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    private void AddAutomaticAuditEntries()
    {
        var entries = ChangeTracker.Entries()
            .Where(entry => IsAuditableSelfEvaluationEntity(entry.Entity)
                && entry.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .ToList();

        foreach (var entry in entries)
        {
            var entityId = entry.Metadata.FindProperty("Id") == null
                ? Guid.Empty
                : (Guid)(entry.Property("Id").CurrentValue
                    ?? entry.Property("Id").OriginalValue
                    ?? Guid.Empty);

            if (entityId == Guid.Empty) continue;

            var action = ResolveAuditAction(entry);
            var entityType = entry.Metadata.ClrType.Name;
            if (WorkflowAuditLogs.Local.Any(log =>
                    log.EntityType == entityType
                    && log.EntityId == entityId
                    && log.WorkflowAction == action))
            {
                continue;
            }

            var performedBy = ResolveAuditActor(entry);

            WorkflowAuditLogs.Add(new WorkflowAuditLog
            {
                Id = Guid.NewGuid(),
                Action = action.ToString(),
                WorkflowAction = action,
                EntityType = entityType,
                EntityId = entityId,
                PerformedBy = performedBy,
                UserRole = ResolveAuditRole(entry),
                Details = $"{action} {entityType} {entityId}",
                PreviousValues = SerializeAuditValues(entry, useCurrentValues: false),
                NewValues = SerializeAuditValues(entry, useCurrentValues: true),
                Timestamp = DateTime.UtcNow
            });
        }
    }

    private static bool IsAuditableSelfEvaluationEntity(object entity)
    {
        var type = entity.GetType();
        return type != typeof(WorkflowAuditLog)
            && type.Namespace?.StartsWith("CMT.Domain.Models.SelfEvaluation", StringComparison.Ordinal) == true;
    }

    private static WorkflowAction ResolveAuditAction(Microsoft.EntityFrameworkCore.ChangeTracking.EntityEntry entry)
    {
        if (entry.State == EntityState.Added) return WorkflowAction.Added;
        if (entry.State == EntityState.Deleted) return WorkflowAction.Deleted;

        var statusProperty = entry.Metadata.FindProperty("ApprovalStatus");
        if (statusProperty != null && entry.Property(statusProperty.Name).IsModified)
        {
            var status = entry.Property(statusProperty.Name).CurrentValue?.ToString();
            return status switch
            {
                "Approved" => WorkflowAction.Approved,
                "Rejected" => WorkflowAction.Rejected,
                "Returned" => WorkflowAction.ReturnedForRevision,
                _ => WorkflowAction.Updated
            };
        }

        if (entry.Metadata.FindProperty("RevisionNumber") is not null
            && entry.Property("RevisionNumber").IsModified)
        {
            return WorkflowAction.Amended;
        }

        foreach (var assignmentProperty in new[]
        {
            "CurrentApproverUserId", "DelegatedToUserId", "AssignedTo", "AssignedToUserId"
        })
        {
            if (entry.Metadata.FindProperty(assignmentProperty) is not null
                && entry.Property(assignmentProperty).IsModified)
            {
                return WorkflowAction.AssignmentChanged;
            }
        }

        return WorkflowAction.Updated;
    }

    private static string ResolveAuditActor(Microsoft.EntityFrameworkCore.ChangeTracking.EntityEntry entry)
    {
        foreach (var name in new[] { "UpdatedBy", "CreatedBy", "PerformedBy" })
        {
            var property = entry.Metadata.FindProperty(name);
            var value = property == null
                ? null
                : (entry.State == EntityState.Deleted
                    ? entry.Property(name).OriginalValue
                    : entry.Property(name).CurrentValue)?.ToString();
            if (!string.IsNullOrWhiteSpace(value)) return value;
        }

        return "system";
    }

    private static string ResolveAuditRole(Microsoft.EntityFrameworkCore.ChangeTracking.EntityEntry entry)
    {
        var property = entry.Metadata.FindProperty("UserRole");
        if (property == null) return "system";
        return entry.Property(property.Name).CurrentValue?.ToString() ?? "system";
    }

    private static string SerializeAuditValues(
        Microsoft.EntityFrameworkCore.ChangeTracking.EntityEntry entry,
        bool useCurrentValues)
    {
        var values = new Dictionary<string, object?>();
        foreach (var property in entry.Properties)
        {
            if (property.Metadata.IsShadowProperty()) continue;
            var value = useCurrentValues ? property.CurrentValue : property.OriginalValue;
            values[property.Metadata.Name] = value;
        }

        var json = JsonSerializer.Serialize(values);
        return json.Length <= 2000 ? json : json[..2000];
    }

    // ===== USER MANAGEMENT =====
    public DbSet<User> Users { get; set; }

    // ===== SELF EVALUATION DbSets =====
    public DbSet<Shop> Shops { get; set; }
    public DbSet<ATAChapter> ATAChapters { get; set; }
    public DbSet<Component> Components { get; set; }
    public DbSet<CapabilityAssessment> CapabilityAssessments { get; set; }
    public DbSet<AirworthinessDirective> AirworthinessDirectives { get; set; }
    public DbSet<ServiceBulletin> ServiceBulletins { get; set; }
    public DbSet<ToolNeedsAnalysis> ToolNeedsAnalyses { get; set; }
    public DbSet<SelfAuditChecklist> SelfAuditChecklists { get; set; }
    public DbSet<EmployeeProficiencyRecord> EmployeeProficiencyRecords { get; set; }
    public DbSet<WorkflowAuditLog> WorkflowAuditLogs { get; set; }
    public DbSet<ResponsibilityDelegation> ResponsibilityDelegations { get; set; }

    // ===== ATA Record & Workflow DbSets =====
    public DbSet<ATARecord> ATARecords { get; set; }
    public DbSet<Department> Departments { get; set; }
    public DbSet<FormSubmission> FormSubmissions { get; set; }
    public DbSet<FormFileAttachment> FormFileAttachments { get; set; }

    // AMENDED v13: Admin-granted, time-boxed upload privileges for completed forms.
    public DbSet<FormUploadGrant> FormUploadGrants { get; set; }

    // ===== TASK CARD (MaintainX / Maintenix) DbSet =====
    // NEW: task card PDFs fetched from http://svdcmpa01/maintenix and stored locally,
    // organized by Part Number (P/N). Counterpart of the CMM Revision data held on
    // ATARecord.CMMPdfUrl. Run: dotnet ef migrations add AddTaskCardDocuments
    public DbSet<TaskCardDocument> TaskCardDocuments { get; set; }

    // ===== FORM-SPECIFIC DbSets =====
    public DbSet<Form918FAA> Form918FAAs { get; set; }
    public DbSet<Form918ACAA> Form918ACAAs { get; set; }
    public DbSet<SBForm> SBForms { get; set; }
    public DbSet<ADForm> ADForms { get; set; }
    public DbSet<PeriodicSelfAudit> PeriodicSelfAudits { get; set; }
    public DbSet<RequestLetter> RequestLetters { get; set; }
    public DbSet<TableOfContent> TableOfContents { get; set; }
    public DbSet<ToolNeedAnalysisReport> ToolNeedAnalysisReports { get; set; }
    public DbSet<SimilarTechnologyEvaluation> SimilarTechnologyEvaluations { get; set; }
    public DbSet<AlternateToolsEquivalency> AlternateToolsEquivalencies { get; set; }
    public DbSet<InhouseManufacturedToolsCard> InhouseManufacturedToolsCards { get; set; }
    public DbSet<FacilityEvaluation> FacilityEvaluations { get; set; }
    public DbSet<ConsumablesList> ConsumablesLists { get; set; }
    public DbSet<AlternateConsumableDeclaration> AlternateConsumableDeclarations { get; set; }
    public DbSet<TrainingRecord> TrainingRecords { get; set; }

public DbSet<UserSignature> UserSignatures => Set<UserSignature>();
public DbSet<FormSignature> FormSignatures => Set<FormSignature>();
public DbSet<FormWorkflowStep> FormWorkflowSteps => Set<FormWorkflowStep>();

    // =====================================================================================
    // AMENDED v12 - WORKFLOW ENGINE ROOT (document A, section 1)
    //
    // WorkflowInstances was already MAPPED in v11, but only implicitly: EF discovered
    // FormWorkflowInstance through the Instance navigation of FormWorkflowStep /
    // FormSignature. Declaring the DbSet explicitly changes NOTHING in the schema; it only
    // gives the repositories a first-class query root ("Pending my action" inbox, folder
    // drill-down, expiry sweep) instead of forcing every read through a child navigation.
    // =====================================================================================
    public DbSet<FormWorkflowInstance> WorkflowInstances => Set<FormWorkflowInstance>();

    // =====================================================================================
    // AMENDED v12 - DOCUMENT A: folders, Table of Contents, expiry, notifications, matrices
    //               and the revision log. The absence of these seven DbSets is what left
    //               requirements #2, #10, #11 and #12 with no storage at all.
    // =====================================================================================

    /// <summary>Requirement #2 / #11 / #12 / #13 - one Self-Evaluation folder per ATA record.</summary>
    public DbSet<EvaluationFolder> EvaluationFolders => Set<EvaluationFolder>();

    /// <summary>Requirement #2 - Table of Contents rows with their live per-form status.</summary>
    public DbSet<EvaluationFolderItem> EvaluationFolderItems => Set<EvaluationFolderItem>();

    /// <summary>Requirement #10 - tracked validity windows (training, calibration, certificates).</summary>
    public DbSet<ExpiryTracking> ExpiryTrackings => Set<ExpiryTracking>();

    /// <summary>Requirement #10 - in-app notification centre.</summary>
    public DbSet<WorkflowNotification> WorkflowNotifications => Set<WorkflowNotification>();

    /// <summary>Requirement #12 - individual competency / training completion matrix.</summary>
    public DbSet<CompetencyMatrixEntry> CompetencyMatrixEntries => Set<CompetencyMatrixEntry>();

    /// <summary>Requirement #12 - tool equivalency matrix; also feeds calibration expiry rows.</summary>
    public DbSet<ToolEquivalencyMatrixEntry> ToolEquivalencyMatrixEntries => Set<ToolEquivalencyMatrixEntry>();

    /// <summary>Requirement #12 - two-year cycle plus documentation-triggered revisions.</summary>
    public DbSet<FolderRevisionLog> FolderRevisionLogs => Set<FolderRevisionLog>();

    // =====================================================================================
    // AMENDED v12 - DOCUMENT B: Documentation Team routing, clerk availability, assignment
    //               history and the three register / library outputs of MNT-1420,
    //               MNT-1420A, MNT-1420B and MNT-1420C.
    // =====================================================================================

    /// <summary>Routing steps 1-3: "Sent to the Documentation Team", made persistent.</summary>
    public DbSet<DocumentationRoutingTicket> DocumentationRoutingTickets => Set<DocumentationRoutingTicket>();

    /// <summary>Makes "DL assigns to an AVAILABLE clerk" implementable.</summary>
    public DbSet<DocumentationClerkWorkload> DocumentationClerkWorkloads => Set<DocumentationClerkWorkload>();

    /// <summary>Every assignment / re-assignment / return inside the Documentation unit.</summary>
    public DbSet<DocumentationAssignmentHistory> DocumentationAssignmentHistories => Set<DocumentationAssignmentHistory>();

    /// <summary>Output of MNT-1420A: the SB / SL / SIL register line.</summary>
    public DbSet<BulletinRegisterEntry> BulletinRegisterEntries => Set<BulletinRegisterEntry>();

    /// <summary>Output of MNT-1420B: the AD compliance line (STL sole authority).</summary>
    public DbSet<DirectiveComplianceEntry> DirectiveComplianceEntries => Set<DirectiveComplianceEntry>();

    /// <summary>Watch list behind the automatic revision triggers (CMM / CMT / Task Card).</summary>
    public DbSet<DocumentationLibraryLink> DocumentationLibraryLinks => Set<DocumentationLibraryLink>();

public DbSet<ATARecordSignature> ATARecordSignatures => Set<ATARecordSignature>();
    public DbSet<ATARecordCreationDelegation> ATARecordCreationDelegations => Set<ATARecordCreationDelegation>();
    public DbSet<ATARecordAmendment> ATARecordAmendments => Set<ATARecordAmendment>();
    public DbSet<ATARecordShopRouting> ATARecordShopRoutings => Set<ATARecordShopRouting>();

    /// <summary>AMENDED v14 - ARCHIVE &amp; SOFT-DELETE: append-only archive index (invariant A1).</summary>
    public DbSet<ArchiveEntry> ArchiveEntries => Set<ArchiveEntry>();
    // =====================================================================================
    // AMENDED v11: the companion file CMT.Domain/Data/ApplicationDbContext.Workflow.cs was
    // DELETED on purpose, so the previous 'partial void OnWorkflowModelCreating' extension
    // point no longer had any implementation and the three workflow DbSets declared above
    // (UserSignatures / FormSignatures / FormWorkflowSteps) were left completely unmapped.
    //
    // The workflow mapping now lives INSIDE this file, in ConfigureWorkflowEntities below,
    // which is invoked at the very end of OnModelCreating. Nothing else is needed: the
    // partial method declaration is gone, therefore no companion file is required and this
    // file compiles and maps the full model on its own.
    // =====================================================================================

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // ===== User Configuration =====
        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("Users");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Username).HasMaxLength(100).IsRequired();
            entity.Property(e => e.Email).HasMaxLength(200).IsRequired();
            entity.Property(e => e.FullName).HasMaxLength(200).IsRequired();
            entity.Property(e => e.PasswordHash).HasMaxLength(500).IsRequired();
            entity.Property(e => e.Role).HasMaxLength(50).IsRequired();
            entity.Property(e => e.PersonnelType).HasMaxLength(50);
            entity.Property(e => e.RefreshToken).HasMaxLength(500);
            entity.HasIndex(e => e.Username).IsUnique();
            entity.HasIndex(e => e.Email).IsUnique();

            entity.HasOne(e => e.Shop)
                .WithMany()
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.Manager)
                .WithMany()
                .HasForeignKey(e => e.ManagerId)
                .OnDelete(DeleteBehavior.NoAction);

            // Seed default users
            var defaultPasswordHash = "$2a$12$8U018BcnRBqsdUX8l1zHUOr0te4UeSRE09WMM4JjgG6bAqdM.uAbK";
            var defaultDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

            entity.HasData(new User
            {
                Id = 1, Username = "team_leader", Email = "team_leader@se.com",
                FullName = "Team Leader", PasswordHash = defaultPasswordHash,
                Role = "team_leader", IsActive = true, ShopId = null, ManagerId = null,
                PersonnelType = null, RefreshToken = null, RefreshTokenExpiryTime = null,
                RecordStatus = RecordStatus.Active, RegisteredBy = "system",
                CreatedDate = defaultDate, LastUpdateDate = defaultDate, LastUpdatedBy = null
            });

            entity.HasData(new User
            {
                Id = 2, Username = "director", Email = "director@se.com",
                FullName = "Director", PasswordHash = defaultPasswordHash,
                Role = "director", IsActive = true, ShopId = null, ManagerId = null,
                PersonnelType = null, RefreshToken = null, RefreshTokenExpiryTime = null,
                RecordStatus = RecordStatus.Active, RegisteredBy = "system",
                CreatedDate = defaultDate, LastUpdateDate = defaultDate, LastUpdatedBy = null
            });

            entity.HasData(new User
            {
                Id = 3, Username = "engineer", Email = "engineer@se.com",
                FullName = "Engineer", PasswordHash = defaultPasswordHash,
                Role = "engineer", IsActive = true, ShopId = null, ManagerId = 1,
                PersonnelType = null, RefreshToken = null, RefreshTokenExpiryTime = null,
                RecordStatus = RecordStatus.Active, RegisteredBy = "system",
                CreatedDate = defaultDate, LastUpdateDate = defaultDate, LastUpdatedBy = null
            });

            entity.HasData(new User
            {
                Id = 4, Username = "shop_tl", Email = "shop_tl@se.com",
                FullName = "Shop Team Leader", PasswordHash = defaultPasswordHash,
                Role = "shop_tl", IsActive = true, ShopId = null, ManagerId = null,
                PersonnelType = null, RefreshToken = null, RefreshTokenExpiryTime = null,
                RecordStatus = RecordStatus.Active, RegisteredBy = "system",
                CreatedDate = defaultDate, LastUpdateDate = defaultDate, LastUpdatedBy = null
            });

            entity.HasData(new User
            {
                Id = 100, Username = "santa", Email = "santa@se.com",
                FullName = "Santa (Admin)", PasswordHash = defaultPasswordHash,
                Role = "admin", IsActive = true, ShopId = null, ManagerId = null,
                PersonnelType = null, RefreshToken = null, RefreshTokenExpiryTime = null,
                RecordStatus = RecordStatus.Active, RegisteredBy = "system",
                CreatedDate = defaultDate, LastUpdateDate = defaultDate, LastUpdatedBy = null
            });
        });

        // =================================================================================
        // AMENDED v11: UserSignature mapping (admin-uploaded signature per user).
        // Consolidated into a SINGLE configuration block. The previous amendment declared
        // modelBuilder.Entity<UserSignature>(...) TWICE with conflicting definitions for
        // RecordStatus (string conversion vs. plain max length) and for the unique index
        // (unnamed vs. UX_UserSignatures_UserId_Active). Duplicated blocks are merged by
        // EF, so the last call silently won and produced an unstable model. One block only.
        // =================================================================================
        modelBuilder.Entity<UserSignature>(entity =>
        {
            entity.ToTable("UserSignatures");
            entity.HasKey(e => e.Id);

            // Owner of the signature. Maps to User.Id (long) -> bigint.
            entity.Property(e => e.UserId).HasColumnType("bigint").IsRequired();
            entity.Property(e => e.UserFullName).HasMaxLength(256);
            entity.Property(e => e.UserRole).HasMaxLength(128);

            // Stored file: ONLY the path is persisted, never the bytes
            // (same convention as FormFileAttachment / TaskCardDocument).
            entity.Property(e => e.FileName).HasMaxLength(260).IsRequired();
            entity.Property(e => e.ContentType).HasMaxLength(128).IsRequired();
            entity.Property(e => e.FileKind).HasConversion<int>();
            entity.Property(e => e.StoragePath).HasMaxLength(1000).IsRequired();
            entity.Property(e => e.FileSha256).HasMaxLength(64);

            // Audit / lifecycle.
            entity.Property(e => e.RecordStatus).HasConversion<string>().HasMaxLength(32);
            entity.Property(e => e.UploadedBy).HasMaxLength(256);
            entity.Property(e => e.UpdatedBy).HasMaxLength(256);
            entity.Property(e => e.Remarks).HasMaxLength(1000);

            // Hard guarantee of requirement "one active signature per user".
            entity.HasIndex(e => new { e.UserId, e.IsActive })
                .HasDatabaseName("UX_UserSignatures_UserId_Active")
                .IsUnique()
                .HasFilter("[IsActive] = 1");

            // Signature resolution at approval time: newest active row of the signer.
            entity.HasIndex(e => e.UserId);
            entity.HasIndex(e => e.UploadedAt);

            entity.HasOne<User>()
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ===== Shop Configuration =====
        modelBuilder.Entity<Shop>(entity =>
        {
            entity.ToTable("Shops");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).HasMaxLength(200).IsRequired();
            entity.Property(e => e.CertificateNumber).HasMaxLength(100);
            entity.Property(e => e.Address).HasMaxLength(500);
            entity.Property(e => e.City).HasMaxLength(100);
            entity.Property(e => e.State).HasMaxLength(100);
            entity.Property(e => e.ZipCode).HasMaxLength(20);
            entity.Property(e => e.Country).HasMaxLength(100);
            entity.Property(e => e.Phone).HasMaxLength(50);
            entity.Property(e => e.Email).HasMaxLength(200);
            entity.Property(e => e.AccountableManager).HasMaxLength(200);
            entity.Property(e => e.QualityManager).HasMaxLength(200);

            entity.HasOne(e => e.Department)
                .WithMany(d => d.Shops)
                .HasForeignKey(e => e.DepartmentId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // ===== Department Configuration =====
        modelBuilder.Entity<Department>(entity =>
        {
            entity.ToTable("Departments");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).HasMaxLength(200).IsRequired();
            entity.Property(e => e.Code).HasMaxLength(50);
            entity.Property(e => e.Description).HasMaxLength(1000);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            // DirectorUserId is now long? (matches User.Id which is long)
            entity.Property(e => e.DirectorUserId).IsRequired(false);

            entity.HasOne(e => e.ParentDepartment)
                .WithMany(e => e.SubDepartments)
                .HasForeignKey(e => e.ParentDepartmentId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => e.Code);
        });

        // ===== ATAChapter Configuration =====
        modelBuilder.Entity<ATAChapter>(entity =>
        {
            entity.ToTable("ATAChapters");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.ChapterNumber).HasMaxLength(10).IsRequired();
            entity.Property(e => e.Title).HasMaxLength(300).IsRequired();
            entity.Property(e => e.Description).HasMaxLength(1000);
            entity.HasIndex(e => e.ChapterNumber);
        });

        // ===== ATARecord Configuration =====
        modelBuilder.Entity<ATARecord>(entity =>
        {
            entity.ToTable("ATARecords");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Description).HasMaxLength(500).IsRequired();
            entity.Property(e => e.PartNumber).HasMaxLength(100).IsRequired();
            entity.Property(e => e.Manufacturer).HasMaxLength(200);
            entity.Property(e => e.ATAChapterCode).HasMaxLength(10);
            entity.Property(e => e.CMMRevDate).HasMaxLength(100);
            entity.Property(e => e.RevNo).HasMaxLength(50);
            entity.Property(e => e.CMMPdfUrl).HasMaxLength(1000);
            entity.Property(e => e.Aircraft).HasMaxLength(100);
            entity.Property(e => e.ECAAShop).HasMaxLength(100);
            entity.Property(e => e.FAAShop).HasMaxLength(100);
            entity.Property(e => e.LetterRefNo).HasMaxLength(100);
            entity.Property(e => e.RejectionReason).HasMaxLength(1000);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            entity.HasOne(e => e.Shop)
                .WithMany(s => s.ATARecords)
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.ATAChapter)
                .WithMany()
                .HasForeignKey(e => e.ATAChapterId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Component)
                .WithMany()
                .HasForeignKey(e => e.ComponentId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => e.ShopId);
            entity.HasIndex(e => e.ATAChapterId);
            entity.HasIndex(e => e.ApprovalStatus);
        });

        // ===== FormSubmission Configuration =====
        modelBuilder.Entity<FormSubmission>(entity =>
        {
            entity.ToTable("FormSubmissions");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FormType).HasMaxLength(100).IsRequired();
            entity.Property(e => e.FormNo).HasMaxLength(50);
            entity.Property(e => e.RevNo).HasMaxLength(20);
            entity.Property(e => e.FormDataJson).HasColumnType("nvarchar(max)");
            entity.Property(e => e.ReviewComments).HasMaxLength(1000);
            entity.Property(e => e.RejectionReason).HasMaxLength(1000);
            entity.Property(e => e.DelegationReason).HasMaxLength(500);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            // ===== AMENDED v4: workflow ownership columns are bigint (long?) =====
            // These map to User.Id (long). Declaring them explicitly makes the
            // generated migration emit "bigint" instead of "uniqueidentifier".
            entity.Property(e => e.SubmittedByUserId).HasColumnType("bigint");
            entity.Property(e => e.ReviewedByUserId).HasColumnType("bigint");
            entity.Property(e => e.ApprovedByUserId).HasColumnType("bigint");
            entity.Property(e => e.CurrentApproverUserId).HasColumnType("bigint");
            entity.Property(e => e.DelegatedToUserId).HasColumnType("bigint");

            entity.HasOne(e => e.ATARecord)
                .WithMany(a => a.FormSubmissions)
                .HasForeignKey(e => e.ATARecordId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.ATARecordId);
            entity.HasIndex(e => e.FormType);
            entity.HasIndex(e => e.ApprovalStatus);

            // AMENDED v4: shop scoping of the submission.
            entity.HasIndex(e => e.ShopId);
            entity.HasIndex(e => e.SourceFormSubmissionId);

            // AMENDED v4: indexes backing the "Pending my approval" inbox queries.
            entity.HasIndex(e => e.CurrentApproverUserId);
            entity.HasIndex(e => e.DelegatedToUserId);
            entity.HasIndex(e => e.SubmittedByUserId);

            // ===== AMENDED v13: upload lock on completion =====
            // UploadLock is an enum and persists as int by EF default (same rule as every
            // other enum in this file) - no HasConversion call needed.
            entity.Property(e => e.UploadLockedByUserId).HasColumnType("bigint");
            entity.Property(e => e.ApprovalSignatureHash).HasMaxLength(128);
            entity.HasIndex(e => e.UploadLock);
        });

        // ===== FormFileAttachment Configuration =====
        modelBuilder.Entity<FormFileAttachment>(entity =>
        {
            entity.ToTable("FormFileAttachments");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FileName).HasMaxLength(500).IsRequired();
            entity.Property(e => e.ContentType).HasMaxLength(100);
            entity.Property(e => e.StoragePath).HasMaxLength(1000).IsRequired();
            entity.Property(e => e.Description).HasMaxLength(500);
            entity.Property(e => e.FormType).HasMaxLength(100);
            entity.Property(e => e.ApprovalComments).HasMaxLength(500);
            entity.Property(e => e.UploadedBy).HasMaxLength(200);

            entity.HasOne(e => e.ATARecord)
                .WithMany(a => a.FileAttachments)
                .HasForeignKey(e => e.ATARecordId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.FormSubmission)
                .WithMany(f => f.FileAttachments)
                .HasForeignKey(e => e.FormSubmissionId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => e.ATARecordId);
            entity.HasIndex(e => e.FormSubmissionId);
        });

        // =================================================================================
        // AMENDED v13 - FormUploadGrant configuration (NEW TABLE FormUploadGrants)
        // The Admin-granted upload privilege that unlocks a completed form for one user
        // inside a time box. One ACTIVE grant per (form, user): granting twice replaces
        // the previous row (the service deactivates the old one first).
        // =================================================================================
        modelBuilder.Entity<FormUploadGrant>(entity =>
        {
            entity.ToTable("FormUploadGrants");
            entity.HasKey(e => e.Id);

            // User ids are bigint (v4 binding rule), never uniqueidentifier.
            entity.Property(e => e.ForUserId).HasColumnType("bigint").IsRequired();
            entity.Property(e => e.GrantedByUserId).HasColumnType("bigint").IsRequired();
            entity.Property(e => e.ForUserName).HasMaxLength(200);
            entity.Property(e => e.GrantedByName).HasMaxLength(200);
            entity.Property(e => e.Reason).HasMaxLength(1000).IsRequired();
            entity.Property(e => e.CreatedBy).HasMaxLength(200);

            entity.HasOne(e => e.FormSubmission)
                .WithMany()
                .HasForeignKey(e => e.FormSubmissionId)
                .OnDelete(DeleteBehavior.Cascade);

            // The hot path: "does THIS user hold a usable grant on THIS form?"
            entity.HasIndex(e => new { e.FormSubmissionId, e.ForUserId, e.IsActive });
            // Expiry sweep + admin audit list.
            entity.HasIndex(e => e.ExpiresAt);
        });

        // ===== TaskCardDocument Configuration (NEW: MaintainX Task Card integration) =====
        // Mirrors the FormFileAttachment convention: only the storage path is persisted,
        // never the file bytes. Rows are grouped by PartNumber and revisioned per
        // TaskDefinitionCode (IsLatest = newest fetch, older rows kept as history).
        modelBuilder.Entity<TaskCardDocument>(entity =>
        {
            entity.ToTable("TaskCardDocuments");
            entity.HasKey(e => e.Id);

            // ----- Ownership / grouping -----
            entity.Property(e => e.PartNumber).HasMaxLength(100).IsRequired();
            entity.Property(e => e.ATAChapterCode).HasMaxLength(20);
            entity.Property(e => e.TaskCode).HasMaxLength(50);

            // ----- External task definition (MaintainX) -----
            entity.Property(e => e.TaskDefinitionCode).HasMaxLength(200);
            entity.Property(e => e.TaskDefinitionName).HasMaxLength(500);
            entity.Property(e => e.TaskDefinitionUrl).HasMaxLength(1000);
            entity.Property(e => e.SourcePdfUrl).HasMaxLength(1000);
            entity.Property(e => e.SourceSystem).HasMaxLength(50);

            // ----- Stored file -----
            entity.Property(e => e.FileName).HasMaxLength(500).IsRequired();
            entity.Property(e => e.ContentType).HasMaxLength(100);
            entity.Property(e => e.StoragePath).HasMaxLength(1000).IsRequired();
            entity.Property(e => e.FileSha256).HasMaxLength(64);

            // ----- Revision tracking -----
            entity.Property(e => e.RevisionNumber).HasMaxLength(100);
            entity.Property(e => e.Remarks).HasMaxLength(1000);

            // ----- Audit -----
            entity.Property(e => e.FetchedBy).HasMaxLength(200);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            entity.HasOne(e => e.ATARecord)
                .WithMany()
                .HasForeignKey(e => e.ATARecordId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.ATARecordId);
            entity.HasIndex(e => e.ShopId);
            entity.HasIndex(e => e.PartNumber);
            entity.HasIndex(e => e.TaskDefinitionCode);

            // Backs the "latest task card for this P/N + task definition" lookup used by
            // the Task Card tab and by the de-duplication check on re-fetch.
            entity.HasIndex(e => new { e.PartNumber, e.TaskDefinitionCode, e.IsLatest });
        });

        // ===== Form918FAA Configuration =====
        modelBuilder.Entity<Form918FAA>(entity =>
        {
            entity.ToTable("Form918FAAs");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FormNumber).HasMaxLength(100);
            entity.Property(e => e.RevisionNumber).HasMaxLength(50);
            entity.Property(e => e.RepairStationName).HasMaxLength(200);
            entity.Property(e => e.CertificateNumber).HasMaxLength(100);
            entity.Property(e => e.Address).HasMaxLength(500);
            entity.Property(e => e.ATAChapterCode).HasMaxLength(100);
            entity.Property(e => e.ComponentDescription).HasMaxLength(500);
            entity.Property(e => e.PartNumber).HasMaxLength(200);
            entity.Property(e => e.Manufacturer).HasMaxLength(200);
            entity.Property(e => e.ModelDesignation).HasMaxLength(200);
            entity.Property(e => e.LimitationsRemarks).HasMaxLength(2000);
            entity.Property(e => e.SpecialEquipment).HasMaxLength(2000);
            entity.Property(e => e.TechnicalData).HasMaxLength(2000);
            entity.Property(e => e.PreparedBy).HasMaxLength(200);
            entity.Property(e => e.ApprovedBy).HasMaxLength(200);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            entity.HasOne(e => e.ATARecord)
                .WithMany()
                .HasForeignKey(e => e.ATARecordId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Shop)
                .WithMany()
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => e.ATARecordId);
            entity.HasIndex(e => e.ShopId);
        });

        // ===== Form918ACAA Configuration =====
        modelBuilder.Entity<Form918ACAA>(entity =>
        {
            entity.ToTable("Form918ACAAs");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FormNumber).HasMaxLength(100);
            entity.Property(e => e.RevisionNumber).HasMaxLength(50);
            entity.Property(e => e.OrganizationName).HasMaxLength(200);
            entity.Property(e => e.ApprovalReference).HasMaxLength(100);
            entity.Property(e => e.Address).HasMaxLength(500);
            entity.Property(e => e.ATAChapterCode).HasMaxLength(100);
            entity.Property(e => e.ComponentDescription).HasMaxLength(500);
            entity.Property(e => e.PartNumber).HasMaxLength(200);
            entity.Property(e => e.Manufacturer).HasMaxLength(200);
            entity.Property(e => e.ModelDesignation).HasMaxLength(200);
            entity.Property(e => e.LimitationsRemarks).HasMaxLength(2000);
            entity.Property(e => e.SpecialEquipment).HasMaxLength(2000);
            entity.Property(e => e.TechnicalData).HasMaxLength(2000);
            entity.Property(e => e.AccountableManager).HasMaxLength(200);
            entity.Property(e => e.QualityManager).HasMaxLength(200);
            entity.Property(e => e.PreparedBy).HasMaxLength(200);
            entity.Property(e => e.ApprovedBy).HasMaxLength(200);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            entity.HasOne(e => e.ATARecord)
                .WithMany()
                .HasForeignKey(e => e.ATARecordId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Shop)
                .WithMany()
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => e.ATARecordId);
            entity.HasIndex(e => e.ShopId);
        });

        // ===== SBForm Configuration =====
        modelBuilder.Entity<SBForm>(entity =>
        {
            entity.ToTable("SBForms");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FormNumber).HasMaxLength(100);
            entity.Property(e => e.RevisionNumber).HasMaxLength(50);
            entity.Property(e => e.SBNumber).HasMaxLength(100).IsRequired();
            entity.Property(e => e.SBTitle).HasMaxLength(500);
            entity.Property(e => e.SBRevision).HasMaxLength(50);
            entity.Property(e => e.IssuedBy).HasMaxLength(200);
            entity.Property(e => e.ATAChapterCode).HasMaxLength(100);
            entity.Property(e => e.AffectedPartNumber).HasMaxLength(200);
            entity.Property(e => e.AffectedSerialNumbers).HasMaxLength(500);
            entity.Property(e => e.ComplianceMethod).HasMaxLength(2000);
            entity.Property(e => e.Remarks).HasMaxLength(2000);
            entity.Property(e => e.EvaluatedBy).HasMaxLength(200);
            entity.Property(e => e.ApprovedBy).HasMaxLength(200);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            entity.HasOne(e => e.ATARecord)
                .WithMany()
                .HasForeignKey(e => e.ATARecordId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Shop)
                .WithMany()
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => e.ATARecordId);
            entity.HasIndex(e => e.SBNumber);
        });

        // ===== ADForm Configuration =====
        modelBuilder.Entity<ADForm>(entity =>
        {
            entity.ToTable("ADForms");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FormNumber).HasMaxLength(100);
            entity.Property(e => e.RevisionNumber).HasMaxLength(50);
            entity.Property(e => e.ADNumber).HasMaxLength(100).IsRequired();
            entity.Property(e => e.ADTitle).HasMaxLength(500);
            entity.Property(e => e.ADRevision).HasMaxLength(50);
            entity.Property(e => e.IssuingAuthority).HasMaxLength(200);
            entity.Property(e => e.ATAChapterCode).HasMaxLength(100);
            entity.Property(e => e.AffectedPartNumber).HasMaxLength(200);
            entity.Property(e => e.AffectedModels).HasMaxLength(500);
            entity.Property(e => e.ComplianceMethod).HasMaxLength(2000);
            entity.Property(e => e.RecurringInterval).HasMaxLength(500);
            entity.Property(e => e.Remarks).HasMaxLength(2000);
            entity.Property(e => e.EvaluatedBy).HasMaxLength(200);
            entity.Property(e => e.ApprovedBy).HasMaxLength(200);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            entity.HasOne(e => e.ATARecord)
                .WithMany()
                .HasForeignKey(e => e.ATARecordId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Shop)
                .WithMany()
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => e.ATARecordId);
            entity.HasIndex(e => e.ADNumber);
        });

        // ===== PeriodicSelfAudit Configuration =====
        modelBuilder.Entity<PeriodicSelfAudit>(entity =>
        {
            entity.ToTable("PeriodicSelfAudits");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FormNumber).HasMaxLength(100);
            entity.Property(e => e.RevisionNumber).HasMaxLength(50);
            entity.Property(e => e.AuditTitle).HasMaxLength(200);
            entity.Property(e => e.AuditorName).HasMaxLength(200);
            entity.Property(e => e.AuditorId).HasMaxLength(100);
            entity.Property(e => e.ShopName).HasMaxLength(200);
            entity.Property(e => e.ATAChapterCode).HasMaxLength(100);
            entity.Property(e => e.ComponentPartNumber).HasMaxLength(200);
            entity.Property(e => e.ChecklistItemsJson).HasColumnType("nvarchar(max)");
            entity.Property(e => e.Findings).HasMaxLength(2000);
            entity.Property(e => e.CorrectiveActions).HasMaxLength(2000);
            entity.Property(e => e.Recommendations).HasMaxLength(2000);
            entity.Property(e => e.ReviewedBy).HasMaxLength(200);
            entity.Property(e => e.ApprovedBy).HasMaxLength(200);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            entity.HasOne(e => e.ATARecord)
                .WithMany()
                .HasForeignKey(e => e.ATARecordId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Shop)
                .WithMany()
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => e.ATARecordId);
            entity.HasIndex(e => e.ShopId);
        });

        // ===== RequestLetter Configuration =====
        modelBuilder.Entity<RequestLetter>(entity =>
        {
            entity.ToTable("RequestLetters");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FormNumber).HasMaxLength(100);
            entity.Property(e => e.RevisionNumber).HasMaxLength(50);
            entity.Property(e => e.LetterReferenceNo).HasMaxLength(100);
            entity.Property(e => e.AddressedTo).HasMaxLength(200);
            entity.Property(e => e.AddressedToTitle).HasMaxLength(200);
            entity.Property(e => e.AddressedToOrganization).HasMaxLength(500);
            entity.Property(e => e.Subject).HasMaxLength(200);
            entity.Property(e => e.Body).HasMaxLength(4000);
            entity.Property(e => e.RequestedCapability).HasMaxLength(200);
            entity.Property(e => e.ATAChapterCode).HasMaxLength(100);
            entity.Property(e => e.ComponentPartNumber).HasMaxLength(200);
            entity.Property(e => e.ComponentDescription).HasMaxLength(500);
            entity.Property(e => e.Manufacturer).HasMaxLength(200);
            entity.Property(e => e.SenderName).HasMaxLength(200);
            entity.Property(e => e.SenderTitle).HasMaxLength(200);
            entity.Property(e => e.SenderSignature).HasMaxLength(200);
            entity.Property(e => e.ApprovedBy).HasMaxLength(200);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            entity.HasOne(e => e.ATARecord)
                .WithMany()
                .HasForeignKey(e => e.ATARecordId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Shop)
                .WithMany()
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => e.ATARecordId);
        });

        // ===== TableOfContent Configuration =====
        modelBuilder.Entity<TableOfContent>(entity =>
        {
            entity.ToTable("TableOfContents");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FormNumber).HasMaxLength(100);
            entity.Property(e => e.RevisionNumber).HasMaxLength(50);
            entity.Property(e => e.Title).HasMaxLength(200);
            entity.Property(e => e.ATAChapterCode).HasMaxLength(100);
            entity.Property(e => e.ComponentPartNumber).HasMaxLength(200);
            entity.Property(e => e.ComponentDescription).HasMaxLength(500);
            entity.Property(e => e.CMMDocumentNumber).HasMaxLength(200);
            entity.Property(e => e.CMMRevision).HasMaxLength(100);
            entity.Property(e => e.CMMPublisher).HasMaxLength(200);
            entity.Property(e => e.CMMRemarks).HasMaxLength(2000);
            entity.Property(e => e.TaskCardsJson).HasColumnType("nvarchar(max)");
            entity.Property(e => e.OtherDocumentsJson).HasColumnType("nvarchar(max)");
            entity.Property(e => e.ContentItemsJson).HasColumnType("nvarchar(max)");
            entity.Property(e => e.PreparedBy).HasMaxLength(200);
            entity.Property(e => e.ReviewedBy).HasMaxLength(200);
            entity.Property(e => e.ApprovedBy).HasMaxLength(200);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            // ===== AMENDED v4: workflow ownership columns are bigint (long?) =====
            entity.Property(e => e.ReviewComments).HasMaxLength(1000);
            entity.Property(e => e.RejectionReason).HasMaxLength(1000);
            entity.Property(e => e.DelegationReason).HasMaxLength(500);

            entity.Property(e => e.PreparedByUserId).HasColumnType("bigint");
            entity.Property(e => e.SubmittedByUserId).HasColumnType("bigint");
            entity.Property(e => e.ReviewedByUserId).HasColumnType("bigint");
            entity.Property(e => e.ApprovedByUserId).HasColumnType("bigint");
            entity.Property(e => e.CurrentApproverUserId).HasColumnType("bigint");
            entity.Property(e => e.DelegatedToUserId).HasColumnType("bigint");

            entity.HasOne(e => e.ATARecord)
                .WithMany()
                .HasForeignKey(e => e.ATARecordId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Shop)
                .WithMany()
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => e.ATARecordId);

            // AMENDED v4: indexes backing the "Pending my approval" inbox queries.
            entity.HasIndex(e => e.ApprovalStatus);
            entity.HasIndex(e => e.CurrentApproverUserId);
            entity.HasIndex(e => e.DelegatedToUserId);
            entity.HasIndex(e => e.SubmittedByUserId);
        });

        // ===== ToolNeedAnalysisReport Configuration =====
        modelBuilder.Entity<ToolNeedAnalysisReport>(entity =>
        {
            entity.ToTable("ToolNeedAnalysisReports");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FormNumber).HasMaxLength(100);
            entity.Property(e => e.RevisionNumber).HasMaxLength(50);
            entity.Property(e => e.ReportTitle).HasMaxLength(200);
            entity.Property(e => e.ATAChapterCode).HasMaxLength(100);
            entity.Property(e => e.ComponentPartNumber).HasMaxLength(200);
            entity.Property(e => e.ComponentDescription).HasMaxLength(500);
            entity.Property(e => e.CMMReference).HasMaxLength(200);
            entity.Property(e => e.ToolItemsJson).HasColumnType("nvarchar(max)");
            entity.Property(e => e.Summary).HasMaxLength(2000);
            entity.Property(e => e.Recommendations).HasMaxLength(2000);
            entity.Property(e => e.PreparedBy).HasMaxLength(200);
            entity.Property(e => e.ReviewedBy).HasMaxLength(200);
            entity.Property(e => e.ApprovedBy).HasMaxLength(200);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            entity.HasOne(e => e.ATARecord)
                .WithMany()
                .HasForeignKey(e => e.ATARecordId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Shop)
                .WithMany()
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => e.ATARecordId);
        });

        // ===== SimilarTechnologyEvaluation Configuration =====
        modelBuilder.Entity<SimilarTechnologyEvaluation>(entity =>
        {
            entity.ToTable("SimilarTechnologyEvaluations");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FormNumber).HasMaxLength(100);
            entity.Property(e => e.RevisionNumber).HasMaxLength(50);
            entity.Property(e => e.EvaluationTitle).HasMaxLength(500);
            entity.Property(e => e.ATAChapterCode).HasMaxLength(100);
            entity.Property(e => e.ComponentPartNumber).HasMaxLength(200);
            entity.Property(e => e.ComponentDescription).HasMaxLength(500);
            entity.Property(e => e.Manufacturer).HasMaxLength(200);
            entity.Property(e => e.ReferenceComponentPartNumber).HasMaxLength(200);
            entity.Property(e => e.ReferenceComponentDescription).HasMaxLength(500);
            entity.Property(e => e.ReferenceManufacturer).HasMaxLength(200);
            entity.Property(e => e.SimilarityJustification).HasMaxLength(2000);
            entity.Property(e => e.TechnologyComparison).HasMaxLength(2000);
            entity.Property(e => e.MaterialsComparison).HasMaxLength(2000);
            entity.Property(e => e.ProcessComparison).HasMaxLength(2000);
            entity.Property(e => e.ToolingComparison).HasMaxLength(2000);
            entity.Property(e => e.SimpleTaskJustification).HasMaxLength(2000);
            entity.Property(e => e.Limitations).HasMaxLength(2000);
            entity.Property(e => e.AdditionalRequirements).HasMaxLength(2000);
            entity.Property(e => e.EvaluatedBy).HasMaxLength(200);
            entity.Property(e => e.ApprovedBy).HasMaxLength(200);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            entity.HasOne(e => e.ATARecord)
                .WithMany()
                .HasForeignKey(e => e.ATARecordId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Shop)
                .WithMany()
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => e.ATARecordId);
        });

        // ===== AlternateToolsEquivalency Configuration =====
        modelBuilder.Entity<AlternateToolsEquivalency>(entity =>
        {
            entity.ToTable("AlternateToolsEquivalencies");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FormNumber).HasMaxLength(100);
            entity.Property(e => e.RevisionNumber).HasMaxLength(50);
            entity.Property(e => e.ATAChapterCode).HasMaxLength(100);
            entity.Property(e => e.ComponentPartNumber).HasMaxLength(200);
            entity.Property(e => e.ComponentDescription).HasMaxLength(500);
            entity.Property(e => e.OriginalToolPartNumber).HasMaxLength(200);
            entity.Property(e => e.OriginalToolDescription).HasMaxLength(500);
            entity.Property(e => e.OriginalToolManufacturer).HasMaxLength(200);
            entity.Property(e => e.AlternateToolPartNumber).HasMaxLength(200);
            entity.Property(e => e.AlternateToolDescription).HasMaxLength(500);
            entity.Property(e => e.AlternateToolManufacturer).HasMaxLength(200);
            entity.Property(e => e.EquivalencyJustification).HasMaxLength(2000);
            entity.Property(e => e.TechnicalBasis).HasMaxLength(2000);
            entity.Property(e => e.CertificateReference).HasMaxLength(500);
            entity.Property(e => e.Conditions).HasMaxLength(2000);
            entity.Property(e => e.AlternateToolsListJson).HasColumnType("nvarchar(max)");
            entity.Property(e => e.EvaluatedBy).HasMaxLength(200);
            entity.Property(e => e.ApprovedBy).HasMaxLength(200);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            entity.HasOne(e => e.ATARecord)
                .WithMany()
                .HasForeignKey(e => e.ATARecordId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Shop)
                .WithMany()
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => e.ATARecordId);
        });

        // ===== InhouseManufacturedToolsCard Configuration =====
        modelBuilder.Entity<InhouseManufacturedToolsCard>(entity =>
        {
            entity.ToTable("InhouseManufacturedToolsCards");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FormNumber).HasMaxLength(100);
            entity.Property(e => e.RevisionNumber).HasMaxLength(50);
            entity.Property(e => e.JobCardNumber).HasMaxLength(100);
            entity.Property(e => e.ATAChapterCode).HasMaxLength(100);
            entity.Property(e => e.ToolName).HasMaxLength(200);
            entity.Property(e => e.ToolPartNumber).HasMaxLength(200);
            entity.Property(e => e.ToolDescription).HasMaxLength(500);
            entity.Property(e => e.ToolDrawingReference).HasMaxLength(200);
            entity.Property(e => e.MaterialSpecification).HasMaxLength(200);
            entity.Property(e => e.ManufacturingProcess).HasMaxLength(2000);
            entity.Property(e => e.QualityRequirements).HasMaxLength(2000);
            entity.Property(e => e.InspectionCriteria).HasMaxLength(2000);
            entity.Property(e => e.AcceptanceCriteria).HasMaxLength(2000);
            entity.Property(e => e.CalibrationInterval).HasMaxLength(100);
            entity.Property(e => e.CalibrationMethod).HasMaxLength(500);
            entity.Property(e => e.InstructionStepsJson).HasColumnType("nvarchar(max)");
            entity.Property(e => e.ManufacturedBy).HasMaxLength(200);
            entity.Property(e => e.InspectedBy).HasMaxLength(200);
            entity.Property(e => e.ApprovedBy).HasMaxLength(200);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            entity.HasOne(e => e.ATARecord)
                .WithMany()
                .HasForeignKey(e => e.ATARecordId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Shop)
                .WithMany()
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => e.ATARecordId);
        });

        // ===== FacilityEvaluation Configuration =====
        modelBuilder.Entity<FacilityEvaluation>(entity =>
        {
            entity.ToTable("FacilityEvaluations");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FormNumber).HasMaxLength(100);
            entity.Property(e => e.RevisionNumber).HasMaxLength(50);
            entity.Property(e => e.FacilityType).HasMaxLength(50).IsRequired();
            entity.Property(e => e.FacilityName).HasMaxLength(200);
            entity.Property(e => e.FacilityLocation).HasMaxLength(500);
            entity.Property(e => e.ATAChapterCode).HasMaxLength(100);
            entity.Property(e => e.ComponentPartNumber).HasMaxLength(200);
            entity.Property(e => e.ComponentDescription).HasMaxLength(500);
            entity.Property(e => e.RequirementsDescription).HasMaxLength(2000);
            entity.Property(e => e.CurrentCapabilities).HasMaxLength(2000);
            entity.Property(e => e.GapAnalysis).HasMaxLength(2000);
            entity.Property(e => e.TemperatureRequirements).HasMaxLength(1000);
            entity.Property(e => e.HumidityRequirements).HasMaxLength(1000);
            entity.Property(e => e.VentilationRequirements).HasMaxLength(1000);
            entity.Property(e => e.LightingRequirements).HasMaxLength(1000);
            entity.Property(e => e.CleanlinessRequirements).HasMaxLength(1000);
            entity.Property(e => e.CleaningMethodRequired).HasMaxLength(1000);
            entity.Property(e => e.CleaningEquipmentRequired).HasMaxLength(1000);
            entity.Property(e => e.ChemicalsRequired).HasMaxLength(1000);
            entity.Property(e => e.RepairEquipmentRequired).HasMaxLength(1000);
            entity.Property(e => e.RepairProcessCapability).HasMaxLength(1000);
            entity.Property(e => e.EvaluationItemsJson).HasColumnType("nvarchar(max)");
            entity.Property(e => e.CorrectiveActions).HasMaxLength(2000);
            entity.Property(e => e.Remarks).HasMaxLength(2000);
            entity.Property(e => e.EvaluatedBy).HasMaxLength(200);
            entity.Property(e => e.ApprovedBy).HasMaxLength(200);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            entity.HasOne(e => e.ATARecord)
                .WithMany()
                .HasForeignKey(e => e.ATARecordId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Shop)
                .WithMany()
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => e.ATARecordId);
            entity.HasIndex(e => e.FacilityType);
        });

        // ===== ConsumablesList Configuration =====
        modelBuilder.Entity<ConsumablesList>(entity =>
        {
            entity.ToTable("ConsumablesLists");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FormNumber).HasMaxLength(100);
            entity.Property(e => e.RevisionNumber).HasMaxLength(50);
            entity.Property(e => e.ATAChapterCode).HasMaxLength(100);
            entity.Property(e => e.ComponentPartNumber).HasMaxLength(200);
            entity.Property(e => e.ComponentDescription).HasMaxLength(500);
            entity.Property(e => e.CMMReference).HasMaxLength(200);
            entity.Property(e => e.ConsumableItemsJson).HasColumnType("nvarchar(max)");
            entity.Property(e => e.Summary).HasMaxLength(2000);
            entity.Property(e => e.ProcurementNotes).HasMaxLength(2000);
            entity.Property(e => e.PreparedBy).HasMaxLength(200);
            entity.Property(e => e.ReviewedBy).HasMaxLength(200);
            entity.Property(e => e.ApprovedBy).HasMaxLength(200);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            entity.HasOne(e => e.ATARecord)
                .WithMany()
                .HasForeignKey(e => e.ATARecordId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Shop)
                .WithMany()
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => e.ATARecordId);
        });

        // ===== AlternateConsumableDeclaration Configuration =====
        modelBuilder.Entity<AlternateConsumableDeclaration>(entity =>
        {
            entity.ToTable("AlternateConsumableDeclarations");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FormNumber).HasMaxLength(100);
            entity.Property(e => e.RevisionNumber).HasMaxLength(50);
            entity.Property(e => e.ATAChapterCode).HasMaxLength(100);
            entity.Property(e => e.ComponentPartNumber).HasMaxLength(200);
            entity.Property(e => e.ComponentDescription).HasMaxLength(500);
            entity.Property(e => e.OriginalConsumableName).HasMaxLength(200);
            entity.Property(e => e.OriginalSpecification).HasMaxLength(200);
            entity.Property(e => e.OriginalManufacturer).HasMaxLength(200);
            entity.Property(e => e.OriginalPartNumber).HasMaxLength(200);
            entity.Property(e => e.AlternateConsumableName).HasMaxLength(200);
            entity.Property(e => e.AlternateSpecification).HasMaxLength(200);
            entity.Property(e => e.AlternateManufacturer).HasMaxLength(200);
            entity.Property(e => e.AlternatePartNumber).HasMaxLength(200);
            entity.Property(e => e.EquivalencyBasis).HasMaxLength(2000);
            entity.Property(e => e.TechnicalJustification).HasMaxLength(2000);
            entity.Property(e => e.ReferenceDocument).HasMaxLength(500);
            entity.Property(e => e.ManufacturerApprovalReference).HasMaxLength(500);
            entity.Property(e => e.Conditions).HasMaxLength(2000);
            entity.Property(e => e.Limitations).HasMaxLength(2000);
            entity.Property(e => e.AlternateConsumablesListJson).HasColumnType("nvarchar(max)");
            entity.Property(e => e.DeclaredBy).HasMaxLength(200);
            entity.Property(e => e.ReviewedBy).HasMaxLength(200);
            entity.Property(e => e.ApprovedBy).HasMaxLength(200);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            entity.HasOne(e => e.ATARecord)
                .WithMany()
                .HasForeignKey(e => e.ATARecordId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Shop)
                .WithMany()
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => e.ATARecordId);
        });

        // ===== TrainingRecord Configuration =====
        modelBuilder.Entity<TrainingRecord>(entity =>
        {
            entity.ToTable("TrainingRecords");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FormNumber).HasMaxLength(100);
            entity.Property(e => e.RevisionNumber).HasMaxLength(50);
            entity.Property(e => e.TrainingType).HasMaxLength(100).IsRequired();
            entity.Property(e => e.TrainingTitle).HasMaxLength(200);
            entity.Property(e => e.ATAChapterCode).HasMaxLength(100);
            entity.Property(e => e.ComponentPartNumber).HasMaxLength(200);
            entity.Property(e => e.ComponentDescription).HasMaxLength(500);
            entity.Property(e => e.EmployeeName).HasMaxLength(200);
            entity.Property(e => e.EmployeeId).HasMaxLength(100);
            entity.Property(e => e.EmployeeTitle).HasMaxLength(200);
            entity.Property(e => e.Department).HasMaxLength(200);
            entity.Property(e => e.CourseName).HasMaxLength(500);
            entity.Property(e => e.CourseProvider).HasMaxLength(200);
            entity.Property(e => e.CertificateNumber).HasMaxLength(100);
            entity.Property(e => e.AssessmentCriteria).HasMaxLength(2000);
            entity.Property(e => e.AssessmentResults).HasMaxLength(2000);
            entity.Property(e => e.CompetencyDeclaration).HasMaxLength(2000);
            entity.Property(e => e.InspectionAuthority).HasMaxLength(500);
            entity.Property(e => e.InspectionScope).HasMaxLength(2000);
            entity.Property(e => e.TrainingHistoryJson).HasColumnType("nvarchar(max)");
            entity.Property(e => e.AssessedBy).HasMaxLength(200);
            entity.Property(e => e.ApprovedBy).HasMaxLength(200);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            entity.HasOne(e => e.ATARecord)
                .WithMany()
                .HasForeignKey(e => e.ATARecordId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Shop)
                .WithMany()
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => e.ATARecordId);
            entity.HasIndex(e => e.TrainingType);
        });

        // ===== Component Configuration =====
        modelBuilder.Entity<Component>(entity =>
        {
            entity.ToTable("Components");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.PartNumber).HasMaxLength(100).IsRequired();
            entity.Property(e => e.Description).HasMaxLength(500).IsRequired();
            entity.Property(e => e.Manufacturer).HasMaxLength(200);
            entity.Property(e => e.ModelSeries).HasMaxLength(100);
            entity.HasIndex(e => e.PartNumber);

            entity.HasOne(e => e.ATAChapter)
                .WithMany(a => a.Components)
                .HasForeignKey(e => e.ATAChapterId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Shop)
                .WithMany(s => s.Components)
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ===== CapabilityAssessment Configuration =====
        modelBuilder.Entity<CapabilityAssessment>(entity =>
        {
            entity.ToTable("CapabilityAssessments");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Justification).HasMaxLength(2000);
            entity.Property(e => e.Limitations).HasMaxLength(2000);
            entity.Property(e => e.CorrectiveActions).HasMaxLength(2000);
            entity.Property(e => e.AssessedBy).HasMaxLength(200);
            entity.Property(e => e.ApprovedBy).HasMaxLength(200);

            entity.HasOne(e => e.Component)
                .WithMany(c => c.CapabilityAssessments)
                .HasForeignKey(e => e.ComponentId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Shop)
                .WithMany(s => s.CapabilityAssessments)
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ===== AirworthinessDirective Configuration =====
        modelBuilder.Entity<AirworthinessDirective>(entity =>
        {
            entity.ToTable("AirworthinessDirectives");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.ADNumber).HasMaxLength(50).IsRequired();
            entity.Property(e => e.Title).HasMaxLength(500).IsRequired();
            entity.Property(e => e.Description).HasMaxLength(2000);
            entity.Property(e => e.ComplianceMethod).HasMaxLength(2000);
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.HasIndex(e => e.ADNumber);

            entity.HasOne(e => e.Component)
                .WithMany(c => c.AirworthinessDirectives)
                .HasForeignKey(e => e.ComponentId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ===== ServiceBulletin Configuration =====
        modelBuilder.Entity<ServiceBulletin>(entity =>
        {
            entity.ToTable("ServiceBulletins");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.SBNumber).HasMaxLength(50).IsRequired();
            entity.Property(e => e.Title).HasMaxLength(500).IsRequired();
            entity.Property(e => e.Description).HasMaxLength(2000);
            entity.Property(e => e.Revision).HasMaxLength(20);
            entity.Property(e => e.ComplianceNotes).HasMaxLength(2000);
            entity.HasIndex(e => e.SBNumber);

            entity.HasOne(e => e.Component)
                .WithMany(c => c.ServiceBulletins)
                .HasForeignKey(e => e.ComponentId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ===== ToolNeedsAnalysis Configuration =====
        modelBuilder.Entity<ToolNeedsAnalysis>(entity =>
        {
            entity.ToTable("ToolNeedsAnalyses");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.ToolName).HasMaxLength(200).IsRequired();
            entity.Property(e => e.ToolPartNumber).HasMaxLength(100);
            entity.Property(e => e.Description).HasMaxLength(500);
            entity.Property(e => e.Manufacturer).HasMaxLength(200);
            entity.Property(e => e.CalibrationInterval).HasMaxLength(100);
            entity.Property(e => e.StorageLocation).HasMaxLength(500);
            entity.Property(e => e.Notes).HasMaxLength(2000);

            entity.HasOne(e => e.Component)
                .WithMany(c => c.ToolNeedsAnalyses)
                .HasForeignKey(e => e.ComponentId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Shop)
                .WithMany(s => s.ToolNeedsAnalyses)
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ===== SelfAuditChecklist Configuration =====
        modelBuilder.Entity<SelfAuditChecklist>(entity =>
        {
            entity.ToTable("SelfAuditChecklists");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Section).HasMaxLength(100).IsRequired();
            entity.Property(e => e.ItemNumber).HasMaxLength(50);
            entity.Property(e => e.Question).HasMaxLength(1000).IsRequired();
            entity.Property(e => e.RegulatoryReference).HasMaxLength(500);
            entity.Property(e => e.Findings).HasMaxLength(2000);
            entity.Property(e => e.CorrectiveAction).HasMaxLength(2000);
            entity.Property(e => e.AssignedTo).HasMaxLength(200);

            entity.HasOne(e => e.Shop)
                .WithMany(s => s.SelfAuditChecklists)
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ===== EmployeeProficiencyRecord Configuration =====
        modelBuilder.Entity<EmployeeProficiencyRecord>(entity =>
        {
            entity.ToTable("EmployeeProficiencyRecords");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.EmployeeName).HasMaxLength(200).IsRequired();
            entity.Property(e => e.EmployeeId).HasMaxLength(50).IsRequired();
            entity.Property(e => e.JobTitle).HasMaxLength(200);
            entity.Property(e => e.Department).HasMaxLength(200);
            entity.Property(e => e.Certifications).HasMaxLength(500);
            entity.Property(e => e.SkillAreas).HasMaxLength(500);
            entity.Property(e => e.TrainingHistory).HasMaxLength(2000);
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.HasIndex(e => e.EmployeeId);

            entity.HasOne(e => e.Shop)
                .WithMany(s => s.EmployeeProficiencyRecords)
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ===== WorkflowAuditLog Configuration =====
        // AMENDED v2.0: Enhanced audit trail with user role tracking and improved indexing
        modelBuilder.Entity<WorkflowAuditLog>(entity =>
        {
            entity.ToTable("WorkflowAuditLogs");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Action).HasMaxLength(200).IsRequired();
            entity.Property(e => e.EntityType).HasMaxLength(100).IsRequired();
            entity.Property(e => e.PerformedBy).HasMaxLength(200).IsRequired();
            entity.Property(e => e.UserRole).HasMaxLength(100).IsRequired();  // NEW: Role context for audit compliance
            entity.Property(e => e.Details).HasMaxLength(2000);
            entity.Property(e => e.PreviousValues).HasMaxLength(2000);
            entity.Property(e => e.NewValues).HasMaxLength(2000);
            entity.Property(e => e.IpAddress).HasMaxLength(100);
            
            // Existing indexes for query optimization
            entity.HasIndex(e => new { e.EntityId, e.EntityType });
            entity.HasIndex(e => e.Timestamp);
            
            // NEW indexes for audit filtering and compliance reporting
            entity.HasIndex(e => e.UserRole)
                .HasDatabaseName("IX_WorkflowAuditLogs_UserRole");
            entity.HasIndex(e => new { e.EntityType, e.UserRole })
                .HasDatabaseName("IX_WorkflowAuditLogs_EntityType_UserRole");
            entity.HasIndex(e => e.WorkflowAction)
                .HasDatabaseName("IX_WorkflowAuditLogs_WorkflowAction");
        });

        // ===== ResponsibilityDelegation Configuration =====
        modelBuilder.Entity<ResponsibilityDelegation>(entity =>
        {
            entity.ToTable("ResponsibilityDelegations");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.DelegatedBy).HasMaxLength(200).IsRequired();
            entity.Property(e => e.DelegatedTo).HasMaxLength(200).IsRequired();
            entity.Property(e => e.Responsibility).HasMaxLength(500).IsRequired();
            entity.Property(e => e.Scope).HasMaxLength(2000);
            entity.Property(e => e.Conditions).HasMaxLength(2000);
            entity.Property(e => e.Notes).HasMaxLength(2000);

            entity.HasOne(e => e.Shop)
                .WithMany(s => s.ResponsibilityDelegations)
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // =================================================================================
        // AMENDED v11: workflow-engine mapping, now declared in THIS file.
        // =================================================================================
        ConfigureWorkflowEntities(modelBuilder);

        // =================================================================================
        // AMENDED v12: the tables that had NO DbSet and therefore NO migration until now.
        // Order matters only for readability - EF resolves the model as a whole.
        // =================================================================================
        ConfigureFolderAndTrackingEntities(modelBuilder);   // document A
        ConfigureDocumentationEntities(modelBuilder);       // document B
        ConfigureSectionEntities(modelBuilder);   
        ConfigureATARecordGovernance(modelBuilder);
    }

    // =====================================================================================
    // AMENDED v11: signature + workflow-step mapping (replaces ApplicationDbContext.Workflow.cs)
    //
    // Only THREE entities are mapped here, because only three are reachable from the DbSets
    // declared above:
    //   FormWorkflowStep      -> WorkflowSteps      (DbSet FormWorkflowSteps)
    //   FormSignature         -> FormSignatures     (DbSet FormSignatures)
    //   FormWorkflowInstance  -> WorkflowInstances  (discovered through the Instance
    //                                               navigation of the two entities above)
    //
    // The remaining classes of WorkflowEntities.cs (EvaluationFolder, EvaluationFolderItem,
    // ExpiryTracking, WorkflowNotification, CompetencyMatrixEntry,
    // ToolEquivalencyMatrixEntry, FolderRevisionLog) are intentionally NOT mapped: they have
    // no DbSet and no navigation reaching them, so EF ignores them and NO table is created
    // for them. Add a DbSet later if/when those features are implemented.
    //
    // Signature linkage (the requirement "link the stored signature image to the user id on
    // approval"): FormWorkflowStep.UserSignatureId and FormSignature.UserSignatureId are
    // optional FKs to UserSignatures, with DeleteBehavior.Restrict so an already-signed form
    // can never lose its signature evidence.
    // =====================================================================================

private static void ConfigureATARecordGovernance(ModelBuilder modelBuilder)
    {
        // ---------------- ATARecordSignature ----------------
        modelBuilder.Entity<ATARecordSignature>(entity =>
        {
            entity.ToTable("ATARecordSignatures");
            entity.HasKey(e => e.Id);

            entity.HasOne(e => e.Record)
                  .WithMany(r => r.Signatures)
                  .HasForeignKey(e => e.ATARecordId)
                  .OnDelete(DeleteBehavior.Restrict);

            // The trail query: all rows of one record, in stage order.
            entity.HasIndex(e => new { e.ATARecordId, e.StageOrder })
                  .HasDatabaseName("IX_ATARecordSignatures_Record_Stage");

            // "Which records did this person sign?"
            entity.HasIndex(e => e.UserId)
                  .HasDatabaseName("IX_ATARecordSignatures_UserId");

            entity.HasIndex(e => new { e.ATARecordId, e.Block, e.IsCurrent })
                  .HasDatabaseName("IX_ATARecordSignatures_Record_Block_Current");

            entity.Property(e => e.SignatureHash).HasMaxLength(128);
        });

        // ---------------- ATARecordCreationDelegation ----------------
        modelBuilder.Entity<ATARecordCreationDelegation>(entity =>
        {
            entity.ToTable("ATARecordCreationDelegations");
            entity.HasKey(e => e.Id);

            // "Do I currently hold a create-right?" — the hot path on every create.
            entity.HasIndex(e => new { e.DelegateUserId, e.Status, e.ExpiresAt })
                  .HasDatabaseName("IX_ATARecordCreationDelegations_Delegate_Status");

            entity.HasIndex(e => new { e.DelegatorUserId, e.Status })
                  .HasDatabaseName("IX_ATARecordCreationDelegations_Delegator_Status");
        });

        // ---------------- ATARecordAmendment ----------------
        modelBuilder.Entity<ATARecordAmendment>(entity =>
        {
            entity.ToTable("ATARecordAmendments");
            entity.HasKey(e => e.Id);

            entity.HasOne(e => e.Record)
                  .WithMany(r => r.Amendments)
                  .HasForeignKey(e => e.ATARecordId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.ATARecordId, e.Sequence })
                  .HasDatabaseName("IX_ATARecordAmendments_Record_Sequence");

            entity.HasIndex(e => e.AmendedByUserId)
                  .HasDatabaseName("IX_ATARecordAmendments_AmendedBy");
        });

        // ---------------- ATARecordShopRouting ----------------
        modelBuilder.Entity<ATARecordShopRouting>(entity =>
        {
            entity.ToTable("ATARecordShopRoutings");
            entity.HasKey(e => e.Id);

            entity.HasOne(e => e.Record)
                  .WithMany(r => r.ShopRoutings)
                  .HasForeignKey(e => e.ATARecordId)
                  .OnDelete(DeleteBehavior.Cascade);

            // One active routing row per (record, shop).
            entity.HasIndex(e => new { e.ATARecordId, e.TargetShopId })
                  .IsUnique()
                  .HasDatabaseName("UX_ATARecordShopRoutings_Record_Shop");

            // The STL inbox index: "what has been routed to me?"
            entity.HasIndex(e => new { e.ResolvedTeamLeaderUserId, e.Status, e.IsActive })
                  .HasDatabaseName("IX_ATARecordShopRoutings_STL_Inbox");

            entity.HasIndex(e => new { e.TargetShopId, e.IsActive })
                  .HasDatabaseName("IX_ATARecordShopRoutings_Shop_Active");
        });

        // ---------------- two new ATARecords indexes ----------------
        modelBuilder.Entity<ATARecord>(entity =>
        {
            entity.HasIndex(e => new { e.CreatedByUserId, e.CreatedAt })
                  .HasDatabaseName("IX_ATARecords_CreatedByUserId_CreatedAt");

            entity.HasIndex(e => e.CreatorRole)
                  .HasDatabaseName("IX_ATARecords_CreatorRole");
        });

        // ---------------- AMENDED v14: ArchiveEntry ----------------
        // Append-only archive index (invariant A1). No FK to ATARecords on purpose:
        // ItemId is a bare Guid so forms and folders can be archived without three
        // nullable foreign keys, and an archived row must survive even if the owning
        // record is later purged by a DBA outside the app.
        modelBuilder.Entity<ArchiveEntry>(entity =>
        {
            entity.ToTable("ArchiveEntries");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.ItemTitle).HasMaxLength(500);
            entity.Property(e => e.ItemReference).HasMaxLength(200);
            entity.Property(e => e.SectionCode).HasMaxLength(100);
            entity.Property(e => e.FormType).HasMaxLength(100);
            entity.Property(e => e.ATAChapterCode).HasMaxLength(10);
            entity.Property(e => e.ShopName).HasMaxLength(200);
            entity.Property(e => e.StatusBeforeArchiveLabel).HasMaxLength(100);
            entity.Property(e => e.ArchivedByName).HasMaxLength(200);
            entity.Property(e => e.ArchivedByRole).HasMaxLength(50);
            entity.Property(e => e.Reason).HasMaxLength(1000);
            entity.Property(e => e.LastEditedWhileArchivedByName).HasMaxLength(200);
            entity.Property(e => e.RestoredByName).HasMaxLength(200);
            entity.Property(e => e.RestoredByRole).HasMaxLength(50);
            entity.Property(e => e.RestoreReason).HasMaxLength(1000);
            entity.Property(e => e.PurgeRequestReason).HasMaxLength(1000);

            // The Archive sidebar list: "what is currently archived, newest first".
            entity.HasIndex(e => new { e.State, e.ArchivedAt })
                  .HasDatabaseName("IX_ArchiveEntries_State_ArchivedAt");

            // Per-ATA-chapter filtering of the Archive.
            entity.HasIndex(e => e.ATARecordId)
                  .HasDatabaseName("IX_ArchiveEntries_ATARecordId");

            // Resolve an item to its current archive row (ItemId is not unique: an
            // item can go through several revoke/restore cycles, each an append row).
            entity.HasIndex(e => new { e.ItemKind, e.ItemId })
                  .HasDatabaseName("IX_ArchiveEntries_Item");

            // "Who did this" audit query.
            entity.HasIndex(e => e.ArchivedByUserId)
                  .HasDatabaseName("IX_ArchiveEntries_ArchivedBy");
        });
    }

    private static void ConfigureWorkflowEntities(ModelBuilder modelBuilder)
    {
        // ===== FormWorkflowInstance Configuration =====
        modelBuilder.Entity<FormWorkflowInstance>(entity =>
        {
            entity.ToTable("WorkflowInstances");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.FormType).HasMaxLength(100).IsRequired();
            entity.Property(e => e.FormNo).HasMaxLength(50);
            entity.Property(e => e.Section).HasMaxLength(100);
            entity.Property(e => e.Title).HasMaxLength(300);
            entity.Property(e => e.CurrentAssignmentUnit).HasMaxLength(50);
            entity.Property(e => e.OriginatorRole).HasMaxLength(50);
            entity.Property(e => e.OriginatorName).HasMaxLength(200);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            // Flattened form snapshot used to re-evaluate the automatic skip conditions.
            entity.Property(e => e.FormFieldsSnapshotJson).HasColumnType("nvarchar(max)");

            // User ids map to User.Id (long) -> bigint.
            entity.Property(e => e.OriginatorUserId).HasColumnType("bigint");
            entity.Property(e => e.CurrentAssigneeUserId).HasColumnType("bigint");

            // Backs the "Pending my action" inbox and the folder / ATA drill-downs.
            entity.HasIndex(e => e.FormSubmissionId);
            entity.HasIndex(e => e.EvaluationFolderId);
            entity.HasIndex(e => e.ATARecordId);
            entity.HasIndex(e => e.ShopId);
            entity.HasIndex(e => e.FormType);
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.CurrentAssigneeUserId);
            entity.HasIndex(e => e.OriginatorUserId);
            entity.HasIndex(e => e.ExpiresAt);
        });

        // ===== FormWorkflowStep Configuration =====
        modelBuilder.Entity<FormWorkflowStep>(entity =>
        {
            entity.ToTable("WorkflowSteps");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.Title).HasMaxLength(300);
            entity.Property(e => e.EligibleRolesCsv).HasMaxLength(500);
            entity.Property(e => e.AssignerRolesCsv).HasMaxLength(500);
            entity.Property(e => e.AssignmentUnit).HasMaxLength(50);
            entity.Property(e => e.SkipConditionField).HasMaxLength(100);
            entity.Property(e => e.SkipWhenValue).HasMaxLength(100);
            entity.Property(e => e.SkipReasonTemplate).HasMaxLength(500);
            entity.Property(e => e.SkipReason).HasMaxLength(500);
            entity.Property(e => e.AssignedToName).HasMaxLength(200);
            entity.Property(e => e.AssignedToRole).HasMaxLength(50);
            entity.Property(e => e.ActedByName).HasMaxLength(200);
            entity.Property(e => e.ActedByRole).HasMaxLength(50);
            entity.Property(e => e.Comments).HasMaxLength(1000);
            entity.Property(e => e.DelegationReason).HasMaxLength(500);
            entity.Property(e => e.ChecklistItemsJson).HasColumnType("nvarchar(max)");

            // Signature captured when this step is executed.
            entity.Property(e => e.SignatureName).HasMaxLength(200);
            entity.Property(e => e.SignatureRole).HasMaxLength(50);
            entity.Property(e => e.SignatureHash).HasMaxLength(128);
            entity.Property(e => e.SignatureStoragePath).HasMaxLength(1000);

            entity.Property(e => e.AssignedToUserId).HasColumnType("bigint");
            entity.Property(e => e.AssignedByUserId).HasColumnType("bigint");
            entity.Property(e => e.ActedByUserId).HasColumnType("bigint");
            entity.Property(e => e.DelegatedByUserId).HasColumnType("bigint");

            entity.HasOne(e => e.Instance)
                .WithMany(i => i.Steps)
                .HasForeignKey(e => e.FormWorkflowInstanceId)
                .OnDelete(DeleteBehavior.Cascade);

            // Resolved signature image of the acting user. Restrict: never lose the evidence.
            entity.HasOne<UserSignature>()
                .WithMany()
                .HasForeignKey(e => e.UserSignatureId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.FormWorkflowInstanceId, e.StepNo }).IsUnique();
            entity.HasIndex(e => e.State);
            entity.HasIndex(e => e.AssignedToUserId);
            entity.HasIndex(e => e.ActedByUserId);
            entity.HasIndex(e => e.UserSignatureId);
        });

        // ===== FormSignature Configuration =====
        modelBuilder.Entity<FormSignature>(entity =>
        {
            entity.ToTable("FormSignatures");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.BlockCaption).HasMaxLength(50);
            entity.Property(e => e.PersonName).HasMaxLength(200);
            entity.Property(e => e.PersonRole).HasMaxLength(50);
            entity.Property(e => e.PersonRoleLabel).HasMaxLength(100);
            entity.Property(e => e.SignatureHash).HasMaxLength(128);
            entity.Property(e => e.Remarks).HasMaxLength(500);

            // Frozen copy of the applied signature file, so re-printing the PDF years later
            // reproduces the original document even if the admin later replaces the file.
            entity.Property(e => e.SignatureStoragePath).HasMaxLength(1000);
            entity.Property(e => e.SignatureFileName).HasMaxLength(260);
            entity.Property(e => e.SignatureContentType).HasMaxLength(128);
            entity.Property(e => e.SignatureFileSha256).HasMaxLength(64);

            entity.Property(e => e.UserId).HasColumnType("bigint");

            entity.HasOne(e => e.Instance)
                .WithMany(i => i.Signatures)
                .HasForeignKey(e => e.FormWorkflowInstanceId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne<UserSignature>()
                .WithMany()
                .HasForeignKey(e => e.UserSignatureId)
                .OnDelete(DeleteBehavior.Restrict);

            // One signature line per block per instance (Prepared by / Reviewed by / ...).
            entity.HasIndex(e => new { e.FormWorkflowInstanceId, e.Block, e.StepNo }).IsUnique();
            entity.HasIndex(e => e.FormSubmissionId);
            entity.HasIndex(e => e.EvaluationFolderId);
            entity.HasIndex(e => e.UserId);
            entity.HasIndex(e => e.UserSignatureId);
        });
    }

private static void ConfigureSectionEntities(ModelBuilder modelBuilder)
    {
        // ================================ ATARecordAssignment ============================
        // Requirement #4 made auditable: WHO the record was handed to, BY WHOM, WHY, and how
        // many times it was re-assigned.
        modelBuilder.Entity<ATARecordAssignment>(entity =>
        {
            entity.ToTable("ATARecordAssignments");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.AssignedByName).HasMaxLength(200);
            entity.Property(e => e.AssignedByRole).HasMaxLength(50);
            entity.Property(e => e.AssignedToName).HasMaxLength(200);
            entity.Property(e => e.AssignedToRole).HasMaxLength(50);
            entity.Property(e => e.Notes).HasMaxLength(500);

            // User ids map to User.Id (long) -> bigint. Never uniqueidentifier.
            entity.Property(e => e.AssignedByUserId).HasColumnType("bigint");
            entity.Property(e => e.AssignedToUserId).HasColumnType("bigint");
            entity.Property(e => e.PreviousAssigneeUserId).HasColumnType("bigint");

            // Real FK (shadow): an assignment cannot exist without its ATA record, but
            // deleting an ATA record that still carries assignments must be REFUSED rather
            // than cascading away the ownership audit trail.
            entity.HasOne<ATARecord>()
                .WithMany()
                .HasForeignKey(e => e.ATARecordId)
                .OnDelete(DeleteBehavior.Restrict);

            // Sequence is 1-based and strictly unique inside one record.
            entity.HasIndex(e => new { e.ATARecordId, e.Sequence })
                .IsUnique()
                .HasDatabaseName("UX_ATARecordAssignments_Record_Sequence");

            // SQL-SERVER FILTERED INDEX - "exactly one row per record carries IsCurrent".
            // Superseded rows stay in the table with IsCurrent = 0 for the audit trail.
            entity.HasIndex(e => e.ATARecordId)
                .IsUnique()
                .HasFilter("[IsCurrent] = 1")
                .HasDatabaseName("UX_ATARecordAssignments_Current");

            // "Records assigned to me" inbox.
            entity.HasIndex(e => new { e.AssignedToUserId, e.IsCurrent })
                .HasDatabaseName("IX_ATARecordAssignments_Assignee");

            entity.HasIndex(e => e.FormWorkflowInstanceId);
            entity.HasIndex(e => e.EvaluationFolderId);
            entity.HasIndex(e => e.ShopId);
            entity.HasIndex(e => e.AssignedByUserId);
            entity.HasIndex(e => e.AssignedToShopId);
            entity.HasIndex(e => e.Action);
            entity.HasIndex(e => e.Reason);
            entity.HasIndex(e => e.AssignedAt);
            entity.HasIndex(e => e.SupersedesAssignmentId);
        });

        // ================================ TrainingEnrollment =============================
        // STL (own shop only) -> HR Specialist verification -> HR Manager approval -> back to
        // the requesting STL. RequesterShopId is NON-nullable: it is the enforcement point of
        // "enrols all employees belonging to his shop only" (EmployeeShopId == RequesterShopId,
        // checked in code by BelongsToRequesterShop()).
        modelBuilder.Entity<TrainingEnrollment>(entity =>
        {
            entity.ToTable("TrainingEnrollments");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.RequesterName).HasMaxLength(200);
            entity.Property(e => e.RequesterRole).HasMaxLength(50);
            entity.Property(e => e.EmployeeName).HasMaxLength(200);
            entity.Property(e => e.EmployeeNo).HasMaxLength(50);
            entity.Property(e => e.EmployeeRole).HasMaxLength(50);
            entity.Property(e => e.FormType).HasMaxLength(100);
            entity.Property(e => e.TrainingCode).HasMaxLength(100);
            entity.Property(e => e.TrainingTitle).HasMaxLength(300);
            entity.Property(e => e.TrainingProvider).HasMaxLength(200);
            entity.Property(e => e.NotRequiredJustification).HasMaxLength(500);
            entity.Property(e => e.VerifiedByHRName).HasMaxLength(200);
            entity.Property(e => e.TrainingStatus).HasMaxLength(100);
            entity.Property(e => e.IneligibleReason).HasMaxLength(500);
            entity.Property(e => e.ApprovedByHRManagerName).HasMaxLength(200);
            entity.Property(e => e.Remarks).HasMaxLength(1000);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            entity.Property(e => e.RequesterUserId).HasColumnType("bigint");
            entity.Property(e => e.EmployeeUserId).HasColumnType("bigint");
            entity.Property(e => e.VerifiedByHRUserId).HasColumnType("bigint");
            entity.Property(e => e.ApprovedByHRManagerUserId).HasColumnType("bigint");
            entity.Property(e => e.RequesterVerifiedByUserId).HasColumnType("bigint");

            // Real FK (shadow): an enrolment row decorates a running instance and dies with it.
            entity.HasOne<FormWorkflowInstance>()
                .WithMany()
                .HasForeignKey(e => e.FormWorkflowInstanceId)
                .OnDelete(DeleteBehavior.Cascade);

            // One enrolment row per employee per training instance.
            entity.HasIndex(e => new { e.FormWorkflowInstanceId, e.EmployeeUserId })
                .IsUnique()
                .HasDatabaseName("UX_TrainingEnrollments_Instance_Employee");

            // Shop scope screen of the requesting STL.
            entity.HasIndex(e => new { e.RequesterShopId, e.State })
                .HasDatabaseName("IX_TrainingEnrollments_ShopScope");

            // "HR filters eligible employees".
            entity.HasIndex(e => new { e.EmployeeUserId, e.IsEligible, e.IsExpired })
                .HasDatabaseName("IX_TrainingEnrollments_Eligibility");

            entity.HasIndex(e => e.EmployeeShopId);
            entity.HasIndex(e => e.RequesterUserId);
            entity.HasIndex(e => e.EvaluationFolderId);
            entity.HasIndex(e => e.ATARecordId);
            entity.HasIndex(e => e.TrainingRecordId);
            entity.HasIndex(e => e.FormType);
            entity.HasIndex(e => e.TrainingCode);
            entity.HasIndex(e => e.TrainingExpiryDate);
            entity.HasIndex(e => e.State);
            entity.HasIndex(e => e.ExpiryTrackingId);
            entity.HasIndex(e => e.CompetencyMatrixEntryId);
        });

        // ========================= ProficiencyAssessmentAssignment =======================
        // The designation behind the EXCLUSIVE routing of MNT-1378 (Inspector) and
        // MNT-922C / MNT 3.14-020 (Technician).
        modelBuilder.Entity<ProficiencyAssessmentAssignment>(entity =>
        {
            entity.ToTable("ProficiencyAssessmentAssignments");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.FormType).HasMaxLength(100).IsRequired();
            entity.Property(e => e.FormNo).HasMaxLength(50);
            entity.Property(e => e.DesignatedName).HasMaxLength(200);
            entity.Property(e => e.DesignatedRole).HasMaxLength(50);
            entity.Property(e => e.DesignatedByRole).HasMaxLength(50);
            entity.Property(e => e.AssessedName).HasMaxLength(200);
            entity.Property(e => e.AssessedRole).HasMaxLength(50);
            entity.Property(e => e.AssessedTask).HasMaxLength(300);
            entity.Property(e => e.Findings).HasMaxLength(1000);
            entity.Property(e => e.Remarks).HasMaxLength(1000);

            entity.Property(e => e.DesignatedUserId).HasColumnType("bigint");
            entity.Property(e => e.DesignatedByUserId).HasColumnType("bigint");
            entity.Property(e => e.AssessedUserId).HasColumnType("bigint");

            entity.HasOne<FormWorkflowInstance>()
                .WithMany()
                .HasForeignKey(e => e.FormWorkflowInstanceId)
                .OnDelete(DeleteBehavior.Cascade);

            // One assessment row per assessed person per instance.
            entity.HasIndex(e => new { e.FormWorkflowInstanceId, e.AssessedUserId })
                .IsUnique()
                .HasDatabaseName("UX_ProficiencyAssessmentAssignments_Instance_Assessed");

            // "Assessments routed exclusively to me", per form type.
            entity.HasIndex(e => new { e.DesignatedUserId, e.FormType })
                .HasDatabaseName("IX_ProficiencyAssessmentAssignments_Designated");

            entity.HasIndex(e => e.ShopId);
            entity.HasIndex(e => e.EvaluationFolderId);
            entity.HasIndex(e => e.AssessedUserId);
            entity.HasIndex(e => e.DesignatedRole);
            entity.HasIndex(e => e.Outcome);
            entity.HasIndex(e => e.AwardedLevel);
            entity.HasIndex(e => e.ValidUntil);
            entity.HasIndex(e => e.ExpiryTrackingId);
            entity.HasIndex(e => e.SignatureId);
            entity.HasIndex(e => e.EmployeeProficiencyRecordId);
        });

        // =============================== ToolNeedAnalysisEntry ===========================
        // One tool line of MNT-1229B: drafted by the STL or delegated to an Engineer, with
        // the alternate-tool pathway and the MGR -> Special Team Leader approval sequence.
        modelBuilder.Entity<ToolNeedAnalysisEntry>(entity =>
        {
            entity.ToTable("ToolNeedAnalysisEntries");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.FormType).HasMaxLength(100);
            entity.Property(e => e.RequiredToolPartNumber).HasMaxLength(200).IsRequired();
            entity.Property(e => e.RequiredToolDescription).HasMaxLength(500);
            entity.Property(e => e.CmmReference).HasMaxLength(100);
            entity.Property(e => e.DraftedByName).HasMaxLength(200);
            entity.Property(e => e.DraftedByRole).HasMaxLength(50);
            entity.Property(e => e.AssignedEngineerName).HasMaxLength(200);
            entity.Property(e => e.InhouseSkipReason).HasMaxLength(500);
            entity.Property(e => e.AlternateToolPartNumber).HasMaxLength(200);
            entity.Property(e => e.AlternateToolDescription).HasMaxLength(500);
            entity.Property(e => e.EquivalencyBasis).HasMaxLength(2000);
            entity.Property(e => e.ManagerApprovedByName).HasMaxLength(200);
            entity.Property(e => e.SpecialTeamLeaderApprovedByName).HasMaxLength(200);
            entity.Property(e => e.CalibrationInterval).HasMaxLength(100);
            entity.Property(e => e.Remarks).HasMaxLength(1000);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            entity.Property(e => e.DraftedByUserId).HasColumnType("bigint");
            entity.Property(e => e.AssignedEngineerUserId).HasColumnType("bigint");
            entity.Property(e => e.ManagerApprovedByUserId).HasColumnType("bigint");
            entity.Property(e => e.SpecialTeamLeaderApprovedByUserId).HasColumnType("bigint");

            entity.HasOne<FormWorkflowInstance>()
                .WithMany()
                .HasForeignKey(e => e.FormWorkflowInstanceId)
                .OnDelete(DeleteBehavior.Cascade);

            // One line per required tool per TNA instance.
            entity.HasIndex(e => new { e.FormWorkflowInstanceId, e.RequiredToolPartNumber })
                .IsUnique()
                .HasDatabaseName("UX_ToolNeedAnalysisEntries_Instance_Tool");

            // Calibration sweep feeding ExpiryTrackings.
            entity.HasIndex(e => new { e.ShopId, e.CalibrationDueDate })
                .HasDatabaseName("IX_ToolNeedAnalysisEntries_Calibration");

            entity.HasIndex(e => e.EvaluationFolderId);
            entity.HasIndex(e => e.ATARecordId);
            entity.HasIndex(e => e.ToolNeedAnalysisReportId);
            entity.HasIndex(e => e.RequiredToolPartNumber);
            entity.HasIndex(e => e.AlternateToolPartNumber);
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.IsApproved);
            entity.HasIndex(e => e.AlternateToolUsed);
            entity.HasIndex(e => e.InhouseManufacturingRequired);
            entity.HasIndex(e => e.DraftedByUserId);
            entity.HasIndex(e => e.AssignedEngineerUserId);
            entity.HasIndex(e => e.ToolEquivalencyMatrixEntryId);
            entity.HasIndex(e => e.ExpiryTrackingId);
            entity.HasIndex(e => e.ApprovalSignatureId);
        });

        // ========================= InhouseToolManufacturingRecord ========================
        // The conditional in-house block. ToolNeedAnalysisEntryId is INDEXED ONLY: adding an
        // FK would create a second cascade path
        // WorkflowInstances -> ToolNeedAnalysisEntries -> InhouseToolManufacturingRecords
        // and SQL Server rejects that.
        modelBuilder.Entity<InhouseToolManufacturingRecord>(entity =>
        {
            entity.ToTable("InhouseToolManufacturingRecords");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.ToolPartNumber).HasMaxLength(200).IsRequired();
            entity.Property(e => e.ToolDescription).HasMaxLength(500);
            entity.Property(e => e.LocalToolNumber).HasMaxLength(100);
            entity.Property(e => e.DrawingNumber).HasMaxLength(200);
            entity.Property(e => e.SkipAuditTrail).HasMaxLength(1000);
            entity.Property(e => e.SpecialTeamLeaderApprovedByName).HasMaxLength(200);
            entity.Property(e => e.Remarks).HasMaxLength(1000);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            entity.Property(e => e.JicCompletedByUserId).HasColumnType("bigint");
            entity.Property(e => e.RiskAssessmentCompletedByUserId).HasColumnType("bigint");
            entity.Property(e => e.Form1554CompletedByUserId).HasColumnType("bigint");
            entity.Property(e => e.SpecialTeamLeaderApprovedByUserId).HasColumnType("bigint");

            entity.HasOne<FormWorkflowInstance>()
                .WithMany()
                .HasForeignKey(e => e.FormWorkflowInstanceId)
                .OnDelete(DeleteBehavior.Cascade);

            // One record per manufactured tool per instance.
            entity.HasIndex(e => new { e.FormWorkflowInstanceId, e.ToolPartNumber })
                .IsUnique()
                .HasDatabaseName("UX_InhouseToolManufacturingRecords_Instance_Tool");

            entity.HasIndex(e => e.ToolNeedAnalysisEntryId);
            entity.HasIndex(e => e.InhouseManufacturedToolsCardId);
            entity.HasIndex(e => e.EvaluationFolderId);
            entity.HasIndex(e => e.ShopId);
            entity.HasIndex(e => e.ToolPartNumber);
            entity.HasIndex(e => e.LocalToolNumber);
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.IsApproved);
            entity.HasIndex(e => e.IsLocked);
            entity.HasIndex(e => e.SpecialTeamLeaderApprovedByUserId);
            entity.HasIndex(e => e.ApprovalSignatureId);
        });

        // ============================ RegulatoryComplianceRecord =========================
        // NO FOREIGN KEY AT ALL, on purpose: both instance links are nullable because the
        // 918 / 918A pair may be deferred BEFORE either instance exists.
        modelBuilder.Entity<RegulatoryComplianceRecord>(entity =>
        {
            entity.ToTable("RegulatoryComplianceRecords");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.DeferredByRole).HasMaxLength(50);
            entity.Property(e => e.DeferralReason).HasMaxLength(500);
            entity.Property(e => e.DirectorApprovedByName).HasMaxLength(200);
            entity.Property(e => e.QaApprovedByName).HasMaxLength(200);
            entity.Property(e => e.EcaaEndorsedByName).HasMaxLength(200);
            entity.Property(e => e.EcaaReferenceNumber).HasMaxLength(100);
            entity.Property(e => e.Remarks).HasMaxLength(1000);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            entity.Property(e => e.DeferredByUserId).HasColumnType("bigint");
            entity.Property(e => e.JointApprovalEnabledByUserId).HasColumnType("bigint");
            entity.Property(e => e.DirectorApprovedByUserId).HasColumnType("bigint");
            entity.Property(e => e.QaApprovedByUserId).HasColumnType("bigint");
            entity.Property(e => e.EcaaEndorsedByUserId).HasColumnType("bigint");

            // SQL-SERVER FILTERED INDEX - one regulatory record per folder. EvaluationFolderId
            // is NULLABLE and SQL Server treats several NULLs as EQUAL in a unique index, so
            // folder-less rows would collide with each other without this filter.
            entity.HasIndex(e => e.EvaluationFolderId)
                .IsUnique()
                .HasFilter("[EvaluationFolderId] IS NOT NULL")
                .HasDatabaseName("UX_RegulatoryComplianceRecords_Folder");

            entity.HasIndex(e => e.PrimaryInstanceId);
            entity.HasIndex(e => e.CompanionInstanceId);
            entity.HasIndex(e => e.ATARecordId);
            entity.HasIndex(e => e.ShopId);
            entity.HasIndex(e => e.Form918FAAId);
            entity.HasIndex(e => e.Form918ACAAId);
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.ComplianceStatus);
            entity.HasIndex(e => e.RegulatoryTargetDate);
            entity.HasIndex(e => e.MaySkipNow);
            entity.HasIndex(e => e.WasDeferred);
            entity.HasIndex(e => e.JointApprovalEnabled);
            entity.HasIndex(e => e.IsComplete);
            entity.HasIndex(e => e.IsLocked);
        });

        // ============================ SelfAuditVerificationItem ==========================
        // MNT-1325 gate. IX_SelfAuditVerificationItems_Gate is the index that answers the
        // blocking question of the release step: "is any MANDATORY item still unverified?".
        modelBuilder.Entity<SelfAuditVerificationItem>(entity =>
        {
            entity.ToTable("SelfAuditVerificationItems");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.ItemCode).HasMaxLength(50).IsRequired();
            entity.Property(e => e.Title).HasMaxLength(300);
            entity.Property(e => e.ExpectedValue).HasMaxLength(300);
            entity.Property(e => e.ActualValue).HasMaxLength(300);
            entity.Property(e => e.VerifiedByName).HasMaxLength(200);
            entity.Property(e => e.VerifiedByRole).HasMaxLength(50);
            entity.Property(e => e.Finding).HasMaxLength(1000);
            entity.Property(e => e.CorrectiveAction).HasMaxLength(1000);

            entity.Property(e => e.VerifiedByUserId).HasColumnType("bigint");

            entity.HasOne<FormWorkflowInstance>()
                .WithMany()
                .HasForeignKey(e => e.FormWorkflowInstanceId)
                .OnDelete(DeleteBehavior.Cascade);

            // One checklist item per code per gate step of one instance.
            entity.HasIndex(e => new { e.FormWorkflowInstanceId, e.StepNo, e.ItemCode })
                .IsUnique()
                .HasDatabaseName("UX_SelfAuditVerificationItems_Instance_Step_Item");

            // The release gate: the step cannot complete while a mandatory item is unverified.
            entity.HasIndex(e => new { e.FormWorkflowInstanceId, e.IsMandatory, e.IsVerified })
                .HasDatabaseName("IX_SelfAuditVerificationItems_Gate");

            entity.HasIndex(e => e.EvaluationFolderId);
            entity.HasIndex(e => e.PeriodicSelfAuditId);
            entity.HasIndex(e => e.Kind);
            entity.HasIndex(e => e.Outcome);
            entity.HasIndex(e => e.EvaluationFolderItemId);
            entity.HasIndex(e => e.ToolEquivalencyMatrixEntryId);
            entity.HasIndex(e => e.VerifiedByUserId);
            entity.HasIndex(e => e.FindingClosed);
            entity.HasIndex(e => e.SequenceNo);
        });

        // ============================== WorkflowDelegationLog ============================
        // Requirement #3. FormWorkflowStepId is INDEXED ONLY, to avoid a second cascade path
        // WorkflowInstances -> WorkflowSteps -> WorkflowDelegationLogs.
        modelBuilder.Entity<WorkflowDelegationLog>(entity =>
        {
            entity.ToTable("WorkflowDelegationLogs");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.FormType).HasMaxLength(100);
            entity.Property(e => e.DelegatedByName).HasMaxLength(200);
            entity.Property(e => e.DelegatedByRole).HasMaxLength(50);
            entity.Property(e => e.DelegatedToName).HasMaxLength(200);
            entity.Property(e => e.DelegatedToRole).HasMaxLength(50);
            entity.Property(e => e.ReasonText).HasMaxLength(500);

            entity.Property(e => e.DelegatedByUserId).HasColumnType("bigint");
            entity.Property(e => e.DelegatedToUserId).HasColumnType("bigint");
            entity.Property(e => e.RevokedByUserId).HasColumnType("bigint");

            entity.HasOne<FormWorkflowInstance>()
                .WithMany()
                .HasForeignKey(e => e.FormWorkflowInstanceId)
                .OnDelete(DeleteBehavior.Cascade);

            // "Steps delegated to me that are still Active".
            entity.HasIndex(e => new { e.DelegatedToUserId, e.Status })
                .HasDatabaseName("IX_WorkflowDelegationLogs_Delegate");

            entity.HasIndex(e => e.FormWorkflowInstanceId);
            entity.HasIndex(e => e.FormWorkflowStepId);
            entity.HasIndex(e => e.DelegatedByUserId);
            entity.HasIndex(e => e.FormType);
            entity.HasIndex(e => e.EvaluationFolderId);
            entity.HasIndex(e => e.ShopId);
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.DelegatedAt);
            entity.HasIndex(e => e.ExpiresAt);
        });
    }


    // =====================================================================================
    // AMENDED v13 - THE TWO METHOD BODIES THAT WERE MISSING (fixes both build errors)
    //
    //   ApplicationDbContext.cs(1427,9): error CS0103: The name
    //       'ConfigureFolderAndTrackingEntities' does not exist in the current context
    //   ApplicationDbContext.cs(1428,9): error CS0103: The name
    //       'ConfigureDocumentationEntities' does not exist in the current context
    //
    // ROOT CAUSE
    //   The v12 amendment added the two CALLS at the end of OnModelCreating:
    //       ConfigureFolderAndTrackingEntities(modelBuilder);   // document A
    //       ConfigureDocumentationEntities(modelBuilder);       // document B
    //   ...but the two METHOD BODIES were never emitted into the file, so the compiler
    //   cannot resolve either name -> CS0103 twice. Nothing else in the solution was wrong:
    //   the 14 DbSets of v12 are already declared above and they compiled fine (an
    //   unresolved entity type would have produced CS0246, not CS0103).
    //
    // WHAT THE TWO METHODS BELOW MAP - THE 13 PREVIOUSLY UNMAPPED TABLES
    //   Document A - CMT.Domain/Models/Workflow/WorkflowEntities.cs
    //     EvaluationFolder            -> EvaluationFolders
    //     EvaluationFolderItem        -> EvaluationFolderItems        (Table of Contents rows)
    //     ExpiryTracking              -> ExpiryTrackings
    //     WorkflowNotification        -> WorkflowNotifications
    //     CompetencyMatrixEntry       -> CompetencyMatrixEntries
    //     ToolEquivalencyMatrixEntry  -> ToolEquivalencyMatrixEntries
    //     FolderRevisionLog           -> FolderRevisionLogs
    //
    //   Document B - CMT.Domain/Models/Workflow/DocumentationWorkflowEntities.cs
    //     DocumentationRoutingTicket     -> DocumentationRoutingTickets
    //     DocumentationClerkWorkload     -> DocumentationClerkWorkloads
    //     DocumentationAssignmentHistory -> DocumentationAssignmentHistories
    //     BulletinRegisterEntry          -> BulletinRegisterEntries
    //     DirectiveComplianceEntry       -> DirectiveComplianceEntries
    //     DocumentationLibraryLink       -> DocumentationLibraryLinks
    //
    // BINDING RULES APPLIED (identical to the rest of this file)
    //   * Entity keys are Guid. USER ids are 'long' (User : BaseEntity -> long Id) and every
    //     user column is declared HasColumnType("bigint"), so the generated migration can
    //     never emit "uniqueidentifier" for a user column.
    //   * Enums persist as int (EF Core default). No HasConversion<string>() is introduced,
    //     therefore DO NOT renumber any enum member after the first migration is applied.
    //   * DateTime columns stay datetime2 (provider default); the entities normalise to UTC.
    //   * DocumentationLibraryLink.TriggerKind is a getter-only computed property with no
    //     backing field. It MUST be Ignore()d or EF Core throws while building the model.
    //
    // FOREIGN KEYS - DELIBERATE AND MINIMAL
    //     EvaluationFolders           1--* EvaluationFolderItems            Cascade  (nav)
    //     EvaluationFolders           1--* FolderRevisionLogs               Cascade  (shadow)
    //     ATARecords                  1--* EvaluationFolders                Restrict (shadow)
    //     WorkflowInstances           1--* DocumentationRoutingTickets      Cascade  (shadow)
    //     DocumentationRoutingTickets 1--* DocumentationAssignmentHistories Cascade  (nav)
    //     WorkflowInstances           1--* BulletinRegisterEntries          Cascade  (shadow)
    //     WorkflowInstances           1--* DirectiveComplianceEntries       Cascade  (shadow)
    //     Users                       1--* DocumentationClerkWorkloads      Cascade  (shadow)
    //   Every other Guid column stays an INDEXED PLAIN column with NO FK, on purpose: a
    //   folder-level virtual form has no FormSubmission row, a register line may exist
    //   before its legacy SBForm/ADForm row, and SQL Server would reject several of those
    //   links as multiple cascade paths.
    //
    // FILTERED UNIQUE INDEXES - SQL SERVER SYNTAX
    //   Six business invariants are "unique only when populated / active", because the
    //   entities initialise their string keys to string.Empty and because SQL Server treats
    //   several NULLs as EQUAL inside a unique index:
    //     UX_EvaluationFolders_FolderCode                       [FolderCode] <> ''
    //     UX_ExpiryTrackings_Entity_Active                      [IsActive] = 1
    //     UX_DocumentationRoutingTickets_TicketNo               [TicketNo] <> ''
    //     UX_CompetencyMatrixEntries_Folder_Employee_Training   [EvaluationFolderId] IS NOT NULL
    //     UX_ToolEquivalencyMatrixEntries_Folder_Pair           [EvaluationFolderId] IS NOT NULL
    //     UX_DocumentationLibraryLinks_Folder_Kind_Number       [EvaluationFolderId] IS NOT NULL
    //   Unfiltered unique indexes:
    //     UX_EvaluationFolderItems_Folder_FormType
    //     UX_FolderRevisionLogs_Folder_Revision
    //     UX_DocumentationRoutingTickets_Instance
    //     UX_DocumentationClerkWorkloads_ClerkUserId
    //     UX_DocumentationAssignmentHistories_Ticket_Sequence
    //     UX_BulletinRegisterEntries_Instance
    //     UX_DirectiveComplianceEntries_Instance
    //     UX_DirectiveComplianceEntries_Shop_AD_Revision
    //   If you ever target a provider other than SQL Server, delete every line flagged
    //   "// SQL-SERVER FILTERED INDEX".
    //
    // MIGRATION (run on your side)
    //   dotnet ef migrations add AddFolderTrackingAndDocumentationTables ^
    //       --project CMT.Domain --startup-project CMT.Web.Api.SelfEvaluation
    //   dotnet ef database update ^
    //       --project CMT.Domain --startup-project CMT.Web.Api.SelfEvaluation
    //
    // EXPECTED MIGRATION CONTENT: 13 CreateTable operations, 0 DropTable, 0 AlterColumn, and
    // no change to any pre-existing table other than the new FK/index objects listed above.
    // If you see anything else, STOP and compare the model snapshot before applying.
    // =====================================================================================

    // =====================================================================================
    // DOCUMENT A - folders, Table of Contents, expiry, notifications, matrices, revisions
    // Requirements #2, #10, #11, #12, #13.
    // =====================================================================================
    private static void ConfigureFolderAndTrackingEntities(ModelBuilder modelBuilder)
    {
        // ================================= EvaluationFolder ==============================
        // Requirement #2 (one folder per ATA / Component), #11 (completion + PDF),
        // #12 (two-year revision cycle), #13 (final sign-off + lock).
        modelBuilder.Entity<EvaluationFolder>(entity =>
        {
            entity.ToTable("EvaluationFolders");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.FolderCode).HasMaxLength(100);
            entity.Property(e => e.Title).HasMaxLength(300);
            entity.Property(e => e.ATAChapterCode).HasMaxLength(20);
            entity.Property(e => e.PartNumber).HasMaxLength(100);
            entity.Property(e => e.ReportStoragePath).HasMaxLength(1000);
            entity.Property(e => e.ReportFileName).HasMaxLength(500);
            entity.Property(e => e.LinkedCmmRevision).HasMaxLength(100);
            entity.Property(e => e.LinkedComponentTaskRevision).HasMaxLength(100);
            entity.Property(e => e.LinkedTaskCardRevision).HasMaxLength(100);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            // User ids map to User.Id (long) -> bigint. Never uniqueidentifier.
            entity.Property(e => e.CompletedByUserId).HasColumnType("bigint");
            entity.Property(e => e.LockedByUserId).HasColumnType("bigint");

            // Real FK: the folder cannot exist without its ATA record, but deleting an ATA
            // record that still owns a folder must be REFUSED rather than cascading.
            entity.HasOne<ATARecord>()
                .WithMany()
                .HasForeignKey(e => e.ATARecordId)
                .OnDelete(DeleteBehavior.Restrict);

            // SQL-SERVER FILTERED INDEX - FolderCode is unique only once populated.
            entity.HasIndex(e => e.FolderCode)
                .IsUnique()
                .HasFilter("[FolderCode] <> ''")
                .HasDatabaseName("UX_EvaluationFolders_FolderCode");

            entity.HasIndex(e => e.ATARecordId);
            entity.HasIndex(e => e.ShopId);
            entity.HasIndex(e => e.DepartmentId);
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.IsComplete);
            entity.HasIndex(e => e.IsLocked);
            entity.HasIndex(e => e.RevisionDueDate);
            entity.HasIndex(e => e.SignOffInstanceId);
            entity.HasIndex(e => e.ATAChapterCode);
            entity.HasIndex(e => e.PartNumber);
        });

        // =============================== EvaluationFolderItem ============================
        // Requirement #2: ONE ROW OF THE PRINTED TABLE OF CONTENTS with its live status.
        modelBuilder.Entity<EvaluationFolderItem>(entity =>
        {
            entity.ToTable("EvaluationFolderItems");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.SectionCode).HasMaxLength(100);
            entity.Property(e => e.SectionTitle).HasMaxLength(200);
            entity.Property(e => e.FormType).HasMaxLength(100);
            entity.Property(e => e.FormNo).HasMaxLength(50);
            entity.Property(e => e.FormTitle).HasMaxLength(300);
            entity.Property(e => e.StatusLabel).HasMaxLength(100);
            entity.Property(e => e.CurrentStepTitle).HasMaxLength(300);
            entity.Property(e => e.CurrentAssigneeName).HasMaxLength(200);
            entity.Property(e => e.Remarks).HasMaxLength(1000);

            entity.Property(e => e.CurrentAssigneeUserId).HasColumnType("bigint");

            // Real FK via the navigation declared on EvaluationFolder.Items.
            entity.HasOne(e => e.Folder)
                .WithMany(f => f.Items)
                .HasForeignKey(e => e.EvaluationFolderId)
                .OnDelete(DeleteBehavior.Cascade);

            // One Table-of-Contents row per form type per folder.
            entity.HasIndex(e => new { e.EvaluationFolderId, e.FormType })
                .IsUnique()
                .HasDatabaseName("UX_EvaluationFolderItems_Folder_FormType");

            // Printed ordering of the Table Of Contents.
            entity.HasIndex(e => new { e.EvaluationFolderId, e.SectionOrder, e.ItemOrder })
                .HasDatabaseName("IX_EvaluationFolderItems_Folder_Order");

            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.LifecycleState);
            entity.HasIndex(e => e.FormSubmissionId);
            entity.HasIndex(e => e.FormWorkflowInstanceId);
            entity.HasIndex(e => e.CurrentAssigneeUserId);
            entity.HasIndex(e => e.ExpiresAt);
            entity.HasIndex(e => e.IsExpired);
            entity.HasIndex(e => e.SectionCode);
        });

        // ================================== ExpiryTracking ===============================
        // Requirement #10: tracked validity windows (training verification, tool
        // calibration, certifications) plus the amendment cycle they raise.
        modelBuilder.Entity<ExpiryTracking>(entity =>
        {
            entity.ToTable("ExpiryTrackings");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.EntityType).HasMaxLength(100).IsRequired();
            entity.Property(e => e.FormType).HasMaxLength(100);
            entity.Property(e => e.TrackedItem).HasMaxLength(300);
            entity.Property(e => e.ResponsibleRole).HasMaxLength(50);

            entity.Property(e => e.ResponsibleUserId).HasColumnType("bigint");

            // SQL-SERVER FILTERED INDEX - only ONE active tracking row per tracked entity.
            // Superseded rows stay in the table with IsActive = 0 for the audit trail.
            entity.HasIndex(e => new { e.EntityType, e.EntityId })
                .IsUnique()
                .HasFilter("[IsActive] = 1")
                .HasDatabaseName("UX_ExpiryTrackings_Entity_Active");

            // Drives the nightly expiry sweep: "still active, not expired, warn window hit".
            entity.HasIndex(e => new { e.IsActive, e.IsExpired, e.ExpiresAt })
                .HasDatabaseName("IX_ExpiryTrackings_Sweep");

            entity.HasIndex(e => e.EvaluationFolderId);
            entity.HasIndex(e => e.ShopId);
            entity.HasIndex(e => e.FormType);
            entity.HasIndex(e => e.ExpiresAt);
            entity.HasIndex(e => e.ResponsibleUserId);
            entity.HasIndex(e => e.AmendmentInstanceId);
            entity.HasIndex(e => e.Status);
        });

        // =============================== WorkflowNotification ============================
        // Requirement #10: the in-app notification centre.
        modelBuilder.Entity<WorkflowNotification>(entity =>
        {
            entity.ToTable("WorkflowNotifications");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.RecipientRole).HasMaxLength(50);
            entity.Property(e => e.Category).HasMaxLength(50).IsRequired();
            entity.Property(e => e.Title).HasMaxLength(300).IsRequired();
            entity.Property(e => e.Message).HasMaxLength(1000);
            entity.Property(e => e.EntityType).HasMaxLength(100);
            entity.Property(e => e.ActionUrl).HasMaxLength(500);

            entity.Property(e => e.RecipientUserId).HasColumnType("bigint");

            // The bell icon query: unread notifications of the signed-in user, newest first.
            entity.HasIndex(e => new { e.RecipientUserId, e.IsRead, e.CreatedAt })
                .HasDatabaseName("IX_WorkflowNotifications_Inbox");

            entity.HasIndex(e => new { e.EntityType, e.EntityId })
                .HasDatabaseName("IX_WorkflowNotifications_Entity");

            entity.HasIndex(e => e.Category);
            entity.HasIndex(e => e.ShopId);
            entity.HasIndex(e => e.FormWorkflowInstanceId);
            entity.HasIndex(e => e.EvaluationFolderId);
            entity.HasIndex(e => e.CreatedAt);
        });

        // ============================== CompetencyMatrixEntry ============================
        // Requirement #12: monitoring of individual competencies / training completion.
        modelBuilder.Entity<CompetencyMatrixEntry>(entity =>
        {
            entity.ToTable("CompetencyMatrixEntries");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.EmployeeName).HasMaxLength(200);
            entity.Property(e => e.EmployeeNo).HasMaxLength(50);
            entity.Property(e => e.EmployeeRole).HasMaxLength(50);
            entity.Property(e => e.TrainingCode).HasMaxLength(100);
            entity.Property(e => e.TrainingTitle).HasMaxLength(300);
            entity.Property(e => e.SourceFormType).HasMaxLength(100);
            entity.Property(e => e.VerifiedByRole).HasMaxLength(50);
            entity.Property(e => e.Remarks).HasMaxLength(1000);

            entity.Property(e => e.EmployeeUserId).HasColumnType("bigint");
            entity.Property(e => e.VerifiedByUserId).HasColumnType("bigint");

            // SQL-SERVER FILTERED INDEX - one competency line per employee / training code
            // inside one folder scope. EvaluationFolderId is NULLABLE and SQL Server treats
            // several NULLs as EQUAL in a unique index, so folder-less rows would collide
            // with each other. The filter keeps the invariant scoped to real folders.
            entity.HasIndex(e => new { e.EvaluationFolderId, e.EmployeeUserId, e.TrainingCode })
                .IsUnique()
                .HasFilter("[EvaluationFolderId] IS NOT NULL")
                .HasDatabaseName("UX_CompetencyMatrixEntries_Folder_Employee_Training");

            // HR "filter eligible employees" screen.
            entity.HasIndex(e => new { e.ShopId, e.IsEligible, e.IsExpired })
                .HasDatabaseName("IX_CompetencyMatrixEntries_Eligibility");

            entity.HasIndex(e => e.EmployeeUserId);
            entity.HasIndex(e => e.EmployeeNo);
            entity.HasIndex(e => e.TrainingCode);
            entity.HasIndex(e => e.TrainingExpiryDate);
            entity.HasIndex(e => e.Level);
        });

        // =========================== ToolEquivalencyMatrixEntry ==========================
        // Requirement #12: the tool equivalency matrix; also the source of the tool
        // calibration expiry rows consumed by requirement #10.
        modelBuilder.Entity<ToolEquivalencyMatrixEntry>(entity =>
        {
            entity.ToTable("ToolEquivalencyMatrixEntries");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.OriginalToolPartNumber).HasMaxLength(200);
            entity.Property(e => e.OriginalToolDescription).HasMaxLength(500);
            entity.Property(e => e.AlternateToolPartNumber).HasMaxLength(200);
            entity.Property(e => e.AlternateToolDescription).HasMaxLength(500);
            entity.Property(e => e.EquivalencyBasis).HasMaxLength(2000);
            entity.Property(e => e.ApprovedByRole).HasMaxLength(50);
            entity.Property(e => e.CalibrationInterval).HasMaxLength(100);
            entity.Property(e => e.SourceFormType).HasMaxLength(100);

            entity.Property(e => e.ApprovedByUserId).HasColumnType("bigint");

            // SQL-SERVER FILTERED INDEX - one equivalency pair per folder scope. Same
            // nullable-FK reasoning as CompetencyMatrixEntries above.
            entity.HasIndex(e => new
                {
                    e.EvaluationFolderId,
                    e.OriginalToolPartNumber,
                    e.AlternateToolPartNumber
                })
                .IsUnique()
                .HasFilter("[EvaluationFolderId] IS NOT NULL")
                .HasDatabaseName("UX_ToolEquivalencyMatrixEntries_Folder_Pair");

            // Calibration sweep feeding ExpiryTrackings.
            entity.HasIndex(e => new { e.ShopId, e.CalibrationDueDate })
                .HasDatabaseName("IX_ToolEquivalencyMatrixEntries_Calibration");

            entity.HasIndex(e => e.EvaluationFolderId);
            entity.HasIndex(e => e.OriginalToolPartNumber);
            entity.HasIndex(e => e.AlternateToolPartNumber);
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.EquivalencyApproved);
            entity.HasIndex(e => e.IsInhouseManufactured);
        });

        // ================================ FolderRevisionLog ==============================
        // Requirement #12: two-year cycle plus documentation-triggered revisions.
        modelBuilder.Entity<FolderRevisionLog>(entity =>
        {
            entity.ToTable("FolderRevisionLogs");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.TriggerReference).HasMaxLength(300);
            entity.Property(e => e.PreviousRevision).HasMaxLength(100);
            entity.Property(e => e.NewRevision).HasMaxLength(100);
            entity.Property(e => e.Notes).HasMaxLength(1000);

            entity.Property(e => e.RaisedByUserId).HasColumnType("bigint");
            entity.Property(e => e.ClosedByUserId).HasColumnType("bigint");

            // Real FK (shadow): the revision history dies with its folder.
            entity.HasOne<EvaluationFolder>()
                .WithMany()
                .HasForeignKey(e => e.EvaluationFolderId)
                .OnDelete(DeleteBehavior.Cascade);

            // One log row per revision number per folder.
            entity.HasIndex(e => new { e.EvaluationFolderId, e.RevisionNumber })
                .IsUnique()
                .HasDatabaseName("UX_FolderRevisionLogs_Folder_Revision");

            entity.HasIndex(e => e.Trigger);
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.RaisedAt);
            entity.HasIndex(e => e.RevisionInstanceId);
        });
    }

    // =====================================================================================
    // DOCUMENT B - Documentation Team routing, clerk availability, assignment history and
    // the three register / library outputs of MNT-1420, MNT-1420A, MNT-1420B, MNT-1420C.
    // =====================================================================================
    private static void ConfigureDocumentationEntities(ModelBuilder modelBuilder)
    {
        // ============================ DocumentationRoutingTicket =========================
        // Routing steps 1, 2 and 3: "Sent to the Documentation Team" -> "DL assigns an
        // available clerk" -> "Re-assigned to DL for final review and sign-off".
        modelBuilder.Entity<DocumentationRoutingTicket>(entity =>
        {
            entity.ToTable("DocumentationRoutingTickets");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.TicketNo).HasMaxLength(50);
            entity.Property(e => e.FormType).HasMaxLength(100).IsRequired();
            entity.Property(e => e.FormNo).HasMaxLength(50);
            entity.Property(e => e.InitiationCategory).HasMaxLength(50);
            entity.Property(e => e.OriginatorName).HasMaxLength(200);
            entity.Property(e => e.OriginatorRole).HasMaxLength(50);
            entity.Property(e => e.AssignmentUnit).HasMaxLength(50);
            entity.Property(e => e.DocumentationLeaderName).HasMaxLength(200);
            entity.Property(e => e.AssignedClerkName).HasMaxLength(200);
            entity.Property(e => e.LastReassignReason).HasMaxLength(500);
            entity.Property(e => e.LeaderReviewComments).HasMaxLength(1000);
            entity.Property(e => e.Notes).HasMaxLength(1000);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            entity.Property(e => e.OriginatorUserId).HasColumnType("bigint");
            entity.Property(e => e.DocumentationLeaderUserId).HasColumnType("bigint");
            entity.Property(e => e.AssignedClerkUserId).HasColumnType("bigint");
            entity.Property(e => e.AssignedByUserId).HasColumnType("bigint");
            entity.Property(e => e.PreviousClerkUserId).HasColumnType("bigint");

            // Real FK (shadow): a ticket cannot outlive its workflow instance.
            entity.HasOne<FormWorkflowInstance>()
                .WithMany()
                .HasForeignKey(e => e.FormWorkflowInstanceId)
                .OnDelete(DeleteBehavior.Cascade);

            // SQL-SERVER FILTERED INDEX - TicketNo is unique only once generated.
            entity.HasIndex(e => e.TicketNo)
                .IsUnique()
                .HasFilter("[TicketNo] <> ''")
                .HasDatabaseName("UX_DocumentationRoutingTickets_TicketNo");

            // One ticket per workflow instance.
            entity.HasIndex(e => e.FormWorkflowInstanceId)
                .IsUnique()
                .HasDatabaseName("UX_DocumentationRoutingTickets_Instance");

            // The DL unit inbox: open tickets of the Documentation unit, by state/priority.
            entity.HasIndex(e => new { e.AssignmentUnit, e.IsClosed, e.State, e.Priority })
                .HasDatabaseName("IX_DocumentationRoutingTickets_UnitQueue");

            // The clerk inbox.
            entity.HasIndex(e => new { e.AssignedClerkUserId, e.IsClosed, e.State })
                .HasDatabaseName("IX_DocumentationRoutingTickets_ClerkQueue");

            entity.HasIndex(e => e.FormSubmissionId);
            entity.HasIndex(e => e.EvaluationFolderId);
            entity.HasIndex(e => e.ATARecordId);
            entity.HasIndex(e => e.FormType);
            entity.HasIndex(e => e.InitiationCategory);
            entity.HasIndex(e => e.State);
            entity.HasIndex(e => e.FormStatus);
            entity.HasIndex(e => e.OriginShopId);
            entity.HasIndex(e => e.OriginDepartmentId);
            entity.HasIndex(e => e.OriginatorUserId);
            entity.HasIndex(e => e.DocumentationLeaderUserId);
            entity.HasIndex(e => e.DueDate);
            entity.HasIndex(e => e.IsOverdue);
            entity.HasIndex(e => e.LeaderSignatureId);
        });

        // ============================ DocumentationClerkWorkload =========================
        // Makes the word "AVAILABLE clerk" implementable: one row per Documentation Clerk.
        modelBuilder.Entity<DocumentationClerkWorkload>(entity =>
        {
            entity.ToTable("DocumentationClerkWorkloads");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.ClerkName).HasMaxLength(200);
            entity.Property(e => e.ClerkRole).HasMaxLength(50);
            entity.Property(e => e.FunctionalUnit).HasMaxLength(50);
            entity.Property(e => e.UnavailableReason).HasMaxLength(300);

            entity.Property(e => e.ClerkUserId).HasColumnType("bigint");

            // IsAssignableAt(DateTime) is a helper METHOD, so EF ignores it automatically.
            // Real FK (shadow) to the user account of the clerk.
            entity.HasOne<User>()
                .WithMany()
                .HasForeignKey(e => e.ClerkUserId)
                .OnDelete(DeleteBehavior.Cascade);

            // Exactly one workload row per clerk - the upsert key used by the engine.
            entity.HasIndex(e => e.ClerkUserId)
                .IsUnique()
                .HasDatabaseName("UX_DocumentationClerkWorkloads_ClerkUserId");

            // The DL assignment screen: available clerks of the unit, least loaded first.
            entity.HasIndex(e => new { e.FunctionalUnit, e.IsAvailable, e.OpenTicketCount })
                .HasDatabaseName("IX_DocumentationClerkWorkloads_Availability");

            entity.HasIndex(e => e.LastAssignedAt);
        });

        // ========================= DocumentationAssignmentHistory ========================
        // Every assignment / re-assignment / return, so routing steps 2 and 3 are auditable.
        modelBuilder.Entity<DocumentationAssignmentHistory>(entity =>
        {
            entity.ToTable("DocumentationAssignmentHistories");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.FromUserName).HasMaxLength(200);
            entity.Property(e => e.FromUserRole).HasMaxLength(50);
            entity.Property(e => e.ToUserName).HasMaxLength(200);
            entity.Property(e => e.ToUserRole).HasMaxLength(50);
            entity.Property(e => e.ActedByRole).HasMaxLength(50);
            entity.Property(e => e.Reason).HasMaxLength(500);

            entity.Property(e => e.FromUserId).HasColumnType("bigint");
            entity.Property(e => e.ToUserId).HasColumnType("bigint");
            entity.Property(e => e.ActedByUserId).HasColumnType("bigint");

            // Real FK via the navigation declared on DocumentationRoutingTicket.
            entity.HasOne(e => e.Ticket)
                .WithMany(t => t.AssignmentHistory)
                .HasForeignKey(e => e.DocumentationRoutingTicketId)
                .OnDelete(DeleteBehavior.Cascade);

            // Sequence is 1-based and strictly unique inside one ticket.
            entity.HasIndex(e => new { e.DocumentationRoutingTicketId, e.Sequence })
                .IsUnique()
                .HasDatabaseName("UX_DocumentationAssignmentHistories_Ticket_Sequence");

            entity.HasIndex(e => e.Action);
            entity.HasIndex(e => e.ToUserId);
            entity.HasIndex(e => e.ActedByUserId);
            entity.HasIndex(e => e.ActedAt);
            entity.HasIndex(e => e.StateAfter);
        });

        // ============================== BulletinRegisterEntry ============================
        // Output of MNT-1420A: the register line the clerk fills in and the DL signs off.
        modelBuilder.Entity<BulletinRegisterEntry>(entity =>
        {
            entity.ToTable("BulletinRegisterEntries");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.BulletinNumber).HasMaxLength(100).IsRequired();
            entity.Property(e => e.Title).HasMaxLength(500);
            entity.Property(e => e.Revision).HasMaxLength(50);
            entity.Property(e => e.IssuedBy).HasMaxLength(200);
            entity.Property(e => e.ATAChapterCode).HasMaxLength(20);
            entity.Property(e => e.AffectedPartNumber).HasMaxLength(200);
            entity.Property(e => e.AffectedSerialNumbers).HasMaxLength(500);
            entity.Property(e => e.ComplianceMethod).HasMaxLength(2000);
            entity.Property(e => e.LibraryReference).HasMaxLength(300);
            entity.Property(e => e.FiledLocation).HasMaxLength(300);
            entity.Property(e => e.SupersededByBulletinNumber).HasMaxLength(100);
            entity.Property(e => e.AffectedCmmNumber).HasMaxLength(100);
            entity.Property(e => e.PreparedByName).HasMaxLength(200);
            entity.Property(e => e.ProcessedByClerkName).HasMaxLength(200);
            entity.Property(e => e.SignedOffByLeaderName).HasMaxLength(200);
            entity.Property(e => e.Remarks).HasMaxLength(2000);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            entity.Property(e => e.PreparedByUserId).HasColumnType("bigint");
            entity.Property(e => e.ProcessedByClerkUserId).HasColumnType("bigint");
            entity.Property(e => e.SignedOffByLeaderUserId).HasColumnType("bigint");

            // Real FK (shadow): the register line belongs to its workflow instance.
            entity.HasOne<FormWorkflowInstance>()
                .WithMany()
                .HasForeignKey(e => e.FormWorkflowInstanceId)
                .OnDelete(DeleteBehavior.Cascade);

            // One register line per workflow instance.
            entity.HasIndex(e => e.FormWorkflowInstanceId)
                .IsUnique()
                .HasDatabaseName("UX_BulletinRegisterEntries_Instance");

            // The printed register: bulletin number + revision inside one shop scope.
            entity.HasIndex(e => new { e.ShopId, e.BulletinNumber, e.Revision })
                .HasDatabaseName("IX_BulletinRegisterEntries_Register");

            // Feeds the CMM revision watch of requirement #12.
            entity.HasIndex(e => new { e.AffectsCmm, e.AffectedCmmNumber })
                .HasDatabaseName("IX_BulletinRegisterEntries_CmmImpact");

            entity.HasIndex(e => e.BulletinNumber);
            entity.HasIndex(e => e.DocumentType);
            entity.HasIndex(e => e.Category);
            entity.HasIndex(e => e.ComplianceStatus);
            entity.HasIndex(e => e.DocumentationRoutingTicketId);
            entity.HasIndex(e => e.SBFormId);
            entity.HasIndex(e => e.EvaluationFolderId);
            entity.HasIndex(e => e.ATARecordId);
            entity.HasIndex(e => e.ATAChapterCode);
            entity.HasIndex(e => e.AffectedPartNumber);
            entity.HasIndex(e => e.IsEffective);
            entity.HasIndex(e => e.IsLocked);
        });

        // ============================ DirectiveComplianceEntry ===========================
        // Output of MNT-1420B. "STL holds SOLE authority to draft, process and issue",
        // therefore every actor column is a Shop Team Leader: there is deliberately NO
        // clerk, NO DL, NO manager and NO director column on this table.
        modelBuilder.Entity<DirectiveComplianceEntry>(entity =>
        {
            entity.ToTable("DirectiveComplianceEntries");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.ADNumber).HasMaxLength(100).IsRequired();
            entity.Property(e => e.Title).HasMaxLength(500);
            entity.Property(e => e.Revision).HasMaxLength(50);
            entity.Property(e => e.IssuingAuthority).HasMaxLength(200);
            entity.Property(e => e.ATAChapterCode).HasMaxLength(20);
            entity.Property(e => e.AffectedPartNumber).HasMaxLength(200);
            entity.Property(e => e.AffectedModels).HasMaxLength(500);
            entity.Property(e => e.ComplianceMethod).HasMaxLength(2000);
            entity.Property(e => e.RecurringInterval).HasMaxLength(200);
            entity.Property(e => e.RelatedBulletinNumber).HasMaxLength(100);
            entity.Property(e => e.DraftedByStlName).HasMaxLength(200);
            entity.Property(e => e.ProcessedByStlName).HasMaxLength(200);
            entity.Property(e => e.IssuedByStlName).HasMaxLength(200);
            entity.Property(e => e.ProcessingComments).HasMaxLength(2000);
            entity.Property(e => e.Remarks).HasMaxLength(2000);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            entity.Property(e => e.DraftedByStlUserId).HasColumnType("bigint");
            entity.Property(e => e.ProcessedByStlUserId).HasColumnType("bigint");
            entity.Property(e => e.IssuedByStlUserId).HasColumnType("bigint");

            entity.HasOne<FormWorkflowInstance>()
                .WithMany()
                .HasForeignKey(e => e.FormWorkflowInstanceId)
                .OnDelete(DeleteBehavior.Cascade);

            // One compliance line per workflow instance.
            entity.HasIndex(e => e.FormWorkflowInstanceId)
                .IsUnique()
                .HasDatabaseName("UX_DirectiveComplianceEntries_Instance");

            // One AD number + revision per shop: the STL owns his own shop rows only.
            // ShopId is NON-nullable here, so no filter is required.
            entity.HasIndex(e => new { e.ShopId, e.ADNumber, e.Revision })
                .IsUnique()
                .HasDatabaseName("UX_DirectiveComplianceEntries_Shop_AD_Revision");

            // Recurring-directive sweep.
            entity.HasIndex(e => new { e.IsRecurring, e.NextRecurrenceDate })
                .HasDatabaseName("IX_DirectiveComplianceEntries_Recurrence");

            entity.HasIndex(e => e.ADNumber);
            entity.HasIndex(e => e.ADFormId);
            entity.HasIndex(e => e.EvaluationFolderId);
            entity.HasIndex(e => e.ATARecordId);
            entity.HasIndex(e => e.ATAChapterCode);
            entity.HasIndex(e => e.AffectedPartNumber);
            entity.HasIndex(e => e.Applicability);
            entity.HasIndex(e => e.ComplianceStatus);
            entity.HasIndex(e => e.ComplianceDueDate);
            entity.HasIndex(e => e.DraftedByStlUserId);
            entity.HasIndex(e => e.IsIssued);
            entity.HasIndex(e => e.IsLocked);
            entity.HasIndex(e => e.IssueSignatureId);
        });

        // ============================= DocumentationLibraryLink ==========================
        // The watch list behind requirement #12: automated revision triggers when the
        // associated CMM / Component Maintenance Task / Task Card is revised.
        modelBuilder.Entity<DocumentationLibraryLink>(entity =>
        {
            entity.ToTable("DocumentationLibraryLinks");
            entity.HasKey(e => e.Id);

            // TriggerKind is a getter-only computed property with NO backing field.
            // Without this Ignore(), EF Core throws while building the model.
            entity.Ignore(e => e.TriggerKind);

            entity.Property(e => e.DocumentNumber).HasMaxLength(200).IsRequired();
            entity.Property(e => e.Title).HasMaxLength(500);
            entity.Property(e => e.CurrentRevision).HasMaxLength(100);
            entity.Property(e => e.PreviousRevision).HasMaxLength(100);
            entity.Property(e => e.SourceFormType).HasMaxLength(100);
            entity.Property(e => e.Remarks).HasMaxLength(1000);
            entity.Property(e => e.CreatedBy).HasMaxLength(200);
            entity.Property(e => e.UpdatedBy).HasMaxLength(200);

            // SQL-SERVER FILTERED INDEX - one watched document per kind per folder scope.
            // Same nullable-FK reasoning as CompetencyMatrixEntries above.
            entity.HasIndex(e => new { e.EvaluationFolderId, e.DocumentKind, e.DocumentNumber })
                .IsUnique()
                .HasFilter("[EvaluationFolderId] IS NOT NULL")
                .HasDatabaseName("UX_DocumentationLibraryLinks_Folder_Kind_Number");

            // The revision-watch sweep.
            entity.HasIndex(e => new { e.IsActive, e.WatchForRevision, e.LastCheckedAt })
                .HasDatabaseName("IX_DocumentationLibraryLinks_Watch");

            entity.HasIndex(e => e.DocumentNumber);
            entity.HasIndex(e => e.DocumentKind);
            entity.HasIndex(e => e.ATARecordId);
            entity.HasIndex(e => e.ShopId);
            entity.HasIndex(e => e.SourceFormWorkflowInstanceId);
            entity.HasIndex(e => e.LastRaisedRevisionLogId);
        });
    }
}