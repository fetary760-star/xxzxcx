namespace Template.Api.Contracts.User.Response;

public class RoleDetail
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public string? NormalizedName { get; set; }
    public required string Description { get; set; }
    public required List<RoleClaimInfo> RoleClaims { get; set; }
    public bool IsSuccess { get; set; }
    public string? Message { get; set; }
    public List<string>? Errors { get; set; }
    public required List<ClientClaimDetail> userPrivilege { get; set; }
}

public class RoleClaimInfo
{
    public int Id { get; set; }
    public required string RoleId { get; set; }
    public string? ClaimType { get; set; }
    public string? ClaimValue { get; set; }
}