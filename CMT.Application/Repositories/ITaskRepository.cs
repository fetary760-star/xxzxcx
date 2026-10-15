using CMT.Domain.Models;
using TaskEntity = CMT.Domain.Models.Task;
using CMT.Domain.Enums;

namespace CMT.Application.Repositories;

public interface ITaskRepository
{
    Task<IEnumerable<TaskEntity>> GetAllTasksAsync();
    Task<TaskEntity?> GetTaskByIdAsync(int taskId);
    Task<IEnumerable<TaskEntity>> GetTasksWithFiltersAsync(
        int? categoryId = null,
        string? statusFilter = null,
        string? searchQuery = null,
        int? priorityId = null,
        DateTime? fromDate = null,
        DateTime? toDate = null,
        int pageNumber = 1,
        int pageSize = 50);
    Task<int> GetTotalTaskCountAsync(
        int? categoryId = null,
        string? statusFilter = null,
        string? searchQuery = null,
        int? priorityId = null,
        DateTime? fromDate = null,
        DateTime? toDate = null);
    Task<TaskEntity> CreateTaskAsync(TaskEntity task);
    Task<TaskEntity> UpdateTaskAsync(TaskEntity task);
    Task<bool> DeleteTaskAsync(int taskId);
    Task<IEnumerable<TaskEntity>> GetTasksByUserIdAsync(int userId);
    Task<IEnumerable<TaskEntity>> GetTasksByStatusAsync(CMT.Domain.Enums.TaskStatus status);
    Task<IEnumerable<TaskEntity>> GetOverdueTasksAsync();
}