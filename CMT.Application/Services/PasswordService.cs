using BCrypt.Net;

namespace CMT.Application.Services;

public class PasswordService : IPasswordService
{
    public string HashPassword(string password)
    {
        // Use a consistent salt rounds for better security and compatibility
        return BCrypt.Net.BCrypt.HashPassword(password, BCrypt.Net.BCrypt.GenerateSalt(12));
    }

    public bool VerifyPassword(string password, string hashedPassword)
    {
        try
        {
            Console.WriteLine($"[DEBUG] Stored password hash: {hashedPassword}");
            Console.WriteLine($"[DEBUG] Input password hash: {BCrypt.Net.BCrypt.HashPassword(password, BCrypt.Net.BCrypt.GenerateSalt(10))}");
            
            // BCrypt.Verify should handle both $2a$ and $2b$ formats
            var isValid = BCrypt.Net.BCrypt.Verify(password, hashedPassword);
            Console.WriteLine($"[DEBUG] Password verification result: {isValid}");
            
            return isValid;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[DEBUG] Password verification exception: {ex.Message}");
            return false;
        }
    }
}