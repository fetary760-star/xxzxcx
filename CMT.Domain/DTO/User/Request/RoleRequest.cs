using System.ComponentModel.DataAnnotations;

namespace Template.Api.Contracts.User.Request;

public class RoleRequest
{
    public int Id { get; set; }
    
    [Required]
    [StringLength(256)]
    public required string Name { get; set; }
    
    [StringLength(256)]
    public string? NormalizedName { get; set; }
    
    [StringLength(500)]
    public required string Description { get; set; }
    
    public string? ConcurrencyStamp { get; set; }
}