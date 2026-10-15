using CMT.Application.DTOs;
using CMT.Application.Common;
using MediatR;

namespace CMT.Application.AuthenticateAuthorize.Command;

public class ValidateAllCommand : IRequest<OperationResult<UserTokenValidationResponse>>
{
    public string AccessToken { get; set; } = string.Empty;
    public string UserToken { get; set; } = string.Empty;
    public string ApiResource { get; set; } = string.Empty;
}