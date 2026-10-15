using CMT.Domain.Models;

namespace CMT.Application.Interfaces
{
    /// <summary>
    /// Service interface for managing task update history and audit trail
    /// </summary>
    public interface ITaskUpdateHistoryService
    {
        /// <summary>
        /// Get all update history for a specific task
        /// </summary>
        System.Threading.Tasks.Task<IEnumerable<TaskUpdateHistory>> GetTaskUpdateHistoryAsync(int taskId);

        /// <summary>
        /// Log a task update to the history table
        /// </summary>
        System.Threading.Tasks.Task<TaskUpdateHistory> LogTaskUpdateAsync(TaskUpdateHistory updateHistory);

        /// <summary>
        /// Log multiple field changes in a single update operation
        /// </summary>
        System.Threading.Tasks.Task LogTaskUpdateWithChangesAsync(
            int taskId,
            int updatedByUserId,
            string updatedByUserName,
            string updatedByUserRole,
            Dictionary<string, (string? oldValue, string? newValue)> changes,
            string? updateComment = null,
            string? ipAddress = null);

        /// <summary>
        /// Get update history with pagination
        /// </summary>
        System.Threading.Tasks.Task<(IEnumerable<TaskUpdateHistory> history, int totalCount)> GetTaskUpdateHistoryPagedAsync(
            int taskId,
            int pageNumber = 1,
            int pageSize = 50);
    }
}