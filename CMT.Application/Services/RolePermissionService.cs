using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using CMT.Domain.Data;
using CMT.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CMT.Application.Services
{
    /// <summary>
    /// Service for managing the role-based permission matrix.
    /// Persists permissions in the database so they are shared across all browsers/PCs.
    /// </summary>
    public class RolePermissionService : IRolePermissionService
    {
        private readonly ApplicationDbContext _context;
        private readonly ILogger<RolePermissionService> _logger;

        // The seven operational roles controlled by this matrix (added shop_manager)
        private static readonly string[] ROLE_KEYS =
        {
            "team_leader", "manager", "shop_tl", "engineer",
            "customer_personnel", "customer", "shop_manager"  // NEW
        };

        // The twelve permissions (must stay in sync with frontend PERMISSION_KEYS)
        private static readonly string[] PERMISSION_KEYS =
        {
            "delete_task", "delete_user", "reopen_task",
            "view_performance_metrics", "view_engineer_workload", "view_analytics",
            "mantenix_data", "transfers", "edit_user",
            "workload_adjustment", "create_task", "request_amendment"
        };

        // Default permission matrix (matches the frontend RolePermissionsManager defaults)
        // Must include ALL 12 permissions for ALL 7 roles
        private static readonly Dictionary<string, Dictionary<string, bool>> DEFAULT_MATRIX = new()
        {
            ["team_leader"] = new()
            {
                ["delete_task"] = true,
                ["delete_user"] = true,
                ["reopen_task"] = true,
                ["view_performance_metrics"] = true,
                ["view_engineer_workload"] = true,
                ["view_analytics"] = true,
                ["mantenix_data"] = true,
                ["transfers"] = true,
                ["edit_user"] = true,
                ["workload_adjustment"] = true,
                ["create_task"] = true,
                ["request_amendment"] = true,
            },
            ["manager"] = new()
            {
                ["delete_task"] = true,
                ["delete_user"] = true,
                ["reopen_task"] = false,
                ["view_performance_metrics"] = true,
                ["view_engineer_workload"] = true,
                ["view_analytics"] = true,
                ["mantenix_data"] = true,
                ["transfers"] = true,
                ["edit_user"] = true,
                ["workload_adjustment"] = false,
                ["create_task"] = false,
                ["request_amendment"] = false,
            },
            ["shop_tl"] = new()
            {
                ["delete_task"] = false,
                ["delete_user"] = false,
                ["reopen_task"] = false,
                ["view_performance_metrics"] = true,
                ["view_engineer_workload"] = true,
                ["view_analytics"] = true,
                ["mantenix_data"] = true,
                ["transfers"] = true,
                ["edit_user"] = false,
                ["workload_adjustment"] = false,
                ["create_task"] = false,
                ["request_amendment"] = false,
            },
            ["engineer"] = new()
            {
                ["delete_task"] = false,
                ["delete_user"] = false,
                ["reopen_task"] = false,
                ["view_performance_metrics"] = true,
                ["view_engineer_workload"] = true,
                ["view_analytics"] = true,
                ["mantenix_data"] = false,
                ["transfers"] = false,
                ["edit_user"] = false,
                ["workload_adjustment"] = true,
                ["create_task"] = false,
                ["request_amendment"] = true,
            },
            ["customer_personnel"] = new()
            {
                ["delete_task"] = false,
                ["delete_user"] = false,
                ["reopen_task"] = false,
                ["view_performance_metrics"] = true,
                ["view_engineer_workload"] = false,
                ["view_analytics"] = true,
                ["mantenix_data"] = false,
                ["transfers"] = false,
                ["edit_user"] = false,
                ["workload_adjustment"] = false,
                ["create_task"] = true,
                ["request_amendment"] = true,
            },
            ["customer"] = new()
            {
                ["delete_task"] = false,
                ["delete_user"] = false,
                ["reopen_task"] = false,
                ["view_performance_metrics"] = false,
                ["view_engineer_workload"] = false,
                ["view_analytics"] = true,
                ["mantenix_data"] = false,
                ["transfers"] = false,
                ["edit_user"] = false,
                ["workload_adjustment"] = false,
                ["create_task"] = false,
                ["request_amendment"] = false,
            },
            ["shop_manager"] = new()
            {
                ["delete_task"] = false,
                ["delete_user"] = false,
                ["reopen_task"] = false,
                ["view_performance_metrics"] = true,
                ["view_engineer_workload"] = true,
                ["view_analytics"] = true,
                ["mantenix_data"] = true,
                ["transfers"] = true,
                ["edit_user"] = false,
                ["workload_adjustment"] = false,
                ["create_task"] = false,
                ["request_amendment"] = false,
            },
        };

        public RolePermissionService(
            ApplicationDbContext context,
            ILogger<RolePermissionService> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async Task<RolePermissionMatrixDto> GetRolePermissionMatrixAsync()
        {
            var records = await _context.RolePermissions.ToListAsync();

            if (records.Count == 0)
            {
                // No records exist yet — seed with defaults
                _logger.LogInformation("No role permissions found in database. Seeding with defaults.");
                return await SeedDefaultMatrixAsync(null);
            }

            // Build the matrix from database records
            var matrix = BuildMatrixFromRecords(records);

            // Ensure all role/permission combinations exist (handles new roles/permissions added later)
            var needsSave = false;
            foreach (var roleKey in ROLE_KEYS)
            {
                if (!matrix.ContainsKey(roleKey))
                {
                    matrix[roleKey] = new Dictionary<string, bool>();
                }

                foreach (var permKey in PERMISSION_KEYS)
                {
                    if (!matrix[roleKey].ContainsKey(permKey))
                    {
                        // Use default value for missing combinations
                        var defaultValue = DEFAULT_MATRIX.ContainsKey(roleKey)
                            && DEFAULT_MATRIX[roleKey].ContainsKey(permKey)
                                ? DEFAULT_MATRIX[roleKey][permKey]
                                : false;

                        matrix[roleKey][permKey] = defaultValue;

                        // Also insert the missing record into the database
                        _context.RolePermissions.Add(new RolePermission
                        {
                            RoleKey = roleKey,
                            PermissionKey = permKey,
                            IsGranted = defaultValue,
                            CreatedAt = DateTime.UtcNow,
                            UpdatedAt = DateTime.UtcNow
                        });
                        needsSave = true;
                    }
                }
            }

            if (needsSave)
            {
                await _context.SaveChangesAsync();
            }

            var latestUpdate = records.Any()
                ? records.Max(r => r.UpdatedAt)
                : DateTime.UtcNow;

            return new RolePermissionMatrixDto
            {
                Matrix = matrix,
                UpdatedAt = latestUpdate
            };
        }

        public async Task<RolePermissionMatrixDto> SetRolePermissionMatrixAsync(
            UpdateRolePermissionMatrixDto matrixDto,
            int updatedByUserId)
        {
            var existingRecords = await _context.RolePermissions.ToListAsync();
            var now = DateTime.UtcNow;

            foreach (var roleKey in ROLE_KEYS)
            {
                if (!matrixDto.Matrix.ContainsKey(roleKey)) continue;

                foreach (var permKey in PERMISSION_KEYS)
                {
                    if (!matrixDto.Matrix[roleKey].ContainsKey(permKey)) continue;

                    var newValue = matrixDto.Matrix[roleKey][permKey];

                    var existing = existingRecords.FirstOrDefault(
                        r => r.RoleKey == roleKey && r.PermissionKey == permKey);

                    if (existing != null)
                    {
                        existing.IsGranted = newValue;
                        existing.UpdatedByUserId = updatedByUserId;
                        existing.UpdatedAt = now;
                    }
                    else
                    {
                        _context.RolePermissions.Add(new RolePermission
                        {
                            RoleKey = roleKey,
                            PermissionKey = permKey,
                            IsGranted = newValue,
                            UpdatedByUserId = updatedByUserId,
                            CreatedAt = now,
                            UpdatedAt = now
                        });
                    }
                }
            }

            await _context.SaveChangesAsync();

            _logger.LogInformation(
                "Role permission matrix updated by user {UserId}", updatedByUserId);

            return await GetRolePermissionMatrixAsync();
        }

        public async Task<RolePermissionMatrixDto> ResetToDefaultAsync(int updatedByUserId)
        {
            // Remove all existing records
            var existingRecords = await _context.RolePermissions.ToListAsync();
            _context.RolePermissions.RemoveRange(existingRecords);
            await _context.SaveChangesAsync();

            _logger.LogInformation(
                "Role permission matrix reset to defaults by user {UserId}", updatedByUserId);

            // Re-seed with defaults
            return await SeedDefaultMatrixAsync(updatedByUserId);
        }

        public async Task<bool> HasPermissionAsync(string roleKey, string permissionKey)
        {
            var normalizedRole = roleKey.ToLower().Trim();
            var normalizedPerm = permissionKey.ToLower().Trim();

            // Admin and Director always have full permissions
            // NOTE: shop_manager does NOT get full permissions - it goes through DB lookup
            if (normalizedRole == "admin" || normalizedRole == "director")
            {
                return true;
            }

            var record = await _context.RolePermissions
                .FirstOrDefaultAsync(r =>
                    r.RoleKey == normalizedRole && r.PermissionKey == normalizedPerm);

            if (record != null)
            {
                return record.IsGranted;
            }

            // Fallback to default if record doesn't exist
            if (DEFAULT_MATRIX.ContainsKey(normalizedRole)
                && DEFAULT_MATRIX[normalizedRole].ContainsKey(normalizedPerm))
            {
                return DEFAULT_MATRIX[normalizedRole][normalizedPerm];
            }

            return false;
        }

        // ─── Private helpers ─────────────────────────────────────────────

        private async Task<RolePermissionMatrixDto> SeedDefaultMatrixAsync(int? updatedByUserId)
        {
            var now = DateTime.UtcNow;

            foreach (var roleKey in ROLE_KEYS)
            {
                foreach (var permKey in PERMISSION_KEYS)
                {
                    var defaultValue = DEFAULT_MATRIX.ContainsKey(roleKey)
                        && DEFAULT_MATRIX[roleKey].ContainsKey(permKey)
                            ? DEFAULT_MATRIX[roleKey][permKey]
                            : false;

                    _context.RolePermissions.Add(new RolePermission
                    {
                        RoleKey = roleKey,
                        PermissionKey = permKey,
                        IsGranted = defaultValue,
                        UpdatedByUserId = updatedByUserId,
                        CreatedAt = now,
                        UpdatedAt = now
                    });
                }
            }

            await _context.SaveChangesAsync();

            return new RolePermissionMatrixDto
            {
                Matrix = new Dictionary<string, Dictionary<string, bool>>(DEFAULT_MATRIX),
                UpdatedAt = now
            };
        }

        private static Dictionary<string, Dictionary<string, bool>> BuildMatrixFromRecords(
            List<RolePermission> records)
        {
            var matrix = new Dictionary<string, Dictionary<string, bool>>();

            foreach (var record in records)
            {
                if (!matrix.ContainsKey(record.RoleKey))
                {
                    matrix[record.RoleKey] = new Dictionary<string, bool>();
                }

                matrix[record.RoleKey][record.PermissionKey] = record.IsGranted;
            }

            return matrix;
        }
    }
}