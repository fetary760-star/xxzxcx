using Microsoft.EntityFrameworkCore;
using CMT.Application.DTOs;
using CMT.Application.Common;
using CMT.Domain.Data;
using CMT.Domain.Models;

namespace CMT.Application.Services;

public class AuthenticationService : IAuthenticationService
{
    private readonly ApplicationDbContext _context;
    private readonly IPasswordService _passwordService;
    private readonly IJwtTokenService _jwtTokenService;

    public AuthenticationService(
        ApplicationDbContext context,
        IPasswordService passwordService,
        IJwtTokenService jwtTokenService)
    {
        _context = context;
        _passwordService = passwordService;
        _jwtTokenService = jwtTokenService;
    }

    public async System.Threading.Tasks.Task<OperationResult<AuthenticationResultDto>> LoginAsync(string username, string password, CancellationToken cancellationToken = default)
    {
        var result = new OperationResult<AuthenticationResultDto>();

        try
        {
            Console.WriteLine($"[DEBUG] Attempting login for username: {username}");
            
            // Find user by username
            var user = await _context.Users
                .Include(u => u.Shop)
                .FirstOrDefaultAsync(u => u.Username == username && u.Status == UserStatus.Active, cancellationToken);

            if (user == null)
            {
                Console.WriteLine($"[DEBUG] User not found or inactive: {username}");
                result.AddError(ErrorCode.UnAuthorized, "Invalid username or password");
                return result;
            }

            Console.WriteLine($"[DEBUG] User found: {user.Username}, verifying password...");

            // Verify password (convert from SHA-256 to bcrypt in production)
            if (!_passwordService.VerifyPassword(password, user.Password))
            {
                Console.WriteLine($"[DEBUG] Password verification failed for user: {username}");
                result.AddError(ErrorCode.UnAuthorized, "Invalid username or password");
                return result;
            }

            Console.WriteLine($"[DEBUG] Password verified successfully for user: {username}");

            // Generate JWT token
            var tokenResult = await _jwtTokenService.GenerateTokenAsync(user, cancellationToken);
            if (!tokenResult.IsSuccess)
            {
                Console.WriteLine($"[DEBUG] Token generation failed for user: {username}");
                result.AddError(tokenResult.Errors[0].Code, tokenResult.Errors[0].Message);
                return result;
            }

            Console.WriteLine($"[DEBUG] Token generated successfully for user: {username}");

            var authResult = new AuthenticationResultDto
            {
                UserId = user.UserId,
                Username = user.Username,
                FullName = user.FullName,
                Email = user.Email,
                Role = user.Role.ToString(),
                ShopId = user.ShopId,
                ShopName = user.Shop?.Name,
                Token = tokenResult.Payload ?? string.Empty,
                ExpiresAt = DateTime.UtcNow.AddHours(24) // Token expiry
            };

            result.Payload = authResult;
            return result;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[DEBUG] Exception during login for {username}: {ex.Message}");
            result.AddError(ErrorCode.ServerError, ex.Message);
            return result;
        }
    }

    public async System.Threading.Tasks.Task<OperationResult<string>> GenerateJwtTokenAsync(int userId, CancellationToken cancellationToken = default)
    {
        var result = new OperationResult<string>();

        try
        {
            var user = await _context.Users
                .Include(u => u.Shop)
                .FirstOrDefaultAsync(u => u.UserId == userId, cancellationToken);

            if (user == null)
            {
                result.AddError(ErrorCode.NotFound, "User not found");
                return result;
            }

            var token = await _jwtTokenService.GenerateTokenAsync(user, cancellationToken);
            result.Payload = token.Payload;
            return result;
        }
        catch (Exception ex)
        {
            result.AddError(ErrorCode.ServerError, ex.Message);
            return result;
        }
    }

    public async System.Threading.Tasks.Task<OperationResult<bool>> ValidateTokenAsync(string token, CancellationToken cancellationToken = default)
    {
        var result = new OperationResult<bool>();

        try
        {
            var isValid = await _jwtTokenService.ValidateTokenAsync(token, cancellationToken);
            result.Payload = isValid.Payload;
            return result;
        }
        catch (Exception ex)
        {
            result.AddError(ErrorCode.ServerError, ex.Message);
            return result;
        }
    }

    public async System.Threading.Tasks.Task LogoutAsync(int userId, CancellationToken cancellationToken = default)
    {
        // Implement token revocation if needed
        // For now, client-side token removal is sufficient
        await System.Threading.Tasks.Task.CompletedTask;
    }
}