using CMT.Domain.Models;

namespace CMT.Application.Services
{
    public interface ICompletedTaskService
    {
        Task<IEnumerable<CompletedTask>> GetAllCompletedTasksAsync();
        Task<CompletedTask?> GetCompletedTaskByIdAsync(int completedTaskId);
        Task<CompletedTask?> GetCompletedTaskByOriginalIdAsync(int originalTaskId);
        Task<(IEnumerable<CompletedTask> tasks, int totalCount)> GetCompletedTasksWithFiltersAsync(
            int? categoryId = null,
            string? searchQuery = null,
            int? priorityId = null,
            DateTime? fromDate = null,
            DateTime? toDate = null,
            int pageNumber = 1,
            int pageSize = 50,
            string? amendmentStatusFilter = null,
            bool? reopenedFilter = null,
            // ENHANCED: User filtering parameter for shop_tl
            IEnumerable<int>? createdByUserIds = null,
            // CRITICAL FIX: Shop filtering parameter to restrict results to specific shop
            int? shopIdFilter = null,
            // NEW: Assigned engineer filtering parameter for director (to see tasks assigned to Team Leaders)
            IEnumerable<string>? assignedEngineerNames = null);
        Task<CompletedTask> MoveTaskToCompletedAsync(CMT.Domain.Models.Task task);
        Task<CompletedTask?> ReopenCompletedTaskAsync(int completedTaskId);
        Task<bool> DeleteCompletedTaskAsync(int completedTaskId);
        
        // NEW: Methods for handling completed task comments and attachments
        Task<IEnumerable<CompletedTaskComment>> GetCompletedTaskCommentsAsync(int completedTaskId);
        Task<IEnumerable<CompletedTaskAttachment>> GetCompletedTaskAttachmentsAsync(int completedTaskId);
    }
}