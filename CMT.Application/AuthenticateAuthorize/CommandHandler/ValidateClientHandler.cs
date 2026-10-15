using MediatR;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using CMT.Application.AuthenticateAuthorize.Command;
using CMT.Application.Common;
using CMT.Application.DTOs;
using CMT.Application.Services;

namespace CMT.Application.AuthenticateAuthorize.CommandHandler;

internal class ValidateClientHandler : IRequestHandler<ValidateClientCommand, OperationResult<ClientTokenValidationResponse>>
{
    private readonly TokenHandlerService _tokenHandlerService;
    public ValidateClientHandler(TokenHandlerService tokenHandlerService)
    {
        _tokenHandlerService = tokenHandlerService;
    }
    public Task<OperationResult<ClientTokenValidationResponse>> Handle(ValidateClientCommand request, CancellationToken cancellationToken)
    {
        var result = new OperationResult<ClientTokenValidationResponse>();
        var tokenValidationResponse = new ClientTokenValidationResponse { ClientId = "", RequireuserToken=true };
        try
        {
            if (!_tokenHandlerService.ValidateToken(request.AccessToken)) //decrypt and validate access token
            {
                result.AddError(ErrorCode.UnAuthorized, "Client token is invalid.");
                return Task.FromResult(result);
            }
            var claims = _tokenHandlerService.GetClaims(request.AccessToken); // get claims from the token
            if (! _authorizeAccessToken(claims, request.ApiResource, ref tokenValidationResponse)) // check if token is alllowed to access claimed api resource
            {
                result.AddError(ErrorCode.UnAuthorized, "Client is not Authorized.");
                return Task.FromResult(result);
            }
            var clientIdClaim = claims.Where(x => x.Type == "clientId").FirstOrDefault();
            if (clientIdClaim is not null)
                tokenValidationResponse.ClientId = clientIdClaim.Value;
            result.Payload = tokenValidationResponse;
            return Task.FromResult(result);

        }
        catch (Exception e)
        {
            result.AddError(ErrorCode.ServerError, e.Message);
        }

        return Task.FromResult(result);
    }

    private bool _authorizeAccessToken(List<Claim> claims,  string apiResource, ref ClientTokenValidationResponse response)
    {
        var requiredClaim = string.Format("{0}",  apiResource).ToLower();
        var claim= claims.Where(x => x.Value.ToLower().StartsWith(requiredClaim)).FirstOrDefault();
        if (claim is null) 
            return false;
        var requireToken = claim.Value.Split("#");
        var doesRequireuserToken = (requireToken.Length == 2 ? requireToken[1].ToLower() : "true");
        response.RequireuserToken = (doesRequireuserToken == "true");
        return true;
    }
}