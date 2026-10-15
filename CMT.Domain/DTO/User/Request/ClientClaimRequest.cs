using System.ComponentModel.DataAnnotations;

namespace Template.Api.Contracts.User.Request;

public class ClientClaimRequest
{
    public int Id { get; set; }
    
    [Required]
    public required string Name { get; set; }
    
    [Required]
    public required string Claim { get; set; }
    
    [Required]
    public required string Description { get; set; }
}