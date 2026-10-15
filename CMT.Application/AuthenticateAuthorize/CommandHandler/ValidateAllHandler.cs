using MediatR;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using CMT.Application.AuthenticateAuthorize.Command;
using CMT.Application.Common;
using CMT.Application.DTOs;
using CMT.Application.Services;

namespace CMT.Application.AuthenticateAuthorize.CommandHandler;

internal class ValidateAllHandler : IRequestHandler<ValidateAllCommand, OperationResult<UserTokenValidationResponse>>
{
    private readonly TokenHandlerService _tokenHandlerService;
    public ValidateAllHandler(TokenHandlerService tokenHandlerService)
    {
        _tokenHandlerService = tokenHandlerService;
    }
    public Task<OperationResult<UserTokenValidationResponse>> Handle(ValidateAllCommand request, CancellationToken cancellationToken)
    {
        var result = new OperationResult<UserTokenValidationResponse>();
        var tokenValidationResponse = new UserTokenValidationResponse 
        { 
            UserId = "", 
            Email = "", 
            FullName = "", 
            Username = "", 
            IsValid = false 
        };
        
        try
        {
            if (!_tokenHandlerService.ValidateToken(request.UserToken)) //decrypt and validate user token
            {
                result.AddError(ErrorCode.UnAuthorized, "User token is invalid.");
                return Task.FromResult(result);
            }
            var claims = _tokenHandlerService.GetClaims(request.UserToken); // get claims from the token
            
            var userIdClaim = claims.Where(x => x.Type == "userId").FirstOrDefault();
            if (userIdClaim != null)
                tokenValidationResponse.UserId = userIdClaim.Value;
                
            var emailClaim = claims.Where(x => x.Type == "email").FirstOrDefault();
            if (emailClaim != null)
                tokenValidationResponse.Email = emailClaim.Value;
                
            var fullNameClaim = claims.Where(x => x.Type == "fullName").FirstOrDefault();
            if (fullNameClaim != null)
                tokenValidationResponse.FullName = fullNameClaim.Value;
                
            var usernameClaim = claims.Where(x => x.Type == "username").FirstOrDefault();
            if (usernameClaim != null)
                tokenValidationResponse.Username = usernameClaim.Value;
                
            tokenValidationResponse.IsValid = true;
            result.Payload = tokenValidationResponse;
            return Task.FromResult(result);

        }
        catch (Exception e)
        {
            result.AddError(ErrorCode.ServerError, e.Message);
        }

        return Task.FromResult(result);
    }
}