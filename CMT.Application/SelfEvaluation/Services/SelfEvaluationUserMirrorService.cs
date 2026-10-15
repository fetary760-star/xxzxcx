using CMT.Domain.Data;
using CMT.Domain.Models;
using CMT.Domain.Models.Shared;
using CMT.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using CmtUserRole = CMT.Domain.Models.UserRole;
using CmtUserStatus = CMT.Domain.Models.UserStatus;
using SelfEvaluationRecordStatus = CMT.Domain.Models.Shared.RecordStatus;
using SelfEvaluationUser = CMT.Domain.Models.SelfEvaluation.User;
using Task = System.Threading.Tasks.Task;

namespace CMT.Application.SelfEvaluation.Services;

public sealed class SelfEvaluationUserMirrorService : ISelfEvaluationUserMirrorService
{
    private const string MirrorSource = "CMT user synchronization";

    private readonly CMT.Domain.Data.ApplicationDbContext _cmtContext;
    private readonly CMT.Domain.SelfEvaluation.Data.ApplicationDbContext _selfEvaluationContext;

    public SelfEvaluationUserMirrorService(
        CMT.Domain.Data.ApplicationDbContext cmtContext,
        CMT.Domain.SelfEvaluation.Data.ApplicationDbContext selfEvaluationContext)
    {
        _cmtContext = cmtContext;
        _selfEvaluationContext = selfEvaluationContext;
    }

    public async Task UpsertAsync(User user, CancellationToken cancellationToken = default)
    {
        if (user.UserId <= 0)
            throw new InvalidOperationException("A saved CMT user ID is required before Self-Evaluation synchronization.");

        var role = ResolveSelfEvaluationRole(user);
        var existing = await _selfEvaluationContext.Users
            .SingleOrDefaultAsync(candidate => candidate.Id == user.UserId, cancellationToken);

        if (existing is not null &&
            !string.Equals(existing.RegisteredBy, MirrorSource, StringComparison.Ordinal) &&
            !SameIdentity(existing, user))
        {
            throw new InvalidOperationException(
                $"CMT user ID {user.UserId} conflicts with a different Self-Evaluation account. " +
                "Resolve the existing identity before syncing; the mirror will not overwrite it.");
        }

        var duplicate = await _selfEvaluationContext.Users
            .AsNoTracking()
            .AnyAsync(candidate => candidate.Id != user.UserId &&
                (candidate.Username == user.Username || candidate.Email == user.Email), cancellationToken);
        if (duplicate)
        {
            throw new InvalidOperationException(
                $"The username or email for CMT user ID {user.UserId} is already assigned to a different Self-Evaluation account.");
        }

        var departmentId = await ResolveDepartmentIdAsync(user.DepartmentId, cancellationToken);
        var shopId = await ResolveShopIdAsync(user.ShopId, departmentId, cancellationToken);
        var requestedSupervisorId = user.SupervisorId ?? user.ManagerId;
        var mappedSupervisorId = requestedSupervisorId.HasValue && await _selfEvaluationContext.Users
            .AnyAsync(candidate => candidate.Id == requestedSupervisorId.Value, cancellationToken)
                ? requestedSupervisorId
                : null;
        var workflowReady = role is not null && await HasValidWorkflowStructureAsync(
            role, departmentId, shopId, mappedSupervisorId, cancellationToken);

        var isNewUser = existing is null;
        if (isNewUser)
        {
            existing = new SelfEvaluationUser { Id = user.UserId };
            _selfEvaluationContext.Users.Add(existing);
        }

        var isActive = user.Status == CmtUserStatus.Active;
        existing.Username = user.Username;
        existing.Email = user.Email;
        existing.FullName = user.FullName;
        existing.PasswordHash = user.Password;
        existing.Role = role is null
            ? $"CMT_{user.Role}"
            : workflowReady ? role : $"CMT_PENDING_{role}";
        existing.ShopId = shopId;
        existing.DepartmentId = departmentId;
        existing.ManagerId = user.ManagerId.HasValue &&
            await _selfEvaluationContext.Users.AnyAsync(
                candidate => candidate.Id == user.ManagerId.Value, cancellationToken)
                    ? user.ManagerId
                    : null;
        existing.SupervisorUserId = mappedSupervisorId;
        existing.PersonnelType = user.PersonnelType;
        existing.IsActive = isActive && role is not null && workflowReady;
        existing.RecordStatus = existing.IsActive
            ? SelfEvaluationRecordStatus.Active
            : SelfEvaluationRecordStatus.Inactive;
        existing.CreatedDate = existing.CreatedDate == default ? user.CreatedAt : existing.CreatedDate;
        existing.LastUpdateDate = user.UpdatedAt;
        existing.LastUpdatedBy = user.UpdatedBy;

        existing.RegisteredBy = MirrorSource;

        if (isNewUser)
            await SaveWithStableUserIdAsync(cancellationToken);
        else
            await _selfEvaluationContext.SaveChangesAsync(cancellationToken);
    }

    private async Task<Guid?> ResolveDepartmentIdAsync(int? cmtDepartmentId, CancellationToken cancellationToken)
    {
        if (!cmtDepartmentId.HasValue) return null;

        var cmtDepartment = await _cmtContext.Departments
            .AsNoTracking()
            .SingleOrDefaultAsync(department =>
                department.DepartmentId == cmtDepartmentId.Value && department.IsActive,
                cancellationToken);
        if (cmtDepartment is null) return null;

        var sourceCode = $"CMT-D-{cmtDepartment.DepartmentId}";
        var department = await _selfEvaluationContext.Departments
            .FirstOrDefaultAsync(candidate => candidate.Code == sourceCode, cancellationToken)
            ?? await _selfEvaluationContext.Departments
                .FirstOrDefaultAsync(candidate => candidate.Name == cmtDepartment.Name, cancellationToken);

        if (department is null)
        {
            department = new CMT.Domain.Models.SelfEvaluation.Department
            {
                Id = Guid.NewGuid(),
                Code = sourceCode,
                Name = cmtDepartment.Name,
                DirectorUserId = cmtDepartment.DirectorId,
                IsActive = true,
                CreatedAt = cmtDepartment.CreatedAt,
                UpdatedAt = DateTime.UtcNow,
                CreatedBy = MirrorSource,
                UpdatedBy = MirrorSource
            };
            _selfEvaluationContext.Departments.Add(department);
        }
        else
        {
            department.Name = cmtDepartment.Name;
            department.DirectorUserId = cmtDepartment.DirectorId;
            department.IsActive = true;
            department.UpdatedAt = DateTime.UtcNow;
            department.UpdatedBy = MirrorSource;
        }

        return department.Id;
    }

    private async Task<Guid?> ResolveShopIdAsync(
        int? cmtShopId,
        Guid? departmentId,
        CancellationToken cancellationToken)
    {
        if (!cmtShopId.HasValue) return null;

        var cmtShop = await _cmtContext.Shops
            .AsNoTracking()
            .SingleOrDefaultAsync(shop =>
                shop.ShopId == cmtShopId.Value && shop.RecordStatus == CMT.Domain.Models.RecordStatus.Active,
                cancellationToken);
        if (cmtShop is null) return null;

        var shop = await _selfEvaluationContext.Shops
            .FirstOrDefaultAsync(candidate =>
                candidate.Name == cmtShop.Name && candidate.DepartmentId == departmentId,
                cancellationToken);

        if (shop is null)
        {
            shop = new CMT.Domain.Models.SelfEvaluation.Shop
            {
                Id = Guid.NewGuid(),
                Name = cmtShop.Name,
                DepartmentId = departmentId,
                TeamLeaderUserId = cmtShop.TeamLeaderId,
                ShopManagerUserId = cmtShop.ManagerId,
                IsActive = true,
                CreatedAt = cmtShop.CreatedAt,
                UpdatedAt = DateTime.UtcNow,
                CreatedBy = MirrorSource,
                UpdatedBy = MirrorSource
            };
            _selfEvaluationContext.Shops.Add(shop);
        }
        else
        {
            shop.TeamLeaderUserId = cmtShop.TeamLeaderId;
            shop.ShopManagerUserId = cmtShop.ManagerId;
            shop.IsActive = true;
            shop.UpdatedAt = DateTime.UtcNow;
            shop.UpdatedBy = MirrorSource;
        }

        return shop.Id;
    }

    private async Task<bool> HasValidWorkflowStructureAsync(
        string role,
        Guid? departmentId,
        Guid? shopId,
        int? supervisorId,
        CancellationToken cancellationToken)
    {
        if (!RoleHierarchy.Rules.TryGetValue(role, out var rule)) return false;
        if (rule.RequiresDepartment && !departmentId.HasValue) return false;
        if (rule.RequiresShop && !shopId.HasValue) return false;
        if (rule.RequiresSupervisor && !supervisorId.HasValue) return false;
        if (!supervisorId.HasValue) return true;

        var supervisor = await _selfEvaluationContext.Users
            .AsNoTracking()
            .SingleOrDefaultAsync(candidate => candidate.Id == supervisorId.Value, cancellationToken);
        var supervisorRole = RoleHierarchy.Normalize(supervisor?.Role);
        return supervisor is { IsActive: true, RecordStatus: SelfEvaluationRecordStatus.Active } &&
            supervisorRole is not null &&
            rule.AllowedSupervisorRoles.Contains(supervisorRole, StringComparer.OrdinalIgnoreCase);
    }

    private static string? ResolveSelfEvaluationRole(User user)
        => user.Role switch
        {
            CmtUserRole.Admin => OrgRoles.Admin,
            CmtUserRole.Director => OrgRoles.Director,
            CmtUserRole.Manager => OrgRoles.Manager,
            CmtUserRole.MiniManager => OrgRoles.ShopManager,
            CmtUserRole.ShopTL or CmtUserRole.TeamLeader => OrgRoles.TeamLeader,
            CmtUserRole.Engineer => OrgRoles.Engineer,
            CmtUserRole.CustomerPersonnel when string.Equals(user.PersonnelType, "technician", StringComparison.OrdinalIgnoreCase)
                => OrgRoles.Technician,
            CmtUserRole.CustomerPersonnel when string.Equals(user.PersonnelType, "tools_clerk", StringComparison.OrdinalIgnoreCase)
                => OrgRoles.DocumentationClerk,
            _ => null
        };

    private static bool SameIdentity(SelfEvaluationUser existing, User cmtUser)
          => string.Equals(existing.Username, cmtUser.Username, StringComparison.OrdinalIgnoreCase) &&
              string.Equals(existing.Email, cmtUser.Email, StringComparison.OrdinalIgnoreCase);

    private async Task SaveWithStableUserIdAsync(CancellationToken cancellationToken)
    {
        var connection = _selfEvaluationContext.Database.GetDbConnection();
        var closeAfterSave = connection.State != System.Data.ConnectionState.Open;
        if (closeAfterSave)
            await _selfEvaluationContext.Database.OpenConnectionAsync(cancellationToken);

        try
        {
            await _selfEvaluationContext.Database.ExecuteSqlRawAsync(
                "SET IDENTITY_INSERT [Users] ON", cancellationToken);
            try
            {
                await _selfEvaluationContext.SaveChangesAsync(cancellationToken);
            }
            finally
            {
                await _selfEvaluationContext.Database.ExecuteSqlRawAsync(
                    "SET IDENTITY_INSERT [Users] OFF", cancellationToken);
            }
        }
        finally
        {
            if (closeAfterSave)
                await _selfEvaluationContext.Database.CloseConnectionAsync();
        }
    }
}