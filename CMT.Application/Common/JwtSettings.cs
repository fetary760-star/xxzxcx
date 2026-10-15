namespace CMT.Application.SelfEvaluation.Common;

/// <summary>
/// JWT Settings - Maps to appsettings.json "JwtSettings" section.
/// 
/// FIXED: Added multiple property name aliases so the configuration
/// binding works regardless of which key name is used in appsettings.json
/// (SecretKey, Key, or Secret).
/// </summary>
public class JwtSettings
{
    /// <summary>
    /// The secret key used for signing JWT tokens.
    /// Must be at least 32 characters (256 bits) for HS256.
    /// Maps to: JwtSettings:SecretKey
    /// </summary>
    public string? SecretKey { get; set; }

    /// <summary>
    /// Alternative property name for the secret key.
    /// Maps to: JwtSettings:Key
    /// </summary>
    public string? Key { get; set; }

    /// <summary>
    /// Alternative property name for the secret key.
    /// Maps to: JwtSettings:Secret
    /// </summary>
    public string? Secret { get; set; }

    /// <summary>
    /// The issuer of the JWT token.
    /// Must match between token generation and validation.
    /// Maps to: JwtSettings:Issuer
    /// </summary>
    public string? Issuer { get; set; }

    /// <summary>
    /// The audience of the JWT token.
    /// Must match between token generation and validation.
    /// Maps to: JwtSettings:Audience
    /// </summary>
    public string? Audience { get; set; }

    /// <summary>
    /// Access token expiration time in minutes.
    /// Default: 1440 (24 hours)
    /// </summary>
    public int AccessTokenExpirationMinutes { get; set; } = 1440;

    /// <summary>
    /// Refresh token expiration time in days.
    /// Default: 30 days
    /// </summary>
    public int RefreshTokenExpirationDays { get; set; } = 30;
}