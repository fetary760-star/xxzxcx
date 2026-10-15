using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CMT.Application.SelfEvaluation.Services;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;

namespace CMT.Web.Api.SelfEvaluation.Controllers
{
    // =========================================================================
    // REQUEST / RESPONSE CONTRACTS
    // =========================================================================

    /// <summary>
    /// Body of POST taskcard-proxy/fetch-and-store.
    /// </summary>
    public class FetchTaskCardRequest
    {
        /// <summary>ATA record whose Documentation section owns the card. Required.</summary>
        public Guid ATARecordId { get; set; }

        /// <summary>
        /// ATA code typed into "Task Definition Code:" (aTaskCd). Optional — falls back to
        /// the ATA record's ATAChapterCode when omitted.
        /// </summary>
        public string? AtaCode { get; set; }

        /// <summary>Part Number. Optional — falls back to the ATA record's PartNumber.</summary>
        public string? PartNumber { get; set; }

        /// <summary>
        /// A specific task definition URL taken from the search results. When omitted the
        /// DTC-JIC entry is selected automatically (documented flow).
        /// </summary>
        public string? TaskDefinitionUrl { get; set; }

        public string? TaskDefinitionCode { get; set; }
        public string? TaskDefinitionName { get; set; }
        public string? Remarks { get; set; }
    }

    /// <summary>One stored task card, as returned to the Task Card tab.</summary>
    public class TaskCardDocumentDto
    {
        public Guid Id { get; set; }
        public Guid ATARecordId { get; set; }
        public string PartNumber { get; set; } = string.Empty;
        public string ATAChapterCode { get; set; } = string.Empty;
        public string TaskCode { get; set; } = string.Empty;
        public string TaskDefinitionCode { get; set; } = string.Empty;
        public string TaskDefinitionName { get; set; } = string.Empty;
        public string TaskDefinitionUrl { get; set; } = string.Empty;
        public string SourcePdfUrl { get; set; } = string.Empty;
        public string SourceSystem { get; set; } = string.Empty;
        public string FileName { get; set; } = string.Empty;
        public string ContentType { get; set; } = string.Empty;
        public long FileSizeBytes { get; set; }
        public string RevisionNumber { get; set; } = string.Empty;
        public int Version { get; set; }
        public bool IsLatest { get; set; }
        public DateTime FetchedAt { get; set; }
        public string FetchedBy { get; set; } = string.Empty;

        /// <summary>Relative URL the frontend uses to open the stored PDF.</summary>
        public string DownloadUrl { get; set; } = string.Empty;
    }

    /// <summary>Stored task cards for one Part Number.</summary>
    public class TaskCardPartNumberGroupDto
    {
        public string PartNumber { get; set; } = string.Empty;
        public string ATAChapterCode { get; set; } = string.Empty;
        public int DocumentCount { get; set; }
        public List<TaskCardDocumentDto> Documents { get; set; } = new List<TaskCardDocumentDto>();
    }

    /// <summary>Envelope returned by POST fetch-and-store.</summary>
    public class FetchTaskCardResponse
    {
        public bool Success { get; set; }
        public bool AlreadyStored { get; set; }
        public TaskCardDocumentDto? Document { get; set; }
        public string? ErrorMessage { get; set; }
        public List<string> SearchSteps { get; set; } = new List<string>();
        public string? RawHtmlSnippet { get; set; }
    }

    // =========================================================================
    // CONTROLLER
    // =========================================================================

    /// <summary>
    /// TaskCardProxyController — Task Card counterpart of <see cref="CMMProxyController"/>.
    ///
    /// The Documentation section's "TASK CARD" tab talks only to this controller. It never
    /// reaches svdcmpa01 directly, because that host is intranet-only and the MaintainX
    /// credentials must stay server-side.
    ///
    /// Endpoints
    /// ---------
    ///   GET  search?ataCode=25-35-10&amp;partNumber=...   Task Definition Search results
    ///   POST fetch-and-store                             Download the PDF and persist it
    ///   GET  documents?ataRecordId=...|partNumber=...     Stored cards grouped by P/N
    ///   GET  documents/{id}/pdf                          Stream one stored PDF
    ///   GET  pdf?url=...                                 Live pass-through of a MaintainX PDF
    ///
    /// Reproduced MaintainX flow (implemented in MaintainXExternalService):
    ///   login.jsp → Shop Technician → Task Definition Search (aTaskCd = ATA code)
    ///   → DTC-JIC task definition → Preview Task Cards → PDF
    /// </summary>
    [ApiController]
    [Route("api/self-evaluation/taskcard-proxy")]
    [Authorize]
    public class TaskCardProxyController : ControllerBase
    {
        private readonly IMaintainXExternalService _maintainXService;
        private readonly ApplicationDbContext _context;
        private readonly ILogger<TaskCardProxyController> _logger;
        private readonly string _storageBasePath;

        public TaskCardProxyController(
            IMaintainXExternalService maintainXService,
            ApplicationDbContext context,
            IConfiguration configuration,
            ILogger<TaskCardProxyController> logger)
        {
            _maintainXService = maintainXService;
            _context = context;
            _logger = logger;
            _storageBasePath = configuration["TaskCardStorage:BasePath"]
                               ?? configuration["FileStorage:BasePath"]
                               ?? "uploads/task-cards";
        }

        // =====================================================================
        // SEARCH
        // =====================================================================

        /// <summary>
        /// Searches MaintainX for the task definitions of an ATA code, exactly as the
        /// documented flow does, and returns the DTC-JIC entry as the primary item.
        /// </summary>
        [HttpGet("search")]
        public async Task<IActionResult> SearchTaskCards(
            [FromQuery] string? ataCode,
            [FromQuery] string? partNumber,
            [FromQuery] Guid? ataRecordId)
        {
            // The ATA code drives the search box; fall back to the ATA record when the
            // caller did not type one in.
            var effectiveAta = ataCode ?? string.Empty;
            var effectivePn = partNumber ?? string.Empty;

            if (ataRecordId.HasValue && ataRecordId.Value != Guid.Empty &&
                (string.IsNullOrWhiteSpace(effectiveAta) || string.IsNullOrWhiteSpace(effectivePn)))
            {
                var record = await _context.ATARecords
                    .AsNoTracking()
                    .FirstOrDefaultAsync(r => r.Id == ataRecordId.Value);

                if (record != null)
                {
                    if (string.IsNullOrWhiteSpace(effectiveAta)) effectiveAta = record.ATAChapterCode;
                    if (string.IsNullOrWhiteSpace(effectivePn)) effectivePn = record.PartNumber;
                }
            }

            if (string.IsNullOrWhiteSpace(effectiveAta))
            {
                return BadRequest(new TaskCardSearchResult
                {
                    Found = false,
                    PartNumber = effectivePn,
                    ErrorMessage = "An ATA / Task Definition Code is required (e.g. 25-35-10 or 253510)."
                });
            }

            _logger.LogInformation(
                "TaskCard Proxy Search: ATA={ATA}, PN={PN}, User={User}",
                effectiveAta, effectivePn, User.Identity?.Name ?? "unknown");

            var result = await _maintainXService.SearchTaskCards(effectiveAta, effectivePn);

            _logger.LogInformation(
                "TaskCard Proxy Result: Found={Found}, Items={Items}, Primary={Primary}",
                result.Found, result.Items.Count, result.PrimaryItem?.TaskDefinitionCode ?? "n/a");

            return Ok(result);
        }

        // =====================================================================
        // FETCH AND STORE
        // =====================================================================

        /// <summary>
        /// Runs the MaintainX flow, downloads the task card PDF behind "Preview Task Cards"
        /// and stores it under the Part Number of the ATA record.
        /// Re-fetching an unchanged document does not create a duplicate revision row.
        /// </summary>
        [HttpPost("fetch-and-store")]
        public async Task<IActionResult> FetchAndStore([FromBody] FetchTaskCardRequest request)
        {
            if (request == null || request.ATARecordId == Guid.Empty)
            {
                return BadRequest(new FetchTaskCardResponse
                {
                    Success = false,
                    ErrorMessage = "ATARecordId is required so the task card can be filed under the correct P/N."
                });
            }

            var record = await _context.ATARecords
                .FirstOrDefaultAsync(r => r.Id == request.ATARecordId);

            if (record == null)
            {
                return NotFound(new FetchTaskCardResponse
                {
                    Success = false,
                    ErrorMessage = $"ATA record {request.ATARecordId} was not found."
                });
            }

            var partNumber = string.IsNullOrWhiteSpace(request.PartNumber)
                ? record.PartNumber
                : request.PartNumber!;
            var ataCode = string.IsNullOrWhiteSpace(request.AtaCode)
                ? record.ATAChapterCode
                : request.AtaCode!;

            if (string.IsNullOrWhiteSpace(ataCode))
            {
                return BadRequest(new FetchTaskCardResponse
                {
                    Success = false,
                    ErrorMessage = "No ATA / Task Definition Code available for this record. Enter one in the Task Card tab."
                });
            }

            _logger.LogInformation(
                "TaskCard fetch-and-store: ATA={ATA}, PN={PN}, Url={Url}, User={User}",
                ataCode, partNumber, request.TaskDefinitionUrl ?? "auto (DTC-JIC)",
                User.Identity?.Name ?? "unknown");

            // Either follow the exact task definition the user picked, or let the service
            // select the DTC-JIC entry from the search results.
            var pdf = string.IsNullOrWhiteSpace(request.TaskDefinitionUrl)
                ? await _maintainXService.FetchPrimaryTaskCardPdf(ataCode, partNumber)
                : await _maintainXService.DownloadTaskCardPdf(request.TaskDefinitionUrl!);

            if (!pdf.Success || pdf.Content == null || pdf.Content.Length == 0)
            {
                return Ok(new FetchTaskCardResponse
                {
                    Success = false,
                    ErrorMessage = pdf.ErrorMessage ?? "MaintainX did not return a task card PDF.",
                    SearchSteps = pdf.SearchSteps,
                    RawHtmlSnippet = pdf.RawHtmlSnippet
                });
            }

            var taskDefinitionCode = FirstNonEmpty(
                pdf.TaskDefinitionCode, request.TaskDefinitionCode, "TASKCARD");
            var taskDefinitionName = FirstNonEmpty(
                pdf.TaskDefinitionName, request.TaskDefinitionName, string.Empty);

            var sha256 = ComputeSha256(pdf.Content);

            // ----- De-duplicate: identical bytes for the same P/N + task definition -----
            var existingLatest = await _context.TaskCardDocuments
                .FirstOrDefaultAsync(d =>
                    d.PartNumber == partNumber &&
                    d.TaskDefinitionCode == taskDefinitionCode &&
                    d.IsLatest);

            if (existingLatest != null && existingLatest.FileSha256 == sha256)
            {
                _logger.LogInformation(
                    "TaskCard unchanged for PN={PN}, Code={Code}; keeping version {Version}.",
                    partNumber, taskDefinitionCode, existingLatest.Version);

                return Ok(new FetchTaskCardResponse
                {
                    Success = true,
                    AlreadyStored = true,
                    Document = ToDto(existingLatest),
                    SearchSteps = pdf.SearchSteps
                });
            }

            // ----- Persist the bytes on disk (the database only keeps the path) -----
            var version = existingLatest?.Version + 1 ?? 1;
            var safePartNumber = Sanitize(partNumber, "PN");
            var safeCode = Sanitize(taskDefinitionCode, "TASKCARD");
            var relativePath = Path.Combine(
                _storageBasePath,
                safePartNumber,
                $"{safeCode}_v{version}_{DateTime.UtcNow:yyyyMMddHHmmss}.pdf");
            var fullPath = Path.Combine(Directory.GetCurrentDirectory(), relativePath);

            Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
            await System.IO.File.WriteAllBytesAsync(fullPath, pdf.Content);

            // ----- Older rows become revision history -----
            if (existingLatest != null)
            {
                existingLatest.IsLatest = false;
                existingLatest.UpdatedAt = DateTime.UtcNow;
                existingLatest.UpdatedBy = User.Identity?.Name ?? "system";
            }

            var document = new TaskCardDocument
            {
                Id = Guid.NewGuid(),
                ATARecordId = record.Id,
                ShopId = record.ShopId,
                PartNumber = Truncate(partNumber, 100),
                ATAChapterCode = Truncate(ataCode, 20),
                TaskCode = Truncate(DigitsOnly(ataCode), 50),
                TaskDefinitionCode = Truncate(taskDefinitionCode, 200),
                TaskDefinitionName = Truncate(taskDefinitionName, 500),
                TaskDefinitionUrl = Truncate(pdf.TaskDefinitionUrl, 1000),
                SourcePdfUrl = Truncate(pdf.SourceUrl, 1000),
                SourceSystem = "MaintainX",
                FileName = Truncate(pdf.FileName, 500),
                ContentType = "application/pdf",
                StoragePath = Truncate(relativePath.Replace('\\', '/'), 1000),
                FileSizeBytes = pdf.Content.Length,
                FileSha256 = sha256,
                RevisionNumber = Truncate(pdf.RevisionNumber, 100),
                Version = version,
                IsLatest = true,
                IsActive = true,
                Remarks = Truncate(request.Remarks ?? string.Empty, 1000),
                FetchedAt = DateTime.UtcNow,
                FetchedBy = Truncate(User.Identity?.Name ?? "system", 200),
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                CreatedBy = Truncate(User.Identity?.Name ?? "system", 200),
                UpdatedBy = Truncate(User.Identity?.Name ?? "system", 200)
            };

            _context.TaskCardDocuments.Add(document);
            await _context.SaveChangesAsync();

            _logger.LogInformation(
                "TaskCard stored: PN={PN}, Code={Code}, v{Version}, {Bytes} bytes at {Path}",
                partNumber, taskDefinitionCode, version, pdf.Content.Length, relativePath);

            return Ok(new FetchTaskCardResponse
            {
                Success = true,
                AlreadyStored = false,
                Document = ToDto(document),
                SearchSteps = pdf.SearchSteps
            });
        }

        // =====================================================================
        // STORED DOCUMENTS
        // =====================================================================

        /// <summary>
        /// Lists the stored task cards grouped by Part Number, which is how the Task Card
        /// tab renders them (same layout as the CMM Revision tab).
        /// </summary>
        [HttpGet("documents")]
        public async Task<IActionResult> GetDocuments(
            [FromQuery] Guid? ataRecordId,
            [FromQuery] string? partNumber,
            [FromQuery] bool latestOnly = false)
        {
            var query = _context.TaskCardDocuments.AsNoTracking().Where(d => d.IsActive);

            if (ataRecordId.HasValue && ataRecordId.Value != Guid.Empty)
                query = query.Where(d => d.ATARecordId == ataRecordId.Value);

            if (!string.IsNullOrWhiteSpace(partNumber))
                query = query.Where(d => d.PartNumber == partNumber);

            if (latestOnly)
                query = query.Where(d => d.IsLatest);

            var documents = await query
                .OrderBy(d => d.PartNumber)
                .ThenBy(d => d.TaskDefinitionCode)
                .ThenByDescending(d => d.Version)
                .ToListAsync();

            var groups = documents
                .GroupBy(d => d.PartNumber)
                .Select(g => new TaskCardPartNumberGroupDto
                {
                    PartNumber = g.Key,
                    ATAChapterCode = g.Select(d => d.ATAChapterCode)
                                      .FirstOrDefault(c => !string.IsNullOrWhiteSpace(c)) ?? string.Empty,
                    DocumentCount = g.Count(),
                    Documents = g.Select(ToDto).ToList()
                })
                .OrderBy(g => g.PartNumber)
                .ToList();

            return Ok(new
            {
                totalDocuments = documents.Count,
                groups
            });
        }

        /// <summary>Streams one stored task card PDF back to the browser.</summary>
        [HttpGet("documents/{id:guid}/pdf")]
        public async Task<IActionResult> GetDocumentPdf(Guid id)
        {
            var document = await _context.TaskCardDocuments
                .AsNoTracking()
                .FirstOrDefaultAsync(d => d.Id == id);

            if (document == null)
                return NotFound(new { message = "Task card not found." });

            var fullPath = Path.Combine(Directory.GetCurrentDirectory(), document.StoragePath);
            if (!System.IO.File.Exists(fullPath))
            {
                _logger.LogWarning("Stored task card missing on disk: {Path}", document.StoragePath);
                return NotFound(new { message = "The stored task card file is missing on the server." });
            }

            var bytes = await System.IO.File.ReadAllBytesAsync(fullPath);
            return File(bytes, string.IsNullOrWhiteSpace(document.ContentType)
                ? "application/pdf"
                : document.ContentType, document.FileName);
        }

        /// <summary>
        /// Soft-deletes a stored task card (kept for auditability, hidden from the tab).
        /// </summary>
        [HttpDelete("documents/{id:guid}")]
        public async Task<IActionResult> DeleteDocument(Guid id)
        {
            var document = await _context.TaskCardDocuments.FirstOrDefaultAsync(d => d.Id == id);
            if (document == null)
                return NotFound(new { message = "Task card not found." });

            document.IsActive = false;
            document.IsLatest = false;
            document.UpdatedAt = DateTime.UtcNow;
            document.UpdatedBy = User.Identity?.Name ?? "system";
            await _context.SaveChangesAsync();

            return Ok(new { success = true });
        }

        /// <summary>
        /// Live pass-through of a MaintainX PDF URL, used when the user wants to view the
        /// source document without storing it. Mirrors CMMProxyController.GetPdf.
        /// </summary>
        [HttpGet("pdf")]
        public async Task<IActionResult> GetPdf([FromQuery] string taskDefinitionUrl)
        {
            if (string.IsNullOrWhiteSpace(taskDefinitionUrl))
                return BadRequest(new { message = "taskDefinitionUrl is required." });

            var pdf = await _maintainXService.DownloadTaskCardPdf(taskDefinitionUrl);

            if (!pdf.Success || pdf.Content == null)
            {
                return StatusCode(502, new
                {
                    message = pdf.ErrorMessage ?? "Could not retrieve the task card PDF from MaintainX.",
                    searchSteps = pdf.SearchSteps
                });
            }

            return File(pdf.Content, "application/pdf", pdf.FileName);
        }

        /// <summary>Diagnostic endpoint mirroring the CMM proxy's test-connection.</summary>
        [HttpGet("test-connection")]
        [AllowAnonymous]
        public async Task<IActionResult> TestConnection([FromQuery] string ataCode = "253510")
        {
            var result = await _maintainXService.SearchTaskCards(ataCode, string.Empty);
            return Ok(new
            {
                testAtaCode = ataCode,
                result,
                timestamp = DateTime.UtcNow
            });
        }

        // =====================================================================
        // HELPERS
        // =====================================================================

        private TaskCardDocumentDto ToDto(TaskCardDocument d) => new TaskCardDocumentDto
        {
            Id = d.Id,
            ATARecordId = d.ATARecordId,
            PartNumber = d.PartNumber,
            ATAChapterCode = d.ATAChapterCode,
            TaskCode = d.TaskCode,
            TaskDefinitionCode = d.TaskDefinitionCode,
            TaskDefinitionName = d.TaskDefinitionName,
            TaskDefinitionUrl = d.TaskDefinitionUrl,
            SourcePdfUrl = d.SourcePdfUrl,
            SourceSystem = d.SourceSystem,
            FileName = d.FileName,
            ContentType = d.ContentType,
            FileSizeBytes = d.FileSizeBytes,
            RevisionNumber = d.RevisionNumber,
            Version = d.Version,
            IsLatest = d.IsLatest,
            FetchedAt = d.FetchedAt,
            FetchedBy = d.FetchedBy,
            DownloadUrl = $"/api/self-evaluation/taskcard-proxy/documents/{d.Id}/pdf"
        };

        private static string ComputeSha256(byte[] bytes)
        {
            using var sha = SHA256.Create();
            return Convert.ToHexString(sha.ComputeHash(bytes)).ToLowerInvariant();
        }

        private static string FirstNonEmpty(params string?[] values)
        {
            foreach (var value in values)
            {
                if (!string.IsNullOrWhiteSpace(value)) return value!.Trim();
            }
            return string.Empty;
        }

        private static string DigitsOnly(string? value) =>
            string.IsNullOrWhiteSpace(value)
                ? string.Empty
                : new string(value.Where(char.IsDigit).ToArray());

        private static string Sanitize(string? value, string fallback)
        {
            if (string.IsNullOrWhiteSpace(value)) return fallback;
            var cleaned = new string(value
                .Select(c => char.IsLetterOrDigit(c) || c == '-' || c == '_' ? c : '_')
                .ToArray()).Trim('_');
            return string.IsNullOrWhiteSpace(cleaned) ? fallback : Truncate(cleaned, 80);
        }

        private static string Truncate(string? value, int max)
        {
            if (string.IsNullOrEmpty(value)) return string.Empty;
            return value.Length <= max ? value : value.Substring(0, max);
        }
    }
}