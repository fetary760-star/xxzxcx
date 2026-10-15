using CMT.Domain.Models;

namespace CMT.Application.DTOs
{
    public class EmployeeScheduleDto
    {
        public int ScheduleId { get; set; }
        public int UserId { get; set; }
        public string EmployeeName { get; set; } = string.Empty;
        public DateTime ScheduleDate { get; set; }
        public TimeSpan StartTime { get; set; }
        public TimeSpan EndTime { get; set; }
        public string? ShiftType { get; set; }
        public string? Comments { get; set; }
        public string Status { get; set; } = "Draft";
        public int? ApprovedBy { get; set; }
        public string? ApprovedByName { get; set; }
        public DateTime? ApprovalDate { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    public class CreateScheduleDto
    {
        public int UserId { get; set; }
        public DateTime ScheduleDate { get; set; }
        public TimeSpan StartTime { get; set; }
        public TimeSpan EndTime { get; set; }
        public string? ShiftType { get; set; }
        public string? Comments { get; set; }
    }

    public class UpdateScheduleDto
    {
        public DateTime ScheduleDate { get; set; }
        public TimeSpan StartTime { get; set; }
        public TimeSpan EndTime { get; set; }
        public string? ShiftType { get; set; }
        public string? Comments { get; set; }
        public string? Status { get; set; }
    }

    public class ScheduleGenerationRequestDto
    {
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
        public List<TaskScheduleInput>? Tasks { get; set; }
        public List<UserScheduleInput>? Users { get; set; }
        public List<TimeOffInput>? TimeOffs { get; set; }
        public ScheduleOptions? Options { get; set; }
    }

    public class TaskScheduleInput
    {
        public int TaskId { get; set; }
        public decimal EstimatedHours { get; set; }
        public DateTime? PlannedStartDate { get; set; }
        public DateTime? PlannedEndDate { get; set; }
        public int? AssignedUserId { get; set; }
        public int Priority { get; set; }
        public int? ShopId { get; set; }
    }

    public class UserScheduleInput
    {
        public int UserId { get; set; }
        public string FullName { get; set; } = string.Empty;
        // FIX (Issue 10): Default to 7.25h net (EAT schedule) instead of 8h
        public decimal WorkHoursPerDay { get; set; } = 7.25m;
    }

    public class TimeOffInput
    {
        public int UserId { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
        public decimal? HoursPerDay { get; set; }
    }

    public class ScheduleOptions
    {
        public bool RespectTimeOff { get; set; } = true;
        // FIX (Issue 10): Default to 7.25h net (EAT schedule) instead of 8h
        public decimal DefaultWorkHours { get; set; } = 7.25m;
    }

    public class ScheduleGenerationResultDto
    {
        public List<ScheduleEntryDto> ScheduleEntries { get; set; } = new();
        public List<UnscheduledTaskDto> UnscheduledTasks { get; set; } = new();
        public Dictionary<int, UserScheduleSummaryDto> PerUserTotals { get; set; } = new();
    }

    public class ScheduleEntryDto
    {
        public int TaskId { get; set; }
        public int? UserId { get; set; }
        public DateTime? Date { get; set; }
        public decimal AllocatedHours { get; set; }
        public string Source { get; set; } = "auto";
    }

    public class UnscheduledTaskDto
    {
        public int TaskId { get; set; }
        public decimal RemainingHours { get; set; }
    }

    public class UserScheduleSummaryDto
    {
        public int UserId { get; set; }
        public string? FullName { get; set; }
        public decimal AssignedHours { get; set; }
    }

    public class ScheduleAnalysisDto
    {
        public List<UserWorkloadAnalysisDto> PerUser { get; set; } = new();
        public TeamWorkloadDto Team { get; set; } = new();
        public FairnessMetricsDto Fairness { get; set; } = new();
    }

    public class UserWorkloadAnalysisDto
    {
        public int UserId { get; set; }
        public string? FullName { get; set; }
        public decimal AssignedHours { get; set; }
        public decimal AvailableHours { get; set; }
        public decimal? UtilizationPercent { get; set; }
    }

    public class TeamWorkloadDto
    {
        public decimal TotalAssignedHours { get; set; }
        public decimal TotalAvailableHours { get; set; }
        public decimal? TeamUtilizationPercent { get; set; }
    }

    public class FairnessMetricsDto
    {
        public decimal Stddev { get; set; }
        public decimal? CoefVar { get; set; }
        public decimal Gini { get; set; }
        public decimal MaxAssigned { get; set; }
        public decimal MinAssigned { get; set; }
        public decimal? MaxMinRatio { get; set; }
    }
}