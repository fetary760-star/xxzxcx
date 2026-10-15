using CMT.Application.Common;
using CMT.Application.DTOs;

namespace CMT.Application.Services;

public interface IAuthenticationService
{
    Task<OperationResult<AuthenticationResultDto>> LoginAsync(string username, string password, CancellationToken cancellationToken = default);
    Task<OperationResult<string>> GenerateJwtTokenAsync(int userId, CancellationToken cancellationToken = default);
    Task<OperationResult<bool>> ValidateTokenAsync(string token, CancellationToken cancellationToken = default);
    Task LogoutAsync(int userId, CancellationToken cancellationToken = default);
}