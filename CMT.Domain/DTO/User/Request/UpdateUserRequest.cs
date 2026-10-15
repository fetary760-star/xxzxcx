using System.ComponentModel.DataAnnotations;

namespace Template.Api.Contracts.User.Request;

public class UpdateUserRequest
{
    public int Id { get; set; }
    public string? FirstName { get; set; }
    public string? MiddleName { get; set; }
    public string? Suffix { get; set; }
    public string? LastName { get; set; }
    public string? DisplayName { get; set; }
    public string? PhoneNumber { get; set; }
    public bool EmailConfirmed { get; set; }
    public bool PhoneNumberConfirmed { get; set; }
    public required List<string> Roles { get; set; }
}