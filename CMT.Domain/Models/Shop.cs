using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Models;

[Table("shops")]
public class Shop : BaseEntity
{
    [Key]
    [Column("shop_id")]
    public int ShopId { get; set; }

    [Required]
    [StringLength(100)]
    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [StringLength(255)]
    [Column("description")]
    public string? Description { get; set; }

    [StringLength(255)]
    [Column("location")]
    public string? Location { get; set; }

    [Column("team_leader_id")]
    public int? TeamLeaderId { get; set; }

    // NEW: Manager assignment for shops
    [Column("manager_id")]
    public int? ManagerId { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    // Navigation properties
    [ForeignKey("TeamLeaderId")]
    public virtual User? TeamLeader { get; set; }

    // NEW: Navigation property for manager
    [ForeignKey("ManagerId")]
    public virtual User? Manager { get; set; }

    public virtual ICollection<User> Users { get; set; } = new List<User>();
    
    // Navigation property for tasks
    public virtual ICollection<Task> Tasks { get; set; } = new List<Task>();
}