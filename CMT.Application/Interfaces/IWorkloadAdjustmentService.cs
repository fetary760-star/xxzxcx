using CMT.Application.DTOs;

namespace CMT.Application.Interfaces
{
    /// <summary>
    /// Service for managing workload adjustment requests.
    /// Engineers can request adjustments to task estimated hours.
    /// Team Leaders can approve or reject these requests.
    /// </summary>
    public interface IWorkloadAdjustmentService
    {
        /// <summary>
        /// Engineer creates a workload adjustment request for a task.
        /// </summary>
        Task<ServiceResult<WorkloadAdjustmentRequestDto>> CreateAdjustmentRequestAsync(
            int requesterId,
            CreateWorkloadAdjustmentDto request,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Team Leader reviews (approves/rejects) a workload adjustment request.
        /// </summary>
        Task<ServiceResult<WorkloadAdjustmentRequestDto>> ReviewAdjustmentRequestAsync(
            int adjustmentRequestId,
            int reviewerId,
            ReviewWorkloadAdjustmentDto review,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Get all pending workload adjustment requests (for TL dashboard).
        /// </summary>
        Task<ServiceResult<List<WorkloadAdjustmentRequestDto>>> GetPendingAdjustmentRequestsAsync(
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Get adjustment requests for a specific engineer.
        /// </summary>
        Task<ServiceResult<List<WorkloadAdjustmentRequestDto>>> GetAdjustmentRequestsByEngineerAsync(
            int engineerId,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Get adjustment request history for a specific task.
        /// </summary>
        Task<ServiceResult<List<WorkloadAdjustmentRequestDto>>> GetAdjustmentRequestsByTaskAsync(
            int taskId,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Get a single adjustment request by ID.
        /// </summary>
        Task<ServiceResult<WorkloadAdjustmentRequestDto>> GetAdjustmentRequestByIdAsync(
            int adjustmentRequestId,
            CancellationToken cancellationToken = default);
    }
}