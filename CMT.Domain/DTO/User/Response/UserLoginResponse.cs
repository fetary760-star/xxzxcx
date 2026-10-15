using Template.Api.Contracts.User.Response;

namespace Template.Api.Contracts.User.Response;

public class UserLoginResponse
{
    public int Id { get; set; }
    public required string userToken { get; set; }
    public required string RefreshToken { get; set; }
    public required List<RoleDetail> Roles { get; set; }
    public DateTime TokenExpiry { get; set; }
    public DateTime RefreshTokenExpiry { get; set; }
    public string? RoleName { get; set; }
    public bool IsSuccess { get; set; }
    public string? Message { get; set; }
    public List<string>? Errors { get; set; }
}

public class RoleClaimDetail
{
    public int Id { get; set; }
    public int RoleId { get; set; }
    public string? ClaimType { get; set; }
    public string? ClaimValue { get; set; }
    public required string Claim { get; set; }
}