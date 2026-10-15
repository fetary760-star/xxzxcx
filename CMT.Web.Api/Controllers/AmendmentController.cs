using CMT.Domain.Data;
using CMT.Domain.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;
using CMT.Application.Services;
using CMT.Application.DTOs;
using System.Security.Claims;

namespace CMT.Web.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class AmendmentController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly IWebHostEnvironment _environment;
        private readonly ILogger<AmendmentController> _logger;
        private readonly IEnhancedAmendmentService _amendmentService;

        public AmendmentController(
            ApplicationDbContext context,
            IWebHostEnvironment environment,
            ILogger<AmendmentController> logger,
            IEnhancedAmendmentService amendmentService)
        {
            _context = context;
            _environment = environment;
            _logger = logger;
            _amendmentService = amendmentService;
        }

        /// <summary>
        /// Get detailed amendment history for a task including all audit trail information
        /// </summary>
        [HttpGet("task/{taskId}/history")]
        public async Task<ActionResult> GetAmendmentHistory(int taskId)
        {
            try
            {
                _logger.LogInformation("Getting amendment history for task {TaskId}", taskId);

                var amendmentRequests = await _context.Set<AmendmentRequest>()
                    .Include(ar => ar.Requester)
                    .Include(ar => ar.ReviewedByTl)
                    .Include(ar => ar.ReviewedByDirector)
                    .Include(ar => ar.ResolvedBy)
                    .Where(ar => ar.TaskId == taskId)
                    .OrderByDescending(ar => ar.CreatedAt)
                    .ToListAsync();

                var historyItems = new List<object>();

                foreach (var request in amendmentRequests)
                {
                    var auditTrail = await _context.Set<AmendmentAuditTrail>()
                        .Include(at => at.ActionByUser)
                        .Where(at => at.AmendmentRequestId == request.AmendmentRequestId)
                        .OrderBy(at => at.ActionTimestamp)
                        .ToListAsync();

                    var historyItem = new
                    {
                        amendment_request_id = request.AmendmentRequestId,
                        task_id = request.TaskId,
                        request_type = request.RequestType,
                        request_reason = request.RequestReason,
                        status = request.Status,
                        final_status = request.FinalStatus,
                        priority_level = request.PriorityLevel,

                        requester_id = request.RequesterId,
                        requester_name = request.Requester?.FullName ?? "Unknown",
                        requester_role = request.Requester?.Role.ToString() ?? "Unknown",
                        requested_at = request.CreatedAt,

                        reviewed_by_tl_id = request.ReviewedByTlId,
                        reviewed_by_tl_name = request.ReviewedByTl?.FullName,
                        tl_review_date = request.TlReviewDate,
                        tl_review_comments = request.TlReviewComments,
                        tl_decision = request.TlDecision,

                        reviewed_by_director_id = request.ReviewedByDirectorId,
                        reviewed_by_director_name = request.ReviewedByDirector?.FullName,
                        director_review_date = request.DirectorReviewDate,
                        director_review_comments = request.DirectorReviewComments,
                        director_decision = request.DirectorDecision,

                        resolved_at = request.ResolvedAt,
                        resolved_by_id = request.ResolvedById,
                        resolved_by_name = request.ResolvedBy?.FullName,

                        created_at = request.CreatedAt,
                        updated_at = request.UpdatedAt,

                        audit_trail = auditTrail.Select(at => new
                        {
                            audit_id = at.AuditId,
                            action_type = at.ActionType,
                            action_by_user_id = at.ActionByUserId,
                            action_by_user_name = at.ActionByUser?.FullName ?? "Unknown",
                            action_by_role = at.ActionByRole,
                            previous_status = at.PreviousStatus,
                            new_status = at.NewStatus,
                            action_comments = at.ActionComments,
                            action_timestamp = at.ActionTimestamp,
                            ip_address = at.IpAddress,
                            user_agent = at.UserAgent
                        }).ToList()
                    };

                    historyItems.Add(historyItem);
                }

                _logger.LogInformation("Found {Count} amendment requests with audit trail for task {TaskId}", historyItems.Count, taskId);

                return Ok(new
                {
                    success = true,
                    task_id = taskId,
                    amendment_history = historyItems,
                    total_count = historyItems.Count
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting amendment history for task {TaskId}", taskId);
                return StatusCode(500, new { success = false, message = "Error retrieving amendment history", error = ex.Message });
            }
        }

        /// <summary>
        /// Get task status history including reopen actions
        /// ENHANCED: Searches both TaskId AND OriginalTaskId so reopen entries are not missed.
        /// </summary>
        [HttpGet("task/{taskId}/status-history")]
        public async Task<ActionResult> GetTaskStatusHistory(int taskId)
        {
            try
            {
                _logger.LogInformation("Getting status history for task {TaskId}", taskId);

                var statusHistory = await _context.Set<TaskStatusHistory>()
                    .Include(sh => sh.ChangedByUser)
                    .Include(sh => sh.RelatedAmendmentRequest)
                    .Where(sh => sh.TaskId == taskId || sh.OriginalTaskId == taskId)
                    .OrderByDescending(sh => sh.ChangeTimestamp)
                    .ToListAsync();

                var historyItems = statusHistory.Select(sh => new
                {
                    history_id = sh.HistoryId,
                    task_id = sh.TaskId,
                    original_task_id = sh.OriginalTaskId,
                    previous_status = sh.PreviousStatus,
                    new_status = sh.NewStatus,
                    status_change_reason = sh.StatusChangeReason,
                    changed_by_user_id = sh.ChangedByUserId,
                    changed_by_user_name = sh.ChangedByUser?.FullName ?? "Unknown",
                    changed_by_role = sh.ChangedByRole,
                    change_timestamp = sh.ChangeTimestamp,
                    is_reopen_action = sh.IsReopenAction,
                    reopen_count = sh.ReopenCount,
                    assigned_engineers = sh.AssignedEngineers,
                    related_amendment_request_id = sh.RelatedAmendmentRequestId
                }).ToList();

                _logger.LogInformation("Found {Count} status history entries for task {TaskId}", historyItems.Count, taskId);

                return Ok(new
                {
                    success = true,
                    task_id = taskId,
                    status_history = historyItems,
                    total_count = historyItems.Count
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting status history for task {TaskId}", taskId);
                return StatusCode(500, new { success = false, message = "Error retrieving status history", error = ex.Message });
            }
        }

        /// <summary>
        /// ENHANCED: Get comprehensive alert details for a task with REAL DATA from database
        /// CRITICAL FIX: Now checks BOTH current task_id AND original_task_id to find reopen history
        /// Returns both IDs clearly so frontend can display "Current Task ID" and "Original Task ID (if reopened)"
        /// </summary>
        [HttpGet("task/{taskId}/alert-details")]
        public async Task<ActionResult> GetAlertDetails(int taskId, [FromQuery] string alertType = "all")
        {
            try
            {
                _logger.LogInformation("Getting alert details for task {TaskId}, type: {AlertType}", taskId, alertType);

                // Try active task first
                var task = await _context.Tasks
                    .Include(t => t.Creator)
                    .Include(t => t.ReopenedByUser)
                    .Include(t => t.AmendmentReviewer)
                    .FirstOrDefaultAsync(t => t.TaskId == taskId);

                int? originalTaskId = null;
                int currentTaskId = taskId;

                // CRITICAL: Check if this task IS a reopened task (has original_task_id in history)
                var reopenHistoryForCurrentTask = await _context.Set<TaskStatusHistory>()
                    .Where(sh => sh.TaskId == taskId && sh.OriginalTaskId != null && sh.IsReopenAction == true)
                    .OrderByDescending(sh => sh.ChangeTimestamp)
                    .FirstOrDefaultAsync();

                if (reopenHistoryForCurrentTask != null)
                {
                    originalTaskId = reopenHistoryForCurrentTask.OriginalTaskId;
                    _logger.LogInformation("Task {TaskId} is a reopened task. Original Task ID: {OriginalTaskId}", taskId, originalTaskId);
                }

                // If not active, try completed tasks
                if (task == null)
                {
                    var completedTask = await _context.CompletedTasks
                        .Include(ct => ct.Creator)
                        .Include(ct => ct.ReopenedByUser)
                        .Include(ct => ct.AmendmentReviewer)
                        .FirstOrDefaultAsync(ct => ct.OriginalTaskId == taskId);

                    if (completedTask == null)
                    {
                        _logger.LogWarning("Task {TaskId} not found in active or completed tables", taskId);
                        return NotFound(new { success = false, message = $"Task {taskId} not found" });
                    }

                    task = new CMT.Domain.Models.Task
                    {
                        TaskId = completedTask.OriginalTaskId,
                        SerialNumber = completedTask.SerialNumber,
                        PartNumber = completedTask.PartNumber,
                        Description = completedTask.Description,
                        ShowRevisionAlert = completedTask.ShowRevisionAlert,
                        RevisionNotes = completedTask.RevisionNotes,
                        IsReopened = completedTask.IsReopened,
                        ReopenCount = completedTask.ReopenCount,
                        ReopenReason = completedTask.ReopenReason,
                        ReopenedAt = completedTask.ReopenedAt,
                        ReopenedBy = completedTask.ReopenedBy,
                        ReopenedByUser = completedTask.ReopenedByUser,
                        AmendmentRequest = completedTask.AmendmentRequest,
                        AmendmentStatus = completedTask.AmendmentStatus,
                        AmendmentReason = completedTask.AmendmentReason,
                        AmendmentRequestedAt = completedTask.AmendmentRequestedAt,
                        AmendmentRequestedBy = completedTask.AmendmentRequestedBy,
                        AmendmentReviewedByTlId = completedTask.AmendmentReviewedByTlId,
                        AmendmentReviewer = completedTask.AmendmentReviewer,
                        IsDuplicate = completedTask.IsDuplicate,
                        DuplicateJustification = completedTask.DuplicateJustification,
                        CreatedBy = completedTask.CreatedBy,
                        Creator = completedTask.Creator,
                        CreatedAt = completedTask.TaskCreatedAt,
                        UpdatedAt = completedTask.TaskUpdatedAt
                    };
                }

                // CRITICAL FIX: Pull status history rows checking BOTH TaskId AND OriginalTaskId
                var statusHistoryRows = await _context.Set<TaskStatusHistory>()
                    .Include(sh => sh.ChangedByUser)
                    .Where(sh => sh.TaskId == taskId || sh.OriginalTaskId == taskId)
                    .OrderByDescending(sh => sh.ChangeTimestamp)
                    .ToListAsync();

                _logger.LogInformation("Found {Count} status history entries for task {TaskId} (including original_task_id matches)", statusHistoryRows.Count, taskId);

                // Map status history for the frontend
                var statusHistory = statusHistoryRows.Select(sh => new
                {
                    history_id = sh.HistoryId,
                    task_id = sh.TaskId,
                    original_task_id = sh.OriginalTaskId,
                    previous_status = sh.PreviousStatus,
                    new_status = sh.NewStatus,
                    status_change_reason = sh.StatusChangeReason,
                    changed_by_user_id = sh.ChangedByUserId,
                    changed_by_user_name = sh.ChangedByUser?.FullName ?? "Unknown",
                    changed_by_role = sh.ChangedByRole,
                    change_timestamp = sh.ChangeTimestamp,
                    is_reopen_action = sh.IsReopenAction,
                    reopen_count = sh.ReopenCount,
                    assigned_engineers = sh.AssignedEngineers,
                    related_amendment_request_id = sh.RelatedAmendmentRequestId
                }).ToList();

                // Find the most recent reopen action (if any)
                var latestReopen = statusHistoryRows
                    .Where(sh => sh.IsReopenAction == true)
                    .OrderByDescending(sh => sh.ChangeTimestamp)
                    .FirstOrDefault();

                if (latestReopen != null)
                {
                    _logger.LogInformation("Latest reopen action found: TaskId={TaskId}, OriginalTaskId={OriginalTaskId}, ReopenedBy={ReopenedBy}, ReopenedAt={ReopenedAt}",
                        latestReopen.TaskId, latestReopen.OriginalTaskId, latestReopen.ChangedByUser?.FullName, latestReopen.ChangeTimestamp);
                }

                // Build top-level fields, prefer explicit task fields then fallback to history
                var reopenedById = task.ReopenedBy ?? latestReopen?.ChangedByUserId;
                var reopenedByName = task.ReopenedByUser?.FullName ?? latestReopen?.ChangedByUser?.FullName;
                var reopenedAt = task.ReopenedAt ?? latestReopen?.ChangeTimestamp;
                var reopenReason = task.ReopenReason ?? latestReopen?.StatusChangeReason;
                var reopenCount = task.ReopenCount != 0 ? task.ReopenCount : (latestReopen?.ReopenCount ?? 0);

                var alertDetails = new
                {
                    task_id = currentTaskId,
                    original_task_id = originalTaskId, // CRITICAL: Now included in response
                    serial_number = task.SerialNumber,
                    part_number = task.PartNumber,
                    description = task.Description,

                    // Revision alert info
                    show_revision_alert = task.ShowRevisionAlert,
                    revision_notes = task.RevisionNotes,
                    revision_by_id = await GetRevisionActorId(taskId),
                    revision_by_name = await GetRevisionActorName(taskId),
                    revision_at = await GetRevisionDate(taskId),
                    updated_at = task.UpdatedAt,
                    updated_by_id = await GetLastUpdateActorId(taskId),
                    updated_by_name = await GetLastUpdateActorName(taskId),

                    // Reopened info (prefer task fields, fall back to history)
                    is_reopened = task.IsReopened || latestReopen != null,
                    reopen_count = reopenCount,
                    reopen_reason = reopenReason,
                    reopened_at = reopenedAt,
                    reopened_by_id = reopenedById,
                    reopened_by_name = reopenedByName,

                    // Amendment info
                    amendment_request = task.AmendmentRequest,
                    amendment_status = task.AmendmentStatus,
                    amendment_reason = task.AmendmentReason ?? await GetAmendmentReasonFromRequests(taskId),
                    amendment_requested_at = task.AmendmentRequestedAt ?? await GetAmendmentRequestDateFromRequests(taskId),
                    amendment_requested_by = task.AmendmentRequestedBy ?? await GetAmendmentRequesterIdFromRequests(taskId),
                    amendment_requested_by_name = await GetAmendmentRequesterNameFromRequests(taskId),
                    amendment_reviewed_by_tl_id = task.AmendmentReviewedByTlId,
                    amendment_reviewed_by_tl_name = task.AmendmentReviewer?.FullName ?? await GetAmendmentReviewerNameFromRequests(taskId),
                    amendment_reviewed_at = await GetAmendmentReviewDateFromRequests(taskId),

                    // Duplicate info
                    is_duplicate = task.IsDuplicate,
                    duplicate_justification = task.DuplicateJustification,
                    marked_duplicate_at = task.CreatedAt,
                    marked_duplicate_by = task.CreatedBy,
                    marked_duplicate_by_name = task.Creator?.FullName,

                    // General info
                    created_by = task.CreatedBy,
                    created_by_name = task.Creator?.FullName,
                    created_at = task.CreatedAt,

                    // Raw status history (newly included) so frontend has direct access
                    status_history = statusHistory
                };

                _logger.LogInformation("AlertDetails for task {TaskId} prepared (original_task_id={OriginalTaskId}, status_history_count={Count})", 
                    taskId, originalTaskId, statusHistory.Count);

                return Ok(new
                {
                    success = true,
                    alert_details = alertDetails
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting alert details for task {TaskId}", taskId);
                return StatusCode(500, new { success = false, message = "Error retrieving alert details", error = ex.Message });
            }
        }

        #region Helper Methods for Enhanced Alert Details

        private async Task<int?> GetRevisionActorId(int taskId)
        {
            var lastRevision = await _context.Set<TaskStatusHistory>()
                .Where(sh => (sh.TaskId == taskId || sh.OriginalTaskId == taskId) && sh.NewStatus != null && sh.NewStatus.ToLower().Contains("revision"))
                .OrderByDescending(sh => sh.ChangeTimestamp)
                .FirstOrDefaultAsync();
            return lastRevision?.ChangedByUserId;
        }

        private async Task<string?> GetRevisionActorName(int taskId)
        {
            var lastRevision = await _context.Set<TaskStatusHistory>()
                .Include(sh => sh.ChangedByUser)
                .Where(sh => (sh.TaskId == taskId || sh.OriginalTaskId == taskId) && sh.NewStatus != null && sh.NewStatus.ToLower().Contains("revision"))
                .OrderByDescending(sh => sh.ChangeTimestamp)
                .FirstOrDefaultAsync();
            return lastRevision?.ChangedByUser?.FullName;
        }

        private async Task<DateTime?> GetRevisionDate(int taskId)
        {
            var lastRevision = await _context.Set<TaskStatusHistory>()
                .Where(sh => (sh.TaskId == taskId || sh.OriginalTaskId == taskId) && sh.NewStatus != null && sh.NewStatus.ToLower().Contains("revision"))
                .OrderByDescending(sh => sh.ChangeTimestamp)
                .FirstOrDefaultAsync();
            return lastRevision?.ChangeTimestamp;
        }

        private async Task<int?> GetLastUpdateActorId(int taskId)
        {
            var lastUpdate = await _context.Set<TaskStatusHistory>()
                .Where(sh => sh.TaskId == taskId || sh.OriginalTaskId == taskId)
                .OrderByDescending(sh => sh.ChangeTimestamp)
                .FirstOrDefaultAsync();
            return lastUpdate?.ChangedByUserId;
        }

        private async Task<string?> GetLastUpdateActorName(int taskId)
        {
            var lastUpdate = await _context.Set<TaskStatusHistory>()
                .Include(sh => sh.ChangedByUser)
                .Where(sh => sh.TaskId == taskId || sh.OriginalTaskId == taskId)
                .OrderByDescending(sh => sh.ChangeTimestamp)
                .FirstOrDefaultAsync();
            return lastUpdate?.ChangedByUser?.FullName;
        }

        private async Task<string?> GetReopenReasonFromHistory(int taskId)
        {
            var reopenHistory = await _context.Set<TaskStatusHistory>()
                .Where(sh => (sh.TaskId == taskId || sh.OriginalTaskId == taskId) && sh.IsReopenAction == true)
                .OrderByDescending(sh => sh.ChangeTimestamp)
                .FirstOrDefaultAsync();
            return reopenHistory?.StatusChangeReason;
        }

        private async Task<DateTime?> GetReopenDateFromHistory(int taskId)
        {
            var reopenHistory = await _context.Set<TaskStatusHistory>()
                .Where(sh => (sh.TaskId == taskId || sh.OriginalTaskId == taskId) && sh.IsReopenAction == true)
                .OrderByDescending(sh => sh.ChangeTimestamp)
                .FirstOrDefaultAsync();
            return reopenHistory?.ChangeTimestamp;
        }

        private async Task<int?> GetReopenActorIdFromHistory(int taskId)
        {
            var reopenHistory = await _context.Set<TaskStatusHistory>()
                .Where(sh => (sh.TaskId == taskId || sh.OriginalTaskId == taskId) && sh.IsReopenAction == true)
                .OrderByDescending(sh => sh.ChangeTimestamp)
                .FirstOrDefaultAsync();
            return reopenHistory?.ChangedByUserId;
        }

        private async Task<string?> GetReopenActorNameFromHistory(int taskId)
        {
            var reopenHistory = await _context.Set<TaskStatusHistory>()
                .Include(sh => sh.ChangedByUser)
                .Where(sh => (sh.TaskId == taskId || sh.OriginalTaskId == taskId) && sh.IsReopenAction == true)
                .OrderByDescending(sh => sh.ChangeTimestamp)
                .FirstOrDefaultAsync();
            return reopenHistory?.ChangedByUser?.FullName;
        }

        private async Task<string?> GetAmendmentReasonFromRequests(int taskId)
        {
            var amendmentRequest = await _context.Set<AmendmentRequest>()
                .Where(ar => ar.TaskId == taskId)
                .OrderByDescending(ar => ar.CreatedAt)
                .FirstOrDefaultAsync();
            return amendmentRequest?.RequestReason;
        }

        private async Task<DateTime?> GetAmendmentRequestDateFromRequests(int taskId)
        {
            var amendmentRequest = await _context.Set<AmendmentRequest>()
                .Where(ar => ar.TaskId == taskId)
                .OrderByDescending(ar => ar.CreatedAt)
                .FirstOrDefaultAsync();
            return amendmentRequest?.CreatedAt;
        }

        private async Task<int?> GetAmendmentRequesterIdFromRequests(int taskId)
        {
            var amendmentRequest = await _context.Set<AmendmentRequest>()
                .Where(ar => ar.TaskId == taskId)
                .OrderByDescending(ar => ar.CreatedAt)
                .FirstOrDefaultAsync();
            return amendmentRequest?.RequesterId;
        }

        private async Task<string?> GetAmendmentRequesterNameFromRequests(int taskId)
        {
            var amendmentRequest = await _context.Set<AmendmentRequest>()
                .Include(ar => ar.Requester)
                .Where(ar => ar.TaskId == taskId)
                .OrderByDescending(ar => ar.CreatedAt)
                .FirstOrDefaultAsync();
            return amendmentRequest?.Requester?.FullName;
        }

        private async Task<string?> GetAmendmentReviewerNameFromRequests(int taskId)
        {
            var amendmentRequest = await _context.Set<AmendmentRequest>()
                .Include(ar => ar.ReviewedByTl)
                .Include(ar => ar.ReviewedByDirector)
                .Where(ar => ar.TaskId == taskId)
                .OrderByDescending(ar => ar.CreatedAt)
                .FirstOrDefaultAsync();
            return amendmentRequest?.ReviewedByTl?.FullName ?? amendmentRequest?.ReviewedByDirector?.FullName;
        }

        private async Task<DateTime?> GetAmendmentReviewDateFromRequests(int taskId)
        {
            var amendmentRequest = await _context.Set<AmendmentRequest>()
                .Where(ar => ar.TaskId == taskId)
                .OrderByDescending(ar => ar.CreatedAt)
                .FirstOrDefaultAsync();
            return amendmentRequest?.TlReviewDate ?? amendmentRequest?.DirectorReviewDate;
        }

        #endregion

        [HttpGet]
        public async Task<ActionResult<IEnumerable<TaskAttachment>>> GetAttachments()
        {
            return await _context.TaskAttachments.ToListAsync();
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<TaskAttachment>> GetAttachment(int id)
        {
            var attachment = await _context.TaskAttachments.FindAsync(id);

            if (attachment == null)
            {
                return NotFound();
            }

            return attachment;
        }

        [HttpGet("task/{taskId}")]
        public async Task<ActionResult<IEnumerable<TaskAttachment>>> GetAttachmentsByTask(int taskId)
        {
            var attachments = await _context.TaskAttachments
                .Where(a => a.TaskId == taskId)
                .ToListAsync();

            return Ok(attachments);
        }

        [HttpPost]
        public async Task<ActionResult<TaskAttachment>> PostAttachment(TaskAttachment attachment)
        {
            _context.TaskAttachments.Add(attachment);
            await _context.SaveChangesAsync();

            return CreatedAtAction("GetAttachment", new { id = attachment.AttachmentId }, attachment);
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> PutAttachment(int id, TaskAttachment attachment)
        {
            if (id != attachment.AttachmentId)
            {
                return BadRequest();
            }

            _context.Entry(attachment).State = EntityState.Modified;

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException)
            {
                if (!AttachmentExists(id))
                {
                    return NotFound();
                }
                else
                {
                    throw;
                }
            }

            return NoContent();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteAttachment(int id)
        {
            var attachment = await _context.TaskAttachments.FindAsync(id);
            if (attachment == null)
            {
                return NotFound();
            }

            _context.TaskAttachments.Remove(attachment);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        [HttpPost("upload")]
        public async Task<IActionResult> UploadFile(IFormFile file, [FromForm] int taskId)
        {
            try
            {
                if (file == null || file.Length == 0)
                {
                    return BadRequest("No file uploaded");
                }

                var uploadsPath = Path.Combine(_environment.ContentRootPath, "uploads");
                if (!Directory.Exists(uploadsPath))
                {
                    Directory.CreateDirectory(uploadsPath);
                }

                var fileName = $"{Guid.NewGuid()}_{file.FileName}";
                var filePath = Path.Combine(uploadsPath, fileName);

                using (var stream = new FileStream(filePath, FileMode.Create))
                {
                    await file.CopyToAsync(stream);
                }

                var attachment = new TaskAttachment
                {
                    TaskId = taskId,
                    FileName = file.FileName,
                    FilePath = $"/uploads/{fileName}",
                    FileSize = file.Length,
                    FileType = file.ContentType,
                    UploadedAt = DateTime.UtcNow,
                    UploadedBy = 1
                };

                _context.TaskAttachments.Add(attachment);
                await _context.SaveChangesAsync();

                return Ok(attachment);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error uploading file");
                return StatusCode(500, "Error uploading file");
            }
        }

        [HttpGet("download/{id}")]
        public async Task<IActionResult> DownloadFile(int id)
        {
            try
            {
                var attachment = await _context.TaskAttachments.FindAsync(id);
                if (attachment == null)
                {
                    _logger.LogWarning($"[DOWNLOAD] Attachment {id} not found in database");
                    return NotFound("Attachment not found");
                }

                _logger.LogInformation($"[DOWNLOAD] Attempting to download: {attachment.FileName} (ID: {id})");
                _logger.LogInformation($"[DOWNLOAD] Stored path: {attachment.FilePath}");

                var actualFilePath = FindActualFile(attachment.FilePath, attachment.FileName);

                if (actualFilePath == null)
                {
                    _logger.LogError($"[DOWNLOAD] File not found for attachment {id}: {attachment.FileName}");
                    return NotFound($"Physical file not found: {attachment.FileName}");
                }

                _logger.LogInformation($"[DOWNLOAD] Found file at: {actualFilePath}");

                var fileBytes = await System.IO.File.ReadAllBytesAsync(actualFilePath);
                var contentType = attachment.FileType ?? "application/octet-stream";

                return File(fileBytes, contentType, attachment.FileName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"[DOWNLOAD] Error downloading file {id}");
                return StatusCode(500, "Error downloading file");
            }
        }

        private string? FindActualFile(string storedPath, string fileName)
        {
            var searchPaths = new List<string>
            {
                "/workspace/uploads/CMT Eng Task Management/CMT.Web.Api/uploads",
                "/workspace/uploads/CMT Eng Task Management/CMT.Frontend/public/uploads",
                "/workspace/uploads"
            };

            foreach (var basePath in searchPaths)
            {
                if (!Directory.Exists(basePath)) continue;

                if (!string.IsNullOrEmpty(storedPath))
                {
                    var normalizedPath = storedPath.TrimStart('/', '\\');
                    if (normalizedPath.StartsWith("uploads/"))
                    {
                        normalizedPath = normalizedPath.Substring(8);
                    }

                    var fullPath = Path.Combine(basePath, normalizedPath);
                    if (System.IO.File.Exists(fullPath) && new System.IO.FileInfo(fullPath).Length > 0)
                    {
                        _logger.LogInformation($"[FIND-FILE] Found at stored path: {fullPath}");
                        return fullPath;
                    }
                }

                var fileNamePath = Path.Combine(basePath, Path.GetFileName(fileName));
                if (System.IO.File.Exists(fileNamePath) && new System.IO.FileInfo(fileNamePath).Length > 0)
                {
                    _logger.LogInformation($"[FIND-FILE] Found by filename: {fileNamePath}");
                    return fileNamePath;
                }
            }

            _logger.LogWarning($"[FIND-FILE] File not found in any location: {fileName}");
            return null;
        }

        private bool AttachmentExists(int id)
        {
            return _context.TaskAttachments.Any(e => e.AttachmentId == id);
        }
    }
}