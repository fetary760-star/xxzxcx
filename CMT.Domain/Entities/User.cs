using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Entities
{
    public class User
    {
        [Key]
        public int UserId { get; set; }

        [Required]
        [StringLength(100)]
        public string FullName { get; set; } = string.Empty;

        [Required]
        [StringLength(50)]
        public string Username { get; set; } = string.Empty;

        [Required]
        [EmailAddress]
        [StringLength(100)]
        public string Email { get; set; } = string.Empty;

        [Required]
        public string PasswordHash { get; set; } = string.Empty;

        [Required]
        public UserRole Role { get; set; }

        public int? ShopId { get; set; }
        
        [ForeignKey("ShopId")]
        public virtual Shop? Shop { get; set; }

        public int? SupervisorId { get; set; }
        
        [ForeignKey("SupervisorId")]
        public virtual User? Supervisor { get; set; }

        public string? ProfilePicturePath { get; set; }

        public bool IsActive { get; set; } = true;

        public DateTime? LastLoginAt { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? UpdatedAt { get; set; }

        [StringLength(100)]
        public string? CreatedBy { get; set; }

        [StringLength(100)]
        public string? UpdatedBy { get; set; }

        // Navigation properties
        public virtual ICollection<User> Subordinates { get; set; } = new List<User>();
        public virtual ICollection<Task> CreatedTasks { get; set; } = new List<Task>();
        public virtual ICollection<TaskAssignment> TaskAssignments { get; set; } = new List<TaskAssignment>();
        public virtual ICollection<Notification> Notifications { get; set; } = new List<Notification>();
        public virtual ICollection<UserSession> Sessions { get; set; } = new List<UserSession>();
    }

    public enum UserRole
    {
        Customer = 1,
        CustomerPersonnel = 2,
        Engineer = 3,
        ShopTeamLeader = 4,
        TeamLeader = 5,
        Manager = 6,
        Director = 7,
        Admin = 8           // NEW: Admin role (santa) - highest privilege
    }
}