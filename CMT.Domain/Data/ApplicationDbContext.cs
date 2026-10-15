using Microsoft.EntityFrameworkCore;
using CMT.Domain.Models;
using TaskEntity = CMT.Domain.Models.Task;

namespace CMT.Domain.Data;

public class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options) { }

    // DbSets
    public DbSet<User> Users { get; set; }
    public DbSet<TaskEntity> Tasks { get; set; }
    public DbSet<TaskCategory> TaskCategories { get; set; }
    public DbSet<TaskSubType> TaskSubTypes { get; set; }
    public DbSet<RequestType> RequestTypes { get; set; }
    public DbSet<TaskPriorityLevel> TaskPriorityLevels { get; set; }
    public DbSet<TaskCategoryTargetDay> TaskCategoryTargetDays { get; set; }
    public DbSet<Shop> Shops { get; set; }
    public DbSet<Notification> Notifications { get; set; }
    public DbSet<PerformanceMetric> PerformanceMetrics { get; set; }
    public DbSet<TaskComment> TaskComments { get; set; }
    public DbSet<TaskAttachment> TaskAttachments { get; set; }
    public DbSet<TaskTransfer> TaskTransfers { get; set; }
    public DbSet<CompletedTask> CompletedTasks { get; set; }
    public DbSet<CompletedTaskComment> CompletedTaskComments { get; set; }
    public DbSet<CompletedTaskAttachment> CompletedTaskAttachments { get; set; }
    public DbSet<EmployeeSchedule> EmployeeSchedules { get; set; }
    public DbSet<Transfer> Transfers { get; set; }

    // Amendment-related DbSets
    public DbSet<AmendmentRequest> AmendmentRequests { get; set; }
    public DbSet<AmendmentAuditTrail> AmendmentAuditTrails { get; set; }
    public DbSet<TaskStatusHistory> TaskStatusHistories { get; set; }
    
    // FIXED: Added missing TaskUpdateHistories DbSet
    public DbSet<TaskUpdateHistory> TaskUpdateHistories { get; set; }
    
    // User Audit Log DbSet
    public DbSet<UserAuditLog> UserAuditLogs { get; set; }

    // Intervention Requests DbSet
    public DbSet<InterventionRequest> InterventionRequests { get; set; }

    // CRITICAL FIX: Added missing TaskHoldRequest and UserDateCount DbSets
    public DbSet<TaskHoldRequest> TaskHoldRequests { get; set; }
    public DbSet<UserDateCount> UserDateCounts { get; set; }

    // CRITICAL FIX: Added missing Departments DbSet
    public DbSet<Department> Departments { get; set; }

    // CRITICAL FIX: Added missing DirectorPermissions DbSet
    public DbSet<DirectorPermission> DirectorPermissions { get; set; }
    
    // Team Leader Permissions DbSet
    public DbSet<TlPermission> TlPermissions { get; set; }

    // Role-based Permission Matrix DbSet
    public DbSet<RolePermission> RolePermissions { get; set; }

    // Workload Adjustment Requests DbSet
    public DbSet<WorkloadAdjustmentRequest> WorkloadAdjustmentRequests { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Configure default values for BaseEntity properties
        var maxDate = new DateTime(9999, 12, 31, 23, 59, 59, DateTimeKind.Utc);

        // Configure BaseEntity defaults for all entities that inherit from it
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            if (typeof(BaseEntity).IsAssignableFrom(entityType.ClrType))
            {
                modelBuilder.Entity(entityType.ClrType)
                    .Property(nameof(BaseEntity.StartDate))
                    .HasDefaultValueSql("GETUTCDATE()");

                modelBuilder.Entity(entityType.ClrType)
                    .Property(nameof(BaseEntity.EndDate))
                    .HasDefaultValue(maxDate);

                modelBuilder.Entity(entityType.ClrType)
                    .Property(nameof(BaseEntity.RegisteredDate))
                    .HasDefaultValueSql("GETUTCDATE()");

                modelBuilder.Entity(entityType.ClrType)
                    .Property(nameof(BaseEntity.LastUpdateDate))
                    .HasDefaultValueSql("GETUTCDATE()");
            }
        }

        // Configure User entity
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(e => e.Username).IsUnique();
            entity.HasIndex(e => e.Email).IsUnique();
            
            entity.Property(e => e.Role)
                .HasConversion<string>()
                .HasMaxLength(50);
                
            entity.Property(e => e.Status)
                .HasConversion<string>()
                .HasMaxLength(20);

            // NEW: Configure PhoneNumber property
            entity.Property(e => e.PhoneNumber)
                .HasMaxLength(20)
                .IsRequired(false);

            // NEW: Configure PersonnelType property
            entity.Property(e => e.PersonnelType)
                .HasMaxLength(50)
                .IsRequired(false);

            // NEW: Configure CanCreateTeamLeader property with default value
            entity.Property(e => e.CanCreateTeamLeader)
                .HasDefaultValue(false)
                .IsRequired();

            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("GETUTCDATE()");

            // Self-referencing relationships
            entity.HasOne(e => e.Supervisor)
                .WithMany(s => s.SupervisedUsers)
                .HasForeignKey(e => e.SupervisorId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.CreatedByUser)
                .WithMany(c => c.CreatedUsers)
                .HasForeignKey(e => e.CreatedByUserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.Manager)
                .WithMany(m => m.ManagedUsers)
                .HasForeignKey(e => e.ManagerId)
                .OnDelete(DeleteBehavior.NoAction);

            // User-Shop relationship
            entity.HasOne(e => e.Shop)
                .WithMany(s => s.Users)
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.SetNull);

            // User-Department relationship (primary relationship for all users)
            entity.HasOne(e => e.Department)
                .WithMany(d => d.Users)
                .HasForeignKey(e => e.DepartmentId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // FIXED: Configure Department entity - removed duplicate Managers relationship
        modelBuilder.Entity<Department>(entity =>
        {
            entity.HasIndex(e => e.Name).IsUnique();
            
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("GETUTCDATE()");

            // Department-Director relationship (one director creates multiple departments)
            entity.HasOne(e => e.Director)
                .WithMany(u => u.CreatedDepartments)
                .HasForeignKey(e => e.DirectorId)
                .OnDelete(DeleteBehavior.NoAction);

            // REMOVED: Separate Managers relationship configuration
            // Department.Managers is a collection property that will be populated in application logic
            // by filtering Department.Users where Role = Manager
            // Both Managers and Users point to the same underlying User.Department relationship
            // Only one relationship configuration is needed (already configured in User entity above)
        });

        // Configure DirectorPermission entity
        modelBuilder.Entity<DirectorPermission>(entity =>
        {
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("GETUTCDATE()");

            // One-to-one relationship: each Director has one permission record
            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.UserId).IsUnique();
        });

        // Configure TlPermission entity (Team Leader permissions)
        // FIX: Added explicit column configuration for the 4 missing metric visibility columns
        modelBuilder.Entity<TlPermission>(entity =>
        {
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("GETUTCDATE()");

            // Granular per-card metric visibility columns
            // These columns must exist in the database - run migration after updating this file
            entity.Property(e => e.CanViewCompletionRate)
                .HasDefaultValue(true)
                .IsRequired();

            entity.Property(e => e.CanViewAvgDelay)
                .HasDefaultValue(true)
                .IsRequired();

            entity.Property(e => e.CanViewTasksCompleted)
                .HasDefaultValue(true)
                .IsRequired();

            entity.Property(e => e.CanViewPendingTasks)
                .HasDefaultValue(true)
                .IsRequired();

            // Workload & Task Creation permissions
            entity.Property(e => e.CanWorkloadAdjustment)
                .HasDefaultValue(true)
                .IsRequired();

            entity.Property(e => e.CanCreateTask)
                .HasDefaultValue(true)
                .IsRequired();

            // One-to-one relationship: each Team Leader has one permission record
            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.UserId).IsUnique();
        });

       // Configure RolePermission entity
        modelBuilder.Entity<RolePermission>(entity =>
        {
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
        
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("GETUTCDATE()");

            // Composite unique index: each (role, permission) combination is unique
            entity.HasIndex(e => new { e.RoleKey, e.PermissionKey }).IsUnique();
        });

        // Configure UserAuditLog entity
        modelBuilder.Entity<UserAuditLog>(entity =>
        {
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");

            entity.HasIndex(e => e.TargetUserId);
            entity.HasIndex(e => e.PerformedByUserId);
            entity.HasIndex(e => e.CreatedAt);

            entity.HasOne(e => e.TargetUser)
                .WithMany()
                .HasForeignKey(e => e.TargetUserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.PerformedByUser)
                .WithMany()
                .HasForeignKey(e => e.PerformedByUserId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        // Configure Shop entity
        modelBuilder.Entity<Shop>(entity =>
        {
            entity.HasIndex(e => e.Name).IsUnique();
            
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
            
            // Shop-TeamLeader relationship (one-to-one)
            entity.HasOne(e => e.TeamLeader)
                .WithMany()
                .HasForeignKey(e => e.TeamLeaderId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // Configure Task entity
        modelBuilder.Entity<TaskEntity>(entity =>
        {
            entity.Property(e => e.Status)
                .HasConversion<string>()
                .HasMaxLength(20);
                
            entity.Property(e => e.AmendmentStatus)
                .HasConversion<string>()
                .HasMaxLength(50);

            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("GETUTCDATE()");

            // Configure relationships
            entity.HasOne(e => e.Category)
                .WithMany(c => c.Tasks)
                .HasForeignKey(e => e.CategoryId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.Creator)
                .WithMany(u => u.CreatedTasks)
                .HasForeignKey(e => e.CreatedBy)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.AmendmentReviewer)
                .WithMany()
                .HasForeignKey(e => e.AmendmentReviewedByTlId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.RejectedByUser)
                .WithMany()
                .HasForeignKey(e => e.RejectedBy)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.CancelledByUser)
                .WithMany()
                .HasForeignKey(e => e.CancelledBy)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.SubType)
                .WithMany()
                .HasForeignKey(e => e.SubTypeId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.RequestType)
                .WithMany(rt => rt.Tasks)
                .HasForeignKey(e => e.RequestTypeId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.Priority)
                .WithMany()
                .HasForeignKey(e => e.PriorityId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.Shop)
                .WithMany(s => s.Tasks)
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.AmendmentRequestEntity)
                .WithOne(ar => ar.Task)
                .HasForeignKey<TaskEntity>(e => e.AmendmentRequestId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.AmendmentRequester)
                .WithMany()
                .HasForeignKey(e => e.AmendmentRequestedBy)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.ReopenedByUser)
                .WithMany()
                .HasForeignKey(e => e.ReopenedBy)
                .OnDelete(DeleteBehavior.NoAction);

            // CRITICAL FIX: Configure Pause/Resume fields for Task entity
            entity.Property(e => e.IsPaused)
                .HasDefaultValue(false)
                .IsRequired();

            entity.Property(e => e.PausedAt)
                .IsRequired(false);

            entity.Property(e => e.PausedReason)
                .IsRequired(false);

            entity.Property(e => e.TotalPausedDurationMinutes)
                .HasDefaultValue(0L)
                .IsRequired();

            entity.Property(e => e.LastResumedAt)
                .IsRequired(false);

            entity.Property(e => e.PausedBy)
                .IsRequired(false);

            entity.HasOne(e => e.PausedByUser)
                .WithMany()
                .HasForeignKey(e => e.PausedBy)
                .OnDelete(DeleteBehavior.NoAction);

            // Configure StatusChangedAt - tracks when the task status was last changed
            // Updated whenever Status transitions (e.g., Pending → InProgress, InProgress → OnHold, etc.)
            // Used by the frontend to track when exactly the status changed and for overdue calculations
            // NOTE: You must add this column to the database via migration:
            //   ALTER TABLE [tasks] ADD [status_changed_at] DATETIME2 NULL;
            entity.Property(e => e.StatusChangedAt)
                .HasColumnName("status_changed_at")
                .IsRequired(false);

            // Configure AssignedAt - the date when the task was assigned to an engineer
            // Used for performance metrics calculations instead of CreatedAt
            entity.Property(e => e.AssignedAt)
                .IsRequired(false);

            // Configure AdjustedEstimatedHours - set when a workload adjustment request is approved
            // Overrides EstimatedHours for workload and performance calculations
            entity.Property(e => e.AdjustedEstimatedHours)
                .HasPrecision(10, 2)
                .IsRequired(false);
        });


        // Configure Transfer entity
        modelBuilder.Entity<Transfer>(entity =>
        {
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");

            entity.HasOne(e => e.FromShopNavigation)
                .WithMany()
                .HasForeignKey(e => e.FromShopId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.ToShopNavigation)
                .WithMany()
                .HasForeignKey(e => e.ToShopId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.Creator)
                .WithMany()
                .HasForeignKey(e => e.CreatedBy)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasIndex(e => e.CreatedBy);
            entity.HasIndex(e => e.FromShopId);
            entity.HasIndex(e => e.ToShopId);
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.CreatedAt);
        });

        // FIXED: Configure TaskUpdateHistory entity - Changed DeleteBehavior from Cascade to NoAction
        // This ensures update history is preserved when tasks are moved to completed_tasks table
        modelBuilder.Entity<TaskUpdateHistory>(entity =>
        {
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("GETUTCDATE()");

            entity.HasOne(e => e.Task)
                .WithMany()
                .HasForeignKey(e => e.TaskId)
                .OnDelete(DeleteBehavior.NoAction); // CHANGED: From Cascade to NoAction

            entity.HasOne(e => e.UpdatedByUser)
                .WithMany()
                .HasForeignKey(e => e.UpdatedByUserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasIndex(e => e.TaskId);
            entity.HasIndex(e => e.UpdatedByUserId);
            entity.HasIndex(e => e.UpdatedAt);
        });

        // Configure AmendmentRequest entity
        modelBuilder.Entity<AmendmentRequest>(entity =>
        {
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("GETUTCDATE()");

            entity.HasOne(e => e.Requester)
                .WithMany()
                .HasForeignKey(e => e.RequesterId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.ReviewedByTl)
                .WithMany()
                .HasForeignKey(e => e.ReviewedByTlId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.ReviewedByDirector)
                .WithMany()
                .HasForeignKey(e => e.ReviewedByDirectorId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.ResolvedBy)
                .WithMany()
                .HasForeignKey(e => e.ResolvedById)
                .OnDelete(DeleteBehavior.NoAction);
        });

        // CRITICAL FIX: Configure AmendmentAuditTrail entity
        // TaskId is NO LONGER a foreign key - it's just an integer field
        // This prevents FK constraint violations when tasks are moved to completed_tasks
        modelBuilder.Entity<AmendmentAuditTrail>(entity =>
        {
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");

            entity.HasOne(e => e.AmendmentRequest)
                .WithMany(ar => ar.AuditTrail)
                .HasForeignKey(e => e.AmendmentRequestId)
                .OnDelete(DeleteBehavior.Cascade);

            // REMOVED: Task foreign key relationship
            // TaskId is now just a simple integer field without FK constraint

            entity.HasOne(e => e.ActionByUser)
                .WithMany()
                .HasForeignKey(e => e.ActionByUserId)
                .OnDelete(DeleteBehavior.NoAction);
                
            // Add index on TaskId for query performance
            entity.HasIndex(e => e.TaskId);
        });

        // CRITICAL FIX: Configure TaskStatusHistory entity
        // TaskId is NO LONGER a foreign key - it's just an integer field
        // This prevents FK constraint violations when tasks are moved to completed_tasks
        modelBuilder.Entity<TaskStatusHistory>(entity =>
        {
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");

            // REMOVED: Task foreign key relationship
            // TaskId is now just a simple integer field without FK constraint

            entity.HasOne(e => e.ChangedByUser)
                .WithMany()
                .HasForeignKey(e => e.ChangedByUserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.RelatedAmendmentRequest)
                .WithMany()
                .HasForeignKey(e => e.RelatedAmendmentRequestId)
                .OnDelete(DeleteBehavior.SetNull);
                
            // Add index on TaskId for query performance
            entity.HasIndex(e => e.TaskId);
        });

        // FIXED: Configure InterventionRequest entity - Changed DeleteBehavior from Cascade to NoAction
        // This ensures intervention history is preserved when tasks are moved to completed_tasks table
        modelBuilder.Entity<InterventionRequest>(entity =>
        {
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("GETUTCDATE()");

            entity.Property(e => e.RequestedAt)
                .HasDefaultValueSql("GETUTCDATE()");

            entity.HasOne(e => e.Task)
                .WithMany()
                .HasForeignKey(e => e.TaskId)
                .OnDelete(DeleteBehavior.NoAction); // CHANGED: From Cascade to NoAction

            entity.HasOne(e => e.RequestedByUser)
                .WithMany()
                .HasForeignKey(e => e.RequestedBy)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.AcknowledgedByUser)
                .WithMany()
                .HasForeignKey(e => e.AcknowledgedBy)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.ResolvedByUser)
                .WithMany()
                .HasForeignKey(e => e.ResolvedBy)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasIndex(e => e.TaskId);
            entity.HasIndex(e => e.RequestedBy);
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.EscalationLevel);
            entity.HasIndex(e => e.CreatedAt);
        });

        // CRITICAL FIX: Configure TaskHoldRequest entity
        modelBuilder.Entity<TaskHoldRequest>(entity =>
        {
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("GETUTCDATE()");

            entity.Property(e => e.HoldRequestedDate)
                .HasDefaultValueSql("GETUTCDATE()");

            entity.HasOne(e => e.Task)
                .WithMany()
                .HasForeignKey(e => e.TaskId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.RequestedByEngineer)
                .WithMany()
                .HasForeignKey(e => e.RequestedByEngineerId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.ReviewedByTl)
                .WithMany()
                .HasForeignKey(e => e.ReviewedByTlId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasIndex(e => e.TaskId);
            entity.HasIndex(e => e.RequestedByEngineerId);
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.HoldRequestedDate);
        });

        // CRITICAL FIX: Configure UserDateCount entity
        modelBuilder.Entity<UserDateCount>(entity =>
        {
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("GETUTCDATE()");

            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.Task)
                .WithMany()
                .HasForeignKey(e => e.TaskId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.TransferredFromUser)
                .WithMany()
                .HasForeignKey(e => e.TransferredFromUserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasIndex(e => e.UserId);
            entity.HasIndex(e => e.TaskId);
            entity.HasIndex(e => new { e.UserId, e.TaskId });
        });

        // Configure WorkloadAdjustmentRequest entity
        modelBuilder.Entity<WorkloadAdjustmentRequest>(entity =>
        {
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("GETUTCDATE()");

            entity.Property(e => e.OriginalEstimatedHours)
                .HasPrecision(10, 2)
                .IsRequired();

            entity.Property(e => e.RequestedEstimatedHours)
                .HasPrecision(10, 2)
                .IsRequired();

            entity.Property(e => e.ApprovedEstimatedHours)
                .HasPrecision(10, 2)
                .IsRequired(false);

            entity.Property(e => e.Status)
                .HasMaxLength(50)
                .IsRequired();

            entity.Property(e => e.RequestReason)
                .IsRequired();

            // NEW: Configure RequestUnit property - stores "hours" or "days"
            entity.Property(e => e.RequestUnit)
                .HasMaxLength(10)
                .HasDefaultValue("hours")
                .IsRequired(false);

            // NEW: Configure PreviousTargetCompletionDate - audit trail for date changes
            entity.Property(e => e.PreviousTargetCompletionDate)
                .IsRequired(false);

            // NEW: Configure NewTargetCompletionDate - audit trail for date changes
            entity.Property(e => e.NewTargetCompletionDate)
                .IsRequired(false);

            entity.Property(e => e.TlReviewComments)
                .IsRequired(false);

            entity.HasOne(e => e.Task)
                .WithMany()
                .HasForeignKey(e => e.TaskId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.Requester)
                .WithMany()
                .HasForeignKey(e => e.RequesterId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.ReviewedByTl)
                .WithMany()
                .HasForeignKey(e => e.ReviewedByTlId)
                .OnDelete(DeleteBehavior.NoAction);

            // Indexes for query performance
            entity.HasIndex(e => e.TaskId);
            entity.HasIndex(e => e.RequesterId);
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.CreatedAt);
        });

        // Configure CompletedTask entity
        modelBuilder.Entity<CompletedTask>(entity =>
        {
            entity.Property(e => e.Status)
                .HasConversion<string>()
                .HasMaxLength(20);
                
            entity.Property(e => e.AmendmentStatus)
                .HasConversion<string>()
                .HasMaxLength(50);

            entity.Property(e => e.CompletedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.Property(e => e.MovedToCompletedAt)
                .HasDefaultValueSql("GETUTCDATE()");

            entity.HasOne(e => e.Category)
                .WithMany()
                .HasForeignKey(e => e.CategoryId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.Creator)
                .WithMany()
                .HasForeignKey(e => e.CreatedBy)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.AmendmentReviewer)
                .WithMany()
                .HasForeignKey(e => e.AmendmentReviewedByTlId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.RejectedByUser)
                .WithMany()
                .HasForeignKey(e => e.RejectedBy)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.CancelledByUser)
                .WithMany()
                .HasForeignKey(e => e.CancelledBy)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.SubType)
                .WithMany()
                .HasForeignKey(e => e.SubTypeId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.RequestType)
                .WithMany()
                .HasForeignKey(e => e.RequestTypeId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.Priority)
                .WithMany()
                .HasForeignKey(e => e.PriorityId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.Shop)
                .WithMany()
                .HasForeignKey(e => e.ShopId)
                .OnDelete(DeleteBehavior.SetNull);

            // ADDED: Configure navigation for amendment requester
            entity.HasOne(e => e.AmendmentRequester)
                .WithMany()
                .HasForeignKey(e => e.AmendmentRequestedBy)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(e => e.ReopenedByUser)
                .WithMany()
                .HasForeignKey(e => e.ReopenedBy)
                .OnDelete(DeleteBehavior.NoAction);

            // Configure TaskAssignedAt - copied from Task.AssignedAt when task is moved to completed
            // Used for performance metrics calculations instead of TaskCreatedAt
            entity.Property(e => e.TaskAssignedAt)
                .IsRequired(false);

            // Configure EngineerCompletedAt - the date/time when the engineer marked the task as completed
            // Copied from Task.ActualCompletionDate when task is moved to completed
            // Distinct from CompletedAt which records when MoveTaskToCompletedAsync runs (TL approval time)
            entity.Property(e => e.EngineerCompletedAt)
                .HasColumnName("engineer_completed_at")
                .IsRequired(false);
        });

        // Configure CompletedTaskComment entity
        modelBuilder.Entity<CompletedTaskComment>(entity =>
        {
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.HasOne(e => e.CompletedTask)
                .WithMany(t => t.TaskComments)
                .HasForeignKey(e => e.CompletedTaskId)
                .OnDelete(DeleteBehavior.Cascade);
                
            entity.HasOne(e => e.Author)
                .WithMany()
                .HasForeignKey(e => e.AuthorId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        // Configure CompletedTaskAttachment entity
        modelBuilder.Entity<CompletedTaskAttachment>(entity =>
        {
            entity.Property(e => e.UploadedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.HasOne(e => e.CompletedTask)
                .WithMany(t => t.Attachments)
                .HasForeignKey(e => e.CompletedTaskId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Configure TaskCategory entity
        modelBuilder.Entity<TaskCategory>(entity =>
        {
            entity.HasIndex(e => e.Name).IsUnique();
        });

        // Configure TaskCategoryTargetDay entity
        modelBuilder.Entity<TaskCategoryTargetDay>(entity =>
        {
            entity.HasIndex(e => e.CategoryId).IsUnique();
            
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("GETUTCDATE()");

            // Configure TargetHours and TargetMinutes with default values
            entity.Property(e => e.TargetHours)
                .HasDefaultValue(0);

            entity.Property(e => e.TargetMinutes)
                .HasDefaultValue(0);
            
            entity.HasOne(e => e.Category)
                .WithOne(c => c.TargetDay)
                .HasForeignKey<TaskCategoryTargetDay>(e => e.CategoryId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Configure TaskPriorityLevel entity
        modelBuilder.Entity<TaskPriorityLevel>(entity =>
        {
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
        });

        // Configure TaskSubType entity
        modelBuilder.Entity<TaskSubType>(entity =>
        {
            entity.HasIndex(e => new { e.CategoryId, e.Name }).IsUnique();
            
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.HasOne(e => e.Category)
                .WithMany(c => c.SubTypes)
                .HasForeignKey(e => e.CategoryId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        // Configure RequestType entity
        modelBuilder.Entity<RequestType>(entity =>
        {
            entity.HasIndex(e => e.Name).IsUnique();
            
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
        });

        // CRITICAL FIX: Configure Notification entity
        // TaskId foreign key now uses SetNull to prevent FK constraint violations
        modelBuilder.Entity<Notification>(entity =>
        {
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.HasOne(e => e.Recipient)
                .WithMany(u => u.Notifications)
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);
                
            // FIXED: Task relationship with SetNull behavior
            // When a task is deleted/moved, TaskId is set to NULL instead of causing FK violation
            entity.HasOne(e => e.Task)
                .WithMany()
                .HasForeignKey(e => e.TaskId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // Configure PerformanceMetric entity
        modelBuilder.Entity<PerformanceMetric>(entity =>
        {
            entity.Property(e => e.AverageCompletionTime)
                .HasPrecision(10, 2);
                
            entity.Property(e => e.EfficiencyRating)
                .HasPrecision(5, 2);

            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("GETUTCDATE()");

            entity.HasOne(e => e.User)
                .WithOne(u => u.PerformanceMetric)
                .HasForeignKey<PerformanceMetric>(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Configure TaskComment entity
        modelBuilder.Entity<TaskComment>(entity =>
        {
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("GETUTCDATE()");

            entity.Property(e => e.CommentType)
                .HasConversion<string>()
                .HasMaxLength(50);
                
            entity.HasOne(e => e.Task)
                .WithMany(t => t.TaskComments)
                .HasForeignKey(e => e.TaskId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.Author)
                .WithMany()
                .HasForeignKey(e => e.AuthorId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        // Configure TaskAttachment entity
        modelBuilder.Entity<TaskAttachment>(entity =>
        {
            entity.Property(e => e.UploadedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.HasOne(e => e.Task)
                .WithMany(t => t.Attachments)
                .HasForeignKey(e => e.TaskId)
                .OnDelete(DeleteBehavior.Cascade);
                
            entity.HasOne(e => e.UploadedByUser)
                .WithMany()
                .HasForeignKey(e => e.UploadedBy)
                .OnDelete(DeleteBehavior.NoAction);
        });

        // FIXED: Configure TaskTransfer entity - Changed DeleteBehavior from Cascade to NoAction
        // This ensures transfer history is preserved when tasks are moved to completed_tasks table
        modelBuilder.Entity<TaskTransfer>(entity =>
        {
            entity.Property(e => e.TransferDate)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETUTCDATE()");
                
            entity.HasOne(e => e.Task)
                .WithMany()
                .HasForeignKey(e => e.TaskId)
                .OnDelete(DeleteBehavior.NoAction); // CHANGED: From Cascade to NoAction
            entity.HasOne(e => e.FromUser)
                .WithMany()
                .HasForeignKey(e => e.FromUserId)
                .OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(e => e.ToUser)
                .WithMany()
                .HasForeignKey(e => e.ToUserId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        // Seed Data
        SeedData(modelBuilder);
    }

    private void SeedData(ModelBuilder modelBuilder)
    {
        var defaultDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var maxDate = new DateTime(9999, 12, 31, 23, 59, 59, DateTimeKind.Utc);

        // Seed Shops
        modelBuilder.Entity<Shop>().HasData(
            new Shop
            {
                ShopId = 1,
                Name = "Machine Shop",
                Description = "Handles all machining tasks.",
                StartDate = defaultDate,
                EndDate = maxDate,
                TimeZoneInfo = "UTC",
                RegisteredDate = defaultDate,
                RegisteredBy = "System",
                LastUpdateDate = defaultDate,
                UpdatedBy = "System",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false,
                CreatedAt = defaultDate
            },
            new Shop
            {
                ShopId = 2,
                Name = "Paint Shop",
                Description = "Handles all painting tasks.",
                StartDate = defaultDate,
                EndDate = maxDate,
                TimeZoneInfo = "UTC",
                RegisteredDate = defaultDate,
                RegisteredBy = "System",
                LastUpdateDate = defaultDate,
                UpdatedBy = "System",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false,
                CreatedAt = defaultDate
            },
            new Shop
            {
                ShopId = 3,
                Name = "Welding Shop",
                Description = "Handles all welding tasks.",
                StartDate = defaultDate,
                EndDate = maxDate,
                TimeZoneInfo = "UTC",
                RegisteredDate = defaultDate,
                RegisteredBy = "System",
                LastUpdateDate = defaultDate,
                UpdatedBy = "System",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false,
                CreatedAt = defaultDate
            }
        );

        // Seed Task Categories
        modelBuilder.Entity<TaskCategory>().HasData(
            new TaskCategory
            {
                CategoryId = 1,
                Name = "AOG & CSD Components Evaluation",
                Description = "Aircraft on Ground (AOG) and Critical Spares Demand (CSD) component evaluations.",
                StartDate = defaultDate,
                EndDate = maxDate,
                TimeZoneInfo = "UTC",
                RegisteredDate = defaultDate,
                RegisteredBy = "System",
                LastUpdateDate = defaultDate,
                UpdatedBy = "System",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false
            },
            new TaskCategory
            {
                CategoryId = 2,
                Name = "Task Card Related",
                Description = "Tasks related to creating, revising, or approving task cards.",
                StartDate = defaultDate,
                EndDate = maxDate,
                TimeZoneInfo = "UTC",
                RegisteredDate = defaultDate,
                RegisteredBy = "System",
                LastUpdateDate = defaultDate,
                UpdatedBy = "System",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false
            },
            new TaskCategory
            {
                CategoryId = 3,
                Name = "Scrap Evaluation & Approval",
                Description = "Evaluation and approval process for parts marked for scrap.",
                StartDate = defaultDate,
                EndDate = maxDate,
                TimeZoneInfo = "UTC",
                RegisteredDate = defaultDate,
                RegisteredBy = "System",
                LastUpdateDate = defaultDate,
                UpdatedBy = "System",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false
            }
        );

        // Seed Task Priority Levels
        modelBuilder.Entity<TaskPriorityLevel>().HasData(
            new TaskPriorityLevel
            {
                PriorityId = 1,
                LevelName = "Critical",
                OrderRank = 0,
                CreatedAt = defaultDate,
                UpdatedAt = defaultDate,
                StartDate = defaultDate,
                EndDate = maxDate,
                TimeZoneInfo = "UTC",
                RegisteredDate = defaultDate,
                RegisteredBy = "System",
                LastUpdateDate = defaultDate,
                UpdatedBy = "System",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false
            },
            new TaskPriorityLevel
            {
                PriorityId = 2,
                LevelName = "High",
                OrderRank = 1,
                CreatedAt = defaultDate,
                UpdatedAt = defaultDate,
                StartDate = defaultDate,
                EndDate = maxDate,
                TimeZoneInfo = "UTC",
                RegisteredDate = defaultDate,
                RegisteredBy = "System",
                LastUpdateDate = defaultDate,
                UpdatedBy = "System",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false
            },
            new TaskPriorityLevel
            {
                PriorityId = 3,
                LevelName = "Medium",
                OrderRank = 2,
                CreatedAt = defaultDate,
                UpdatedAt = defaultDate,
                StartDate = defaultDate,
                EndDate = maxDate,
                TimeZoneInfo = "UTC",
                RegisteredDate = defaultDate,
                RegisteredBy = "System",
                LastUpdateDate = defaultDate,
                UpdatedBy = "System",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false
            },
            new TaskPriorityLevel
            {
                PriorityId = 4,
                LevelName = "Low",
                OrderRank = 3,
                CreatedAt = defaultDate,
                UpdatedAt = defaultDate,
                StartDate = defaultDate,
                EndDate = maxDate,
                TimeZoneInfo = "UTC",
                RegisteredDate = defaultDate,
                RegisteredBy = "System",
                LastUpdateDate = defaultDate,
                UpdatedBy = "System",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false
            }
        );

        // Seed Default Users with proper BCrypt password hashing
        // Default password: "CMT@2024" - hashed with BCrypt
        var defaultPasswordHash = "$2b$12$HtyFpgtGlYmcvN.npVofReQzuDKZoj23IK6HXCyYOrO2QcdknHg3.";

        modelBuilder.Entity<User>().HasData(
            new User
            {
                UserId = 1,
                Username = "team_leader",
                Password = defaultPasswordHash,
                Email = "team_leader@cmt.com",
                FullName = "Team Leader",
                Role = UserRole.TeamLeader,
                Status = UserStatus.Active,
                ShopId = 1,
                CanCreateTeamLeader = false,
                CreatedAt = defaultDate,
                UpdatedAt = defaultDate,
                StartDate = defaultDate,
                EndDate = maxDate,
                TimeZoneInfo = "UTC",
                RegisteredDate = defaultDate,
                RegisteredBy = "System",
                LastUpdateDate = defaultDate,
                UpdatedBy = "System",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false
            },
            new User
            {
                UserId = 2,
                Username = "director",
                Password = defaultPasswordHash,
                Email = "director@cmt.com",
                FullName = "Director",
                Role = UserRole.Director,
                Status = UserStatus.Active,
                CanCreateTeamLeader = true,
                CreatedAt = defaultDate,
                UpdatedAt = defaultDate,
                StartDate = defaultDate,
                EndDate = maxDate,
                TimeZoneInfo = "UTC",
                RegisteredDate = defaultDate,
                RegisteredBy = "System",
                LastUpdateDate = defaultDate,
                UpdatedBy = "System",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false
            },
            new User
            {
                UserId = 3,
                Username = "engineer",
                Password = defaultPasswordHash,
                Email = "engineer@cmt.com",
                FullName = "Engineer",
                Role = UserRole.Engineer,
                Status = UserStatus.Active,
                ShopId = 1,
                SupervisorId = 1,
                CanCreateTeamLeader = false,
                CreatedAt = defaultDate,
                UpdatedAt = defaultDate,
                StartDate = defaultDate,
                EndDate = maxDate,
                TimeZoneInfo = "UTC",
                RegisteredDate = defaultDate,
                RegisteredBy = "System",
                LastUpdateDate = defaultDate,
                UpdatedBy = "System",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false
            },
            new User
            {
                UserId = 4,
                Username = "shop_tl",
                Password = defaultPasswordHash,
                Email = "shop_tl@cmt.com",
                FullName = "Shop Team Leader",
                Role = UserRole.ShopTL,
                Status = UserStatus.Active,
                ShopId = 2,
                CanCreateTeamLeader = false,
                CreatedAt = defaultDate,
                UpdatedAt = defaultDate,
                StartDate = defaultDate,
                EndDate = maxDate,
                TimeZoneInfo = "UTC",
                RegisteredDate = defaultDate,
                RegisteredBy = "System",
                LastUpdateDate = defaultDate,
                UpdatedBy = "System",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false
            },
            new User
            {
                UserId = 100, // Using high ID to avoid conflicts
                Username = "santa",
                Password = defaultPasswordHash,
                Email = "santa@cmt.com",
                FullName = "Santa (Admin)",
                Role = UserRole.Admin,
                Status = UserStatus.Active,
                CanCreateTeamLeader = true,
                CreatedAt = defaultDate,
                UpdatedAt = defaultDate,
                StartDate = defaultDate,
                EndDate = maxDate,
                TimeZoneInfo = "UTC",
                RegisteredDate = defaultDate,
                RegisteredBy = "System",
                LastUpdateDate = defaultDate,
                UpdatedBy = "System",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false
            }
        );

        // UPDATED: Seed Sample Departments (removed ManagerId since we now support multiple managers)
        modelBuilder.Entity<Department>().HasData(
            new Department
            {
                DepartmentId = 1,
                Name = "Engineering Department",
                Description = "Handles all engineering and technical operations",
                DirectorId = 2, // Director user
                IsActive = true,
                CreatedAt = defaultDate,
                UpdatedAt = defaultDate,
                StartDate = defaultDate,
                EndDate = maxDate,
                TimeZoneInfo = "UTC",
                RegisteredDate = defaultDate,
                RegisteredBy = "System",
                LastUpdateDate = defaultDate,
                UpdatedBy = "System",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false
            },
            new Department
            {
                DepartmentId = 2,
                Name = "Operations Department",
                Description = "Manages day-to-day operational activities",
                DirectorId = 2, // Same director can manage multiple departments
                IsActive = true,
                CreatedAt = defaultDate,
                UpdatedAt = defaultDate,
                StartDate = defaultDate,
                EndDate = maxDate,
                TimeZoneInfo = "UTC",
                RegisteredDate = defaultDate,
                RegisteredBy = "System",
                LastUpdateDate = defaultDate,
                UpdatedBy = "System",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false
            },
            new Department
            {
                DepartmentId = 3,
                Name = "Quality Assurance Department",
                Description = "Ensures quality standards and compliance",
                DirectorId = 2,
                IsActive = true,
                CreatedAt = defaultDate,
                UpdatedAt = defaultDate,
                StartDate = defaultDate,
                EndDate = maxDate,
                TimeZoneInfo = "UTC",
                RegisteredDate = defaultDate,
                RegisteredBy = "System",
                LastUpdateDate = defaultDate,
                UpdatedBy = "System",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false
            }
        );
    }
}