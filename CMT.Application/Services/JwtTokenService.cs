using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using CMT.Application.Common;
using CMT.Domain.Models;

namespace CMT.Application.Services;

public class JwtTokenService : IJwtTokenService
{
    private readonly IConfiguration _configuration;

    public JwtTokenService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    /// <summary>
    /// Converts UserRole enum to lowercase string format with underscores
    /// to match frontend and backend role checks
    /// FIXED: Added Admin role support
    /// </summary>
    private string ConvertRoleToString(UserRole role)
    {
        return role switch
        {
            UserRole.TeamLeader => "team_leader",
            UserRole.Director => "director",
            UserRole.Engineer => "engineer",
            UserRole.CustomerPersonnel => "customer_personnel",
            UserRole.Customer => "customer",
            UserRole.ShopTL => "shop_tl",
            UserRole.Manager => "manager",
            UserRole.Admin => "admin",  // FIXED: Added Admin role
            _ => "customer"
        };
    }

    public System.Threading.Tasks.Task<OperationResult<string>> GenerateTokenAsync(User user, CancellationToken cancellationToken = default)
    {
        var result = new OperationResult<string>();

        try
        {
            var jwtSettings = _configuration.GetSection("JwtSettings");
            var key = Encoding.ASCII.GetBytes(jwtSettings["SecretKey"] ?? "DefaultSecretKeyForCMTApplication123456789");
            var issuer = jwtSettings["Issuer"] ?? "CMT.Api";
            var audience = jwtSettings["Audience"] ?? "CMT.Client";
            var expireMinutes = int.Parse(jwtSettings["ExpireMinutes"] ?? "1440"); // 24 hours default

            // FIXED: Convert role enum to lowercase string with underscores (now includes Admin)
            var roleString = ConvertRoleToString(user.Role);

            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.NameIdentifier, user.UserId.ToString()),
                new Claim(ClaimTypes.Name, user.Username),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim(ClaimTypes.Role, roleString),
                new Claim("FullName", user.FullName),
                new Claim("ShopId", user.ShopId?.ToString() ?? "")
            };

            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(claims),
                Expires = DateTime.UtcNow.AddMinutes(expireMinutes),
                Issuer = issuer,
                Audience = audience,
                SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
            };

            var tokenHandler = new JwtSecurityTokenHandler();
            var token = tokenHandler.CreateToken(tokenDescriptor);
            var tokenString = tokenHandler.WriteToken(token);

            result.Payload = tokenString;
            return System.Threading.Tasks.Task.FromResult(result);
        }
        catch (Exception ex)
        {
            result.AddError(ErrorCode.ServerError, ex.Message);
            return System.Threading.Tasks.Task.FromResult(result);
        }
    }

    public System.Threading.Tasks.Task<OperationResult<bool>> ValidateTokenAsync(string token, CancellationToken cancellationToken = default)
    {
        var result = new OperationResult<bool>();

        try
        {
            var jwtSettings = _configuration.GetSection("JwtSettings");
            var key = Encoding.ASCII.GetBytes(jwtSettings["SecretKey"] ?? "DefaultSecretKeyForCMTApplication123456789");
            var issuer = jwtSettings["Issuer"] ?? "CMT.Api";
            var audience = jwtSettings["Audience"] ?? "CMT.Client";

            var tokenHandler = new JwtSecurityTokenHandler();
            var validationParameters = new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(key),
                ValidateIssuer = true,
                ValidIssuer = issuer,
                ValidateAudience = true,
                ValidAudience = audience,
                ValidateLifetime = true,
                ClockSkew = TimeSpan.Zero
            };

            tokenHandler.ValidateToken(token, validationParameters, out SecurityToken validatedToken);
            result.Payload = true;
            return System.Threading.Tasks.Task.FromResult(result);
        }
        catch
        {
            result.Payload = false;
            return System.Threading.Tasks.Task.FromResult(result);
        }
    }
}