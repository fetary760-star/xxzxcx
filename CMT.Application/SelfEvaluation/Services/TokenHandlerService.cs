using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using CMT.Application.SelfEvaluation.Common;

namespace CMT.Application.SelfEvaluation.Services;

/// <summary>
/// Token Handler Service - Generates and validates JWT tokens.
/// 
/// FIXED: Ensures the signing key, issuer, and audience match exactly what
/// is configured in Program.cs AddJwtBearer so that [Authorize] attribute
/// can validate tokens issued by this service.
/// </summary>
public class TokenHandlerService
{
    private readonly JwtSettings _jwtSettings;
    private readonly SymmetricSecurityKey _signingKey;

    public TokenHandlerService(IOptions<JwtSettings> jwtSettings)
    {
        _jwtSettings = jwtSettings.Value;

        var keyString = _jwtSettings.SecretKey ?? _jwtSettings.Key ?? _jwtSettings.Secret
            ?? throw new InvalidOperationException("JWT SecretKey is not configured");

        var keyBytes = Encoding.UTF8.GetBytes(keyString);
        // Ensure minimum 256-bit key for HS256
        if (keyBytes.Length < 32)
        {
            Array.Resize(ref keyBytes, 32);
        }
        _signingKey = new SymmetricSecurityKey(keyBytes);
    }

    /// <summary>
    /// Generates an access token (JWT) for the authenticated user.
    /// Claims MUST match what Program.cs TokenValidationParameters expects.
    /// </summary>
    public string GenerateAccessToken(long userId, string username, string email, string fullName, string role, Guid? shopId = null)
    {
        var safeRole = string.IsNullOrWhiteSpace(role) ? "Engineer" : role.Trim();
        var safeUsername = string.IsNullOrWhiteSpace(username) ? userId.ToString() : username.Trim();
        var safeFullName = string.IsNullOrWhiteSpace(fullName) ? safeUsername : fullName.Trim();

        var claims = new List<Claim>
        {
            // Standard claims - these are what [Authorize] and User.FindFirst() look for.
            // Keep a single canonical role/name claim to avoid JWT arrays like ["TeamLeader","TeamLeader"]
            // that trigger middleware auth failures.
            new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
            new Claim("sub", userId.ToString()),
            new Claim("unique_name", safeUsername),
            new Claim(ClaimTypes.Name, safeUsername),
            new Claim(ClaimTypes.Email, email),
            new Claim("FullName", safeFullName),
            new Claim("fullName", safeFullName),
            new Claim("role", safeRole),
            new Claim(ClaimTypes.Role, safeRole),
            // Include a JTI for token uniqueness
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new Claim(JwtRegisteredClaimNames.Iat, DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64),
        };

        // Add shop ID if present
        if (shopId.HasValue && shopId.Value != Guid.Empty)
        {
            claims.Add(new Claim("ShopId", shopId.Value.ToString()));
        }

        var expirationMinutes = _jwtSettings.AccessTokenExpirationMinutes > 0
            ? _jwtSettings.AccessTokenExpirationMinutes
            : 1440; // Default 24 hours

        var credentials = new SigningCredentials(_signingKey, SecurityAlgorithms.HmacSha256);

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.AddMinutes(expirationMinutes),
            SigningCredentials = credentials,
            Issuer = _jwtSettings.Issuer,
            Audience = _jwtSettings.Audience,
        };

        var tokenHandler = new JwtSecurityTokenHandler();
        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }

    /// <summary>
    /// Generates a cryptographically secure refresh token.
    /// </summary>
    public string GenerateRefreshToken()
    {
        var randomBytes = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomBytes);
        return Convert.ToBase64String(randomBytes);
    }

    /// <summary>
    /// Validates a JWT token and returns the ClaimsPrincipal.
    /// Returns null if validation fails.
    /// </summary>
    public ClaimsPrincipal? ValidateToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;

        var tokenHandler = new JwtSecurityTokenHandler();

        try
        {
            var validationParameters = new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = _signingKey,
                ValidateIssuer = !string.IsNullOrEmpty(_jwtSettings.Issuer),
                ValidIssuer = _jwtSettings.Issuer,
                ValidateAudience = !string.IsNullOrEmpty(_jwtSettings.Audience),
                ValidAudience = _jwtSettings.Audience,
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromMinutes(5),
                NameClaimType = "unique_name",
                RoleClaimType = "role"
            };

            var principal = tokenHandler.ValidateToken(token, validationParameters, out _);
            return principal;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Validates a JWT token ignoring the expiration time.
    /// Used during token refresh to identify the user from an expired access token.
    /// </summary>
    public ClaimsPrincipal? ValidateTokenIgnoringExpiry(string token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;

        var tokenHandler = new JwtSecurityTokenHandler();

        try
        {
            var validationParameters = new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = _signingKey,
                ValidateIssuer = !string.IsNullOrEmpty(_jwtSettings.Issuer),
                ValidIssuer = _jwtSettings.Issuer,
                ValidateAudience = !string.IsNullOrEmpty(_jwtSettings.Audience),
                ValidAudience = _jwtSettings.Audience,
                ValidateLifetime = false, // Ignore expiration
                ClockSkew = TimeSpan.FromMinutes(5),
                NameClaimType = "unique_name",
                RoleClaimType = "role"
            };

            var principal = tokenHandler.ValidateToken(token, validationParameters, out _);
            return principal;
        }
        catch
        {
            return null;
        }
    }
}