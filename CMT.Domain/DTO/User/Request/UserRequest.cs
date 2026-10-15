using System.ComponentModel.DataAnnotations;

namespace Template.Api.Contracts.User.Request;

public class UserRequest
{

    [Required]
    [MinLength(3)]
    public required string Username { get; set; }
    [Required]
    [MinLength(3)]
    [EmailAddress]
    public required string Email { get; set; }
    [Required]
    [MinLength(3)]
    public required string FirstName { get; set; }
    [Required]
    [MinLength(3)]
    public required string LastName { get; set; }
    [Required]
    [MinLength(8)]
    public required string Password { get; set; }
    public bool IsSuperAdmin { get; set; } = false;
    public bool IsCompany { get; set; } = false;
    public bool IsAccountLocked { get; set; }=false;

    [Phone]
    public required string PhoneNumber { get; set; }
    public required List<long> Roles { get; set; }     
}