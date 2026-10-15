using System.ComponentModel.DataAnnotations;

namespace Template.Api.Contracts.User.Request
{
    public class UserLogin 
    {
        [Required]
        public required string Username { get; set; }
        [Required]
        public required string Password { get; set; }
    }
}