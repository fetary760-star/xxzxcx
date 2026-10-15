using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using CMT.Domain.Data;
using CMT.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CMT.Application.Services;

/// <summary>
/// Service for managing employee schedules with EAT (East Africa Time) timezone support.
/// Handles CRUD operations, approval workflow, conflict detection, and working-hour calculations.
///
/// EAT Schedule Constants:
///   Shift:   08:00 – 17:00 (9 gross hours)
///   Breaks:  Morning tea 15 min, Lunch 75 min, Afternoon 15 min → 105 min total
///   Net:     435 min → 7.25 hours (7 h 15 min) per day
///   Days off: Saturday & Sunday (amendable)
/// </summary>
public class ScheduleService : IScheduleService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<ScheduleService> _logger;

    // EAT schedule constants
    private static readonly TimeSpan DefaultStartTime = new(8, 0, 0);   // 08:00
    private static readonly TimeSpan DefaultEndTime   = new(17, 0, 0);  // 17:00
    private const int MorningTeaBreakMinutes   = 15;
    private const int LunchBreakMinutes        = 75;  // 1 hour 15 minutes
    private const int AfternoonBreakMinutes    = 15;
    private const int TotalBreakMinutes        = MorningTeaBreakMinutes + LunchBreakMinutes + AfternoonBreakMinutes; // 105
    private const decimal GrossShiftHours      = 9.0m;    // 08:00–17:00
    private const decimal NetWorkHoursPerDay   = 7.25m;   // (540 - 105) / 60

    public ScheduleService(ApplicationDbContext context, ILogger<ScheduleService> logger)
    {
        _context = context;
        _logger  = logger;
    }

    /// <inheritdoc />
    public async Task<(IEnumerable<EmployeeSchedule> schedules, int totalCount)> GetSchedulesAsync(
        DateTime? weekStarting = null,
        int? userId = null,
        string? status = null,
        int pageNumber = 1,
        int pageSize = 50)
    {
        var query = _context.EmployeeSchedules
            .Include(s => s.User)
            .Include(s => s.Approver)
            .AsQueryable();

        // Filter by week starting date (show the full week Mon–Sun)
        if (weekStarting.HasValue)
        {
            var start = weekStarting.Value.Date;
            var end   = start.AddDays(6);
            query = query.Where(s => s.ScheduleDate >= start && s.ScheduleDate <= end);
        }

        if (userId.HasValue)
            query = query.Where(s => s.UserId == userId.Value);

        if (!string.IsNullOrWhiteSpace(status))
            query = query.Where(s => s.Status == status);

        var totalCount = await query.CountAsync();

        var schedules = await query
            .OrderByDescending(s => s.ScheduleDate)
            .ThenBy(s => s.UserId)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return (schedules, totalCount);
    }

    /// <inheritdoc />
    public async Task<EmployeeSchedule?> GetScheduleByIdAsync(int scheduleId)
    {
        return await _context.EmployeeSchedules
            .Include(s => s.User)
            .Include(s => s.Approver)
            .FirstOrDefaultAsync(s => s.ScheduleId == scheduleId);
    }

    /// <inheritdoc />
    public async Task<EmployeeSchedule> CreateScheduleAsync(EmployeeSchedule schedule)
    {
        // Apply EAT defaults if not explicitly set
        if (schedule.StartTime == TimeSpan.Zero)
            schedule.StartTime = DefaultStartTime;
        if (schedule.EndTime == TimeSpan.Zero)
            schedule.EndTime = DefaultEndTime;

        schedule.Status    = "Draft";
        schedule.CreatedAt = DateTime.UtcNow;
        schedule.UpdatedAt = DateTime.UtcNow;

        _context.EmployeeSchedules.Add(schedule);
        await _context.SaveChangesAsync();

        _logger.LogInformation(
            "Created schedule {ScheduleId} for user {UserId} on {Date}",
            schedule.ScheduleId, schedule.UserId, schedule.ScheduleDate.ToString("yyyy-MM-dd"));

        return schedule;
    }

    /// <inheritdoc />
    public async Task<EmployeeSchedule> UpdateScheduleAsync(EmployeeSchedule schedule)
    {
        var existing = await _context.EmployeeSchedules.FindAsync(schedule.ScheduleId);
        if (existing == null)
            throw new KeyNotFoundException($"Schedule {schedule.ScheduleId} not found.");

        if (existing.Status == "Locked")
            throw new InvalidOperationException("Cannot update a locked schedule.");

        existing.ScheduleDate = schedule.ScheduleDate;
        existing.StartTime    = schedule.StartTime;
        existing.EndTime      = schedule.EndTime;
        existing.ShiftType    = schedule.ShiftType;
        existing.Comments     = schedule.Comments;
        existing.UpdatedAt    = DateTime.UtcNow;

        // If the schedule was previously approved and is now being edited, revert to Draft
        if (existing.Status == "Approved")
        {
            existing.Status       = "Draft";
            existing.ApprovedBy   = null;
            existing.ApprovalDate = null;
        }

        await _context.SaveChangesAsync();

        _logger.LogInformation("Updated schedule {ScheduleId}", schedule.ScheduleId);
        return existing;
    }

    /// <inheritdoc />
    public async Task<bool> DeleteScheduleAsync(int scheduleId)
    {
        var schedule = await _context.EmployeeSchedules.FindAsync(scheduleId);
        if (schedule == null) return false;

        if (schedule.Status == "Locked")
            throw new InvalidOperationException("Cannot delete a locked schedule.");

        _context.EmployeeSchedules.Remove(schedule);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Deleted schedule {ScheduleId}", scheduleId);
        return true;
    }

    /// <inheritdoc />
    public async Task<EmployeeSchedule> ApproveScheduleAsync(int scheduleId, int approvedByUserId)
    {
        var schedule = await _context.EmployeeSchedules
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.ScheduleId == scheduleId);

        if (schedule == null)
            throw new KeyNotFoundException($"Schedule {scheduleId} not found.");

        if (schedule.Status == "Approved" || schedule.Status == "Locked")
            throw new InvalidOperationException($"Schedule is already {schedule.Status}.");

        schedule.Status       = "Approved";
        schedule.ApprovedBy   = approvedByUserId;
        schedule.ApprovalDate = DateTime.UtcNow;
        schedule.UpdatedAt    = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        _logger.LogInformation(
            "Approved schedule {ScheduleId} by user {ApprovedBy}",
            scheduleId, approvedByUserId);

        return schedule;
    }

    /// <inheritdoc />
    public async Task<bool> CheckScheduleConflictAsync(
        int userId,
        DateTime scheduleDate,
        TimeSpan startTime,
        TimeSpan endTime,
        int? excludeScheduleId = null)
    {
        var query = _context.EmployeeSchedules
            .Where(s => s.UserId == userId && s.ScheduleDate.Date == scheduleDate.Date);

        if (excludeScheduleId.HasValue)
            query = query.Where(s => s.ScheduleId != excludeScheduleId.Value);

        // Check for overlapping time ranges
        return await query.AnyAsync(s =>
            s.StartTime < endTime && s.EndTime > startTime);
    }

    /// <inheritdoc />
    public async Task<IEnumerable<EmployeeSchedule>> GetSchedulesByDateRangeAsync(
        DateTime startDate, DateTime endDate)
    {
        return await _context.EmployeeSchedules
            .Include(s => s.User)
            .Include(s => s.Approver)
            .Where(s => s.ScheduleDate >= startDate.Date && s.ScheduleDate <= endDate.Date)
            .OrderBy(s => s.ScheduleDate)
            .ThenBy(s => s.UserId)
            .ToListAsync();
    }
}