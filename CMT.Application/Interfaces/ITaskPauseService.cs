using CMT.Application.DTOs;

namespace CMT.Application.Interfaces
{
    public interface ITaskPauseService
    {
        Task<ServiceResult<TaskPauseHistoryDto>> PauseTaskAsync(int taskId, int userId, string pauseReason, CancellationToken cancellationToken = default);
        Task<ServiceResult<TaskPauseHistoryDto>> ResumeTaskAsync(int taskId, int userId, string? resumeComment, CancellationToken cancellationToken = default);
        Task<ServiceResult<TaskPauseHistoryDto>> GetPauseHistoryAsync(int taskId, CancellationToken cancellationToken = default);
    }
}