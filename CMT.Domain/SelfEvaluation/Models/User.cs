using CMT.Domain.Models.SelfEvaluation;

namespace CMT.Domain.Models.SelfEvaluation;

/// <summary>
/// User entity - AMENDED v4
///
/// AMENDMENTS v4 (breaking fix for POST /api/users returning 400 problem+json):
/// - SupervisorUserId changed from Guid? to long?.
///   User.Id is a long, so the admin UI legitimately posts "supervisorUserId": "2".
///   Binding "2" into a Guid? failed inside ASP.NET model binding BEFORE the
///   controller executed, which is exactly why the response was
///   "application/problem+json" 400 with no message from our own code.
/// - Added Supervisor navigation property and Subordinates collection so the org
///   chart can be built from the real reporting chain.
/// - Roles now come from CMT.Domain.Models.Shared.OrgRoles / RoleHierarchy:
///   Admin, Director, SpecialTeamLeader, Manager, ShopManager, TeamLeader
///   (persisted name of Shop Team Leader), Engineer, Technician,
///   CertifyingStaff, QAPersonnel, ECAAPersonnel.
///
/// Hierarchy:
///   Admin
///     -> Director (per department, Admin only)
///          -> Manager -> ShopManager -> TeamLeader -> personnel
///     -> SpecialTeamLeader (under a Director) -> Engineer
/// </summary>
public class User : CMT.Domain.Models.SelfEvaluation.BaseEntity
{
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;

    /// <summary>
    /// Canonical role name. Validate/normalise with RoleHierarchy.Normalize().
    /// Valid values: Admin, Director, SpecialTeamLeader, Manager, ShopManager,
    /// TeamLeader, Engineer, Technician, CertifyingStaff, QAPersonnel, ECAAPersonnel.
    /// </summary>
    public string Role { get; set; } = string.Empty;

    /// <summary>
    /// The shop this user belongs to (Shop Managers, Shop Team Leaders and personnel).
    /// </summary>
    public Guid? ShopId { get; set; }

    /// <summary>
    /// Legacy manager reference using the numeric user id. Kept for backwards
    /// compatibility; SupervisorUserId is the authoritative reporting link.
    /// </summary>
    public long? ManagerId { get; set; }

    /// <summary>
    /// Personnel type classification (Full-time, Contract, Secondment, ...).
    /// </summary>
    public string? PersonnelType { get; set; }

    public bool IsActive { get; set; } = true;
    public string? RefreshToken { get; set; }
    public DateTime? RefreshTokenExpiryTime { get; set; }

    // ===== HIERARCHICAL ORGANIZATION FIELDS =====

    /// <summary>
    /// The department this user belongs to (mandatory for Director and Manager).
    /// </summary>
    public Guid? DepartmentId { get; set; }

    /// <summary>
    /// AMENDED v4: now long? (was Guid?) to match User.Id.
    ///
    /// The direct supervisor in the reporting chain:
    /// - Technician / CertifyingStaff / QAPersonnel / ECAAPersonnel -> TeamLeader or ShopManager
    /// - Engineer                                                   -> SpecialTeamLeader
    /// - TeamLeader                                                  -> ShopManager or Manager
    /// - ShopManager                                                 -> Manager
    /// - Manager                                                     -> Director
    /// - SpecialTeamLeader                                           -> Director
    /// - Director                                                    -> Admin (optional)
    /// </summary>
    public long? SupervisorUserId { get; set; }

    /// <summary>
    /// Job title within the organization (e.g. "Senior Engineer", "Lead Technician").
    /// </summary>
    public string? JobTitle { get; set; }

    /// <summary>
    /// Comma separated permissions granted on top of the role defaults.
    /// Example: "form.approve,form.delegate"
    /// </summary>
    public string? AdditionalPermissions { get; set; }

    /// <summary>
    /// Comma separated permissions removed from the role defaults.
    /// Example: "form.delete,user.create"
    /// </summary>
    public string? RevokedPermissions { get; set; }

    // ===== NAVIGATION PROPERTIES =====

    public Shop? Shop { get; set; }

    /// <summary>Legacy navigation for <see cref="ManagerId"/>.</summary>
    public User? Manager { get; set; }

    /// <summary>AMENDED v4: navigation for <see cref="SupervisorUserId"/>.</summary>
    public User? Supervisor { get; set; }

    /// <summary>AMENDED v4: direct reports of this user.</summary>
    public ICollection<User> Subordinates { get; set; } = new List<User>();

    public Department? Department { get; set; }
}