using CMT.Application.Common;
using CMT.Application.Services;
using MediatR;

namespace CMT.Application.AuthenticateAuthorize.Command;

public class ValidateEmailTokenCommand : IRequest<OperationResult<string>>
{
    public string EmailToken { get; set; } = string.Empty;
}

internal class ValidateEmailTokenHandler : IRequestHandler<ValidateEmailTokenCommand, OperationResult<string>>
{
    private readonly TokenHandlerService _tokenHandlerService;
    public ValidateEmailTokenHandler(TokenHandlerService tokenHandlerService)
    {
        _tokenHandlerService = tokenHandlerService;
    }
    public Task<OperationResult<string>> Handle(ValidateEmailTokenCommand request, CancellationToken cancellationToken)
    {
        var result = new OperationResult<string>();
        try
        {
            if (!_tokenHandlerService.ValidateToken(request.EmailToken))
            {
                result.AddError(ErrorCode.UnAuthorized, "Email token is invalid.");
                return Task.FromResult(result);
            }
            var claims = _tokenHandlerService.GetClaims(request.EmailToken);
            var emailClaim = claims.Where(x => x.Type == "email").FirstOrDefault();
            if (emailClaim is not null)
                result.Payload = emailClaim.Value;
            else
                result.AddError(ErrorCode.UnAuthorized, "Email not found in token.");
        }
        catch (Exception e)
        {
            result.AddError(ErrorCode.ServerError, e.Message);
        }
        return Task.FromResult(result);
    }
}