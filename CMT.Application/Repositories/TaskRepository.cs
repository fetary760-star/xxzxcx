using CMT.Application.Repositories;
using CMT.Application.Services;
using CMT.Domain.Data;
using CMT.Domain.Models;
using Microsoft.EntityFrameworkCore;
using TaskEntity = CMT.Domain.Models.Task;
using CMT.Domain.Enums;

namespace CMT.Application.Repositories;

public class TaskRepository : ITaskRepository
{
    private readonly ApplicationDbContext _context;
    private readonly ICompletedTaskService _completedTaskService;

    public TaskRepository(ApplicationDbContext context, ICompletedTaskService completedTaskService)
    {
        _context = context;
        _completedTaskService = completedTaskService;
    }

    public async Task<IEnumerable<TaskEntity>> GetAllTasksAsync()
    {
        return await _context.Tasks
            .Include(t => t.Category)
            .Include(t => t.Priority)
            .Include(t => t.Creator)
            .Include(t => t.SubType)
            .Include(t => t.RequestType)
            .Include(t => t.Shop)
            .Where(t => t.RecordStatus == RecordStatus.Active)
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync();
    }

    public async Task<TaskEntity?> GetTaskByIdAsync(int taskId)
    {
        return await _context.Tasks
            .Include(t => t.Category)
            .Include(t => t.Priority)
            .Include(t => t.Creator)
            .Include(t => t.SubType)
            .Include(t => t.RequestType)
            .Include(t => t.Shop)
            .Include(t => t.TaskComments)
            .Include(t => t.Attachments)
            .FirstOrDefaultAsync(t => t.TaskId == taskId && t.RecordStatus == RecordStatus.Active);
    }

    public async Task<IEnumerable<TaskEntity>> GetTasksWithFiltersAsync(
        int? categoryId = null,
        string? statusFilter = null,
        string? searchQuery = null,
        int? priorityId = null,
        DateTime? fromDate = null,
        DateTime? toDate = null,
        int pageNumber = 1,
        int pageSize = 50)
    {
        var query = _context.Tasks
            .Include(t => t.Category)
            .Include(t => t.Priority)
            .Include(t => t.Creator)
            .Include(t => t.SubType)
            .Include(t => t.RequestType)
            .Include(t => t.Shop)
            .Where(t => t.RecordStatus == RecordStatus.Active);

        // Apply filters
        if (categoryId.HasValue)
            query = query.Where(t => t.CategoryId == categoryId.Value);

        if (!string.IsNullOrEmpty(statusFilter))
        {
            if (Enum.TryParse<CMT.Domain.Enums.TaskStatus>(statusFilter, true, out var status))
                query = query.Where(t => t.Status == status);
        }

        if (priorityId.HasValue)
            query = query.Where(t => t.PriorityId == priorityId.Value);

        if (!string.IsNullOrEmpty(searchQuery))
        {
            query = query.Where(t => 
                t.Description.Contains(searchQuery) ||
                t.SerialNumber!.Contains(searchQuery) ||
                t.PartNumber!.Contains(searchQuery) ||
                t.PoNumber!.Contains(searchQuery) ||
                t.AssignedEngineer.Contains(searchQuery));
        }

        if (fromDate.HasValue)
            query = query.Where(t => t.CreatedAt >= fromDate.Value);

        if (toDate.HasValue)
            query = query.Where(t => t.CreatedAt <= toDate.Value);

        return await query
            .OrderByDescending(t => t.CreatedAt)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
    }

    public async Task<int> GetTotalTaskCountAsync(
        int? categoryId = null,
        string? statusFilter = null,
        string? searchQuery = null,
        int? priorityId = null,
        DateTime? fromDate = null,
        DateTime? toDate = null)
    {
        var query = _context.Tasks.Where(t => t.RecordStatus == RecordStatus.Active);

        // Apply same filters as GetTasksWithFiltersAsync
        if (categoryId.HasValue)
            query = query.Where(t => t.CategoryId == categoryId.Value);

        if (!string.IsNullOrEmpty(statusFilter))
        {
            if (Enum.TryParse<CMT.Domain.Enums.TaskStatus>(statusFilter, true, out var status))
                query = query.Where(t => t.Status == status);
        }

        if (priorityId.HasValue)
            query = query.Where(t => t.PriorityId == priorityId.Value);

        if (!string.IsNullOrEmpty(searchQuery))
        {
            query = query.Where(t => 
                t.Description.Contains(searchQuery) ||
                t.SerialNumber!.Contains(searchQuery) ||
                t.PartNumber!.Contains(searchQuery) ||
                t.PoNumber!.Contains(searchQuery) ||
                t.AssignedEngineer.Contains(searchQuery));
        }

        if (fromDate.HasValue)
            query = query.Where(t => t.CreatedAt >= fromDate.Value);

        if (toDate.HasValue)
            query = query.Where(t => t.CreatedAt <= toDate.Value);

        return await query.CountAsync();
    }

    public async Task<TaskEntity> CreateTaskAsync(TaskEntity task)
    {
        task.CreatedAt = DateTime.UtcNow;
        task.UpdatedAt = DateTime.UtcNow;
        task.RecordStatus = RecordStatus.Active;
        
        _context.Tasks.Add(task);
        await _context.SaveChangesAsync();
        
        return await GetTaskByIdAsync(task.TaskId) ?? task;
    }

    public async Task<TaskEntity> UpdateTaskAsync(TaskEntity task)
    {
        var originalTask = await _context.Tasks.AsNoTracking().FirstOrDefaultAsync(t => t.TaskId == task.TaskId);
        
        task.UpdatedAt = DateTime.UtcNow;
        task.UpdateAudit(task.UpdatedBy);
        
        _context.Tasks.Update(task);
        await _context.SaveChangesAsync();
        
        // Check if status changed to Completed
        if (originalTask != null && 
            originalTask.Status != CMT.Domain.Enums.TaskStatus.Completed && 
            task.Status == CMT.Domain.Enums.TaskStatus.Completed)
        {
            // Move task to completed_tasks table
            await _completedTaskService.MoveTaskToCompletedAsync(task);
            return task;
        }
        
        return await GetTaskByIdAsync(task.TaskId) ?? task;
    }

    public async Task<bool> DeleteTaskAsync(int taskId)
    {
        var task = await _context.Tasks.FindAsync(taskId);
        if (task == null) return false;

        task.RecordStatus = RecordStatus.Deleted;
        task.UpdatedAt = DateTime.UtcNow;
        
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<IEnumerable<TaskEntity>> GetTasksByUserIdAsync(int userId)
    {
        return await _context.Tasks
            .Include(t => t.Category)
            .Include(t => t.Priority)
            .Include(t => t.Creator)
            .Where(t => t.CreatedBy == userId && t.RecordStatus == RecordStatus.Active)
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync();
    }

    public async Task<IEnumerable<TaskEntity>> GetTasksByStatusAsync(CMT.Domain.Enums.TaskStatus status)
    {
        return await _context.Tasks
            .Include(t => t.Category)
            .Include(t => t.Priority)
            .Include(t => t.Creator)
            .Where(t => t.Status == status && t.RecordStatus == RecordStatus.Active)
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync();
    }

    public async Task<IEnumerable<TaskEntity>> GetOverdueTasksAsync()
    {
        var today = DateTime.UtcNow.Date;
        
        return await _context.Tasks
            .Include(t => t.Category)
            .Include(t => t.Priority)
            .Include(t => t.Creator)
            .Where(t => t.RecordStatus == RecordStatus.Active &&
                       t.Status != CMT.Domain.Enums.TaskStatus.Completed &&
                       t.Status != CMT.Domain.Enums.TaskStatus.Rejected &&
                       (t.TargetCompletionDate.HasValue && t.TargetCompletionDate.Value.Date < today ||
                        !t.TargetCompletionDate.HasValue && t.EstimatedCompletionDate.Date < today))
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync();
    }
}