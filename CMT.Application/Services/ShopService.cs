using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using CMT.Domain.Models;
using CMT.Domain.Data;
using Microsoft.EntityFrameworkCore;
using DomainUserRole = CMT.Domain.Models.UserRole;

namespace CMT.Application.Services
{
    public class ShopService : IShopService
    {
        private readonly ApplicationDbContext _context;

        public ShopService(ApplicationDbContext context)
        {
            _context = context;
        }

        public async System.Threading.Tasks.Task<List<ShopDto>> GetAllShopsAsync()
        {
            var shops = await _context.Shops
                .Include(s => s.TeamLeader)
                .Include(s => s.Manager)
                .Include(s => s.Users)
                .Where(s => s.RecordStatus == RecordStatus.Active)
                .OrderBy(s => s.Name)
                .ToListAsync();

            return shops.Select(MapToShopDto).ToList();
        }

        public async System.Threading.Tasks.Task<List<ShopDto>> GetActiveShopsAsync()
        {
            var shops = await _context.Shops
                .Include(s => s.TeamLeader)
                .Include(s => s.Manager)
                .Include(s => s.Users)
                .Where(s => s.RecordStatus == RecordStatus.Active)
                .OrderBy(s => s.Name)
                .ToListAsync();

            return shops.Select(MapToShopDto).ToList();
        }

        public async System.Threading.Tasks.Task<ShopDto?> GetShopByIdAsync(int shopId)
        {
            var shop = await _context.Shops
                .Include(s => s.TeamLeader)
                .Include(s => s.Manager)
                .Include(s => s.Users)
                .FirstOrDefaultAsync(s => s.ShopId == shopId && s.RecordStatus == RecordStatus.Active);

            return shop != null ? MapToShopDto(shop) : null;
        }

        // NEW: Get shops managed by a specific manager
        public async System.Threading.Tasks.Task<List<ShopDto>> GetShopsByManagerAsync(int managerId)
        {
            var shops = await _context.Shops
                .Include(s => s.TeamLeader)
                .Include(s => s.Manager)
                .Include(s => s.Users)
                .Where(s => s.ManagerId == managerId && s.RecordStatus == RecordStatus.Active)
                .OrderBy(s => s.Name)
                .ToListAsync();

            return shops.Select(MapToShopDto).ToList();
        }

        public async System.Threading.Tasks.Task<ShopDto> CreateShopAsync(CreateShopDto createShopDto, int createdByUserId)
        {
            // Check if shop name already exists
            var existingShop = await _context.Shops
                .FirstOrDefaultAsync(s => s.Name == createShopDto.Name && s.RecordStatus == RecordStatus.Active);

            if (existingShop != null)
                throw new InvalidOperationException($"Shop with name '{createShopDto.Name}' already exists");

            // Validate team leader if provided
            if (createShopDto.TeamLeaderId.HasValue)
            {
                var teamLeader = await _context.Users.FindAsync(createShopDto.TeamLeaderId.Value);
                if (teamLeader == null)
                    throw new InvalidOperationException("Team leader not found");

                if (teamLeader.Role != DomainUserRole.ShopTL)
                    throw new InvalidOperationException("Selected user must have 'shop_tl' role");
            }

            // NEW: Validate manager if provided
            if (createShopDto.ManagerId.HasValue)
            {
                var manager = await _context.Users.FindAsync(createShopDto.ManagerId.Value);
                if (manager == null)
                    throw new InvalidOperationException("Manager not found");

                if (manager.Role != DomainUserRole.Manager)
                    throw new InvalidOperationException("Selected user must have 'manager' role");
            }

            var createdByUser = await _context.Users.FindAsync(createdByUserId);
            var createdByUsername = createdByUser?.Username ?? "System";

            var shop = new Shop
            {
                Name = createShopDto.Name,
                Description = createShopDto.Description,
                TeamLeaderId = createShopDto.TeamLeaderId,
                ManagerId = createShopDto.ManagerId,
                CreatedAt = DateTime.UtcNow,
                RegisteredBy = createdByUsername,
                RegisteredDate = DateTime.UtcNow,
                LastUpdateDate = DateTime.UtcNow,
                UpdatedBy = createdByUsername,
                StartDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                EndDate = new DateTime(9999, 12, 31, 23, 59, 59, DateTimeKind.Utc),
                TimeZoneInfo = "UTC",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false
            };

            _context.Shops.Add(shop);
            await _context.SaveChangesAsync();

            // If team leader is assigned, update their shop assignment and manager
            if (createShopDto.TeamLeaderId.HasValue)
            {
                var teamLeader = await _context.Users.FindAsync(createShopDto.TeamLeaderId.Value);
                if (teamLeader != null)
                {
                    teamLeader.ShopId = shop.ShopId;
                    // NEW: Assign manager to team leader if shop has a manager
                    if (createShopDto.ManagerId.HasValue)
                    {
                        teamLeader.ManagerId = createShopDto.ManagerId.Value;
                    }
                    teamLeader.UpdatedAt = DateTime.UtcNow;
                    await _context.SaveChangesAsync();
                }
            }

            return await GetShopByIdAsync(shop.ShopId) ?? throw new InvalidOperationException("Failed to create shop");
        }

        public async System.Threading.Tasks.Task<ShopDto> UpdateShopAsync(int shopId, UpdateShopDto updateShopDto, int updatedByUserId)
        {
            var shop = await _context.Shops.FindAsync(shopId);
            if (shop == null || shop.RecordStatus != RecordStatus.Active)
                throw new InvalidOperationException("Shop not found");

            // Check if new name conflicts with existing shop
            if (shop.Name != updateShopDto.Name)
            {
                var existingShop = await _context.Shops
                    .FirstOrDefaultAsync(s => s.Name == updateShopDto.Name && s.ShopId != shopId && s.RecordStatus == RecordStatus.Active);

                if (existingShop != null)
                    throw new InvalidOperationException($"Shop with name '{updateShopDto.Name}' already exists");
            }

            // Validate team leader if provided
            if (updateShopDto.TeamLeaderId.HasValue)
            {
                var teamLeader = await _context.Users.FindAsync(updateShopDto.TeamLeaderId.Value);
                if (teamLeader == null)
                    throw new InvalidOperationException("Team leader not found");

                if (teamLeader.Role != DomainUserRole.ShopTL)
                    throw new InvalidOperationException("Selected user must have 'shop_tl' role");
            }

            // NEW: Validate manager if provided
            if (updateShopDto.ManagerId.HasValue)
            {
                var manager = await _context.Users.FindAsync(updateShopDto.ManagerId.Value);
                if (manager == null)
                    throw new InvalidOperationException("Manager not found");

                if (manager.Role != DomainUserRole.Manager)
                    throw new InvalidOperationException("Selected user must have 'manager' role");
            }

            var updatedByUser = await _context.Users.FindAsync(updatedByUserId);
            var updatedByUsername = updatedByUser?.Username ?? "System";

            // Remove old team leader's shop assignment and manager assignment
            if (shop.TeamLeaderId.HasValue && shop.TeamLeaderId != updateShopDto.TeamLeaderId)
            {
                var oldTeamLeader = await _context.Users.FindAsync(shop.TeamLeaderId.Value);
                if (oldTeamLeader != null && oldTeamLeader.ShopId == shopId)
                {
                    oldTeamLeader.ShopId = null;
                    oldTeamLeader.ManagerId = null; // NEW: Remove manager assignment
                    oldTeamLeader.UpdatedAt = DateTime.UtcNow;
                }
            }

            shop.Name = updateShopDto.Name ?? shop.Name;
            shop.Description = updateShopDto.Description ?? shop.Description;
            shop.TeamLeaderId = updateShopDto.TeamLeaderId;
            shop.ManagerId = updateShopDto.ManagerId; // NEW: Update manager assignment
            shop.LastUpdateDate = DateTime.UtcNow;
            shop.UpdatedBy = updatedByUsername;

            await _context.SaveChangesAsync();

            // Assign new team leader to this shop and manager
            if (updateShopDto.TeamLeaderId.HasValue)
            {
                var newTeamLeader = await _context.Users.FindAsync(updateShopDto.TeamLeaderId.Value);
                if (newTeamLeader != null)
                {
                    newTeamLeader.ShopId = shop.ShopId;
                    // NEW: Assign manager to new team leader
                    newTeamLeader.ManagerId = updateShopDto.ManagerId;
                    newTeamLeader.UpdatedAt = DateTime.UtcNow;
                    await _context.SaveChangesAsync();
                }
            }

            return await GetShopByIdAsync(shopId) ?? throw new InvalidOperationException("Failed to update shop");
        }

        public async System.Threading.Tasks.Task<bool> DeleteShopAsync(int shopId, int deletedByUserId)
        {
            var shop = await _context.Shops
                .Include(s => s.Users)
                .FirstOrDefaultAsync(s => s.ShopId == shopId);

            if (shop == null || shop.RecordStatus != RecordStatus.Active)
                return false;

            // Check if shop has users
            if (shop.Users.Any(u => u.Status == UserStatus.Active))
                throw new InvalidOperationException("Cannot delete shop with active users. Please reassign or deactivate users first.");

            var deletedByUser = await _context.Users.FindAsync(deletedByUserId);
            var deletedByUsername = deletedByUser?.Username ?? "System";

            shop.RecordStatus = RecordStatus.Inactive;
            shop.LastUpdateDate = DateTime.UtcNow;
            shop.UpdatedBy = deletedByUsername;

            await _context.SaveChangesAsync();

            return true;
        }

        public async System.Threading.Tasks.Task<bool> AssignTeamLeaderAsync(int shopId, int teamLeaderId, int assignedByUserId)
        {
            var shop = await _context.Shops.FindAsync(shopId);
            if (shop == null || shop.RecordStatus != RecordStatus.Active)
                throw new InvalidOperationException("Shop not found");

            var teamLeader = await _context.Users.FindAsync(teamLeaderId);
            if (teamLeader == null)
                throw new InvalidOperationException("Team leader not found");

            if (teamLeader.Role != DomainUserRole.ShopTL)
                throw new InvalidOperationException("Selected user must have 'shop_tl' role");

            var assignedByUser = await _context.Users.FindAsync(assignedByUserId);
            var assignedByUsername = assignedByUser?.Username ?? "System";

            // Remove old team leader's shop assignment and manager assignment
            if (shop.TeamLeaderId.HasValue)
            {
                var oldTeamLeader = await _context.Users.FindAsync(shop.TeamLeaderId.Value);
                if (oldTeamLeader != null && oldTeamLeader.ShopId == shopId)
                {
                    oldTeamLeader.ShopId = null;
                    oldTeamLeader.ManagerId = null; // NEW: Remove manager assignment
                    oldTeamLeader.UpdatedAt = DateTime.UtcNow;
                }
            }

            shop.TeamLeaderId = teamLeaderId;
            shop.LastUpdateDate = DateTime.UtcNow;
            shop.UpdatedBy = assignedByUsername;

            teamLeader.ShopId = shopId;
            // NEW: Assign shop's manager to team leader
            teamLeader.ManagerId = shop.ManagerId;
            teamLeader.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            return true;
        }

        // NEW: Assign manager to shop
        public async System.Threading.Tasks.Task<bool> AssignManagerAsync(int shopId, int managerId, int assignedByUserId)
        {
            var shop = await _context.Shops
                .Include(s => s.TeamLeader)
                .FirstOrDefaultAsync(s => s.ShopId == shopId && s.RecordStatus == RecordStatus.Active);
            
            if (shop == null)
                throw new InvalidOperationException("Shop not found");

            var manager = await _context.Users.FindAsync(managerId);
            if (manager == null)
                throw new InvalidOperationException("Manager not found");

            if (manager.Role != DomainUserRole.Manager)
                throw new InvalidOperationException("Selected user must have 'manager' role");

            var assignedByUser = await _context.Users.FindAsync(assignedByUserId);
            var assignedByUsername = assignedByUser?.Username ?? "System";

            shop.ManagerId = managerId;
            shop.LastUpdateDate = DateTime.UtcNow;
            shop.UpdatedBy = assignedByUsername;

            // NEW: Also assign manager to the shop's team leader
            if (shop.TeamLeader != null)
            {
                shop.TeamLeader.ManagerId = managerId;
                shop.TeamLeader.UpdatedAt = DateTime.UtcNow;
            }

            await _context.SaveChangesAsync();

            return true;
        }

        public async System.Threading.Tasks.Task<List<ShopDto>> GetShopsWithTeamLeadersAsync()
        {
            var shops = await _context.Shops
                .Include(s => s.TeamLeader)
                .Include(s => s.Manager)
                .Include(s => s.Users)
                .Where(s => s.RecordStatus == RecordStatus.Active && s.TeamLeaderId != null)
                .OrderBy(s => s.Name)
                .ToListAsync();

            return shops.Select(MapToShopDto).ToList();
        }

        // NEW: Get shops with managers
        public async System.Threading.Tasks.Task<List<ShopDto>> GetShopsWithManagersAsync()
        {
            var shops = await _context.Shops
                .Include(s => s.TeamLeader)
                .Include(s => s.Manager)
                .Include(s => s.Users)
                .Where(s => s.RecordStatus == RecordStatus.Active && s.ManagerId != null)
                .OrderBy(s => s.Name)
                .ToListAsync();

            return shops.Select(MapToShopDto).ToList();
        }

        private ShopDto MapToShopDto(Shop shop)
        {
            return new ShopDto
            {
                ShopId = shop.ShopId,
                Name = shop.Name,
                Description = shop.Description,
                IsActive = shop.RecordStatus == RecordStatus.Active,
                CreatedAt = shop.CreatedAt,
                UpdatedAt = shop.LastUpdateDate,
                UserCount = shop.Users.Count(u => u.Status == UserStatus.Active),
                TeamLeaderId = shop.TeamLeaderId,
                TeamLeaderName = shop.TeamLeader?.FullName,
                ManagerId = shop.ManagerId,
                ManagerName = shop.Manager?.FullName
            };
        }
    }
}