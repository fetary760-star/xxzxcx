using CMT.Application.DTOs;
using CMT.Application.Common;
using MediatR;

namespace CMT.Application.AuthenticateAuthorize.Command;

public class ValidateClientCommand : IRequest<OperationResult<ClientTokenValidationResponse>>
{
    public string AccessToken { get; set; } = string.Empty;
    public string ApiResource { get; set; } = string.Empty;
}