using CMT.Application.DTOs;
using CMT.Application.Common;

namespace CMT.Application.Services
{
    public interface IDuplicateDetectionService
    {
        /// <summary>
        /// Check for duplicate tasks based on serial number, part number, and other criteria
        /// </summary>
        Task<OperationResult<DuplicateCheckResponse>> CheckDuplicatesAsync(DuplicateCheckRequest request);

        /// <summary>
        /// Get all duplicate tasks with filtering and pagination
        /// </summary>
        Task<OperationResult<(IEnumerable<DuplicateTaskDto> duplicates, int totalCount)>> GetDuplicateTasksAsync(DuplicateFilterRequest request);

        /// <summary>
        /// Process duplicate tasks (merge, mark as separate, etc.)
        /// </summary>
        Task<OperationResult<bool>> ProcessDuplicatesAsync(ProcessDuplicateRequest request, int userId);

        /// <summary>
        /// Mark tasks as duplicates and create alerts
        /// </summary>
        Task<OperationResult<bool>> MarkAsDuplicateAsync(List<int> taskIds, string notes, int userId);

        /// <summary>
        /// Get duplicate alerts for the alerts section
        /// </summary>
        Task<OperationResult<IEnumerable<DuplicateAlertDto>>> GetDuplicateAlertsAsync(int? userId = null);

        /// <summary>
        /// Mark duplicate alert as read
        /// </summary>
        Task<OperationResult<bool>> MarkAlertAsReadAsync(int alertId, int userId);

        /// <summary>
        /// Get duplicate statistics for dashboard
        /// </summary>
        Task<OperationResult<DuplicateStatistics>> GetDuplicateStatisticsAsync();

        /// <summary>
        /// Advanced duplicate detection with AI-like similarity scoring
        /// </summary>
        Task<OperationResult<DuplicateCheckResponse>> AdvancedDuplicateCheckAsync(DuplicateCheckRequest request);
    }
}