using CMT.Domain.Models;
using CMT.Domain.Enums;

namespace CMT.Domain.DTO.User.Request
{
    public class ActivateDeactivateUserRequest
    {
        public UserStatusAction StatusAction { get; set; }
        public long UserId { get; set; }
    }
}