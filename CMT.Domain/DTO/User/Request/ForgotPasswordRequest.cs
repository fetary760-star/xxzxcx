namespace Template.Api;
public class ForgotPasswordRequest
{
    public required string Token { get; set; }
    public required string Password { get; set; }
}