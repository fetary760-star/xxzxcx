namespace CMT.Application.DTOs
{
    /// <summary>
    /// Represents the full role permission matrix as returned by the API.
    /// Structure: Dictionary of role_key → Dictionary of permission_key → bool
    /// </summary>
    public class RolePermissionMatrixDto
    {
        /// <summary>
        /// The permission matrix. Key = role_key, Value = dict of permission_key → granted.
        /// Example: { "team_leader": { "delete_task": true, "delete_user": true, ... }, ... }
        /// </summary>
        public Dictionary<string, Dictionary<string, bool>> Matrix { get; set; } = new();

        public DateTime UpdatedAt { get; set; }
    }

    /// <summary>
    /// DTO for updating the entire role permission matrix at once.
    /// </summary>
    public class UpdateRolePermissionMatrixDto
    {
        /// <summary>
        /// The full permission matrix to save.
        /// Key = role_key, Value = dict of permission_key → granted.
        /// </summary>
        public Dictionary<string, Dictionary<string, bool>> Matrix { get; set; } = new();
    }
}