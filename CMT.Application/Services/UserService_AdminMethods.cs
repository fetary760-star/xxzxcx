using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using CMT.Domain.Data;
using CMT.Domain.Models;
using Microsoft.EntityFrameworkCore;
using DomainUserRole = CMT.Domain.Models.UserRole;
using DomainTaskStatus = CMT.Domain.Enums.TaskStatus;

namespace CMT.Application.Services
{
    public partial class UserService
    {
        /// <summary>
        /// Get Admin Dashboard with system overview and all Directors
        /// </summary>
        public async System.Threading.Tasks.Task<AdminDashboardDto> GetAdminDashboardAsync(int adminUserId)
        {
            var admin = await _context.Users
                .FirstOrDefaultAsync(u => u.UserId == adminUserId && u.Role == DomainUserRole.Admin);

            if (admin == null)
            {
                return new AdminDashboardDto
                {
                    AdminUserId = adminUserId,
                    AdminName = "Unknown"
                };
            }

            // Get all directors
            var directors = await _context.Users
                .Where(u => u.Role == DomainUserRole.Director && u.Status == UserStatus.Active)
                .OrderBy(u => u.FullName)
                .ToListAsync();

            var directorSummaries = new List<DirectorSummaryDto>();

            foreach (var director in directors)
            {
                // Get departments where this director is assigned (via DirectorId)
                var departmentCount = await _context.Departments
                    .Where(d => d.DirectorId == director.UserId && d.IsActive)
                    .CountAsync();

                // Get managers in director's departments
                var managerCount = await _context.Users
                    .Where(u => u.DepartmentId.HasValue && 
                               u.Role == DomainUserRole.Manager && 
                               u.Status == UserStatus.Active &&
                               _context.Departments.Any(d => d.DepartmentId == u.DepartmentId && d.DirectorId == director.UserId))
                    .CountAsync();

                // Get all users in director's departments
                var totalTeamMembers = await _context.Users
                    .Where(u => u.DepartmentId.HasValue && 
                               u.Status == UserStatus.Active &&
                               _context.Departments.Any(d => d.DepartmentId == u.DepartmentId && d.DirectorId == director.UserId))
                    .CountAsync();

                directorSummaries.Add(new DirectorSummaryDto
                {
                    UserId = director.UserId,
                    FullName = director.FullName,
                    Username = director.Username,
                    Email = director.Email,
                    DepartmentCount = departmentCount,
                    ManagerCount = managerCount,
                    TotalTeamMembers = totalTeamMembers,
                    IsActive = director.Status == UserStatus.Active,
                    CreatedAt = director.CreatedAt,
                    CanCreateTeamLeader = director.CanCreateTeamLeader
                });
            }

            // System-wide statistics
            var totalDepartments = await _context.Departments.Where(d => d.IsActive).CountAsync();
            var totalManagers = await _context.Users.Where(u => u.Role == DomainUserRole.Manager && u.Status == UserStatus.Active).CountAsync();
            var totalShopTLs = await _context.Users.Where(u => u.Role == DomainUserRole.ShopTL && u.Status == UserStatus.Active).CountAsync();
            var totalEngineers = await _context.Users.Where(u => u.Role == DomainUserRole.Engineer && u.Status == UserStatus.Active).CountAsync();
            var totalCustomerPersonnel = await _context.Users.Where(u => u.Role == DomainUserRole.CustomerPersonnel && u.Status == UserStatus.Active).CountAsync();

            var activeTasks = await _context.Tasks
                .Where(t => t.Status != DomainTaskStatus.Completed && 
                           t.Status != DomainTaskStatus.Rejected &&
                           t.RecordStatus == RecordStatus.Active)
                .CountAsync();

            var completedTasks = await _context.CompletedTasks
                .Where(ct => ct.RecordStatus == RecordStatus.Active)
                .CountAsync();

            // Recent tasks across the system
            var recentTasks = await _context.Tasks
                .Include(t => t.Creator)
                .Include(t => t.Category)
                .Include(t => t.Priority)
                .Where(t => t.RecordStatus == RecordStatus.Active)
                .OrderByDescending(t => t.CreatedAt)
                .Take(15)
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

            return new AdminDashboardDto
            {
                AdminUserId = adminUserId,
                AdminName = admin.FullName,
                Directors = directorSummaries,
                TotalDirectors = directors.Count,
                TotalDepartments = totalDepartments,
                TotalManagers = totalManagers,
                TotalShopTeamLeaders = totalShopTLs,
                TotalEngineers = totalEngineers,
                TotalCustomerPersonnel = totalCustomerPersonnel,
                TotalActiveTasks = activeTasks,
                TotalCompletedTasks = completedTasks,
                RecentTasks = recentTasks
            };
        }

        /// <summary>
        /// Create a Director (Admin only) - UPDATED: Supports Team Leader permission
        /// </summary>
        public async System.Threading.Tasks.Task<UserDto> CreateDirectorAsync(CreateUserDto createUserDto, int createdByAdminId, string? ipAddress = null)
        {
            // Validate that the creator is an Admin
            var admin = await _context.Users.FindAsync(createdByAdminId);
            if (admin == null || admin.Role != DomainUserRole.Admin)
            {
                throw new InvalidOperationException("Only Admin can create Directors");
            }

            // CRITICAL FIX: Validate that role is explicitly set to "director"
            if (string.IsNullOrWhiteSpace(createUserDto.Role) || createUserDto.Role != "director")
            {
                throw new InvalidOperationException("Role must be explicitly set to 'director' when creating a Director");
            }

            // CRITICAL FIX: Validate that department is assigned - MANDATORY
            if (!createUserDto.DepartmentId.HasValue && string.IsNullOrWhiteSpace(createUserDto.NewDepartmentName))
            {
                throw new InvalidOperationException("Director must be assigned to a department. Please select an existing department or create a new one.");
            }

            // Validate department exists if provided
            if (createUserDto.DepartmentId.HasValue && createUserDto.DepartmentId.Value > 0)
            {
                var department = await _context.Departments.FindAsync(createUserDto.DepartmentId.Value);
                if (department == null || !department.IsActive)
                {
                    throw new InvalidOperationException($"Department with ID {createUserDto.DepartmentId.Value} does not exist or is inactive");
                }
            }

            // Create director WITHOUT department assignment first (will be set later)
            var tempCreateDto = new CreateUserDto
            {
                Username = createUserDto.Username,
                Email = createUserDto.Email,
                FullName = createUserDto.FullName,
                Password = createUserDto.Password,
                Role = "director",
                IsActive = createUserDto.IsActive,
                CanCreateTeamLeader = createUserDto.CanCreateTeamLeader
            };
            
            var director = await CreateUserAsync(tempCreateDto, createdByAdminId, ipAddress);

            // If creating new department, create it and assign director
            if (!string.IsNullOrWhiteSpace(createUserDto.NewDepartmentName))
            {
                var newDepartment = new Department
                {
                    Name = createUserDto.NewDepartmentName.Trim(),
                    Description = createUserDto.NewDepartmentDescription?.Trim(),
                    DirectorId = director.UserId,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                _context.Departments.Add(newDepartment);
                await _context.SaveChangesAsync();

                // Update director's department assignment
                var directorEntity = await _context.Users.FindAsync(director.UserId);
                if (directorEntity != null)
                {
                    directorEntity.DepartmentId = newDepartment.DepartmentId;
                    await _context.SaveChangesAsync();
                }

                Console.WriteLine($"[DEBUG] New department '{newDepartment.Name}' created with ID: {newDepartment.DepartmentId} for Director {director.UserId}. Department.DirectorId = {newDepartment.DirectorId}");
            }
            else if (createUserDto.DepartmentId.HasValue && createUserDto.DepartmentId.Value > 0)
            {
                // CRITICAL FIX: Update existing department's DirectorId
                var existingDepartment = await _context.Departments.FindAsync(createUserDto.DepartmentId.Value);
                if (existingDepartment != null)
                {
                    existingDepartment.DirectorId = director.UserId;
                    existingDepartment.UpdatedAt = DateTime.UtcNow;
                    await _context.SaveChangesAsync();
                    
                    Console.WriteLine($"[DEBUG] Existing department {existingDepartment.DepartmentId} updated. Department.DirectorId = {existingDepartment.DirectorId}");
                }

                // Update director's department assignment
                var directorEntity = await _context.Users.FindAsync(director.UserId);
                if (directorEntity != null)
                {
                    directorEntity.DepartmentId = createUserDto.DepartmentId.Value;
                    await _context.SaveChangesAsync();
                }
            }

            var directorEntityToMirror = await _context.Users.FindAsync(director.UserId);
            if (directorEntityToMirror is not null)
                await MirrorUserAsync(directorEntityToMirror);

            return await GetUserByIdAsync(director.UserId) ?? throw new InvalidOperationException("Failed to retrieve created director");
        }

        /// <summary>
        /// Create a Director with department assignment (Admin only) - UPDATED: Supports Team Leader permission
        /// </summary>
        public async System.Threading.Tasks.Task<UserDto> CreateDirectorWithDepartmentAsync(
            CreateDirectorWithDepartmentDto createDirectorDto, 
            int createdByAdminId, 
            string? ipAddress = null)
        {
            // Validate that the creator is an Admin
            var admin = await _context.Users.FindAsync(createdByAdminId);
            if (admin == null || admin.Role != DomainUserRole.Admin)
            {
                throw new InvalidOperationException("Only Admin can create Directors");
            }

            // Validate input
            if (string.IsNullOrWhiteSpace(createDirectorDto.Username))
                throw new InvalidOperationException("Username is required");
            
            if (string.IsNullOrWhiteSpace(createDirectorDto.Email))
                throw new InvalidOperationException("Email is required");
            
            if (string.IsNullOrWhiteSpace(createDirectorDto.FullName))
                throw new InvalidOperationException("Full name is required");
            
            if (string.IsNullOrWhiteSpace(createDirectorDto.Password))
                throw new InvalidOperationException("Password is required");

            // CRITICAL FIX: Validate department assignment is provided - MANDATORY
            if (!createDirectorDto.ExistingDepartmentId.HasValue && string.IsNullOrWhiteSpace(createDirectorDto.NewDepartmentName))
            {
                throw new InvalidOperationException("Director must be assigned to a department. Please select an existing department or create a new one.");
            }

            // Trim input data
            createDirectorDto.Username = createDirectorDto.Username.Trim();
            createDirectorDto.Email = createDirectorDto.Email.Trim();
            createDirectorDto.FullName = createDirectorDto.FullName.Trim();
            createDirectorDto.Password = createDirectorDto.Password.Trim();

            if (!await IsUsernameAvailableAsync(createDirectorDto.Username))
                throw new InvalidOperationException("Username already exists");

            if (!await IsEmailAvailableAsync(createDirectorDto.Email))
                throw new InvalidOperationException("Email already exists");

            // CRITICAL FIX: Create the director user with explicit role assignment
            var director = new User
            {
                FullName = createDirectorDto.FullName,
                Username = createDirectorDto.Username,
                Email = createDirectorDto.Email,
                Password = HashPassword(createDirectorDto.Password),
                Role = DomainUserRole.Director,
                Status = createDirectorDto.IsActive ? UserStatus.Active : UserStatus.Inactive,
                CreatedByUserId = createdByAdminId,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                CanCreateTeamLeader = createDirectorDto.CanCreateTeamLeader
            };

            _context.Users.Add(director);
            
            try
            {
                await _context.SaveChangesAsync();
                Console.WriteLine($"[DEBUG] Director created successfully with UserId: {director.UserId}, CanCreateTeamLeader: {director.CanCreateTeamLeader}");
            }
            catch (DbUpdateException ex)
            {
                Console.WriteLine($"[ERROR] Database update error: {ex.Message}");
                
                if (ex.InnerException?.Message?.Contains("UNIQUE constraint") == true)
                {
                    if (ex.InnerException.Message.Contains("Username"))
                        throw new InvalidOperationException("Username already exists");
                    if (ex.InnerException.Message.Contains("Email"))
                        throw new InvalidOperationException("Email already exists");
                }
                
                throw new InvalidOperationException($"Failed to create director: {ex.InnerException?.Message ?? ex.Message}");
            }

            // Handle department assignment
            int? departmentId = null;

            if (!string.IsNullOrWhiteSpace(createDirectorDto.NewDepartmentName))
            {
                // Create new department for this director
                var newDepartment = new Department
                {
                    Name = createDirectorDto.NewDepartmentName.Trim(),
                    Description = createDirectorDto.NewDepartmentDescription?.Trim(),
                    DirectorId = director.UserId,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                _context.Departments.Add(newDepartment);
                await _context.SaveChangesAsync();

                departmentId = newDepartment.DepartmentId;
                Console.WriteLine($"[DEBUG] New department '{newDepartment.Name}' created with ID: {departmentId} for Director {director.UserId}. Department.DirectorId = {newDepartment.DirectorId}");
            }
            else if (createDirectorDto.ExistingDepartmentId.HasValue && createDirectorDto.ExistingDepartmentId.Value > 0)
            {
                // Assign to existing department
                var existingDepartment = await _context.Departments.FindAsync(createDirectorDto.ExistingDepartmentId.Value);
                if (existingDepartment == null || !existingDepartment.IsActive)
                {
                    throw new InvalidOperationException($"Department with ID {createDirectorDto.ExistingDepartmentId.Value} does not exist or is inactive");
                }

                // CRITICAL FIX: Update department's DirectorId
                existingDepartment.DirectorId = director.UserId;
                existingDepartment.UpdatedAt = DateTime.UtcNow;
                await _context.SaveChangesAsync();

                departmentId = existingDepartment.DepartmentId;
                Console.WriteLine($"[DEBUG] Director {director.UserId} assigned to existing department {departmentId}. Department.DirectorId updated to {director.UserId}");
            }

            // CRITICAL FIX: Update director's department assignment - MANDATORY
            if (departmentId.HasValue)
            {
                director.DepartmentId = departmentId.Value;
                await _context.SaveChangesAsync();
                await MirrorUserAsync(director);
            }
            else
            {
                // This should never happen due to validation above, but add safety check
                throw new InvalidOperationException("Failed to assign director to department");
            }

            // Log the action
            await _userAuditService.LogUserActionAsync(
                actionType: "CREATE",
                targetUserId: director.UserId,
                performedByUserId: createdByAdminId,
                changesMade: $"Created Director: {director.Username} with department assignment (DepartmentId: {departmentId}, Department.DirectorId: {director.UserId}, CanCreateTeamLeader: {director.CanCreateTeamLeader})",
                reason: "Director creation by Admin",
                ipAddress: ipAddress
            );

            return await GetUserByIdAsync(director.UserId) ?? throw new InvalidOperationException("Failed to create director");
        }

        // ═══════════════════════════════════════════════════════════════════════
        // SOFT-DELETE MANAGEMENT METHODS (Admin only)
        // ═══════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Retrieve all soft-deleted users (Status == Inactive).
        /// These are users that were "deleted" via DeleteUserAsync which sets Status = Inactive.
        /// </summary>
        public async System.Threading.Tasks.Task<List<UserDto>> GetSoftDeletedUsersAsync()
        {
            var users = await _context.Users
                .Include(u => u.Shop)
                .Include(u => u.Supervisor)
                .Include(u => u.CreatedByUser)
                .Include(u => u.Manager)
                .Include(u => u.Department)
                .Where(u => u.Status == UserStatus.Inactive)
                .OrderByDescending(u => u.UpdatedAt)
                .ToListAsync();

            var userDtos = new List<UserDto>();
            foreach (var user in users)
            {
                userDtos.Add(await MapToUserDtoAsync(user));
            }
            return userDtos;
        }

        /// <summary>
        /// Permanently hard-delete a soft-deleted user from the database.
        /// Only users with Status == Inactive can be permanently deleted.
        /// This method cascade-deletes or nullifies all related records before removing the user.
        /// CRITICAL FIX: Uses CreateExecutionStrategy().ExecuteAsync() to support
        /// SqlServerRetryingExecutionStrategy with user-initiated transactions.
        /// CRITICAL FIX: Non-nullable FK columns (e.g. tasks.created_by, completed_tasks.created_by)
        /// are reassigned to reassignToUserId (the admin performing the deletion) instead of 0,
        /// because user_id = 0 does not exist and violates FK constraints.
        /// CRITICAL FIX: Departments.DirectorId is reassigned to another valid user
        /// instead of setting to 0 (which violates FK_departments_users_director_id).
        /// </summary>
        public async System.Threading.Tasks.Task<bool> PermanentlyDeleteUserAsync(int userId, int reassignToUserId)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null)
                return false;

            // Safety check: only allow permanent deletion of soft-deleted (Inactive) users
            if (user.Status != UserStatus.Inactive)
            {
                throw new InvalidOperationException(
                    "Only soft-deleted (Inactive) users can be permanently deleted. " +
                    "Please soft-delete the user first before permanently removing them.");
            }

            // Validate that the reassignment target user exists
            var reassignUser = await _context.Users.FindAsync(reassignToUserId);
            if (reassignUser == null)
            {
                throw new InvalidOperationException(
                    $"Cannot reassign records: target user with ID {reassignToUserId} does not exist.");
            }

            var username = user.Username;

            // CRITICAL FIX: Wrap the entire transaction inside CreateExecutionStrategy().ExecuteAsync()
            // to support SqlServerRetryingExecutionStrategy with user-initiated transactions.
            var strategy = _context.Database.CreateExecutionStrategy();

            await strategy.ExecuteAsync(async () =>
            {
                // Use a transaction to ensure all-or-nothing cascade deletion
                using var transaction = await _context.Database.BeginTransactionAsync();

                try
                {
                    Console.WriteLine($"[DEBUG] Starting cascade deletion for user {userId} ({username}), reassigning non-nullable FKs to user {reassignToUserId}...");

                    // ═══════════════════════════════════════════════════════════════
                    // STEP 1: Delete records that are "owned" by this user
                    //         (records that don't make sense without the user)
                    // ═══════════════════════════════════════════════════════════════

                    // 1a. Delete Notifications for this user (no [Table] attr, uses DbSet name; PascalCase columns)
                    var notifCount = await _context.Database.ExecuteSqlRawAsync(
                        "DELETE FROM Notifications WHERE UserId = {0}", userId);
                    Console.WriteLine($"[DEBUG]   Removed {notifCount} notifications");

                    // 1b. Delete PerformanceMetrics for this user ([Table("performance_metrics")], snake_case columns)
                    var perfCount = await _context.Database.ExecuteSqlRawAsync(
                        "DELETE FROM performance_metrics WHERE user_id = {0}", userId);
                    Console.WriteLine($"[DEBUG]   Removed {perfCount} performance metrics");

                    // 1c. Delete DirectorPermissions for this user ([Table("director_permissions")], snake_case columns)
                    var dpCount = await _context.Database.ExecuteSqlRawAsync(
                        "DELETE FROM director_permissions WHERE user_id = {0}", userId);
                    Console.WriteLine($"[DEBUG]   Removed {dpCount} director permissions");

                    // 1c2. Delete TlPermissions for this user ([Table("tl_permissions")], snake_case columns)
                    var tlpCount = await _context.Database.ExecuteSqlRawAsync(
                        "DELETE FROM tl_permissions WHERE user_id = {0}", userId);
                    Console.WriteLine($"[DEBUG]   Removed {tlpCount} TL permissions");

                    // 1d. Delete EmployeeSchedules owned by this user ([Table("employee_schedules")], snake_case columns)
                    var schedCount = await _context.Database.ExecuteSqlRawAsync(
                        "DELETE FROM employee_schedules WHERE user_id = {0}", userId);
                    Console.WriteLine($"[DEBUG]   Removed {schedCount} employee schedules");

                    // 1e. Nullify EmployeeSchedules.ApprovedBy referencing this user (nullable int?)
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE employee_schedules SET approved_by = NULL WHERE approved_by = {0}", userId);

                    // 1f. Delete UserDateCounts owned by this user ([Table("user_date_counts")], snake_case columns)
                    var udcCount = await _context.Database.ExecuteSqlRawAsync(
                        "DELETE FROM user_date_counts WHERE user_id = {0}", userId);
                    Console.WriteLine($"[DEBUG]   Removed {udcCount} user date counts");

                    // 1g. Nullify UserDateCounts.TransferredFromUserId referencing this user (nullable int?)
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE user_date_counts SET transferred_from_user_id = NULL WHERE transferred_from_user_id = {0}", userId);

                    // 1h. Delete UserAuditLogs referencing this user ([Table("user_audit_logs")], snake_case columns)
                    var auditCount = await _context.Database.ExecuteSqlRawAsync(
                        "DELETE FROM user_audit_logs WHERE target_user_id = {0} OR performed_by_user_id = {0}", userId);
                    Console.WriteLine($"[DEBUG]   Removed {auditCount} audit logs");

                    // 1i. Delete TaskComments by this user ([Table("task_comments")], AuthorId is nullable int?)
                    var tcCount = await _context.Database.ExecuteSqlRawAsync(
                        "DELETE FROM task_comments WHERE author_id = {0}", userId);
                    Console.WriteLine($"[DEBUG]   Removed {tcCount} task comments");

                    // 1j. Delete CompletedTaskComments by this user ([Table("completed_task_comments")], AuthorId is non-nullable int)
                    var ctcCount = await _context.Database.ExecuteSqlRawAsync(
                        "DELETE FROM completed_task_comments WHERE author_id = {0}", userId);
                    Console.WriteLine($"[DEBUG]   Removed {ctcCount} completed task comments");

                    // 1k. Delete TaskTransfers referencing this user ([Table("task_transfers")], FromUserId/ToUserId are non-nullable int)
                    var ttCount = await _context.Database.ExecuteSqlRawAsync(
                        "DELETE FROM task_transfers WHERE from_user_id = {0} OR to_user_id = {0}", userId);
                    Console.WriteLine($"[DEBUG]   Removed {ttCount} task transfers");

                    // ═══════════════════════════════════════════════════════════════
                    // STEP 2: Reassign non-nullable FK references to the admin user
                    //         (reassignToUserId) instead of 0, which violates FK
                    //         constraints because no user with user_id = 0 exists.
                    // ═══════════════════════════════════════════════════════════════

                    // 2a. Tasks - CreatedBy is non-nullable int [Required] ([Table("tasks")])
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE tasks SET created_by = {0} WHERE created_by = {1}", reassignToUserId, userId);
                    Console.WriteLine($"[DEBUG]   Reassigned tasks.created_by to admin {reassignToUserId}");

                    // 2b. CompletedTasks - CreatedBy is non-nullable int [Required] ([Table("completed_tasks")])
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE completed_tasks SET created_by = {0} WHERE created_by = {1}", reassignToUserId, userId);
                    Console.WriteLine($"[DEBUG]   Reassigned completed_tasks.created_by to admin {reassignToUserId}");

                    // 2c. TaskUpdateHistory - UpdatedByUserId is non-nullable int [Required] ([Table("task_update_history")])
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE task_update_history SET updated_by_user_id = {0} WHERE updated_by_user_id = {1}", reassignToUserId, userId);
                    Console.WriteLine($"[DEBUG]   Reassigned task_update_history.updated_by_user_id to admin {reassignToUserId}");

                    // 2d. TaskAttachments - UploadedBy is non-nullable int [Required] ([Table("task_attachments")])
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE task_attachments SET uploaded_by = {0} WHERE uploaded_by = {1}", reassignToUserId, userId);
                    Console.WriteLine($"[DEBUG]   Reassigned task_attachments.uploaded_by to admin {reassignToUserId}");

                    // 2e. AmendmentRequests - RequesterId is non-nullable int [Required] ([Table("amendment_requests")])
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE amendment_requests SET requester_id = {0} WHERE requester_id = {1}", reassignToUserId, userId);
                    Console.WriteLine($"[DEBUG]   Reassigned amendment_requests.requester_id to admin {reassignToUserId}");

                    // 2f. AmendmentAuditTrail - ActionByUserId is non-nullable int [Required] ([Table("amendment_audit_trail")])
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE amendment_audit_trail SET action_by_user_id = {0} WHERE action_by_user_id = {1}", reassignToUserId, userId);
                    Console.WriteLine($"[DEBUG]   Reassigned amendment_audit_trail.action_by_user_id to admin {reassignToUserId}");

                    // 2g. TaskStatusHistory - ChangedByUserId is non-nullable int [Required] ([Table("task_status_history")])
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE task_status_history SET changed_by_user_id = {0} WHERE changed_by_user_id = {1}", reassignToUserId, userId);
                    Console.WriteLine($"[DEBUG]   Reassigned task_status_history.changed_by_user_id to admin {reassignToUserId}");

                    // 2h. InterventionRequests - RequestedBy is non-nullable int [Required] ([Table("intervention_requests")])
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE intervention_requests SET requested_by = {0} WHERE requested_by = {1}", reassignToUserId, userId);
                    Console.WriteLine($"[DEBUG]   Reassigned intervention_requests.requested_by to admin {reassignToUserId}");

                    // 2i. TaskHoldRequests - RequestedByEngineerId is non-nullable int [Required] ([Table("task_hold_requests")])
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE task_hold_requests SET requested_by_engineer_id = {0} WHERE requested_by_engineer_id = {1}", reassignToUserId, userId);
                    Console.WriteLine($"[DEBUG]   Reassigned task_hold_requests.requested_by_engineer_id to admin {reassignToUserId}");

                    // 2j. WorkloadAdjustmentRequests - RequesterId is non-nullable int [Required] ([Table("workload_adjustment_requests")])
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE workload_adjustment_requests SET requester_id = {0} WHERE requester_id = {1}", reassignToUserId, userId);
                    Console.WriteLine($"[DEBUG]   Reassigned workload_adjustment_requests.requester_id to admin {reassignToUserId}");

                    // 2k. Departments - DirectorId is non-nullable int with FK constraint to users.user_id
                    //     Strategy: Reassign to another active Director, then admin, then any active user.
                    //     If absolutely no other user exists, delete the orphaned departments.
                    await _context.Database.ExecuteSqlRawAsync(@"
                        UPDATE departments 
                        SET director_id = COALESCE(
                            (SELECT TOP 1 user_id FROM users 
                             WHERE user_id <> {0} AND role = 'Director' AND status = 'Active' 
                             ORDER BY created_at),
                            (SELECT TOP 1 user_id FROM users 
                             WHERE user_id = {1} AND status = 'Active'),
                            (SELECT TOP 1 user_id FROM users 
                             WHERE user_id <> {0} AND role = 'Admin' AND status = 'Active' 
                             ORDER BY created_at),
                            (SELECT TOP 1 user_id FROM users 
                             WHERE user_id <> {0} AND status = 'Active' 
                             ORDER BY user_id)
                        ),
                        updated_at = GETUTCDATE()
                        WHERE director_id = {0}
                        AND EXISTS (
                            SELECT 1 FROM users 
                            WHERE user_id <> {0} AND status = 'Active'
                        )", userId, reassignToUserId);
                    Console.WriteLine($"[DEBUG]   Reassigned departments from user {userId} to replacement user");

                    // If no active users exist at all (extremely unlikely), delete orphaned departments
                    await _context.Database.ExecuteSqlRawAsync(
                        "DELETE FROM departments WHERE director_id = {0}", userId);
                    Console.WriteLine($"[DEBUG]   Cleaned up any remaining orphaned departments for user {userId}");

                    // ═══════════════════════════════════════════════════════════════
                    // STEP 3: Nullify nullable FK references
                    // ═══════════════════════════════════════════════════════════════

                    // 3a. Tasks - nullable user FK columns ([Table("tasks")])
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE tasks SET amendment_reviewed_by_tl_id = NULL WHERE amendment_reviewed_by_tl_id = {0}", userId);
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE tasks SET Rejected_by = NULL WHERE Rejected_by = {0}", userId);
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE tasks SET amendment_requested_by = NULL WHERE amendment_requested_by = {0}", userId);
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE tasks SET reopened_by = NULL WHERE reopened_by = {0}", userId);
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE tasks SET cancelled_by = NULL WHERE cancelled_by = {0}", userId);
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE tasks SET paused_by = NULL WHERE paused_by = {0}", userId);
                    Console.WriteLine($"[DEBUG]   Nullified tasks nullable FK references");

                    // 3b. CompletedTasks - nullable user FK columns ([Table("completed_tasks")])
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE completed_tasks SET amendment_reviewed_by_tl_id = NULL WHERE amendment_reviewed_by_tl_id = {0}", userId);
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE completed_tasks SET Rejected_by = NULL WHERE Rejected_by = {0}", userId);
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE completed_tasks SET amendment_requested_by = NULL WHERE amendment_requested_by = {0}", userId);
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE completed_tasks SET reopened_by = NULL WHERE reopened_by = {0}", userId);
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE completed_tasks SET cancelled_by = NULL WHERE cancelled_by = {0}", userId);
                    Console.WriteLine($"[DEBUG]   Nullified completed_tasks nullable FK references");

                    // 3c. AmendmentRequests - nullable user FK columns ([Table("amendment_requests")])
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE amendment_requests SET reviewed_by_tl_id = NULL WHERE reviewed_by_tl_id = {0}", userId);
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE amendment_requests SET reviewed_by_director_id = NULL WHERE reviewed_by_director_id = {0}", userId);
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE amendment_requests SET resolved_by_id = NULL WHERE resolved_by_id = {0}", userId);
                    Console.WriteLine($"[DEBUG]   Nullified amendment_requests nullable FK references");

                    // 3d. InterventionRequests - nullable user FK columns ([Table("intervention_requests")])
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE intervention_requests SET acknowledged_by = NULL WHERE acknowledged_by = {0}", userId);
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE intervention_requests SET resolved_by = NULL WHERE resolved_by = {0}", userId);
                    Console.WriteLine($"[DEBUG]   Nullified intervention_requests nullable FK references");

                    // 3e. TaskHoldRequests - nullable user FK columns ([Table("task_hold_requests")])
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE task_hold_requests SET reviewed_by_tl_id = NULL WHERE reviewed_by_tl_id = {0}", userId);
                    Console.WriteLine($"[DEBUG]   Nullified task_hold_requests nullable FK references");

                    // 3f. TaskTransfers - ApprovedBy is nullable int? ([Table("task_transfers")])
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE task_transfers SET approved_by = NULL WHERE approved_by = {0}", userId);
                    Console.WriteLine($"[DEBUG]   Nullified task_transfers.approved_by");

                    // 3g. Transfers - CreatedBy and AssignedEngineerId are nullable int? ([Table("transfers")])
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE transfers SET created_by = NULL WHERE created_by = {0}", userId);
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE transfers SET assigned_engineer_id = NULL WHERE assigned_engineer_id = {0}", userId);
                    Console.WriteLine($"[DEBUG]   Nullified transfers FK references");

                    // 3h. Self-referencing User relationships (all nullable int?) ([Table("users")])
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE users SET supervisor_id = NULL WHERE supervisor_id = {0}", userId);
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE users SET created_by_user_id = NULL WHERE created_by_user_id = {0}", userId);
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE users SET manager_id = NULL WHERE manager_id = {0}", userId);
                    Console.WriteLine($"[DEBUG]   Nullified self-referencing user FK references");

                    // 3i. Shops - TeamLeaderId and ManagerId are nullable int? ([Table("shops")])
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE shops SET team_leader_id = NULL WHERE team_leader_id = {0}", userId);
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE shops SET manager_id = NULL WHERE manager_id = {0}", userId);
                    Console.WriteLine($"[DEBUG]   Nullified shop FK references");

                    // 3j. WorkloadAdjustmentRequests - ReviewedByTlId is nullable int? ([Table("workload_adjustment_requests")])
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE workload_adjustment_requests SET reviewed_by_tl_id = NULL WHERE reviewed_by_tl_id = {0}", userId);
                    Console.WriteLine($"[DEBUG]   Nullified workload_adjustment_requests.reviewed_by_tl_id");

                    // 3k. RolePermissions - UpdatedByUserId is nullable int? ([Table("role_permissions")])
                    await _context.Database.ExecuteSqlRawAsync(
                        "UPDATE role_permissions SET updated_by_user_id = NULL WHERE updated_by_user_id = {0}", userId);
                    Console.WriteLine($"[DEBUG]   Nullified role_permissions.updated_by_user_id");

                    // ═══════════════════════════════════════════════════════════════
                    // STEP 4: Clear change tracker and delete the user
                    // ═══════════════════════════════════════════════════════════════
                    _context.ChangeTracker.Clear();

                    var userToDelete = await _context.Users.FindAsync(userId);
                    if (userToDelete != null)
                    {
                        _context.Users.Remove(userToDelete);
                        await _context.SaveChangesAsync();
                    }

                    await transaction.CommitAsync();
                    Console.WriteLine($"[DEBUG] User {userId} ({username}) permanently deleted from database. Records reassigned to admin {reassignToUserId}.");
                }
                catch (Exception)
                {
                    await transaction.RollbackAsync();
                    throw;
                }
            });

            return true;
        }

        /// <summary>
        /// Restore a soft-deleted user by setting their Status back to Active.
        /// </summary>
        public async System.Threading.Tasks.Task<bool> RestoreUserAsync(int userId)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null)
                return false;

            // Safety check: only restore users that are currently Inactive
            if (user.Status != UserStatus.Inactive)
            {
                throw new InvalidOperationException(
                    $"User '{user.Username}' is not in a soft-deleted (Inactive) state. Current status: {user.Status}");
            }

            user.Status = UserStatus.Active;
            user.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            await MirrorUserAsync(user);
            Console.WriteLine($"[DEBUG] User {userId} ({user.Username}) restored to Active status.");
            return true;
        }
    }
}