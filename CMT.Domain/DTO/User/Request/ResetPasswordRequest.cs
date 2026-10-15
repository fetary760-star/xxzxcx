namespace Template.Api;
public class ResetPasswordRequest
{
    public required string UserName { get; set; }
    public required string NewPassword { get; set; }
}