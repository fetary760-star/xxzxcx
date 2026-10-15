using System.ComponentModel.DataAnnotations;

namespace CMT.Domain.Entities
{
    public class Transfer : BaseEntity
    {
        [Key]
        public int TransferId { get; set; }

        [StringLength(100)]
        public string? FromShop { get; set; }

        [StringLength(100)]
        public string? ToShop { get; set; }

        public int? FromShopId { get; set; }

        public int? ToShopId { get; set; }

        [StringLength(100)]
        public string? PartNumber { get; set; }

        [StringLength(100)]
        public string? SerialNumber { get; set; }

        [StringLength(50)]
        public string Status { get; set; } = "Pending";

        [StringLength(500)]
        public string? Notes { get; set; }

        public int? CreatedBy { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? UpdatedAt { get; set; }

        // FIXED: Added missing properties for assigned engineer
        [StringLength(200)]
        public string? AssignedEngineer { get; set; }

        public int? AssignedEngineerId { get; set; }

        // Navigation properties
        public virtual Shop? FromShopNavigation { get; set; }
        public virtual Shop? ToShopNavigation { get; set; }
        public virtual User? Creator { get; set; }
    }
}