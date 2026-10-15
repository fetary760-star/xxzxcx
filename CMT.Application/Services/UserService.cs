using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using CMT.Domain.Data;
using CMT.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using DomainUserRole = CMT.Domain.Models.UserRole;
using DomainTaskStatus = CMT.Domain.Enums.TaskStatus;

namespace CMT.Application.Services
{
    public partial class UserService : IUserService
    {
        private readonly ApplicationDbContext _context;
        private readonly IConfiguration _configuration;
        private readonly IPasswordService _passwordService;
        private readonly IUserAuditService _userAuditService;
        private readonly ISelfEvaluationUserMirrorService _selfEvaluationUserMirror;

        public UserService(
            ApplicationDbContext context,
            IConfiguration configuration,
            IPasswordService passwordService,
            IUserAuditService userAuditService,
            ISelfEvaluationUserMirrorService selfEvaluationUserMirror)
        {
            _context = context;
            _configuration = configuration;
            _passwordService = passwordService;
            _userAuditService = userAuditService;
            _selfEvaluationUserMirror = selfEvaluationUserMirror;
        }

        public async System.Threading.Tasks.Task<LoginResponseDto?> AuthenticateAsync(LoginDto loginDto)
        {
            var user = await _context.Users
                .Include(u => u.Shop)
                .Include(u => u.Supervisor)
                .Include(u => u.Manager)
                .Include(u => u.Department)
                .FirstOrDefaultAsync(u => u.Username == loginDto.Username && u.Status == UserStatus.Active);

            if (user == null || !VerifyPassword(loginDto.Password, user.Password))
                return null;

            var token = GenerateJwtToken(user);
            var refreshToken = GenerateRefreshToken();

            var userDto = await MapToUserDtoAsync(user);

            return new LoginResponseDto
            {
                Token = token,
                RefreshToken = refreshToken,
                User = userDto,
                ExpiresAt = DateTime.UtcNow.AddHours(24),
                Permissions = userDto.Permissions
            };
        }

        public async System.Threading.Tasks.Task<LoginResponseDto?> RefreshTokenAsync(string refreshToken)
        {
            await System.Threading.Tasks.Task.CompletedTask;
            return null;
        }

        public async System.Threading.Tasks.Task<bool> RevokeTokenAsync(string token)
        {
            await System.Threading.Tasks.Task.CompletedTask;
            return true;
        }

        public async System.Threading.Tasks.Task<UserDto?> GetUserByIdAsync(int userId)
        {
            var user = await _context.Users
                .Include(u => u.Shop)
                .Include(u => u.Supervisor)
                .Include(u => u.CreatedByUser)
                .Include(u => u.Manager)
                .Include(u => u.Department)
                .FirstOrDefaultAsync(u => u.UserId == userId);

            if (user == null) return null;

            return await MapToUserDtoAsync(user);
        }

        public async System.Threading.Tasks.Task<UserDto?> GetUserByUsernameAsync(string username)
        {
            var user = await _context.Users
                .Include(u => u.Shop)
                .Include(u => u.Supervisor)
                .Include(u => u.CreatedByUser)
                .Include(u => u.Manager)
                .Include(u => u.Department)
                .FirstOrDefaultAsync(u => u.Username == username);

            if (user == null) return null;

            return await MapToUserDtoAsync(user);
        }

        public async System.Threading.Tasks.Task<UserDto?> GetUserByUsernameOrFullNameAsync(string nameOrUsername)
        {
            if (string.IsNullOrWhiteSpace(nameOrUsername))
                return null;

            var trimmed = nameOrUsername.Trim();

            // First try exact username match
            var user = await _context.Users
                .Include(u => u.Shop)
                .Include(u => u.Supervisor)
                .Include(u => u.CreatedByUser)
                .Include(u => u.Manager)
                .Include(u => u.Department)
                .FirstOrDefaultAsync(u => u.Username == trimmed);

            // If not found by username, try exact full name match
            if (user == null)
            {
                user = await _context.Users
                    .Include(u => u.Shop)
                    .Include(u => u.Supervisor)
                    .Include(u => u.CreatedByUser)
                    .Include(u => u.Manager)
                    .Include(u => u.Department)
                    .FirstOrDefaultAsync(u => u.FullName == trimmed);
            }

            // If still not found, try case-insensitive full name match
            if (user == null)
            {
                user = await _context.Users
                    .Include(u => u.Shop)
                    .Include(u => u.Supervisor)
                    .Include(u => u.CreatedByUser)
                    .Include(u => u.Manager)
                    .Include(u => u.Department)
                    .FirstOrDefaultAsync(u => u.FullName.ToLower() == trimmed.ToLower());
            }

            if (user == null) return null;

            return await MapToUserDtoAsync(user);
        }

        public async System.Threading.Tasks.Task<List<UserDto>> GetAllUsersAsync()
        {
            var users = await _context.Users
                .Include(u => u.Shop)
                .Include(u => u.Supervisor)
                .Include(u => u.CreatedByUser)
                .Include(u => u.Manager)
                .Include(u => u.Department)
                .Where(u => u.Status == UserStatus.Active)
                .OrderBy(u => u.FullName)
                .ToListAsync();

            var userDtos = new List<UserDto>();
            foreach (var user in users)
            {
                userDtos.Add(await MapToUserDtoAsync(user));
            }
            return userDtos;
        }

        public async System.Threading.Tasks.Task<List<UserDto>> GetUsersByRoleAsync(string role)
        {
            if (!ValidRoles.IsValidRole(role))
                return new List<UserDto>();

            var domainRole = ConvertStringToUserRole(role);

            var users = await _context.Users
                .Include(u => u.Shop)
                .Include(u => u.Supervisor)
                .Include(u => u.CreatedByUser)
                .Include(u => u.Manager)
                .Include(u => u.Department)
                .Where(u => u.Role == domainRole && u.Status == UserStatus.Active)
                .OrderBy(u => u.FullName)
                .ToListAsync();

            var userDtos = new List<UserDto>();
            foreach (var user in users)
            {
                userDtos.Add(await MapToUserDtoAsync(user));
            }
            return userDtos;
        }

        public async System.Threading.Tasks.Task<List<UserDto>> GetUsersByShopAsync(int shopId)
        {
            var users = await _context.Users
                .Include(u => u.Shop)
                .Include(u => u.Supervisor)
                .Include(u => u.CreatedByUser)
                .Include(u => u.Manager)
                .Include(u => u.Department)
                .Where(u => u.ShopId == shopId && u.Status == UserStatus.Active)
                .OrderBy(u => u.FullName)
                .ToListAsync();

            var userDtos = new List<UserDto>();
            foreach (var user in users)
            {
                userDtos.Add(await MapToUserDtoAsync(user));
            }
            return userDtos;
        }

        public async System.Threading.Tasks.Task<List<UserDto>> GetSubordinatesAsync(int supervisorId)
        {
            var users = await _context.Users
                .Include(u => u.Shop)
                .Include(u => u.Supervisor)
                .Include(u => u.CreatedByUser)
                .Include(u => u.Manager)
                .Include(u => u.Department)
                .Where(u => u.SupervisorId == supervisorId && u.Status == UserStatus.Active)
                .OrderBy(u => u.FullName)
                .ToListAsync();

            var userDtos = new List<UserDto>();
            foreach (var user in users)
            {
                userDtos.Add(await MapToUserDtoAsync(user));
            }
            return userDtos;
        }

        public async System.Threading.Tasks.Task<List<UserDto>> GetManagedUsersAsync(int managerId)
        {
            var users = await _context.Users
                .Include(u => u.Shop)
                .Include(u => u.Supervisor)
                .Include(u => u.CreatedByUser)
                .Include(u => u.Manager)
                .Include(u => u.Department)
                .Where(u => u.ManagerId == managerId && u.Status == UserStatus.Active)
                .OrderBy(u => u.FullName)
                .ToListAsync();

            var userDtos = new List<UserDto>();
            foreach (var user in users)
            {
                userDtos.Add(await MapToUserDtoAsync(user));
            }
            return userDtos;
        }

        public async System.Threading.Tasks.Task<List<EngineerDto>> GetEngineersOnlyAsync()
        {
            var engineers = await _context.Users
                .Where(u => u.Role == DomainUserRole.Engineer && u.Status == UserStatus.Active)
                .OrderBy(u => u.FullName)
                .Select(u => new EngineerDto
                {
                    UserId = u.UserId,
                    FullName = u.FullName,
                    Username = u.Username,
                    Email = u.Email
                })
                .ToListAsync();

            return engineers;
        }

        public async System.Threading.Tasks.Task<ManagerDashboardDto> GetManagerDashboardAsync(int managerId)
        {
            var manager = await _context.Users
                .FirstOrDefaultAsync(u => u.UserId == managerId && u.Role == DomainUserRole.Manager);

            if (manager == null)
            {
                return new ManagerDashboardDto
                {
                    ManagerUserId = managerId,
                    ManagerName = "Unknown"
                };
            }

            var shopTeamLeaders = await _context.Users
                .Include(u => u.Shop)
                .Where(u => u.ManagerId == managerId && u.Role == DomainUserRole.ShopTL && u.Status == UserStatus.Active)
                .OrderBy(u => u.FullName)
                .ToListAsync();

            var shopTLMetrics = new List<ShopTeamLeaderMetricsDto>();
            int totalActiveTasks = 0;
            int totalCompletedTasks = 0;
            int totalPendingTasks = 0;
            double overallCompletionRate = 0;
            double overallAverageDelay = 0;
            int totalShopTLs = 0;

            foreach (var shopTL in shopTeamLeaders)
            {
                var createdUsers = await GetUsersCreatedByShopTLAsync(shopTL.UserId);
                var createdUserIds = createdUsers.Select(u => u.UserId).ToList();
                createdUserIds.Add(shopTL.UserId);

                var activeTasks = await _context.Tasks
                    .Where(t => createdUserIds.Contains(t.CreatedBy) && 
                               t.Status != DomainTaskStatus.Completed && 
                               t.Status != DomainTaskStatus.Rejected &&
                               t.RecordStatus == RecordStatus.Active)
                    .CountAsync();

                var completedTasks = await _context.CompletedTasks
                    .Where(ct => createdUserIds.Contains(ct.CreatedBy) && ct.RecordStatus == RecordStatus.Active)
                    .CountAsync();

                var pendingTasks = await _context.Tasks
                    .Where(t => createdUserIds.Contains(t.CreatedBy) && 
                               t.Status == DomainTaskStatus.Pending &&
                               t.RecordStatus == RecordStatus.Active)
                    .CountAsync();

                var totalTasks = activeTasks + completedTasks;
                var completionRate = totalTasks > 0 ? (double)completedTasks / totalTasks * 100 : 0;

                var delayedTasks = await _context.CompletedTasks
                    .Where(ct => createdUserIds.Contains(ct.CreatedBy) && 
                                ct.RecordStatus == RecordStatus.Active &&
                                ct.ActualCompletionDate.HasValue &&
                                ct.TargetCompletionDate.HasValue &&
                                ct.ActualCompletionDate.Value > ct.TargetCompletionDate.Value)
                    .ToListAsync();

                var averageDelay = delayedTasks.Any()
                    ? delayedTasks.Average(t => (t.ActualCompletionDate!.Value - t.TargetCompletionDate!.Value).TotalDays)
                    : 0;

                shopTLMetrics.Add(new ShopTeamLeaderMetricsDto
                {
                    UserId = shopTL.UserId,
                    FullName = shopTL.FullName,
                    Username = shopTL.Username,
                    Email = shopTL.Email,
                    ShopId = shopTL.ShopId,
                    ShopName = shopTL.Shop?.Name,
                    TotalUsersCreated = createdUsers.Count,
                    CreatedUsers = createdUsers,
                    CompletedTasks = completedTasks,
                    ActiveTasks = activeTasks,
                    PendingTasks = pendingTasks,
                    CompletionRate = completionRate,
                    AverageDelayDays = averageDelay,
                    IsActive = shopTL.Status == UserStatus.Active,
                    CreatedAt = shopTL.CreatedAt
                });

                totalActiveTasks += activeTasks;
                totalCompletedTasks += completedTasks;
                totalPendingTasks += pendingTasks;
                totalShopTLs++;
            }

            var overallTotal = totalActiveTasks + totalCompletedTasks;
            overallCompletionRate = overallTotal > 0 ? (double)totalCompletedTasks / overallTotal * 100 : 0;

            if (totalShopTLs > 0)
            {
                overallAverageDelay = shopTLMetrics.Average(m => m.AverageDelayDays);
            }

            var allManagedUserIds = new List<int>();
            foreach (var shopTL in shopTeamLeaders)
            {
                var createdUsers = await GetUsersCreatedByShopTLAsync(shopTL.UserId);
                allManagedUserIds.Add(shopTL.UserId);
                allManagedUserIds.AddRange(createdUsers.Select(u => u.UserId));
            }

            var recentTasks = await _context.Tasks
                .Include(t => t.Creator)
                .Include(t => t.Category)
                .Include(t => t.Priority)
                .Where(t => allManagedUserIds.Contains(t.CreatedBy) && t.RecordStatus == RecordStatus.Active)
                .OrderByDescending(t => t.CreatedAt)
                .Take(10)
                .Select(t => new TaskSummaryDto
                {
                    TaskId = t.TaskId,
                    Description = t.Description,
                    Status = t.Status.ToString(),
                    CreatedByName = t.Creator.FullName,
                    CreatedAt = t.CreatedAt,
                    CategoryName = t.Category.Name,
                    PriorityName = t.Priority.LevelName,
                    TargetCompletionDate = t.TargetCompletionDate
                })
                .ToListAsync();

            Console.WriteLine($"[DEBUG] Manager {managerId} dashboard: Total={overallTotal}, Completed={totalCompletedTasks}, Active={totalActiveTasks}, Pending={totalPendingTasks}, CompletionRate={overallCompletionRate:F2}%");

            return new ManagerDashboardDto
            {
                ManagerUserId = managerId,
                ManagerName = manager.FullName,
                ShopTeamLeaders = shopTLMetrics,
                TotalShopTeamLeaders = shopTLMetrics.Count,
                TotalActiveTasks = totalActiveTasks,
                TotalCompletedTasks = totalCompletedTasks,
                TotalPendingTasks = totalPendingTasks,
                OverallCompletionRate = overallCompletionRate,
                OverallAverageDelay = overallAverageDelay,
                RecentTasks = recentTasks
            };
        }

        public async System.Threading.Tasks.Task<List<UserDto>> GetUsersCreatedByShopTLAsync(int shopTLUserId)
        {
            var shopTL = await _context.Users
                .Include(u => u.Shop)
                .FirstOrDefaultAsync(u => u.UserId == shopTLUserId && u.Role == DomainUserRole.ShopTL);

            if (shopTL == null || !shopTL.ShopId.HasValue)
            {
                return new List<UserDto>();
            }

            var users = await _context.Users
                .Include(u => u.Shop)
                .Include(u => u.Supervisor)
                .Include(u => u.CreatedByUser)
                .Include(u => u.Manager)
                .Include(u => u.Department)
                .Where(u => u.CreatedByUserId == shopTLUserId && 
                           u.Status == UserStatus.Active)
                .OrderBy(u => u.FullName)
                .ToListAsync();

            var userDtos = new List<UserDto>();
            foreach (var user in users)
            {
                userDtos.Add(await MapToUserDtoAsync(user));
            }
            return userDtos;
        }

        public async System.Threading.Tasks.Task<List<UserDto>> GetUsersByCreatorIdAsync(int creatorUserId)
        {
            Console.WriteLine($"[DEBUG] GetUsersByCreatorIdAsync called for creatorUserId: {creatorUserId}");
            
            var users = await _context.Users
                .Include(u => u.Shop)
                .Include(u => u.Supervisor)
                .Include(u => u.CreatedByUser)
                .Include(u => u.Manager)
                .Include(u => u.Department)
                .Where(u => u.CreatedByUserId == creatorUserId && 
                           u.Status == UserStatus.Active)
                .OrderBy(u => u.FullName)
                .ToListAsync();

            Console.WriteLine($"[DEBUG] Found {users.Count} users created by user {creatorUserId}");

            var userDtos = new List<UserDto>();
            foreach (var user in users)
            {
                userDtos.Add(await MapToUserDtoAsync(user));
            }
            return userDtos;
        }

        /// <summary>
        /// Get all users visible to a Shop Manager (MiniManager):
        /// 1. All Shop TLs assigned to the same shop (regardless of who created them)
        /// 2. All users created by this Shop Manager
        /// 3. All users created by Shop TLs in the same shop (customer_personnel under those Shop TLs)
        /// This ensures the Shop Manager sees and can manage all Shop TLs in their shop.
        /// </summary>
        public async System.Threading.Tasks.Task<List<UserDto>> GetUsersForShopManagerAsync(int shopManagerUserId)
        {
            Console.WriteLine($"[DEBUG] GetUsersForShopManagerAsync called for shopManagerUserId: {shopManagerUserId}");

            var shopManager = await _context.Users
                .Include(u => u.Shop)
                .FirstOrDefaultAsync(u => u.UserId == shopManagerUserId && u.Role == DomainUserRole.MiniManager);

            if (shopManager == null)
            {
                Console.WriteLine($"[DEBUG] Shop Manager {shopManagerUserId} not found");
                return new List<UserDto>();
            }

            // Collect all relevant user IDs to avoid duplicates
            var userIds = new HashSet<int>();

            // 1. If Shop Manager has a shop, get ALL Shop TLs in that shop
            if (shopManager.ShopId.HasValue)
            {
                var shopTLsInShop = await _context.Users
                    .Where(u => u.ShopId == shopManager.ShopId.Value &&
                               u.Role == DomainUserRole.ShopTL &&
                               u.Status == UserStatus.Active)
                    .Select(u => u.UserId)
                    .ToListAsync();

                foreach (var id in shopTLsInShop)
                    userIds.Add(id);

                Console.WriteLine($"[DEBUG] Found {shopTLsInShop.Count} Shop TLs in shop {shopManager.ShopId.Value}");

                // 2. Get all users created by those Shop TLs (customer_personnel under them)
                foreach (var shopTLId in shopTLsInShop)
                {
                    var createdByShopTL = await _context.Users
                        .Where(u => u.CreatedByUserId == shopTLId && u.Status == UserStatus.Active)
                        .Select(u => u.UserId)
                        .ToListAsync();

                    foreach (var id in createdByShopTL)
                        userIds.Add(id);
                }

                // 3. Also get any other users in the same shop (e.g., customer_personnel, engineers)
                var otherUsersInShop = await _context.Users
                    .Where(u => u.ShopId == shopManager.ShopId.Value &&
                               u.UserId != shopManagerUserId &&
                               u.Status == UserStatus.Active)
                    .Select(u => u.UserId)
                    .ToListAsync();

                foreach (var id in otherUsersInShop)
                    userIds.Add(id);
            }

            // 4. Always include users created directly by this Shop Manager
            var createdByShopManager = await _context.Users
                .Where(u => u.CreatedByUserId == shopManagerUserId && u.Status == UserStatus.Active)
                .Select(u => u.UserId)
                .ToListAsync();

            foreach (var id in createdByShopManager)
                userIds.Add(id);

            Console.WriteLine($"[DEBUG] Total unique user IDs for Shop Manager {shopManagerUserId}: {userIds.Count}");

            // Fetch full user data for all collected IDs
            var users = await _context.Users
                .Include(u => u.Shop)
                .Include(u => u.Supervisor)
                .Include(u => u.CreatedByUser)
                .Include(u => u.Manager)
                .Include(u => u.Department)
                .Where(u => userIds.Contains(u.UserId))
                .OrderBy(u => u.FullName)
                .ToListAsync();

            var userDtos = new List<UserDto>();
            foreach (var user in users)
            {
                userDtos.Add(await MapToUserDtoAsync(user));
            }
            return userDtos;
        }

        public async System.Threading.Tasks.Task<ShopTLDashboardDto> GetShopTLDashboardAsync(int shopTLUserId)
        {
            var shopTL = await _context.Users
                .Include(u => u.Shop)
                .Include(u => u.Manager)
                .Include(u => u.Department)
                .FirstOrDefaultAsync(u => u.UserId == shopTLUserId && u.Role == DomainUserRole.ShopTL);

            if (shopTL == null || !shopTL.ShopId.HasValue)
            {
                return new ShopTLDashboardDto
                {
                    ShopTLUserId = shopTLUserId,
                    ShopTLName = "Unknown",
                    ShopName = "No Shop Assigned",
                    ShopId = 0
                };
            }

            var createdUsers = await GetUsersCreatedByShopTLAsync(shopTLUserId);
            var createdUserIds = createdUsers.Select(u => u.UserId).ToList();
            
            var activeTasks = await _context.Tasks
                .Where(t => createdUserIds.Contains(t.CreatedBy) && 
                           t.Status != DomainTaskStatus.Completed && 
                           t.Status != DomainTaskStatus.Rejected &&
                           t.RecordStatus == RecordStatus.Active)
                .CountAsync();

            var completedTasks = await _context.CompletedTasks
                .Where(ct => createdUserIds.Contains(ct.CreatedBy) && ct.RecordStatus == RecordStatus.Active)
                .CountAsync();

            var pendingTasks = await _context.Tasks
                .Where(t => createdUserIds.Contains(t.CreatedBy) && 
                           t.Status == DomainTaskStatus.Pending &&
                           t.RecordStatus == RecordStatus.Active)
                .CountAsync();

            var recentTasks = await _context.Tasks
                .Include(t => t.Creator)
                .Include(t => t.Category)
                .Include(t => t.Priority)
                .Where(t => createdUserIds.Contains(t.CreatedBy) && t.RecordStatus == RecordStatus.Active)
                .OrderByDescending(t => t.CreatedAt)
                .Take(10)
                .Select(t => new TaskSummaryDto
                {
                    TaskId = t.TaskId,
                    Description = t.Description,
                    Status = t.Status.ToString(),
                    CreatedByName = t.Creator.FullName,
                    CreatedAt = t.CreatedAt,
                    CategoryName = t.Category.Name,
                    PriorityName = t.Priority.LevelName,
                    TargetCompletionDate = t.TargetCompletionDate
                })
                .ToListAsync();

            var statusBreakdown = await _context.Tasks
                .Where(t => createdUserIds.Contains(t.CreatedBy) && t.RecordStatus == RecordStatus.Active)
                .GroupBy(t => t.Status)
                .ToDictionaryAsync(g => g.Key.ToString(), g => g.Count());

            return new ShopTLDashboardDto
            {
                ShopTLUserId = shopTLUserId,
                ShopTLName = shopTL.FullName,
                ShopName = shopTL.Shop?.Name ?? "Unknown Shop",
                ShopId = shopTL.ShopId.Value,
                ManagerId = shopTL.ManagerId,
                ManagerName = shopTL.Manager?.FullName,
                CreatedUsers = createdUsers,
                TotalCreatedUsers = createdUsers.Count,
                TotalActiveTasks = activeTasks,
                TotalCompletedTasks = completedTasks,
                TotalPendingTasks = pendingTasks,
                RecentTasks = recentTasks,
                TaskStatusBreakdown = statusBreakdown
            };
        }

        public async System.Threading.Tasks.Task<UserDto> CreateUserAsync(CreateUserDto createUserDto, int createdByUserId = 0, string? ipAddress = null)
        {
            Console.WriteLine($"[DEBUG] CreateUserAsync called with: {System.Text.Json.JsonSerializer.Serialize(createUserDto)}");
            
            // Enhanced input validation
            if (string.IsNullOrWhiteSpace(createUserDto.Username))
                throw new InvalidOperationException("Username is required");
            
            if (string.IsNullOrWhiteSpace(createUserDto.Email))
                throw new InvalidOperationException("Email is required");
            
            if (string.IsNullOrWhiteSpace(createUserDto.FullName))
                throw new InvalidOperationException("Full name is required");
            
            if (string.IsNullOrWhiteSpace(createUserDto.Password))
                throw new InvalidOperationException("Password is required");
            
            if (string.IsNullOrWhiteSpace(createUserDto.Role))
                throw new InvalidOperationException("Role is required");

            // Trim input data
            createUserDto.Username = createUserDto.Username.Trim();
            createUserDto.Email = createUserDto.Email.Trim();
            createUserDto.FullName = createUserDto.FullName.Trim();
            createUserDto.Password = createUserDto.Password.Trim();
            createUserDto.Role = createUserDto.Role.Trim();

            if (!await IsUsernameAvailableAsync(createUserDto.Username))
                throw new InvalidOperationException("Username already exists");

            if (!await IsEmailAvailableAsync(createUserDto.Email))
                throw new InvalidOperationException("Email already exists");

            if (!ValidRoles.IsValidRole(createUserDto.Role))
                throw new InvalidOperationException($"Invalid role: {createUserDto.Role}");

            // NEW: Validate personnel type for customer_personnel role
            if (createUserDto.Role == "customer_personnel")
            {
                if (!ValidRoles.IsValidPersonnelType(createUserDto.PersonnelType))
                    throw new InvalidOperationException($"Invalid personnel type: {createUserDto.PersonnelType}");
                
                // Default to customer_personnel if not specified
                if (string.IsNullOrEmpty(createUserDto.PersonnelType))
                {
                    createUserDto.PersonnelType = "customer_personnel";
                }
            }

            // CRITICAL: Shop Team Leader MUST have a Manager assigned
            if (createUserDto.Role == "shop_tl")
            {
                if (!createUserDto.ShopId.HasValue || createUserDto.ShopId.Value <= 0)
                {
                    throw new InvalidOperationException("Shop assignment is required for Shop Team Leader role");
                }
                
                var shop = await _context.Shops.FindAsync(createUserDto.ShopId.Value);
                if (shop == null || shop.RecordStatus != RecordStatus.Active)
                {
                    throw new InvalidOperationException($"Shop with ID {createUserDto.ShopId.Value} does not exist or is inactive");
                }

                // ENFORCE: Manager assignment is REQUIRED for Shop Team Leader
                if (!createUserDto.ManagerId.HasValue || createUserDto.ManagerId.Value <= 0)
                {
                    throw new InvalidOperationException("Manager assignment is REQUIRED for Shop Team Leader role");
                }

                var manager = await _context.Users.FindAsync(createUserDto.ManagerId.Value);
                if (manager == null || (manager.Role != DomainUserRole.Manager && manager.Role != DomainUserRole.Director))
                {
                    throw new InvalidOperationException("Invalid manager assignment - manager must have Manager or Director role");
                }
                
                if (manager.Status != UserStatus.Active)
                {
                    throw new InvalidOperationException("Invalid manager assignment - manager must be active");
                }
                
                Console.WriteLine($"[DEBUG] Shop TL creation validated. ShopId: {createUserDto.ShopId.Value}, ManagerId: {createUserDto.ManagerId.Value}");
            }

            // CRITICAL FIX: Team Leader role - Manager assignment is OPTIONAL when created by Director
            if (createUserDto.Role == "team_leader")
            {
                // Check if creator is a Director
                User? creator = null;
                if (createdByUserId > 0)
                {
                    creator = await _context.Users.FindAsync(createdByUserId);
                }

                // If created by Director, manager assignment is OPTIONAL
                // If created by anyone else (Manager, Admin, etc.), manager assignment is REQUIRED
                bool isCreatedByDirector = creator?.Role == DomainUserRole.Director;

                if (!isCreatedByDirector)
                {
                    // For non-Director creators, manager assignment is still required
                    if (!createUserDto.ManagerId.HasValue || createUserDto.ManagerId.Value <= 0)
                    {
                        throw new InvalidOperationException("Manager assignment is REQUIRED for Team Leader role when not created by Director");
                    }

                    var manager = await _context.Users.FindAsync(createUserDto.ManagerId.Value);
                    if (manager == null || (manager.Role != DomainUserRole.Manager && manager.Role != DomainUserRole.Director))
                    {
                        throw new InvalidOperationException("Invalid manager assignment - manager must have Manager or Director role");
                    }
                    
                    if (manager.Status != UserStatus.Active)
                    {
                        throw new InvalidOperationException("Invalid manager assignment - manager must be active");
                    }
                }
                else
                {
                    // Director is creating Team Leader - manager assignment is OPTIONAL
                    Console.WriteLine($"[DEBUG] Director {createdByUserId} creating Team Leader - manager assignment is optional");
                    
                    // If manager is provided, validate it
                    if (createUserDto.ManagerId.HasValue && createUserDto.ManagerId.Value > 0)
                    {
                        var manager = await _context.Users.FindAsync(createUserDto.ManagerId.Value);
                        if (manager == null || (manager.Role != DomainUserRole.Manager && manager.Role != DomainUserRole.Director))
                        {
                            throw new InvalidOperationException("Invalid manager assignment - manager must have Manager or Director role");
                        }
                        
                        if (manager.Status != UserStatus.Active)
                        {
                            throw new InvalidOperationException("Invalid manager assignment - manager must be active");
                        }
                    }
                }
            }

            // Manager assignment validation for other roles (excluding team_leader which is handled above)
            if (createUserDto.Role != "team_leader" && createUserDto.ManagerId.HasValue && createUserDto.ManagerId.Value > 0)
            {
                var manager = await _context.Users.FindAsync(createUserDto.ManagerId.Value);
                if (manager == null || (manager.Role != DomainUserRole.Manager && manager.Role != DomainUserRole.Director))
                {
                    throw new InvalidOperationException("Invalid manager assignment - manager must have Manager or Director role");
                }
                
                if (manager.Status != UserStatus.Active)
                {
                    throw new InvalidOperationException("Invalid manager assignment - manager must be active");
                }
            }

            // Supervisor assignment validation
            if (createUserDto.SupervisorId.HasValue && createUserDto.SupervisorId.Value > 0)
            {
                var supervisor = await _context.Users.FindAsync(createUserDto.SupervisorId.Value);
                if (supervisor == null || supervisor.Status != UserStatus.Active)
                {
                    throw new InvalidOperationException("Invalid supervisor assignment - supervisor must be active");
                }
            }

        // ═══════════════════════════════════════════════════════════════════════
// CRITICAL FIX: ENHANCED AUTO-DEPARTMENT ASSIGNMENT LOGIC
// ═══════════════════════════════════════════════════════════════════════
var finalManagerId = createUserDto.ManagerId;
var finalDepartmentId = createUserDto.DepartmentId;

if (createdByUserId > 0)
{
    var creator = await _context.Users
        .Include(u => u.Department)
        .FirstOrDefaultAsync(u => u.UserId == createdByUserId);
    
    if (creator != null)
    {
        // ═══════════════════════════════════════════════════════════════
        // PRIORITY 1: Director creates ANY user (Team Leader, Manager, Engineer, etc.)
        // ALL users inherit Director's department automatically
        // ═══════════════════════════════════════════════════════════════
        if (creator.Role == DomainUserRole.Director)
        {
            // Get the director's primary department (the one they own)
            var directorDepartment = await _context.Departments
                .FirstOrDefaultAsync(d => d.DirectorId == createdByUserId && d.IsActive);
            
            if (directorDepartment != null)
            {
                // CRITICAL: Auto-assign DepartmentId for ALL users created by Director
                // This includes: Managers, Shop TLs, Engineers, Team Leaders, Customer Personnel
                // OVERRIDE any DepartmentId that might have been passed in the DTO
                finalDepartmentId = directorDepartment.DepartmentId;
                Console.WriteLine($"[DEBUG] ✓ ENHANCED FIX: Auto-inheriting DepartmentId {finalDepartmentId} from Director {createdByUserId} for {createUserDto.Role} '{createUserDto.FullName}'");
                Console.WriteLine($"[DEBUG]    Director's Department: '{directorDepartment.Name}' (ID: {directorDepartment.DepartmentId})");
                
                // CRITICAL NEW FIX: For Team Leaders created by Director, also set the Director as their Manager
                // This ensures proper hierarchy and task visibility
                if (createUserDto.Role == "team_leader")
                {
                    // If no manager was explicitly provided, set the Director as the manager
                    if (!finalManagerId.HasValue || finalManagerId.Value <= 0)
                    {
                        finalManagerId = createdByUserId;
                        Console.WriteLine($"[DEBUG] ✓ NEW FIX: Auto-assigning Director {createdByUserId} as Manager for Team Leader '{createUserDto.FullName}'");
                    }
                }
            }
            else
            {
                Console.WriteLine($"[WARNING] Director {createdByUserId} has no active department assigned! User will be created without department.");
            }
        }
        
        // ═══════════════════════════════════════════════════════════════
        // PRIORITY 2: Manager creates users (Shop TLs, Engineers, Team Leaders)
        // Inherit Manager's department
        // ═══════════════════════════════════════════════════════════════
        else if (creator.Role == DomainUserRole.Manager && creator.DepartmentId.HasValue)
        {
            // Auto-inherit DepartmentId for Shop TLs and other users created by Manager
            if (createUserDto.Role == "shop_tl" || createUserDto.Role == "engineer" || createUserDto.Role == "team_leader")
            {
                finalDepartmentId = creator.DepartmentId;
                finalManagerId = createdByUserId; // Manager creates these users, so they report to this manager
                Console.WriteLine($"[DEBUG] Auto-inheriting DepartmentId {finalDepartmentId} from Manager {createdByUserId}");
            }
        }
        
        // ═══════════════════════════════════════════════════════════════
        // PRIORITY 3: Shop TL creates Customer Personnel
        // Inherit Manager and Department from Shop TL
        // ═══════════════════════════════════════════════════════════════
        else if (creator.Role == DomainUserRole.ShopTL)
        {
            if (createUserDto.Role == "customer_personnel")
            {
                // Inherit manager from Shop TL
                if (creator.ManagerId.HasValue)
                {
                    finalManagerId = creator.ManagerId;
                    Console.WriteLine($"[DEBUG] Customer Personnel inheriting ManagerId {finalManagerId} from Shop TL {createdByUserId}");
                }
                
                // Inherit department from Shop TL
                if (creator.DepartmentId.HasValue)
                {
                    finalDepartmentId = creator.DepartmentId;
                    Console.WriteLine($"[DEBUG] Customer Personnel inheriting DepartmentId {finalDepartmentId} from Shop TL {createdByUserId}");
                }
            }
        }
        
        // ═══════════════════════════════════════════════════════════════
        // PRIORITY 4: Team Leader creates Engineers
        // Inherit Team Leader's department (which was inherited from Director)
        // ═══════════════════════════════════════════════════════════════
        else if (creator.Role == DomainUserRole.TeamLeader && creator.DepartmentId.HasValue)
        {
            if (createUserDto.Role == "engineer")
            {
                finalDepartmentId = creator.DepartmentId;
                Console.WriteLine($"[DEBUG] Engineer inheriting DepartmentId {finalDepartmentId} from Team Leader {createdByUserId}");
            }
        }
        
        // ═══════════════════════════════════════════════════════════════
        // PRIORITY 5: Shop Manager creates Customer Personnel, Engineers, Customers
        // Inherit Shop Manager's shop, manager, and department
        // ═══════════════════════════════════════════════════════════════
        else if (creator.Role == DomainUserRole.MiniManager)
        {
            // FIXED: Include shop_tl in allowed roles for Shop Manager
            var allowedRoles = new[] { "customer_personnel", "engineer", "customer", "shop_tl" };
            if (allowedRoles.Contains(createUserDto.Role))
            {
                // Inherit manager from Shop Manager (only if not explicitly provided)
                if (creator.ManagerId.HasValue && (!finalManagerId.HasValue || finalManagerId.Value <= 0))
                {
                    finalManagerId = creator.ManagerId;
                    Console.WriteLine($"[DEBUG] User inheriting ManagerId {finalManagerId} from Shop Manager {createdByUserId}");
                }
                
                // Inherit department from Shop Manager
                if (creator.DepartmentId.HasValue)
                {
                    finalDepartmentId = creator.DepartmentId;
                    Console.WriteLine($"[DEBUG] User inheriting DepartmentId {finalDepartmentId} from Shop Manager {createdByUserId}");
                }
                
                // FIXED: For shop_tl created by Shop Manager, auto-assign the shop if not already set
                if (createUserDto.Role == "shop_tl" && creator.ShopId.HasValue && (!createUserDto.ShopId.HasValue || createUserDto.ShopId.Value <= 0))
                {
                    createUserDto.ShopId = creator.ShopId;
                    Console.WriteLine($"[DEBUG] Shop TL inheriting ShopId {createUserDto.ShopId} from Shop Manager {createdByUserId}");
                }
                
                Console.WriteLine($"[DEBUG] Shop Manager {createdByUserId} creating {createUserDto.Role} user '{createUserDto.FullName}' in shop {createUserDto.ShopId}");
            }
        }
    }
}

            var user = new User
            {
                FullName = createUserDto.FullName,
                Username = createUserDto.Username,
                Email = createUserDto.Email,
                PhoneNumber = createUserDto.PhoneNumber?.Trim(),
                Password = HashPassword(createUserDto.Password),
                Role = ConvertStringToUserRole(createUserDto.Role),
                ShopId = createUserDto.ShopId > 0 ? createUserDto.ShopId : null,
                SupervisorId = createUserDto.SupervisorId > 0 ? createUserDto.SupervisorId : null,
                ManagerId = finalManagerId > 0 ? finalManagerId : null,
                DepartmentId = finalDepartmentId > 0 ? finalDepartmentId : null,
                CreatedByUserId = createdByUserId > 0 ? createdByUserId : null,
                PersonnelType = createUserDto.Role == "customer_personnel" ? createUserDto.PersonnelType : null,
                Status = createUserDto.IsActive ? UserStatus.Active : UserStatus.Inactive,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                // NEW: Set CanCreateTeamLeader permission for Directors
                CanCreateTeamLeader = createUserDto.Role == "director" ? createUserDto.CanCreateTeamLeader : false
            };

            Console.WriteLine($"[DEBUG] Creating user: Role: {user.Role}, PersonnelType: {user.PersonnelType}, ShopId: {user.ShopId}, ManagerId: {user.ManagerId}, DepartmentId: {user.DepartmentId}, CreatedBy: {user.CreatedByUserId}, CanCreateTeamLeader: {user.CanCreateTeamLeader}");

            _context.Users.Add(user);
            
            try
            {
                await _context.SaveChangesAsync();
                await MirrorUserAsync(user);
                Console.WriteLine($"[DEBUG] ✓ User created successfully with UserId: {user.UserId}, DepartmentId: {user.DepartmentId}, CanCreateTeamLeader: {user.CanCreateTeamLeader}");
            }
            catch (DbUpdateException ex)
            {
                Console.WriteLine($"[ERROR] Database update error: {ex.Message}");
                Console.WriteLine($"[ERROR] Inner exception: {ex.InnerException?.Message}");
                
                if (ex.InnerException?.Message?.Contains("UNIQUE constraint") == true)
                {
                    if (ex.InnerException.Message.Contains("Username"))
                        throw new InvalidOperationException("Username already exists");
                    if (ex.InnerException.Message.Contains("Email"))
                        throw new InvalidOperationException("Email already exists");
                }
                
                throw new InvalidOperationException($"Failed to create user: {ex.InnerException?.Message ?? ex.Message}");
            }

            if (createdByUserId > 0)
            {
                var personnelTypeDisplay = user.PersonnelType switch
                {
                    "technical" => "Technical",
                    "tools_clerk" => "Tools Clerk",
                    "warranty_officer" => "Warranty Officer",
                    _ => "Customer Personnel"
                };
                
                await _userAuditService.LogUserActionAsync(
                    actionType: "CREATE",
                    targetUserId: user.UserId,
                    performedByUserId: createdByUserId,
                    changesMade: $"Created user: {user.Username} with role: {createUserDto.Role}" + 
                                (user.PersonnelType != null ? $" (Personnel Type: {personnelTypeDisplay})" : "") +
                                (user.DepartmentId.HasValue ? $" in Department {user.DepartmentId}" : "") +
                                (user.CanCreateTeamLeader ? " with Team Leader creation permission" : ""),
                    reason: "User creation",
                    ipAddress: ipAddress
                );
            }

            return await GetUserByIdAsync(user.UserId) ?? throw new InvalidOperationException("Failed to create user");
        }

        public async System.Threading.Tasks.Task<UserDto> UpdateUserAsync(int userId, UpdateUserDto updateUserDto, int updatedByUserId = 0, string? ipAddress = null)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null)
                throw new InvalidOperationException("User not found");

            // CRITICAL FIX: Check username availability only if username is being changed
            if (!string.IsNullOrEmpty(updateUserDto.Username) && user.Username != updateUserDto.Username.Trim())
            {
                if (!await IsUsernameAvailableAsync(updateUserDto.Username, userId))
                    throw new InvalidOperationException("Username already exists");
            }

            if (!string.IsNullOrEmpty(updateUserDto.Email) && !await IsEmailAvailableAsync(updateUserDto.Email, userId))
                throw new InvalidOperationException("Email already exists");

            var changes = new List<string>();
            
            if (!string.IsNullOrEmpty(updateUserDto.FullName) && user.FullName != updateUserDto.FullName.Trim())
            {
                changes.Add($"FullName: '{user.FullName}' → '{updateUserDto.FullName.Trim()}'");
                user.FullName = updateUserDto.FullName.Trim();
            }

            // CRITICAL FIX: Handle username updates
            if (!string.IsNullOrEmpty(updateUserDto.Username) && user.Username != updateUserDto.Username.Trim())
            {
                changes.Add($"Username: '{user.Username}' → '{updateUserDto.Username.Trim()}'");
                user.Username = updateUserDto.Username.Trim();
                Console.WriteLine($"[DEBUG] Username updated for user {userId}: '{user.Username}' → '{updateUserDto.Username.Trim()}'");
            }

            if (!string.IsNullOrEmpty(updateUserDto.Email) && user.Email != updateUserDto.Email.Trim())
            {
                changes.Add($"Email: '{user.Email}' → '{updateUserDto.Email.Trim()}'");
                user.Email = updateUserDto.Email.Trim();
            }

            // Handle phone number updates
            if (updateUserDto.PhoneNumber != null && user.PhoneNumber != updateUserDto.PhoneNumber.Trim())
            {
                var newPhone = string.IsNullOrWhiteSpace(updateUserDto.PhoneNumber) ? null : updateUserDto.PhoneNumber.Trim();
                changes.Add($"PhoneNumber: '{user.PhoneNumber ?? "N/A"}' → '{newPhone ?? "N/A"}'");
                user.PhoneNumber = newPhone;
            }
            
            if (!string.IsNullOrEmpty(updateUserDto.Role))
            {
                if (!ValidRoles.IsValidRole(updateUserDto.Role))
                    throw new InvalidOperationException($"Invalid role: {updateUserDto.Role}");
                
                var newRole = ConvertStringToUserRole(updateUserDto.Role);
                if (user.Role != newRole)
                {
                    changes.Add($"Role: '{ConvertUserRoleToString(user.Role)}' → '{updateUserDto.Role}'");
                    user.Role = newRole;
                }
            }

            // NEW: Handle personnel type updates for customer_personnel role
            if (user.Role == DomainUserRole.CustomerPersonnel && !string.IsNullOrEmpty(updateUserDto.PersonnelType))
            {
                if (!ValidRoles.IsValidPersonnelType(updateUserDto.PersonnelType))
                    throw new InvalidOperationException($"Invalid personnel type: {updateUserDto.PersonnelType}");
                
                if (user.PersonnelType != updateUserDto.PersonnelType)
                {
                    var oldType = user.PersonnelType switch
                    {
                        "technical" => "Technical",
                        "tools_clerk" => "Tools Clerk",
                        "warranty_officer" => "Warranty Officer",
                        _ => "Customer Personnel"
                    };
                    var newType = updateUserDto.PersonnelType switch
                    {
                        "technical" => "Technical",
                        "tools_clerk" => "Tools Clerk",
                        "warranty_officer" => "Warranty Officer",
                        _ => "Customer Personnel"
                    };
                    changes.Add($"PersonnelType: '{oldType}' → '{newType}'");
                    user.PersonnelType = updateUserDto.PersonnelType;
                }
            }
            
            if (updateUserDto.ShopId.HasValue && user.ShopId != updateUserDto.ShopId.Value)
            {
                if (updateUserDto.ShopId.Value > 0)
                {
                    var shop = await _context.Shops.FindAsync(updateUserDto.ShopId.Value);
                    if (shop == null || shop.RecordStatus != RecordStatus.Active)
                        throw new InvalidOperationException($"Shop with ID {updateUserDto.ShopId.Value} does not exist or is inactive");
                }
                
                changes.Add($"ShopId: {user.ShopId} → {updateUserDto.ShopId.Value}");
                user.ShopId = updateUserDto.ShopId.Value > 0 ? updateUserDto.ShopId.Value : null;
            }
            
            if (updateUserDto.SupervisorId.HasValue && user.SupervisorId != updateUserDto.SupervisorId.Value)
            {
                if (updateUserDto.SupervisorId.Value > 0)
                {
                    var supervisor = await _context.Users.FindAsync(updateUserDto.SupervisorId.Value);
                    if (supervisor == null || supervisor.Status != UserStatus.Active)
                        throw new InvalidOperationException("Invalid supervisor assignment");
                }
                
                changes.Add($"SupervisorId: {user.SupervisorId} → {updateUserDto.SupervisorId.Value}");
                user.SupervisorId = updateUserDto.SupervisorId.Value > 0 ? updateUserDto.SupervisorId.Value : null;
            }

            // Handle manager assignment updates
            if (updateUserDto.ManagerId.HasValue && user.ManagerId != updateUserDto.ManagerId.Value)
            {
                if (updateUserDto.ManagerId.Value > 0)
                {
                    var manager = await _context.Users.FindAsync(updateUserDto.ManagerId.Value);
                    if (manager == null || (manager.Role != DomainUserRole.Manager && manager.Role != DomainUserRole.Director))
                        throw new InvalidOperationException("Invalid manager assignment");
                    
                    if (manager.Status != UserStatus.Active)
                        throw new InvalidOperationException("Manager must be active");
                }

                changes.Add($"ManagerId: {user.ManagerId} → {updateUserDto.ManagerId.Value}");
                user.ManagerId = updateUserDto.ManagerId.Value > 0 ? updateUserDto.ManagerId.Value : null;
            }

            // Handle department assignment updates
            if (updateUserDto.DepartmentId.HasValue && user.DepartmentId != updateUserDto.DepartmentId.Value)
            {
                if (updateUserDto.DepartmentId.Value > 0)
                {
                    var department = await _context.Departments.FindAsync(updateUserDto.DepartmentId.Value);
                    if (department == null || !department.IsActive)
                        throw new InvalidOperationException("Invalid department assignment");
                }

                changes.Add($"DepartmentId: {user.DepartmentId} → {updateUserDto.DepartmentId.Value}");
                user.DepartmentId = updateUserDto.DepartmentId.Value > 0 ? updateUserDto.DepartmentId.Value : null;
            }
            
            if (updateUserDto.IsActive.HasValue)
            {
                var newStatus = updateUserDto.IsActive.Value ? UserStatus.Active : UserStatus.Inactive;
                if (user.Status != newStatus)
                {
                    changes.Add($"Status: '{user.Status}' → '{newStatus}'");
                    user.Status = newStatus;
                }
            }

            // CRITICAL FIX: Handle password update correctly
            if (!string.IsNullOrEmpty(updateUserDto.NewPassword))
            {
                changes.Add("Password: [CHANGED]");
                user.Password = HashPassword(updateUserDto.NewPassword);
                Console.WriteLine($"[DEBUG] Password updated for user {userId}");
            }

            if (!string.IsNullOrEmpty(updateUserDto.ProfilePicturePath) && user.ProfilePicturePath != updateUserDto.ProfilePicturePath)
            {
                changes.Add($"ProfilePicturePath: '{user.ProfilePicturePath}' → '{updateUserDto.ProfilePicturePath}'");
                user.ProfilePicturePath = updateUserDto.ProfilePicturePath;
            }

            user.UpdatedAt = DateTime.UtcNow;
            
            try
            {
                await _context.SaveChangesAsync();
                await MirrorUserAsync(user);
                Console.WriteLine($"[DEBUG] User {userId} updated successfully. Changes: {string.Join("; ", changes)}");
            }
            catch (DbUpdateException ex)
            {
                Console.WriteLine($"[ERROR] Database update error: {ex.Message}");
                throw new InvalidOperationException($"Failed to update user: {ex.InnerException?.Message ?? ex.Message}");
            }

            if (updatedByUserId > 0 && changes.Count > 0)
            {
                await _userAuditService.LogUserActionAsync(
                    actionType: "UPDATE",
                    targetUserId: userId,
                    performedByUserId: updatedByUserId,
                    changesMade: string.Join("; ", changes),
                    reason: "User update",
                    ipAddress: ipAddress
                );
            }

            return await GetUserByIdAsync(userId) ?? throw new InvalidOperationException("Failed to update user");
        }

        public async System.Threading.Tasks.Task<bool> DeleteUserAsync(int userId, int deletedByUserId = 0, string? ipAddress = null)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null)
                return false;

            user.Status = UserStatus.Inactive;
            user.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            await MirrorUserAsync(user);

            if (deletedByUserId > 0)
            {
                await _userAuditService.LogUserActionAsync(
                    actionType: "DELETE",
                    targetUserId: userId,
                    performedByUserId: deletedByUserId,
                    changesMade: $"Deleted user: {user.Username}",
                    reason: "User deletion",
                    ipAddress: ipAddress
                );
            }

            return true;
        }

        public async System.Threading.Tasks.Task<bool> ChangePasswordAsync(int userId, ChangePasswordDto changePasswordDto)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null || !VerifyPassword(changePasswordDto.CurrentPassword, user.Password))
                return false;

            user.Password = HashPassword(changePasswordDto.NewPassword);
            user.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            await MirrorUserAsync(user);

            return true;
        }

        public async System.Threading.Tasks.Task<bool> ResetPasswordAsync(int userId, string newPassword)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null)
                return false;

            user.Password = HashPassword(newPassword);
            user.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            await MirrorUserAsync(user);

            return true;
        }

        public async System.Threading.Tasks.Task<bool> IsUsernameAvailableAsync(string username, int? excludeUserId = null)
        {
            var query = _context.Users.Where(u => u.Username == username);
            
            if (excludeUserId.HasValue)
                query = query.Where(u => u.UserId != excludeUserId.Value);

            return !await query.AnyAsync();
        }

        public async System.Threading.Tasks.Task<bool> IsEmailAvailableAsync(string email, int? excludeUserId = null)
        {
            var query = _context.Users.Where(u => u.Email == email);
            
            if (excludeUserId.HasValue)
                query = query.Where(u => u.UserId != excludeUserId.Value);

            return !await query.AnyAsync();
        }

        public string HashPassword(string password)
        {
            return _passwordService.HashPassword(password);
        }

        public bool VerifyPassword(string password, string hash)
        {
            return _passwordService.VerifyPassword(password, hash);
        }

        private async System.Threading.Tasks.Task MirrorUserAsync(User user)
        {
            try
            {
                await _selfEvaluationUserMirror.UpsertAsync(user);
            }
            catch (Exception exception)
            {
                throw new InvalidOperationException(
                    $"CMT user {user.UserId} was saved, but Self-Evaluation synchronization failed. " +
                    "The operation is safe to retry by editing the CMT user after resolving the reported conflict.",
                    exception);
            }
        }

        private string GenerateJwtToken(User user)
        {
            var jwtSettings = _configuration.GetSection("JwtSettings");
            var secretKey = jwtSettings["SecretKey"] ?? "DefaultSecretKeyForDevelopment";
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey));
            var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]{
                new Claim(ClaimTypes.NameIdentifier, user.UserId.ToString()),
                new Claim(ClaimTypes.Name, user.Username),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim("FullName", user.FullName),
                new Claim("Role", ConvertUserRoleToString(user.Role)),
                new Claim("ShopId", user.ShopId?.ToString() ?? ""),
                new Claim("SupervisorId", user.SupervisorId?.ToString() ?? ""),
                new Claim("ManagerId", user.ManagerId?.ToString() ?? ""),
                new Claim("DepartmentId", user.DepartmentId?.ToString() ?? ""),
                new Claim("PersonnelType", user.PersonnelType ?? ""),
                // NEW: Include CanCreateTeamLeader in JWT claims for Directors
                new Claim("CanCreateTeamLeader", user.CanCreateTeamLeader.ToString().ToLower())
            };

            var token = new JwtSecurityToken(
                issuer: jwtSettings["Issuer"] ?? "CMT",
                audience: jwtSettings["Audience"] ?? "CMT",
                claims: claims,
                expires: DateTime.UtcNow.AddHours(24),
                signingCredentials: credentials
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        private string GenerateRefreshToken()
        {
            var randomBytes = new byte[32];
            using var rng = RandomNumberGenerator.Create();
            rng.GetBytes(randomBytes);
            return Convert.ToBase64String(randomBytes);
        }

        private async System.Threading.Tasks.Task<UserDto> MapToUserDtoAsync(User user)
        {
            var activeTasks = await _context.Tasks
                .Where(t => t.CreatedBy == user.UserId && 
                           t.Status != DomainTaskStatus.Completed && 
                           t.Status != DomainTaskStatus.Rejected &&
                           t.RecordStatus == RecordStatus.Active)
                .CountAsync();

            var completedTasks = await _context.CompletedTasks
                .Where(ct => ct.CreatedBy == user.UserId && ct.RecordStatus == RecordStatus.Active)
                .CountAsync();

            var pendingTasks = await _context.Tasks
                .Where(t => t.CreatedBy == user.UserId && 
                           t.Status == DomainTaskStatus.Pending &&
                           t.RecordStatus == RecordStatus.Active)
                .CountAsync();

            return new UserDto
            {
                UserId = user.UserId,
                FullName = user.FullName,
                Username = user.Username,
                Email = user.Email,
                PhoneNumber = user.PhoneNumber,
                Role = ConvertUserRoleToString(user.Role),
                ShopId = user.ShopId,
                ShopName = user.Shop?.Name,
                SupervisorId = user.SupervisorId,
                SupervisorName = user.Supervisor?.FullName,
                CreatedByUserId = user.CreatedByUserId,
                CreatedByUserName = user.CreatedByUser?.FullName,
                ManagerId = user.ManagerId,
                ManagerName = user.Manager?.FullName,
                DepartmentId = user.DepartmentId,
                DepartmentName = user.Department?.Name,
                PersonnelType = user.PersonnelType,
                ProfilePicturePath = user.ProfilePicturePath,
                CreatedAt = user.CreatedAt,
                UpdatedAt = user.UpdatedAt,
                LastLoginAt = null,
                IsActive = user.Status == UserStatus.Active,
                ActiveTasksCount = activeTasks,
                CompletedTasksCount = completedTasks,
                PendingTasksCount = pendingTasks,
                // NEW: Include CanCreateTeamLeader in UserDto
                CanCreateTeamLeader = user.CanCreateTeamLeader
            };
        }

        private DomainUserRole ConvertStringToUserRole(string role)
        {
           return role switch
{
    "team_leader" => DomainUserRole.TeamLeader,
    "director" => DomainUserRole.Director,
    "engineer" => DomainUserRole.Engineer,
    "customer_personnel" => DomainUserRole.CustomerPersonnel,
    "customer" => DomainUserRole.Customer,
    "shop_tl" => DomainUserRole.ShopTL,
    "manager" => DomainUserRole.Manager,
    "admin" => DomainUserRole.Admin,
    "shop_manager" => DomainUserRole.MiniManager,
    _ => throw new ArgumentException($"Invalid role: {role}")
};

        }

        private string ConvertUserRoleToString(DomainUserRole role)
        {
           return role switch
{
    DomainUserRole.TeamLeader => "team_leader",
    DomainUserRole.Director => "director",
    DomainUserRole.Engineer => "engineer",
    DomainUserRole.CustomerPersonnel => "customer_personnel",
    DomainUserRole.Customer => "customer",
    DomainUserRole.ShopTL => "shop_tl",
    DomainUserRole.Manager => "manager",
    DomainUserRole.Admin => "admin",
    DomainUserRole.MiniManager => "shop_manager",
    _ => "unknown"
};

        }
    }
}