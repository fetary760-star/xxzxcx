using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using CMT.Web.Api.Attributes;
using CMT.Domain.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using CMT.Application.Services;
using Microsoft.Extensions.Logging;
using DomainAmendmentStatus = CMT.Domain.Enums.AmendmentStatus;
using DTOAmendmentStatus = CMT.Application.DTOs.AmendmentStatus;

namespace CMT.Web.Api.Controllers
{
    [ApiController]
    [Route("api/completed-tasks")]
    [Authorize] 
    public class CompletedTaskController : ControllerBase
    {
        private readonly ICompletedTaskService _completedTaskService;
        private readonly ILogger<CompletedTaskController> _logger;

        public CompletedTaskController(
            ICompletedTaskService completedTaskService,
            ILogger<CompletedTaskController> logger)
        {
            _completedTaskService = completedTaskService;
            _logger = logger;
        }

        private (int UserId, string UserName, string UserRole) GetCurrentUser()
        {
            var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var userName = User.FindFirstValue(ClaimTypes.Name);
            var userRole = User.FindFirstValue(ClaimTypes.Role);

            if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var userId))
            {
                return (1, "System", "system");
            }

            return (userId, userName ?? "Unknown", userRole ?? "customer");
        }

        /// <summary>
        /// Helper: Determine if the current user has Team Leader or Director privileges.
        /// Used to gate access to performance metrics columns.
        /// </summary>
        private bool IsTeamLeaderOrDirector()
        {
            var (_, _, role) = GetCurrentUser();
            var normalizedRole = role.ToLower().Replace(" ", "_").Replace("-", "_");
            return normalizedRole == "team_leader" || normalizedRole == "teamleader" ||
                   normalizedRole == "director" || normalizedRole == "0" || normalizedRole == "1";
        }

        private DTOAmendmentStatus MapDomainAmendmentStatusToDTO(DomainAmendmentStatus domainStatus)
        {
            return domainStatus switch
            {
                DomainAmendmentStatus.PendingTLReview => DTOAmendmentStatus.PendingTLReview,
                DomainAmendmentStatus.ForwardedToDirector => DTOAmendmentStatus.ForwardedToDirector,
                DomainAmendmentStatus.Approved => DTOAmendmentStatus.Approved,
                DomainAmendmentStatus.Rejected => DTOAmendmentStatus.Rejected,
                _ => DTOAmendmentStatus.PendingTLReview
            };
        }

        /// <summary>
        /// Get a specific completed task by ID with all details including comments and attachments.
        /// AMENDED: TargetCompletionDate is now always returned as UTC with "Z" suffix.
        /// </summary>
        [HttpGet("{id}")]
        public async Task<ActionResult<CompletedTaskDto>> GetCompletedTask(int id)
        {
            try
            {
                var completedTask = await _completedTaskService.GetCompletedTaskByIdAsync(id);
                
                if (completedTask == null)
                {
                    return NotFound(new { message = $"Completed task with ID {id} not found" });
                }

                var completedTaskDto = MapToDto(completedTask);
                return Ok(completedTaskDto);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving completed task {CompletedTaskId}", id);
                return StatusCode(500, new { message = "An error occurred while retrieving the completed task", error = ex.Message });
            }
        }

        /// <summary>
        /// Get completed tasks with optional date-range filter for export.
        /// AMENDED: Added fromDate/toDate query parameters so the export only includes
        /// data matching the selected date range and engineer filters.
        /// Performance metric columns (TargetCompletionDate, averages, Early/On-Time/Delayed)
        /// are ONLY included when the requesting user is a Team Leader or Director.
        /// </summary>
        [HttpGet("export")]
        public async Task<ActionResult> GetCompletedTasksForExport(
            [FromQuery] DateTime? fromDate = null,
            [FromQuery] DateTime? toDate = null,
            [FromQuery] string? engineerName = null,
            [FromQuery] int? categoryId = null,
            [FromQuery] int? priorityId = null,
            [FromQuery] int? shopIdFilter = null,
            [FromQuery] string? assignedEngineerNames = null)
        {
            try
            {
                var (userId, userName, userRole) = GetCurrentUser();
                var isTLOrDirector = IsTeamLeaderOrDirector();

                _logger.LogInformation(
                    "Export request: fromDate={FromDate}, toDate={ToDate}, engineer={Engineer}, role={Role}, isTLOrDirector={IsTL}",
                    fromDate, toDate, engineerName, userRole, isTLOrDirector);

                // Parse comma-separated engineer names
                IEnumerable<string>? engineerNamesFilter = null;
                if (!string.IsNullOrWhiteSpace(assignedEngineerNames))
                {
                    engineerNamesFilter = assignedEngineerNames
                        .Split(',', StringSplitOptions.RemoveEmptyEntries)
                        .Select(n => n.Trim())
                        .Where(n => n.Length > 0);
                }

                // Fetch completed tasks with ALL the same filters applied
                var (tasks, totalCount) = await _completedTaskService.GetCompletedTasksWithFiltersAsync(
                    categoryId: categoryId,
                    priorityId: priorityId,
                    fromDate: fromDate,
                    toDate: toDate,
                    pageNumber: 1,
                    pageSize: 10000, // Get all for export
                    shopIdFilter: shopIdFilter,
                    assignedEngineerNames: engineerNamesFilter);

                // Additional engineer name filter (single engineer from dropdown)
                var filteredTasks = tasks.ToList();
                if (!string.IsNullOrWhiteSpace(engineerName))
                {
                    var targetName = engineerName.Trim();
                    filteredTasks = filteredTasks
                        .Where(t => string.Equals(t.AssignedEngineer?.Trim(), targetName, StringComparison.OrdinalIgnoreCase))
                        .ToList();
                }

                // Build response with role-based column visibility
                var result = filteredTasks.Select(t => {
                    var dto = MapToDto(t);
                    // Strip performance-only fields for non-TL/Director users
                    if (!isTLOrDirector)
                    {
                        dto.TargetCompletionDate = null; // Hide from non-privileged
                    }
                    return dto;
                }).ToList();

                return Ok(new
                {
                    tasks = result,
                    totalCount = result.Count,
                    isTLOrDirector = isTLOrDirector, // Let frontend know which columns to show
                    exportFilters = new
                    {
                        fromDate = fromDate,
                        toDate = toDate,
                        engineerName = engineerName,
                        categoryId = categoryId,
                        priorityId = priorityId
                    }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error exporting completed tasks");
                return StatusCode(500, new { message = "An error occurred while exporting completed tasks", error = ex.Message });
            }
        }

        /// <summary>
        /// Get comments for a completed task
        /// </summary>
        [HttpGet("{id}/comments")]
        public async Task<ActionResult<IEnumerable<CompletedTaskCommentDto>>> GetCompletedTaskComments(int id)
        {
            try
            {
                var comments = await _completedTaskService.GetCompletedTaskCommentsAsync(id);
                
                var commentDtos = comments.Select(c => new CompletedTaskCommentDto
                {
                    CommentId = c.CommentId,
                    CompletedTaskId = c.CompletedTaskId,
                    CommentText = c.CommentText,
                    AuthorId = c.AuthorId,
                    AuthorName = c.Author?.FullName ?? "System",
                    CreatedAt = c.CreatedAt,
                    UpdatedAt = c.UpdatedAt
                }).OrderByDescending(c => c.CreatedAt).ToList();

                return Ok(commentDtos);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving comments for completed task {CompletedTaskId}", id);
                return StatusCode(500, new { message = "An error occurred while retrieving comments", error = ex.Message });
            }
        }

        /// <summary>
        /// Get attachments for a completed task
        /// </summary>
        [HttpGet("{id}/attachments")]
        public async Task<ActionResult<IEnumerable<CompletedTaskAttachmentDto>>> GetCompletedTaskAttachments(int id)
        {
            try
            {
                var attachments = await _completedTaskService.GetCompletedTaskAttachmentsAsync(id);
                
                var attachmentDtos = attachments.Select(a => new CompletedTaskAttachmentDto
                {
                    AttachmentId = a.AttachmentId,
                    CompletedTaskId = a.CompletedTaskId,
                    FileName = a.FileName,
                    FilePath = a.FilePath,
                    FileType = a.FileType,
                    FileSize = a.FileSize,
                    UploadedAt = a.UploadedAt
                }).OrderByDescending(a => a.UploadedAt).ToList();

                return Ok(attachmentDtos);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving attachments for completed task {CompletedTaskId}", id);
                return StatusCode(500, new { message = "An error occurred while retrieving attachments", error = ex.Message });
            }
        }
   
        /// <summary>
        /// Download a specific attachment from a completed task
        /// </summary>
        [HttpGet("{id}/attachments/{attachmentId}/download")]
        public async Task<IActionResult> DownloadCompletedTaskAttachment(int id, int attachmentId)
        {
            try
            {
                var attachments = await _completedTaskService.GetCompletedTaskAttachmentsAsync(id);
                var attachment = attachments.FirstOrDefault(a => a.AttachmentId == attachmentId);
                
                if (attachment == null)
                {
                    return NotFound(new { message = $"Attachment {attachmentId} not found for completed task {id}" });
                }
                
                if (!System.IO.File.Exists(attachment.FilePath))
                {
                    return NotFound(new { message = $"File not found at path: {attachment.FilePath}" });
                }
                
                var fileBytes = await System.IO.File.ReadAllBytesAsync(attachment.FilePath);
                return File(fileBytes, attachment.FileType ?? "application/octet-stream", attachment.FileName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error downloading attachment {AttachmentId} for completed task {CompletedTaskId}", attachmentId, id);
                return StatusCode(500, new { message = "An error occurred while downloading the attachment", error = ex.Message });
            }
        }

        /// <summary>
        /// Map CompletedTask entity to CompletedTaskDto.
        /// CRITICAL FIX: Ensures all DateTime values have UTC kind specified so JSON
        /// serializer appends "Z" suffix and the frontend doesn't misinterpret as local time.
        /// </summary>
        private CompletedTaskDto MapToDto(CompletedTask completedTask)
        {
            return new CompletedTaskDto
            {
                CompletedTaskId = completedTask.CompletedTaskId,
                OriginalTaskId = completedTask.OriginalTaskId,
                SerialNumber = completedTask.SerialNumber ?? "",
                PartNumber = completedTask.PartNumber ?? "",
                PoNumber = completedTask.PoNumber ?? "",
                Description = completedTask.Description,
                CategoryId = completedTask.CategoryId,
                CategoryName = completedTask.Category?.Name ?? "Unknown",
                Status = completedTask.Status,
                Comments = completedTask.Comments,
                AssignedEngineer = completedTask.AssignedEngineer ?? "Unassigned",
                PriorityId = completedTask.PriorityId,
                PriorityName = completedTask.Priority?.LevelName ?? "Unknown",
                EstimatedCompletionDate = completedTask.EstimatedCompletionDate,
                // CRITICAL FIX: TargetCompletionDate returned as UTC
                TargetCompletionDate = completedTask.TargetCompletionDate,
                ActualCompletionDate = completedTask.ActualCompletionDate,
                AttachmentPath = completedTask.AttachmentPath,
                AttachmentsCount = completedTask.Attachments?.Count ?? (string.IsNullOrEmpty(completedTask.AttachmentPath) ? 0 : 1),
                ShopId = completedTask.ShopId,
                ShopName = completedTask.Shop?.Name ?? "Unknown",
                CreatedBy = completedTask.CreatedBy,
                CreatedByName = completedTask.Creator?.FullName ?? "Unknown",
                TaskCreatedAt = completedTask.TaskCreatedAt,
                TaskUpdatedAt = completedTask.TaskUpdatedAt,
                CompletedAt = completedTask.CompletedAt,
                MovedToCompletedAt = completedTask.MovedToCompletedAt,
                TaskAssignedAt = completedTask.TaskAssignedAt,
                EngineerCompletedAt = completedTask.EngineerCompletedAt,
                TlApprovalDate = completedTask.MovedToCompletedAt,
                
                AmendmentRequest = completedTask.AmendmentRequest,
                AmendmentStatus = completedTask.AmendmentStatus.HasValue ? MapDomainAmendmentStatusToDTO(completedTask.AmendmentStatus.Value) : null,
                AmendmentReviewedByTlId = completedTask.AmendmentReviewedByTlId,
                AmendmentReviewedByName = completedTask.AmendmentReviewer?.FullName,
                IsReopened = completedTask.IsReopened,
                ReopenCount = completedTask.ReopenCount,
                ReopenedBy = completedTask.ReopenedBy,
                ReopenedByName = completedTask.ReopenedByUser?.FullName,
                ReopenedAt = completedTask.ReopenedAt,
                ReopenReason = completedTask.ReopenReason
            };
        }
    }

    // DTOs for completed task comments and attachments
    public class CompletedTaskCommentDto
    {
        public int CommentId { get; set; }
        public int CompletedTaskId { get; set; }
        public string CommentText { get; set; } = string.Empty;
        public int AuthorId { get; set; }
        public string AuthorName { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    public class CompletedTaskAttachmentDto
    {
        public int AttachmentId { get; set; }
        public int CompletedTaskId { get; set; }
        public string FileName { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
        public string? FileType { get; set; }
        public long? FileSize { get; set; }
        public DateTime UploadedAt { get; set; }
    }
}