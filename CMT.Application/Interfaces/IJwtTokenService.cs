using CMT.Application.Common;
using CMT.Domain.Models;

namespace CMT.Application.Services;

public interface IJwtTokenService
{
    System.Threading.Tasks.Task<OperationResult<string>> GenerateTokenAsync(User user, CancellationToken cancellationToken = default);
    System.Threading.Tasks.Task<OperationResult<bool>> ValidateTokenAsync(string token, CancellationToken cancellationToken = default);
}