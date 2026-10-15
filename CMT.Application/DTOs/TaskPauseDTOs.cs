using System.ComponentModel.DataAnnotations;

namespace CMT.Application.DTOs
{
    public class PauseTaskRequestDto
    {
        [Required(ErrorMessage = "Pause reason is required")]
        public string PauseReason { get; set; } = string.Empty;
    }

    public class ResumeTaskRequestDto
    {
        public string? ResumeComment { get; set; }
    }

    public class TaskPauseHistoryDto
    {
        public int TaskId { get; set; }
        public string TaskDescription { get; set; } = string.Empty;
        public bool IsPaused { get; set; }
        public DateTime? PausedAt { get; set; }
        public string? PausedReason { get; set; }
        public int? PausedByUserId { get; set; }
        public string? PausedByUserName { get; set; }
        public DateTime? LastResumedAt { get; set; }
        public long TotalPausedDurationMinutes { get; set; }
        public string TotalPausedDurationFormatted { get; set; } = string.Empty;
        public string? StatusBeforePause { get; set; }

        /// <summary>
        /// The date/time when the task status was last changed due to this pause/resume action.
        /// </summary>
        public DateTime? StatusChangedAt { get; set; }

        public List<PauseResumeEventDto> Events { get; set; } = new List<PauseResumeEventDto>();
    }

    public class PauseResumeEventDto
    {
        public int EventId { get; set; }
        public string EventType { get; set; } = string.Empty; // "Paused" or "Resumed"
        public DateTime EventDate { get; set; }
        public string? Reason { get; set; }
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public long? DurationMinutes { get; set; }
        public string? DurationFormatted { get; set; }
    }
}