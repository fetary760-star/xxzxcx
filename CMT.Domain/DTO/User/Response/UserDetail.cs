namespace Template.Api.Contracts.User.Response;

public class UserDetail
{
    public int Id { get; set; }
    public required string Username { get; set; }
    public required string Email { get; set; }
    public required string FirstName { get; set; }
    public string? MiddleName { get; set; }
    public string? Suffix { get; set; }
    public required string LastName { get; set; }
    public string? DisplayName { get; set; }
    public required string PhoneNumber { get; set; }
    public required string VerificationToken { get; set; }
    public bool EmailConfirmed { get; set; }
    public bool PhoneNumberConfirmed { get; set; }
    public required List<UserRoleInfo> IdentityUserRoles { get; set; }
    public bool TwoFactorEnabled { get; set; }
    public DateTime? LockoutEnd { get; set; }
    public bool LockoutEnabled { get; set; }
    public int AccessFailedCount { get; set; }
    public required RoleDetail Role { get; set; }
    public bool IsSuccess { get; set; }
    public string? Message { get; set; }
    public List<string>? Errors { get; set; }
}

public class UserRoleInfo
{
    public required string UserId { get; set; }
    public required string RoleId { get; set; }
}