using MediatR;

namespace CMT.Application.SelfEvaluation.Common;

public class LoginUserCommand : IRequest<object>
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}
