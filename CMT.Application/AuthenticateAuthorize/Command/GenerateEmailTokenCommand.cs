using MediatR;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using CMT.Application.Common;
using CMT.Application.Services;

namespace CMT.Application.AuthenticateAuthorize.Command;

public class GenerateEmailTokenCommand : IRequest<OperationResult<string>>
{
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public int TokenLifeTime { get; set; }
}
internal class GenerateEmailTokenHandler : IRequestHandler<GenerateEmailTokenCommand, OperationResult<string>>
{
    private readonly TokenHandlerService _tokenService;
    public GenerateEmailTokenHandler(TokenHandlerService _tokenService) => this._tokenService = _tokenService;
    public Task<OperationResult<string>> Handle(GenerateEmailTokenCommand request, CancellationToken cancellationToken)
    {
        var result = new OperationResult<string>();
        if (string.IsNullOrEmpty(request.Email) || string.IsNullOrEmpty(request.FullName))
            result.AddError(ErrorCode.ServerError, "Email and Name are mandatory.");
        if (request.TokenLifeTime <= 1)
            result.AddError(ErrorCode.ServerError, "Token LifeTime cant be lessthan or equal to zero.");
        if (result.Errors.Count > 0)
            return Task.FromResult(result);
        result.Payload = GetJwtString(request.Email, request.FullName, request.TokenLifeTime);

        return Task.FromResult(result);
    }
    private string GetJwtString(string email, string fullName, int tokenLifeTime)
    {
        var claims = new[]
            {
        new Claim("email",email),
         new Claim("name",fullName),
         }.ToList();
        var token = _tokenService.CreateSecurityToken(claims, tokenLifeTime);
        return _tokenService.WriteToken(token);
    }
}