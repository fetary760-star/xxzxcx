using System.ComponentModel.DataAnnotations;

namespace CMT.Application.DTOs
{
    public class ShopDto
    {
        public int ShopId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string? Location { get; set; }
        public int? TeamLeaderId { get; set; }
        public string? TeamLeaderName { get; set; }
        
        // NEW: Manager properties
        public int? ManagerId { get; set; }
        public string? ManagerName { get; set; }
        
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
        
        // Additional properties for management
        public int UserCount { get; set; }
        public List<UserDto> Users { get; set; } = new List<UserDto>();
    }

    public class CreateShopDto
    {
        [Required]
        [StringLength(100)]
        public string Name { get; set; } = string.Empty;

        [StringLength(255)]
        public string? Description { get; set; }

        [StringLength(255)]
        public string? Location { get; set; }

        public int? TeamLeaderId { get; set; }
        
        // NEW: Manager assignment
        public int? ManagerId { get; set; }

        public bool IsActive { get; set; } = true;
    }

    public class UpdateShopDto
    {
        [StringLength(100)]
        public string? Name { get; set; }

        [StringLength(255)]
        public string? Description { get; set; }

        [StringLength(255)]
        public string? Location { get; set; }

        public int? TeamLeaderId { get; set; }
        
        // NEW: Manager assignment
        public int? ManagerId { get; set; }

        public bool? IsActive { get; set; }
    }
}