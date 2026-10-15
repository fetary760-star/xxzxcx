using CMT.Domain.Models;
using TaskEntity = CMT.Domain.Models.Task;

namespace CMT.Application.Services
{
    public interface ITaskService
    {
        System.Threading.Tasks.Task<IEnumerable<TaskEntity>> GetAllTasksAsync();
        System.Threading.Tasks.Task<TaskEntity?> GetTaskByIdAsync(int taskId);
        
        // UPDATED: Enhanced method signature with amendment, user filtering, and assigned engineer filtering support
        System.Threading.Tasks.Task<(IEnumerable<TaskEntity> tasks, int totalCount)> GetTasksWithFiltersAsync(
            int? categoryId = null,
            string? statusFilter = null,
            string? searchQuery = null,
            int? priorityId = null,
            DateTime? fromDate = null,
            DateTime? toDate = null,
            int pageNumber = 1,
            int pageSize = 50,
            string? amendmentStatusFilter = null,
            bool? reopenedFilter = null,
            // NEW: User filtering parameter for shop_tl, manager, and director
            IEnumerable<int>? createdByUserIds = null,
            // NEW: Assigned engineer filtering parameter for director (to see tasks assigned to Team Leaders)
            IEnumerable<string>? assignedEngineerNames = null);
            
        System.Threading.Tasks.Task<TaskEntity> CreateTaskAsync(TaskEntity task);
        System.Threading.Tasks.Task<TaskEntity> UpdateTaskAsync(TaskEntity task, int updatedByUserId, string updatedByUserName);
        System.Threading.Tasks.Task<bool> DeleteTaskAsync(int taskId);
        System.Threading.Tasks.Task<IEnumerable<TaskEntity>> GetTasksByUserIdAsync(int userId);
        System.Threading.Tasks.Task<PerformanceMetrics> GetUserPerformanceMetricsAsync(int userId);
        System.Threading.Tasks.Task<DashboardMetrics> GetDashboardMetricsAsync();
        
        // NEW: Intervention and Comment methods
        System.Threading.Tasks.Task<IEnumerable<InterventionRequest>> GetInterventionRequestsAsync(int taskId);
        System.Threading.Tasks.Task UpdateInterventionRequestAsync(InterventionRequest interventionRequest);
        System.Threading.Tasks.Task CreateInterventionRequestAsync(InterventionRequest interventionRequest);
        System.Threading.Tasks.Task<TaskComment> AddCommentAsync(TaskComment comment);
        System.Threading.Tasks.Task<IEnumerable<TaskComment>> GetTaskCommentsAsync(int taskId);

        // ═══════════════════════════════════════════════════════════════════════
        // SOFT-DELETE MANAGEMENT METHODS (Admin only)
        // ═══════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Retrieve all soft-deleted tasks (RecordStatus == Inactive)
        /// </summary>
        System.Threading.Tasks.Task<IEnumerable<TaskEntity>> GetSoftDeletedTasksAsync();

        /// <summary>
        /// Permanently hard-delete a soft-deleted task and all its related records
        /// (comments, attachments, update history, interventions)
        /// </summary>
        System.Threading.Tasks.Task<bool> PermanentlyDeleteTaskAsync(int taskId);

        /// <summary>
        /// Restore a soft-deleted task by setting RecordStatus back to Active
        /// </summary>
        System.Threading.Tasks.Task<bool> RestoreTaskAsync(int taskId);
    }

    public class PerformanceMetrics
    {
        public double CompletionRate { get; set; }
        public double AvgDelay { get; set; }
        public int TasksCompleted { get; set; }
        public int PendingTasks { get; set; }
        public int OverdueTasks { get; set; }
        public int TotalTasks { get; set; }
    }

    public class DashboardMetrics
    {
        public int TotalTasks { get; set; }
        public int CompletedTasks { get; set; }
        public int PendingTasks { get; set; }
        public int InProgressTasks { get; set; }
        public int OverdueTasks { get; set; }
        public double CompletionRate { get; set; }
        public string AverageCompletionTime { get; set; } = "0 days";
        public IEnumerable<TaskEntity> RecentTasks { get; set; } = new List<TaskEntity>();
    }

    // Intervention Request Model
    public class InterventionRequest
    {
        public int Id { get; set; }
        public int TaskId { get; set; }
        public int RequestedBy { get; set; }
        public DateTime RequestedAt { get; set; }
        public string EscalationLevel { get; set; } = "team_lead";
        public string Status { get; set; } = "pending";
        public string Comments { get; set; } = string.Empty;
        public string UserRole { get; set; } = string.Empty;
        public DateTime? AcknowledgedAt { get; set; }
        public int? AcknowledgedBy { get; set; }
        public DateTime? ResolvedAt { get; set; }
        public int? ResolvedBy { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}