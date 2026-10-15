using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Models
{
    [Table("employee_schedules")]
    public class EmployeeSchedule
    {
        [Key]
        [Column("schedule_id")]
        public int ScheduleId { get; set; }

        [Required]
        [Column("user_id")]
        public int UserId { get; set; }

        [Required]
        [Column("schedule_date")]
        public DateTime ScheduleDate { get; set; }

        [Required]
        [Column("start_time")]
        public TimeSpan StartTime { get; set; }

        [Required]
        [Column("end_time")]
        public TimeSpan EndTime { get; set; }

        [StringLength(50)]
        [Column("shift_type")]
        public string? ShiftType { get; set; }

        [Column("comments", TypeName = "TEXT")]
        public string? Comments { get; set; }

        [StringLength(20)]
        [Column("status")]
        public string Status { get; set; } = "Draft";

        [Column("approved_by")]
        public int? ApprovedBy { get; set; }

        [Column("approval_date")]
        public DateTime? ApprovalDate { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; }

        [Column("updated_at")]
        public DateTime UpdatedAt { get; set; }

        // Navigation properties
        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;

        [ForeignKey("ApprovedBy")]
        public virtual User? Approver { get; set; }
    }
}