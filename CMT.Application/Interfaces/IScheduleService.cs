using CMT.Domain.Models;
using CMT.Application.DTOs;

namespace CMT.Application.Interfaces
{
    public interface IScheduleService
    {
        Task<(IEnumerable<EmployeeSchedule> schedules, int totalCount)> GetSchedulesAsync(
            DateTime? weekStarting = null,
            int? userId = null,
            string? status = null,
            int pageNumber = 1,
            int pageSize = 50);

        Task<EmployeeSchedule?> GetScheduleByIdAsync(int scheduleId);
        Task<EmployeeSchedule> CreateScheduleAsync(EmployeeSchedule schedule);
        Task<EmployeeSchedule> UpdateScheduleAsync(EmployeeSchedule schedule);
        Task<bool> DeleteScheduleAsync(int scheduleId);
        Task<EmployeeSchedule> ApproveScheduleAsync(int scheduleId, int approvedByUserId);
        Task<bool> CheckScheduleConflictAsync(int userId, DateTime scheduleDate, TimeSpan startTime, TimeSpan endTime, int? excludeScheduleId = null);
        Task<IEnumerable<EmployeeSchedule>> GetSchedulesByDateRangeAsync(DateTime startDate, DateTime endDate);
    }
}