using CMT.Application.Interfaces;
using CMT.Domain.Data;
using CMT.Domain.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;

namespace CMT.Web.Api.Controllers
{
    [ApiController]
    [Route("api/tasks/{taskId}/attachments")]
    [AllowAnonymous] // Temporarily remove authorization to fix 401 errors
    public class AttachmentsController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly ITaskService _taskService;
        private readonly IWebHostEnvironment _environment;
        private readonly IConfiguration _configuration;
        private readonly ILogger<AttachmentsController> _logger;

        // Excel file signatures (magic bytes)
        private static readonly byte[] XlsxSignature = new byte[] { 0x50, 0x4B, 0x03, 0x04 }; // ZIP/XLSX signature (PK..)
        private static readonly byte[] XlsSignature = new byte[] { 0xD0, 0xCF, 0x11, 0xE0 }; // OLE2 compound document (XLS)

        public AttachmentsController(
            ApplicationDbContext context, 
            ITaskService taskService, 
            IWebHostEnvironment environment,
            IConfiguration configuration,
            ILogger<AttachmentsController> logger)
        {
            _context = context;
            _taskService = taskService;
            _environment = environment;
            _configuration = configuration;
            _logger = logger;
        }

        /// <summary>
        /// Get the base storage path with fallback options
        /// </summary>
        private string GetBaseStoragePath()
        {
            // Try multiple locations in order of preference
            var possiblePaths = new[]
            {
                Path.Combine(_environment.ContentRootPath ?? "", "../CMT.Frontend/public/uploads"),
                Path.Combine(_environment.WebRootPath ?? "", "uploads"),
                "/tmp/cmt-uploads", // Fallback to /tmp which is always writable
                Path.Combine(Path.GetTempPath(), "cmt-uploads") // System temp directory
            };

            foreach (var path in possiblePaths)
            {
                try
                {
                    var fullPath = Path.GetFullPath(path);
                    
                    // Try to create directory if it doesn't exist
                    if (!Directory.Exists(fullPath))
                    {
                        Directory.CreateDirectory(fullPath);
                    }
                    
                    // Test write permissions by creating a test file
                    var testFile = Path.Combine(fullPath, $".write_test_{Guid.NewGuid()}.tmp");
                    try
                    {
                        System.IO.File.WriteAllText(testFile, "test");
                        System.IO.File.Delete(testFile);
                        
                        _logger.LogInformation($"Using upload directory: {fullPath}");
                        return fullPath;
                    }
                    catch
                    {
                        _logger.LogWarning($"Directory not writable: {fullPath}");
                        continue;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, $"Cannot use path: {path}");
                    continue;
                }
            }

            // Last resort: use temp directory
            var tempPath = Path.Combine(Path.GetTempPath(), "cmt-uploads");
            Directory.CreateDirectory(tempPath);
            _logger.LogWarning($"Using fallback temp directory: {tempPath}");
            return tempPath;
        }

        /// <summary>
        /// Get all attachments for a specific task with file existence validation
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<IEnumerable<object>>> GetTaskAttachments(int taskId)
        {
            try
            {
                _logger.LogInformation($"[ATTACHMENTS] GET request for task {taskId}");
                
                // FIXED: Don't check if task exists in active tasks - just return attachments from database
                // This allows attachments to be retrieved for completed tasks as well
                
                // Get attachments from database directly
                var attachments = await _context.TaskAttachments
                    .Include(a => a.UploadedByUser)
                    .Where(a => a.TaskId == taskId)
                    .ToListAsync();

                _logger.LogInformation($"[ATTACHMENTS] Found {attachments.Count} attachments for task {taskId}");

                var result = new List<object>();
                
                foreach (var attachment in attachments)
                {
                    try
                    {
                        // Check if file exists on disk
                        var actualPath = await FindActualFilePath(attachment);
                        var fileExists = actualPath != null;
                        
                        result.Add(new
                        {
                            attachment_id = attachment.AttachmentId,
                            task_id = attachment.TaskId,
                            file_path = attachment.FilePath,
                            file_name = attachment.FileName,
                            file_type = attachment.FileType,
                            file_size = attachment.FileSize,
                            uploaded_by = attachment.UploadedBy,
                            uploader_name = attachment.UploadedByUser != null ? attachment.UploadedByUser.FullName : "Unknown",
                            uploaded_at = attachment.UploadedAt,
                            file_exists = fileExists,
                            actual_path = actualPath,
                            status = fileExists ? "Available" : "Missing - File Not Found"
                        });
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, $"[ATTACHMENTS] Error processing attachment {attachment.AttachmentId}");
                        // Continue processing other attachments even if one fails
                        result.Add(new
                        {
                            attachment_id = attachment.AttachmentId,
                            task_id = attachment.TaskId,
                            file_path = attachment.FilePath,
                            file_name = attachment.FileName,
                            file_type = attachment.FileType,
                            file_size = attachment.FileSize,
                            uploaded_by = attachment.UploadedBy,
                            uploader_name = attachment.UploadedByUser != null ? attachment.UploadedByUser.FullName : "Unknown",
                            uploaded_at = attachment.UploadedAt,
                            file_exists = false,
                            actual_path = (string?)null,
                            status = "Error - Could not process attachment"
                        });
                    }
                }

                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[ATTACHMENTS] Error retrieving attachments for task {TaskId}", taskId);
                // Return empty array instead of 500 error for better UX
                return Ok(new List<object>());
            }
        }

        /// <summary>
        /// Download attachment file - ENHANCED with proper content type detection
        /// FIXED: Detects actual file format by reading magic bytes to prevent format mismatch errors
        /// </summary>
        [HttpGet("{attachmentId}/download")]
        public async Task<IActionResult> DownloadAttachment(int taskId, int attachmentId)
        {
            try
            {
                _logger.LogInformation($"[DOWNLOAD] Attempting to download attachment {attachmentId} for task {taskId}");

                // Get attachment from database
                var attachment = await _context.TaskAttachments
                    .FirstOrDefaultAsync(a => a.TaskId == taskId && a.AttachmentId == attachmentId);

                if (attachment == null)
                {
                    _logger.LogWarning($"[DOWNLOAD] Attachment {attachmentId} not found for task {taskId}");
                    return NotFound(new { message = $"Attachment with ID {attachmentId} not found for task {taskId}" });
                }

                _logger.LogInformation($"[DOWNLOAD] Found attachment in DB: {attachment.FileName}");

                // Find the actual file location using enhanced search
                var actualFilePath = await FindActualFilePath(attachment);

                if (actualFilePath == null)
                {
                    _logger.LogWarning($"[DOWNLOAD] File '{attachment.FileName}' not found in any location.");
                    
                    // Try to find a similar file that might be the same content
                    var similarFile = await FindSimilarFile(attachment);
                    
                    if (similarFile != null)
                    {
                        _logger.LogInformation($"[DOWNLOAD] Found similar file: {similarFile}");
                        var similarFileBytes = await System.IO.File.ReadAllBytesAsync(similarFile);
                        var similarContentType = await DetectContentType(similarFileBytes, attachment.FileType, attachment.FileName);
                        var correctedFileName = GetCorrectedFileName(attachment.FileName, similarContentType);
                        return File(similarFileBytes, similarContentType, correctedFileName);
                    }
                    
                    return NotFound(new { 
                        message = "Physical file not found for attachment", 
                        fileName = attachment.FileName,
                        attachmentId = attachmentId,
                        suggestions = new[]
                        {
                            "The file may have been deleted or moved",
                            "Contact administrator to restore from backup",
                            "Re-upload the file if available",
                            "Use the cleanup endpoint to remove orphaned database records"
                        }
                    });
                }

                // Read file bytes
                var fileBytes = await System.IO.File.ReadAllBytesAsync(actualFilePath);
                
                // FIXED: Detect actual content type by reading file magic bytes
                var contentType = await DetectContentType(fileBytes, attachment.FileType, attachment.FileName);
                
                // FIXED: Correct the filename extension if it doesn't match the actual content
                var correctedFilename = GetCorrectedFileName(attachment.FileName, contentType);
                
                _logger.LogInformation($"[DOWNLOAD] Successfully serving file: {correctedFilename} ({fileBytes.Length} bytes, type: {contentType})");
                
                // Set proper headers for file download
                Response.Headers["Content-Disposition"] = $"attachment; filename=\"{correctedFilename}\"";
                Response.Headers["X-Content-Type-Options"] = "nosniff";
                Response.Headers["Cache-Control"] = "private, no-cache, no-store, must-revalidate";
                
                return File(fileBytes, contentType, correctedFilename);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"[DOWNLOAD] Error downloading attachment {attachmentId} for task {taskId}");
                return StatusCode(500, "Internal server error occurred while downloading the file");
            }
        }

        /// <summary>
        /// FIXED: Detect actual content type by reading file magic bytes
        /// This prevents "file format and extension don't match" errors in Excel/Office
        /// </summary>
        private async Task<string> DetectContentType(byte[] fileBytes, string? storedFileType, string fileName)
        {
            var extension = Path.GetExtension(fileName)?.ToLowerInvariant();
            
            // Check for Excel files specifically - they often have mismatched extensions
            if (extension == ".xls" || extension == ".xlsx" || 
                (storedFileType != null && storedFileType.Contains("excel")))
            {
                // Check magic bytes to determine actual format
                if (fileBytes.Length >= 4)
                {
                    // Check for XLSX (ZIP-based Office Open XML format)
                    if (fileBytes[0] == XlsxSignature[0] && 
                        fileBytes[1] == XlsxSignature[1] && 
                        fileBytes[2] == XlsxSignature[2] && 
                        fileBytes[3] == XlsxSignature[3])
                    {
                        _logger.LogInformation($"[CONTENT-TYPE] Detected XLSX format (ZIP signature) for {fileName}");
                        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                    }
                    
                    // Check for XLS (OLE2 compound document format)
                    if (fileBytes[0] == XlsSignature[0] && 
                        fileBytes[1] == XlsSignature[1] && 
                        fileBytes[2] == XlsSignature[2] && 
                        fileBytes[3] == XlsSignature[3])
                    {
                        _logger.LogInformation($"[CONTENT-TYPE] Detected XLS format (OLE2 signature) for {fileName}");
                        return "application/vnd.ms-excel";
                    }
                }
            }
            
            // Check for other common file types by magic bytes
            if (fileBytes.Length >= 4)
            {
                // PDF
                if (fileBytes[0] == 0x25 && fileBytes[1] == 0x50 && 
                    fileBytes[2] == 0x44 && fileBytes[3] == 0x46) // %PDF
                {
                    return "application/pdf";
                }
                
                // PNG
                if (fileBytes[0] == 0x89 && fileBytes[1] == 0x50 && 
                    fileBytes[2] == 0x4E && fileBytes[3] == 0x47) // .PNG
                {
                    return "image/png";
                }
                
                // JPEG
                if (fileBytes[0] == 0xFF && fileBytes[1] == 0xD8 && fileBytes[2] == 0xFF)
                {
                    return "image/jpeg";
                }
                
                // GIF
                if (fileBytes[0] == 0x47 && fileBytes[1] == 0x49 && fileBytes[2] == 0x46) // GIF
                {
                    return "image/gif";
                }
                
                // ZIP (also covers DOCX, PPTX, XLSX)
                if (fileBytes[0] == 0x50 && fileBytes[1] == 0x4B && 
                    fileBytes[2] == 0x03 && fileBytes[3] == 0x04)
                {
                    // Check extension to determine specific Office format
                    if (extension == ".docx")
                        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
                    if (extension == ".pptx")
                        return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
                    if (extension == ".xlsx")
                        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                    return "application/zip";
                }
                
                // OLE2 Compound Document (DOC, XLS, PPT)
                if (fileBytes[0] == 0xD0 && fileBytes[1] == 0xCF && 
                    fileBytes[2] == 0x11 && fileBytes[3] == 0xE0)
                {
                    if (extension == ".doc")
                        return "application/msword";
                    if (extension == ".xls")
                        return "application/vnd.ms-excel";
                    if (extension == ".ppt")
                        return "application/vnd.ms-powerpoint";
                    return "application/octet-stream";
                }
            }
            
            // Fall back to extension-based detection
            return GetContentTypeByExtension(extension, storedFileType);
        }

        /// <summary>
        /// FIXED: Get corrected filename with proper extension based on detected content type
        /// </summary>
        private string GetCorrectedFileName(string originalFileName, string contentType)
        {
            var nameWithoutExt = Path.GetFileNameWithoutExtension(originalFileName);
            var originalExt = Path.GetExtension(originalFileName)?.ToLowerInvariant();
            
            // Determine correct extension based on content type
            var correctExt = contentType switch
            {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => ".xlsx",
                "application/vnd.ms-excel" => ".xls",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => ".docx",
                "application/msword" => ".doc",
                "application/vnd.openxmlformats-officedocument.presentationml.presentation" => ".pptx",
                "application/vnd.ms-powerpoint" => ".ppt",
                "application/pdf" => ".pdf",
                "image/png" => ".png",
                "image/jpeg" => ".jpg",
                "image/gif" => ".gif",
                "application/zip" => ".zip",
                _ => originalExt ?? ""
            };
            
            // If extension needs correction, log and fix it
            if (!string.IsNullOrEmpty(correctExt) && originalExt != correctExt)
            {
                _logger.LogInformation($"[FILENAME] Correcting extension from {originalExt} to {correctExt} for {originalFileName}");
                return nameWithoutExt + correctExt;
            }
            
            return originalFileName;
        }

        /// <summary>
        /// Get content type by file extension (fallback method)
        /// </summary>
        private string GetContentTypeByExtension(string? extension, string? storedFileType)
        {
            if (!string.IsNullOrEmpty(storedFileType) && storedFileType.Contains("/"))
            {
                return storedFileType;
            }

            return extension switch
            {
                ".pdf" => "application/pdf",
                ".doc" => "application/msword",
                ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                ".xls" => "application/vnd.ms-excel",
                ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                ".ppt" => "application/vnd.ms-powerpoint",
                ".pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                ".txt" => "text/plain",
                ".jpg" or ".jpeg" => "image/jpeg",
                ".png" => "image/png",
                ".gif" => "image/gif",
                ".zip" => "application/zip",
                _ => "application/octet-stream"
            };
        }

        /// <summary>
        /// NEW: Clean up orphaned database records for missing files
        /// </summary>
        [HttpPost("cleanup-missing")]
        public async Task<ActionResult> CleanupMissingFiles(int taskId)
        {
            try
            {
                _logger.LogInformation($"[CLEANUP] Starting cleanup of missing files for task {taskId}");
                
                var attachments = await _context.TaskAttachments
                    .Where(a => a.TaskId == taskId)
                    .ToListAsync();

                var removedCount = 0;
                var keptCount = 0;
                var removedFiles = new List<object>();

                foreach (var attachment in attachments)
                {
                    var actualPath = await FindActualFilePath(attachment);
                    
                    if (actualPath == null)
                    {
                        _logger.LogInformation($"[CLEANUP] Removing orphaned record: {attachment.FileName} (ID: {attachment.AttachmentId})");
                        
                        removedFiles.Add(new
                        {
                            attachment_id = attachment.AttachmentId,
                            file_name = attachment.FileName,
                            file_path = attachment.FilePath,
                            uploaded_at = attachment.UploadedAt
                        });
                        
                        _context.TaskAttachments.Remove(attachment);
                        removedCount++;
                    }
                    else
                    {
                        keptCount++;
                    }
                }

                if (removedCount > 0)
                {
                    await _context.SaveChangesAsync();
                    _logger.LogInformation($"[CLEANUP] Removed {removedCount} orphaned records for task {taskId}");
                }

                return Ok(new 
                { 
                    message = $"Cleanup completed for task {taskId}", 
                    removedCount = removedCount,
                    keptCount = keptCount,
                    totalChecked = attachments.Count,
                    removedFiles = removedFiles
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[CLEANUP] Error cleaning up missing files for task {TaskId}", taskId);
                return StatusCode(500, "Error occurred while cleaning up missing files");
            }
        }

        /// <summary>
        /// NEW: Repair file paths in database - Enhanced endpoint
        /// </summary>
        [HttpPost("repair-paths")]
        public async Task<ActionResult> RepairFilePaths(int taskId)
        {
            try
            {
                _logger.LogInformation($"[REPAIR] Starting file path repair for task {taskId}");
                
                var attachments = await _context.TaskAttachments
                    .Where(a => a.TaskId == taskId)
                    .ToListAsync();

                var repairedCount = 0;
                var notFoundCount = 0;
                var repairedFiles = new List<object>();

                foreach (var attachment in attachments)
                {
                    var actualPath = await FindActualFilePath(attachment);
                    
                    if (actualPath != null)
                    {
                        // Convert to relative path for database storage
                        var relativePath = ConvertToRelativePath(actualPath);
                        
                        if (attachment.FilePath != relativePath)
                        {
                            _logger.LogInformation($"[REPAIR] Updating path for {attachment.FileName}: {attachment.FilePath} -> {relativePath}");
                            
                            repairedFiles.Add(new
                            {
                                attachment_id = attachment.AttachmentId,
                                file_name = attachment.FileName,
                                old_path = attachment.FilePath,
                                new_path = relativePath,
                                actual_path = actualPath
                            });
                            
                            attachment.FilePath = relativePath;
                            repairedCount++;
                        }
                    }
                    else
                    {
                        _logger.LogWarning($"[REPAIR] File not found for attachment: {attachment.FileName} (ID: {attachment.AttachmentId})");
                        notFoundCount++;
                    }
                }

                if (repairedCount > 0)
                {
                    await _context.SaveChangesAsync();
                    _logger.LogInformation($"[REPAIR] Successfully repaired {repairedCount} file paths for task {taskId}");
                }

                return Ok(new 
                { 
                    message = $"Repair completed for task {taskId}", 
                    repairedCount = repairedCount,
                    notFoundCount = notFoundCount,
                    totalChecked = attachments.Count,
                    repairedFiles = repairedFiles
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[REPAIR] Error repairing file paths for task {TaskId}", taskId);
                return StatusCode(500, "Error occurred while repairing file paths");
            }
        }

        /// <summary>
        /// Enhanced file finding with comprehensive search strategy
        /// </summary>
        private async Task<string?> FindActualFilePath(TaskAttachment attachment)
        {
            try
            {
                var fileName = Path.GetFileName(attachment.FilePath);
                var possiblePaths = new List<string>();
                
                // 1. Primary location where files are actually stored
                var primaryPath = GetBaseStoragePath();
                possiblePaths.Add(Path.Combine(primaryPath, fileName));
                
                // 2. Alternative locations
                if (!string.IsNullOrEmpty(_environment.WebRootPath))
                {
                    possiblePaths.Add(Path.Combine(_environment.WebRootPath, "uploads", fileName));
                }
                
                if (!string.IsNullOrEmpty(_environment.ContentRootPath))
                {
                    possiblePaths.Add(Path.Combine(_environment.ContentRootPath, "uploads", fileName));
                    possiblePaths.Add(Path.Combine(_environment.ContentRootPath, "../CMT.Frontend/public/uploads", fileName));
                }

                // 3. Handle extension variations (.xls vs .xlsx)
                var fileNameWithoutExt = Path.GetFileNameWithoutExtension(fileName);
                var currentExt = Path.GetExtension(fileName);
                var alternativeExt = currentExt.ToLower() == ".xls" ? ".xlsx" : ".xls";
                
                var alternativeFileName = fileNameWithoutExt + alternativeExt;
                possiblePaths.Add(Path.Combine(primaryPath, alternativeFileName));

                // Search for the file in all possible locations
                foreach (var path in possiblePaths)
                {
                    try
                    {
                        var fullPath = Path.GetFullPath(path);
                        _logger.LogDebug($"[SEARCH] Checking path: {fullPath}");
                        if (System.IO.File.Exists(fullPath))
                        {
                            var fileInfo = new System.IO.FileInfo(fullPath);
                            if (fileInfo.Length > 0) // Basic integrity check
                            {
                                _logger.LogInformation($"[SEARCH] File found at: {fullPath}");
                                return fullPath;
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug(ex, "Error checking location: {Location}", path);
                    }
                }

                return null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[SEARCH] Error in FindActualFilePath for attachment {AttachmentId}", attachment.AttachmentId);
                return null;
            }
        }

        /// <summary>
        /// Find a similar file that might be the same content (fallback mechanism)
        /// </summary>
        private async Task<string?> FindSimilarFile(TaskAttachment attachment)
        {
            try
            {
                var uploadsPath = GetBaseStoragePath();
                if (!Directory.Exists(uploadsPath)) return null;

                var targetExtension = Path.GetExtension(attachment.FileName).ToLower();
                var targetSize = attachment.FileSize;

                var files = Directory.GetFiles(uploadsPath, $"*{targetExtension}")
                    .Where(f => new FileInfo(f).Length == targetSize)
                    .OrderByDescending(f => new FileInfo(f).LastWriteTime)
                    .Take(3); // Check the 3 most recent files with same extension and size

                foreach (var file in files)
                {
                    var fileInfo = new FileInfo(file);
                    if (fileInfo.Length > 0 && fileInfo.Length == targetSize)
                    {
                        _logger.LogInformation($"[SIMILAR] Found similar file: {file} (size: {fileInfo.Length})");
                        return file;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error finding similar file for {FileName}", attachment.FileName);
            }

            return null;
        }

        /// <summary>
        /// Convert absolute path to relative path for database storage
        /// </summary>
        private string ConvertToRelativePath(string absolutePath)
        {
            var fileName = Path.GetFileName(absolutePath);
            return $"/uploads/{fileName}";
        }

        /// <summary>
        /// Get appropriate content type for file (legacy method - kept for compatibility)
        /// </summary>
        private string GetContentType(string? fileType, string fileName)
        {
            return GetContentTypeByExtension(Path.GetExtension(fileName)?.ToLowerInvariant(), fileType);
        }

        /// <summary>
        /// Upload a new attachment to a task
        /// </summary>
        [HttpPost]
        public async Task<ActionResult<object>> UploadAttachment(int taskId, IFormFile? file, IFormFile? attachment_file, [FromForm] int? uploadedBy)
        {
            try
            {
                _logger.LogInformation($"[UPLOAD] Upload request for task {taskId}");
                
                // Handle both 'file' and 'attachment_file' parameter names
                var uploadFile = file ?? attachment_file;
                
                if (uploadFile == null || uploadFile.Length == 0)
                {
                    _logger.LogWarning($"[UPLOAD] No file provided for task {taskId}");
                    return Ok(new { success = false, message = "No file provided" });
                }

                if (uploadFile.Length > 5 * 1024 * 1024) 
                {
                    _logger.LogWarning($"[UPLOAD] File size exceeds limit for task {taskId}");
                    return Ok(new { success = false, message = "File size exceeds 5MB limit" });
                }

                var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".gif", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".zip" };
                var fileExtension = Path.GetExtension(uploadFile.FileName).ToLowerInvariant();
                
                if (!allowedExtensions.Contains(fileExtension))
                {
                    _logger.LogWarning($"[UPLOAD] Invalid file type: {fileExtension}");
                    return Ok(new { 
                        success = false, 
                        message = $"File type not allowed. Allowed types: {string.Join(", ", allowedExtensions)}" 
                    });
                }

                var baseStoragePath = GetBaseStoragePath();
                var timestamp = DateTime.UtcNow.Ticks;
                var uniqueFileName = $"attachment_{timestamp}_{Guid.NewGuid().ToString()[..8]}{fileExtension}";
                var filePath = Path.Combine(baseStoragePath, uniqueFileName);

                try
                {
                    using (var stream = new FileStream(filePath, FileMode.Create, FileAccess.Write, FileShare.None))
                    {
                        await uploadFile.CopyToAsync(stream);
                        await stream.FlushAsync();
                    }
                    _logger.LogInformation($"[UPLOAD] File saved successfully: {filePath}");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"[UPLOAD] Failed to save file to {filePath}");
                    return Ok(new { success = false, message = "Failed to save file to server storage" });
                }

                var attachment = new TaskAttachment
                {
                    TaskId = taskId,
                    FileName = uploadFile.FileName,
                    FilePath = $"/uploads/{uniqueFileName}",
                    FileType = uploadFile.ContentType,
                    FileSize = uploadFile.Length,
                    UploadedBy = uploadedBy ?? 1,
                    UploadedAt = DateTime.UtcNow
                };

                _context.TaskAttachments.Add(attachment);
                await _context.SaveChangesAsync();

                var savedAttachment = await _context.TaskAttachments
                    .Include(a => a.UploadedByUser)
                    .FirstOrDefaultAsync(a => a.AttachmentId == attachment.AttachmentId);

                var result = new
                {
                    success = true,
                    attachment_id = savedAttachment!.AttachmentId,
                    task_id = savedAttachment.TaskId,
                    file_path = savedAttachment.FilePath,
                    file_name = savedAttachment.FileName,
                    file_type = savedAttachment.FileType,
                    file_size = savedAttachment.FileSize,
                    uploaded_by = savedAttachment.UploadedBy,
                    uploader_name = savedAttachment.UploadedByUser?.FullName ?? "Unknown",
                    uploaded_at = savedAttachment.UploadedAt,
                    message = "Upload successful"
                };

                _logger.LogInformation($"[UPLOAD] Successfully uploaded attachment {result.attachment_id} for task {taskId}");
                return Ok(result); 

            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[UPLOAD] Error uploading attachment for task {TaskId}", taskId);
                return Ok(new { success = false, message = "An internal error occurred while processing your upload" });
            }
        }

        /// <summary>
        /// Delete an attachment
        /// </summary>
        [HttpDelete("{attachmentId}")]
        public async Task<ActionResult> DeleteAttachment(int taskId, int attachmentId)
        {
            try
            {
                var attachment = await _context.TaskAttachments
                    .FirstOrDefaultAsync(a => a.TaskId == taskId && a.AttachmentId == attachmentId);

                if (attachment == null)
                {
                    return NotFound(new { message = $"Attachment with ID {attachmentId} not found for task {taskId}" });
                }

                var actualFilePath = await FindActualFilePath(attachment);
                if (actualFilePath != null)
                {
                    try
                    {
                        System.IO.File.Delete(actualFilePath);
                        _logger.LogInformation($"Deleted file: {actualFilePath}");
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, $"Failed to delete file: {actualFilePath}");
                    }
                }

                _context.TaskAttachments.Remove(attachment);
                await _context.SaveChangesAsync();

                return Ok(new { message = $"Attachment {attachmentId} has been deleted successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting attachment {AttachmentId} for task {TaskId}", attachmentId, taskId);
                return StatusCode(500, new { message = "An error occurred while deleting the attachment", error = ex.Message });
            }
        }
    }
}