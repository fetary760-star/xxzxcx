using CMT.Application.DTOs;

namespace CMT.Application.Interfaces
{
    public interface ITaskHoldService
    {
        Task<ServiceResult<TaskHoldRequestDto>> CreateHoldRequestAsync(int taskId, int engineerId, string holdReason, CancellationToken cancellationToken = default);
        Task<ServiceResult<TaskHoldRequestDto>> ReviewHoldRequestAsync(int holdRequestId, int teamLeadId, string decision, string? action, string? reviewComments, CancellationToken cancellationToken = default);
        Task<ServiceResult<List<TaskHoldRequestDto>>> GetPendingHoldRequestsAsync(int? teamLeadId = null, CancellationToken cancellationToken = default);
        Task<ServiceResult<List<TaskHoldRequestDto>>> GetHoldRequestsByTaskIdAsync(int taskId, CancellationToken cancellationToken = default);
        Task<ServiceResult<List<UserDateCountDto>>> GetUserDateCountsAsync(int userId, int? taskId = null, CancellationToken cancellationToken = default);
        Task<ServiceResult<int>> CalculateDaysWorkedAsync(int taskId, int engineerId, CancellationToken cancellationToken = default);
        /// <summary>
        /// Get distinct task IDs where the specified engineer has submitted hold requests.
        /// Used by the frontend RBAC filter to ensure engineers can still see tasks
        /// after hold approval changes the assignment (transfer_to_tl or return_to_initiator).
        /// </summary>
        Task<ServiceResult<List<int>>> GetTaskIdsByEngineerHoldRequestsAsync(int engineerId, CancellationToken cancellationToken = default);
    }
}