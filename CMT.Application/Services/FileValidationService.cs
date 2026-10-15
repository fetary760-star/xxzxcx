using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using System.Text;

namespace CMT.Application.Services
{
    /// <summary>
    /// Service for validating uploaded files to prevent malicious uploads
    /// </summary>
    public interface IFileValidationService
    {
        Task<FileValidationResult> ValidateFileAsync(IFormFile file);
        bool IsAllowedFileType(string fileName);
        Task<string> GetActualMimeTypeAsync(IFormFile file);
    }

    public class FileValidationResult
    {
        public bool IsValid { get; set; }
        public string? ErrorMessage { get; set; }
        public string? DetectedMimeType { get; set; }
        public List<string> Warnings { get; set; } = new();
    }

    public class FileValidationService : IFileValidationService
    {
        private readonly ILogger<FileValidationService> _logger;

        // Allowed file extensions with their corresponding MIME types
        private readonly Dictionary<string, List<string>> _allowedFileTypes = new()
        {
            { ".pdf", new List<string> { "application/pdf" } },
            { ".jpg", new List<string> { "image/jpeg", "image/jpg" } },
            { ".jpeg", new List<string> { "image/jpeg", "image/jpg" } },
            { ".png", new List<string> { "image/png" } }
        };

        // File signatures (magic numbers) for validation
        private readonly Dictionary<string, byte[][]> _fileSignatures = new()
        {
            { ".pdf", new[] { new byte[] { 0x25, 0x50, 0x44, 0x46 } } }, // %PDF
            { ".jpg", new[] { new byte[] { 0xFF, 0xD8, 0xFF } } }, // JPEG
            { ".jpeg", new[] { new byte[] { 0xFF, 0xD8, 0xFF } } }, // JPEG
            { ".png", new[] { new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A } } } // PNG
        };

        private const long MaxFileSize = 5 * 1024 * 1024; // 5MB
        private const int SignatureCheckBytes = 8; // Read first 8 bytes for signature check

        public FileValidationService(ILogger<FileValidationService> logger)
        {
            _logger = logger;
        }

        /// <summary>
        /// Comprehensive file validation including extension, MIME type, and file signature
        /// </summary>
        public async Task<FileValidationResult> ValidateFileAsync(IFormFile file)
        {
            var result = new FileValidationResult { IsValid = false };

            try
            {
                // 1. Check if file exists
                if (file == null || file.Length == 0)
                {
                    result.ErrorMessage = "No file provided or file is empty";
                    return result;
                }

                // 2. Check file size
                if (file.Length > MaxFileSize)
                {
                    result.ErrorMessage = $"File size exceeds maximum limit of {MaxFileSize / (1024 * 1024)}MB";
                    return result;
                }

                // 3. Validate file extension
                var fileExtension = Path.GetExtension(file.FileName).ToLowerInvariant();
                if (string.IsNullOrEmpty(fileExtension) || !_allowedFileTypes.ContainsKey(fileExtension))
                {
                    result.ErrorMessage = $"File type '{fileExtension}' is not allowed. Allowed types: {string.Join(", ", _allowedFileTypes.Keys)}";
                    return result;
                }

                // 4. Validate MIME type from Content-Type header
                var contentType = file.ContentType?.ToLowerInvariant();
                if (string.IsNullOrEmpty(contentType))
                {
                    result.ErrorMessage = "File content type is missing";
                    return result;
                }

                var allowedMimeTypes = _allowedFileTypes[fileExtension];
                if (!allowedMimeTypes.Any(mt => contentType.Contains(mt)))
                {
                    result.ErrorMessage = $"Content type '{contentType}' does not match file extension '{fileExtension}'";
                    return result;
                }

                // 5. Validate file signature (magic numbers)
                var isValidSignature = await ValidateFileSignatureAsync(file, fileExtension);
                if (!isValidSignature)
                {
                    result.ErrorMessage = $"File signature validation failed. The file content does not match the extension '{fileExtension}'";
                    return result;
                }

                // 6. Additional content validation
                var actualMimeType = await GetActualMimeTypeAsync(file);
                result.DetectedMimeType = actualMimeType;

                // 7. Check for suspicious content
                var suspiciousContentCheck = await CheckForSuspiciousContentAsync(file);
                if (!suspiciousContentCheck.IsClean)
                {
                    result.ErrorMessage = suspiciousContentCheck.Reason;
                    return result;
                }

                // All validations passed
                result.IsValid = true;
                _logger.LogInformation($"File validation passed for: {file.FileName} (Size: {file.Length} bytes, Type: {actualMimeType})");

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error validating file: {file?.FileName}");
                result.ErrorMessage = "An error occurred during file validation";
                return result;
            }
        }

        /// <summary>
        /// Check if file type is allowed based on extension
        /// </summary>
        public bool IsAllowedFileType(string fileName)
        {
            var extension = Path.GetExtension(fileName).ToLowerInvariant();
            return _allowedFileTypes.ContainsKey(extension);
        }

        /// <summary>
        /// Get actual MIME type by reading file content
        /// </summary>
        public async Task<string> GetActualMimeTypeAsync(IFormFile file)
        {
            try
            {
                using var stream = file.OpenReadStream();
                var buffer = new byte[SignatureCheckBytes];
                await stream.ReadAsync(buffer, 0, SignatureCheckBytes);

                // Check against known signatures
                if (buffer.Length >= 4 && buffer[0] == 0x25 && buffer[1] == 0x50 && buffer[2] == 0x44 && buffer[3] == 0x46)
                    return "application/pdf";

                if (buffer.Length >= 3 && buffer[0] == 0xFF && buffer[1] == 0xD8 && buffer[2] == 0xFF)
                    return "image/jpeg";

                if (buffer.Length >= 8 && buffer[0] == 0x89 && buffer[1] == 0x50 && buffer[2] == 0x4E && buffer[3] == 0x47)
                    return "image/png";

                return "application/octet-stream";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error detecting MIME type");
                return "application/octet-stream";
            }
        }

        /// <summary>
        /// Validate file signature (magic numbers) against expected values
        /// </summary>
        private async Task<bool> ValidateFileSignatureAsync(IFormFile file, string extension)
        {
            try
            {
                if (!_fileSignatures.ContainsKey(extension))
                {
                    _logger.LogWarning($"No signature defined for extension: {extension}");
                    return true; // Allow if no signature defined
                }

                using var stream = file.OpenReadStream();
                var headerBytes = new byte[SignatureCheckBytes];
                var bytesRead = await stream.ReadAsync(headerBytes, 0, SignatureCheckBytes);

                if (bytesRead < 1)
                {
                    _logger.LogWarning("Could not read file header bytes");
                    return false;
                }

                var signatures = _fileSignatures[extension];
                foreach (var signature in signatures)
                {
                    if (headerBytes.Take(signature.Length).SequenceEqual(signature))
                    {
                        return true;
                    }
                }

                _logger.LogWarning($"File signature mismatch for {file.FileName}. Expected: {extension}");
                return false;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error validating file signature");
                return false;
            }
        }

        /// <summary>
        /// Check for suspicious content patterns
        /// </summary>
        private async Task<(bool IsClean, string? Reason)> CheckForSuspiciousContentAsync(IFormFile file)
        {
            try
            {
                // Check for double extensions (e.g., file.pdf.exe)
                var fileName = file.FileName.ToLowerInvariant();
                var suspiciousExtensions = new[] { ".exe", ".bat", ".cmd", ".sh", ".ps1", ".vbs", ".js", ".jar", ".app", ".deb", ".rpm" };
                
                if (suspiciousExtensions.Any(ext => fileName.Contains(ext)))
                {
                    return (false, "File name contains suspicious executable extension");
                }

                // Check for null bytes in filename (path traversal attempt)
                if (fileName.Contains('\0'))
                {
                    return (false, "File name contains null bytes");
                }

                // Check for path traversal attempts
                if (fileName.Contains("..") || fileName.Contains("/") || fileName.Contains("\\"))
                {
                    return (false, "File name contains path traversal characters");
                }

                // For image files, check for embedded scripts
                var extension = Path.GetExtension(fileName);
                if (extension == ".jpg" || extension == ".jpeg" || extension == ".png")
                {
                    using var stream = file.OpenReadStream();
                    var buffer = new byte[Math.Min(1024, file.Length)]; // Read first 1KB
                    await stream.ReadAsync(buffer, 0, buffer.Length);
                    
                    var content = Encoding.ASCII.GetString(buffer);
                    var suspiciousPatterns = new[] { "<script", "<?php", "<%", "javascript:", "vbscript:" };
                    
                    if (suspiciousPatterns.Any(pattern => content.Contains(pattern, StringComparison.OrdinalIgnoreCase)))
                    {
                        return (false, "Image file contains suspicious script content");
                    }
                }

                return (true, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking for suspicious content");
                return (false, "Error during content validation");
            }
        }
    }
}