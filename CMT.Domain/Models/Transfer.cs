using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Models
{
    [Table("transfers")]
    public class Transfer
    {
        [Key]
        [Column("transfer_id")]
        public int TransferId { get; set; }

        [Column("from_shop")]
        [StringLength(200)]
        public string? FromShop { get; set; }

        [Column("to_shop")]
        [StringLength(200)]
        public string? ToShop { get; set; }

        [Column("from_shop_id")]
        public int? FromShopId { get; set; }

        [Column("to_shop_id")]
        public int? ToShopId { get; set; }

        [Column("part_number")]
        [StringLength(100)]
        public string? PartNumber { get; set; }

        [Column("serial_number")]
        [StringLength(100)]
        public string? SerialNumber { get; set; }

        [Column("status")]
        [StringLength(50)]
        public string Status { get; set; } = "pending";

        [Column("notes")]
        public string? Notes { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [Column("created_by")]
        public int? CreatedBy { get; set; }

        [Column("assigned_engineer")]
        [StringLength(200)]
        public string? AssignedEngineer { get; set; }

        [Column("assigned_engineer_id")]
        public int? AssignedEngineerId { get; set; }

        // Navigation properties
        [ForeignKey("FromShopId")]
        public virtual Shop? FromShopNavigation { get; set; }

        [ForeignKey("ToShopId")]
        public virtual Shop? ToShopNavigation { get; set; }

        [ForeignKey("CreatedBy")]
        public virtual User? Creator { get; set; }
    }
}