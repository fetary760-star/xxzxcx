using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CMT.Application.SelfEvaluation.Contracts.Workflow;
using CMT.Application.SelfEvaluation.Services;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.Shared;
using CMT.Domain.Models.Workflow;
using User = CMT.Domain.Models.SelfEvaluation.User;

namespace CMT.Web.Api.SelfEvaluation.Controllers.SelfEvaluation
{
    // =====================================================================================
    // EvaluationFoldersController.cs   (NEW FILE)
    // Copy to: CMT.Web.Api.SelfEvaluation/Controllers/SelfEvaluation/EvaluationFoldersController.cs
    //
    // WHY THIS FILE EXISTS
    // --------------------
    // GET /api/evaluation-folders?pageSize=500 returned 404 because NO controller was
    // mapped to that prefix — the nearest match, TableOfContentController, lives under
    // /api/self-evaluation/table-of-content. The frontend route table (workflow-api.ts)
    // and the endpoint map of WorkflowApiContracts.cs both declare /api/evaluation-folders,
    // so this controller implements the READ surface on the contract path:
    //
    //     GET /api/evaluation-folders                             -> FolderSummaryResponse[]
    //     GET /api/evaluation-folders/{folderId}                  -> FolderDetailResponse
    //     GET /api/evaluation-folders/{folderId}/table-of-contents -> TableOfContentsResponse
    //     GET /api/evaluation-folders/{folderId}/progress          -> FolderProgressResponse
    //
    // The folder ENGINE transitions (create, update, sign-off, report, revisions,
    // competency / tool-equivalency matrices) are NOT part of this fix. They answer
    // 501 FOLDER_ENGINE_NOT_WIRED with an explicit message instead of a silent 404, so
    // the UI can surface a meaningful error until the engine handlers are wired.
    //
    // SHOP VISIBILITY mirrors WorkflowInboxQueryService: Admin / Director / Manager /
    // Special Team Leader see every shop; everyone else is restricted to their own shop.
    //
    // BINDING RULES: entity ids are Guid; every enum is also exposed as a string label.
    // =====================================================================================

    [ApiController]
    [Route("api/evaluation-folders")]
    [Authorize]
    public class EvaluationFoldersController : ControllerBase
    {
        private const string EngineNotWiredCode = "FOLDER_ENGINE_NOT_WIRED";

        /// <summary>Roles that legitimately see every shop (same set as the inbox service).</summary>
        private static readonly string[] SeesEveryShopRoles =
        {
            OrgRoles.Admin,
            OrgRoles.Director,
            OrgRoles.Manager,
            OrgRoles.SpecialTeamLeader
        };

        private readonly ApplicationDbContext _context;
        private readonly WorkflowInstanceQueryService _instances;
        private readonly ICurrentUserAccessor _currentUser;

        public EvaluationFoldersController(
            ApplicationDbContext context,
            WorkflowInstanceQueryService instances,
            ICurrentUserAccessor currentUser)
        {
            _context = context;
            _instances = instances;
            _currentUser = currentUser;
        }

        // =================================================================================
        // READ  -  GET /api/evaluation-folders  (the call the sidebar tracker makes)
        // =================================================================================

        [HttpGet]
        public async Task<IActionResult> List(
            [FromQuery] Guid? shopId,
            [FromQuery] Guid? departmentId,
            [FromQuery] string? ataChapter,
            [FromQuery] int? status,
            [FromQuery] string? search,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 100,
            CancellationToken cancellationToken = default)
        {
            var (user, failure) = await RequireUserAsync(cancellationToken);
            if (failure is not null) return failure;

            var canonicalRole = RoleHierarchy.Normalize(user!.Role);

            var query = _context.EvaluationFolders
                .AsNoTracking()
                .AsQueryable();

            // Shop scoping first, then the explicit filter on top.
            if (canonicalRole is null || !SeesEveryShopRoles.Contains(canonicalRole))
            {
                if (user.ShopId.HasValue)
                    query = query.Where(f => f.ShopId == user.ShopId.Value);
                else
                    query = query.Where(f => false); // no shop -> no rows (safe default)
            }

            if (shopId.HasValue)
                query = query.Where(f => f.ShopId == shopId.Value);

            if (departmentId.HasValue)
                query = query.Where(f => f.DepartmentId == departmentId.Value);

            if (!string.IsNullOrWhiteSpace(ataChapter))
                query = query.Where(f => f.ATAChapterCode == ataChapter.Trim());

            if (status.HasValue && Enum.IsDefined(typeof(ApprovalStatus), status.Value))
                query = query.Where(f => f.Status == (ApprovalStatus)status.Value);

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(f =>
                    f.Title.Contains(term) ||
                    f.FolderCode.Contains(term) ||
                    f.PartNumber.Contains(term) ||
                    f.ATAChapterCode.Contains(term));
            }

            var safePage = Math.Max(1, page);
            var safePageSize = Math.Clamp(pageSize, 1, 500);
            var total = await query.CountAsync(cancellationToken);

            var folders = await query
                .OrderByDescending(f => f.UpdatedAt)
                .Skip((safePage - 1) * safePageSize)
                .Take(safePageSize)
                .ToListAsync(cancellationToken);

            Response.Headers["X-Total-Count"] = total.ToString();
            return Ok(folders.Select(ToSummary).ToList());
        }

        // =================================================================================
        // READ  -  GET /api/evaluation-folders/{folderId}
        // =================================================================================

        [HttpGet("{folderId:guid}")]
        public async Task<IActionResult> Get(Guid folderId, CancellationToken cancellationToken)
        {
            var (user, failure) = await RequireUserAsync(cancellationToken);
            if (failure is not null) return failure;

            var folder = await _context.EvaluationFolders
                .AsNoTracking()
                .Include(f => f.Items)
                .FirstOrDefaultAsync(f => f.Id == folderId, cancellationToken);

            if (folder is null)
                return NotFound(new
                {
                    code = WorkflowErrorCodes.FolderNotFound,
                    message = "Evaluation folder not found."
                });

            if (!CanSeeShop(user!, folder.ShopId))
                return StatusCode(403, new
                {
                    code = WorkflowErrorCodes.OutsideOwnShop,
                    message = "This folder belongs to another shop."
                });

            WorkflowInstanceResponse? signOff = null;
            if (folder.SignOffInstanceId.HasValue)
            {
                signOff = await _instances.GetByInstanceIdAsync(
                    folder.SignOffInstanceId.Value, user!, cancellationToken);
            }

            var ataStatus = await GetAtaStatusAsync(folder.ATARecordId, cancellationToken);
            var routing = await LoadToolRoutingAsync(folder.ATARecordId, cancellationToken);

            return Ok(new FolderDetailResponse
            {
                Folder = ToSummary(folder),
                TableOfContents = ToTableOfContents(folder, user!, ataStatus, routing),
                Progress = ToProgress(folder, user!, ataStatus, routing),
                SignOff = signOff
            });
        }

        // =================================================================================
        // READ  -  GET /api/evaluation-folders/{folderId}/table-of-contents
        // =================================================================================

        [HttpGet("{folderId:guid}/table-of-contents")]
        public async Task<IActionResult> GetTableOfContents(Guid folderId, CancellationToken cancellationToken)
        {
            var (user, failure) = await RequireUserAsync(cancellationToken);
            if (failure is not null) return failure;

            var folder = await _context.EvaluationFolders
                .AsNoTracking()
                .Include(f => f.Items)
                .FirstOrDefaultAsync(f => f.Id == folderId, cancellationToken);

            if (folder is null)
                return NotFound(new
                {
                    code = WorkflowErrorCodes.FolderNotFound,
                    message = "Evaluation folder not found."
                });

            if (!CanSeeShop(user!, folder.ShopId))
                return StatusCode(403, new
                {
                    code = WorkflowErrorCodes.OutsideOwnShop,
                    message = "This folder belongs to another shop."
                });

            var ataStatus = await GetAtaStatusAsync(folder.ATARecordId, cancellationToken);
            var routing = await LoadToolRoutingAsync(folder.ATARecordId, cancellationToken);
            return Ok(ToTableOfContents(folder, user!, ataStatus, routing));
        }

        // =================================================================================
        // READ  -  GET /api/evaluation-folders/{folderId}/progress
        // =================================================================================

        [HttpGet("{folderId:guid}/progress")]
        public async Task<IActionResult> GetProgress(Guid folderId, CancellationToken cancellationToken)
        {
            var (user, failure) = await RequireUserAsync(cancellationToken);
            if (failure is not null) return failure;

            var folder = await _context.EvaluationFolders
                .AsNoTracking()
                .Include(f => f.Items)
                .FirstOrDefaultAsync(f => f.Id == folderId, cancellationToken);

            if (folder is null)
                return NotFound(new
                {
                    code = WorkflowErrorCodes.FolderNotFound,
                    message = "Evaluation folder not found."
                });

            if (!CanSeeShop(user!, folder.ShopId))
                return StatusCode(403, new
                {
                    code = WorkflowErrorCodes.OutsideOwnShop,
                    message = "This folder belongs to another shop."
                });

            var ataStatus = await GetAtaStatusAsync(folder.ATARecordId, cancellationToken);
            var routing = await LoadToolRoutingAsync(folder.ATARecordId, cancellationToken);
            return Ok(ToProgress(folder, user!, ataStatus, routing));
        }

        // =================================================================================
        // ENGINE  - create the folder + seeded ToC.
        // The rest of the transitions stay 501 until their engine handlers are wired.
        // =================================================================================

        /// <summary>POST /api/evaluation-folders — create per ATA / Component.</summary>
        [HttpPost]
        public async Task<IActionResult> Create(
            [FromBody] CreateFolderRequest request,
            CancellationToken cancellationToken)
        {
            if (request is null)
                return BadRequest(new
                {
                    code = "INVALID_REQUEST",
                    message = "A valid create-folder payload is required."
                });

            var (user, failure) = await RequireUserAsync(cancellationToken);
            if (failure is not null) return failure;

            if (request.ATARecordId == Guid.Empty)
                return ValidationProblem(new ValidationProblemDetails(new Dictionary<string, string[]>
                {
                    [nameof(request.ATARecordId)] = new[] { "ATARecordId is required." }
                })
                {
                    Title = "Validation failed",
                    Status = StatusCodes.Status400BadRequest,
                    Detail = "A valid ATA record id is required before creating the evaluation folder."
                });

            var record = await _context.ATARecords
                .AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == request.ATARecordId, cancellationToken);

            if (record is null)
                return NotFound(new
                {
                    code = WorkflowErrorCodes.FolderNotFound,
                    message = "The ATA record for this evaluation folder no longer exists."
                });

            var existing = await _context.EvaluationFolders
                .FirstOrDefaultAsync(f => f.ATARecordId == request.ATARecordId, cancellationToken);

            if (existing is not null)
            {
                var existingDetail = await BuildFolderDetailAsync(existing.Id, user!, cancellationToken);
                return StatusCode(StatusCodes.Status200OK, existingDetail);
            }

            var now = DateTime.UtcNow;
            var folderId = Guid.NewGuid();
            var title = string.IsNullOrWhiteSpace(request.Title)
                ? $"{record.Description} — {record.PartNumber}"
                : request.Title.Trim();

            var folder = new EvaluationFolder
            {
                Id = folderId,
                ATARecordId = request.ATARecordId,
                ShopId = request.ShopId ?? record.ShopId,
                DepartmentId = null,
                FolderCode = GenerateFolderCode(record, folderId),
                Title = title,
                ATAChapterCode = string.IsNullOrWhiteSpace(record.ATAChapterCode) ? "" : record.ATAChapterCode,
                PartNumber = record.PartNumber,
                Status = ApprovalStatus.Draft,
                TotalItems = 0,
                ApprovedItems = 0,
                SkippedItems = 0,
                PendingItems = 0,
                ExpiredItems = 0,
                CompletionPercent = 0,
                IsComplete = false,
                CompletedAt = null,
                CompletedByUserId = null,
                IsLocked = false,
                LockedAt = null,
                LockedByUserId = null,
                SignOffInstanceId = null,
                ReportStoragePath = string.Empty,
                ReportFileName = string.Empty,
                ReportGeneratedAt = null,
                RevisionNumber = Math.Max(1, record.RevisionNumber),
                RevisionDueDate = null,
                LastRevisedAt = null,
                LinkedCmmRevision = request.LinkedCmmRevision ?? string.Empty,
                LinkedComponentTaskRevision = request.LinkedComponentTaskRevision ?? string.Empty,
                LinkedTaskCardRevision = request.LinkedTaskCardRevision ?? string.Empty,
                CreatedAt = now,
                UpdatedAt = now,
                CreatedBy = user!.FullName,
                UpdatedBy = user.FullName
            };

            _context.EvaluationFolders.Add(folder);

            var template = FormWorkflowCatalog.FolderTemplate();
            var items = template
                .Select((definition, index) => new EvaluationFolderItem
                {
                    Id = Guid.NewGuid(),
                    EvaluationFolderId = folder.Id,
                    SectionCode = definition.Section,
                    SectionTitle = ToCSections.TitleOf(definition.Section),
                    SectionOrder = ToCSections.OrderOf(definition.Section),
                    ItemOrder = index + 1,
                    FormType = definition.FormType,
                    FormNo = definition.FormNo,
                    FormTitle = definition.Title,
                    IsMandatory = definition.IsMandatory,
                    IsOptionalByRegulatoryDate = definition.IsOptionalByRegulatoryDate,
                    IsGeneratedByJointApproval = definition.IsGeneratedByJointApproval,
                    FormSubmissionId = null,
                    FormWorkflowInstanceId = null,
                    Status = ApprovalStatus.Draft,
                    LifecycleState = FormLifecycleState.Draft,
                    StatusLabel = ApprovalStatusInfo.Label(ApprovalStatus.Draft),
                    TotalSteps = definition.Steps.Length,
                    CompletedSteps = 0,
                    CurrentStepTitle = string.Empty,
                    CurrentAssigneeUserId = null,
                    CurrentAssigneeName = string.Empty,
                    ExpiryMonths = definition.ExpiryMonths,
                    ExpiresAt = null,
                    IsExpired = false,
                    Remarks = definition.Remarks,
                    CreatedAt = now,
                    UpdatedAt = now
                })
                .ToList();

            foreach (var item in items)
            {
                item.UpdatedAt = now;
            }

            _context.EvaluationFolderItems.AddRange(items);

            folder.TotalItems = items.Count;
            folder.PendingItems = items.Count(i => i.IsMandatory);
            folder.ApprovedItems = 0;
            folder.SkippedItems = 0;
            folder.ExpiredItems = 0;
            folder.CompletionPercent = 0;
            folder.IsComplete = false;

            await _context.SaveChangesAsync(cancellationToken);

            var detail = await BuildFolderDetailAsync(folder.Id, user, cancellationToken);
            return CreatedAtAction(nameof(Get), new { folderId = folder.Id }, detail);
        }

        private async Task<FolderDetailResponse> BuildFolderDetailAsync(Guid folderId, User actor, CancellationToken cancellationToken)
        {
            var folder = await _context.EvaluationFolders
                .AsNoTracking()
                .Include(f => f.Items)
                .FirstOrDefaultAsync(f => f.Id == folderId, cancellationToken);

            if (folder is null)
            {
                return new FolderDetailResponse();
            }

            var ataStatus = await GetAtaStatusAsync(folder.ATARecordId, cancellationToken);
            var routing = await LoadToolRoutingAsync(folder.ATARecordId, cancellationToken);

            return new FolderDetailResponse
            {
                Folder = ToSummary(folder),
                TableOfContents = ToTableOfContents(folder, actor, ataStatus, routing),
                Progress = ToProgress(folder, actor, ataStatus, routing)
            };
        }

        private async Task<ToolRouting> LoadToolRoutingAsync(
            Guid ataRecordId,
            CancellationToken cancellationToken)
        {
            var tnaData = await _context.FormSubmissions
                .AsNoTracking()
                .Where(f => f.ATARecordId == ataRecordId
                    && f.IsActive
                    && (f.FormType == FormNodeTypes.TNA
                        || f.FormType == FormNodeTypes.ToolNeedAnalysisReport))
                .OrderByDescending(f => f.UpdatedAt)
                .Select(f => f.FormDataJson)
                .ToListAsync(cancellationToken);
            return tnaData
                .Select(ToolRouting.FromTnaJson)
                .FirstOrDefault(route => route.AcquisitionCode is 1 or 2 or 3)
                ?? new ToolRouting(0);
        }

        private sealed record ToolRouting(int AcquisitionCode)
        {
            public static ToolRouting FromTnaJson(string? json)
            {
                if (string.IsNullOrWhiteSpace(json)) return new ToolRouting(0);
                try
                {
                    using var document = JsonDocument.Parse(json);
                    if (!TryGetProperty(document.RootElement, "items", out var items)
                        || items.ValueKind != JsonValueKind.Array)
                        return new ToolRouting(0);

                    var code = items.EnumerateArray()
                        .Select(item => TryGetProperty(item, "acquisitionCode", out var value)
                            ? ParseAcquisitionCode(value.ToString()) : 0)
                        .Max();
                    return new ToolRouting(code is 1 or 2 or 3 ? code : 0);
                }
                catch (JsonException) { return new ToolRouting(0); }
            }

            private static int ParseAcquisitionCode(string value)
            {
                var trimmed = value.Trim();
                if (trimmed.Length > 0 && trimmed[0] is '1' or '2' or '3'
                    && (trimmed.Length == 1 || trimmed[1] == '.' || char.IsWhiteSpace(trimmed[1])))
                    return trimmed[0] - '0';
                return int.TryParse(trimmed, out var parsed) && parsed is 1 or 2 or 3 ? parsed : 0;
            }

            private static bool TryGetProperty(
                JsonElement element,
                string name,
                out JsonElement value)
            {
                foreach (var property in element.EnumerateObject())
                {
                    if (string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase))
                    {
                        value = property.Value;
                        return true;
                    }
                }

                value = default;
                return false;
            }

            public (bool mandatory, bool maySkip, string label) For(string formType)
            {
                if (formType.Equals(FormNodeTypes.AlternateToolsEquivalency, StringComparison.OrdinalIgnoreCase))
                    return AcquisitionCode switch
                    {
                        2 or 3 => (true, false, "Mandatory: alternative tool selected"),
                        1 => (false, false, "Automatically skipped: standard tool selected"),
                        _ => (false, false, "Optional: awaiting tool acquisition decision")
                    };

                var inhouse = formType.Equals(FormNodeTypes.InhouseManufacturedTools, StringComparison.OrdinalIgnoreCase)
                    || formType.Equals(FormNodeTypes.ToolMfgJic, StringComparison.OrdinalIgnoreCase);
                if (inhouse)
                    return AcquisitionCode == 3
                        ? (true, false, "Mandatory: conditional in-house tool selected")
                        : AcquisitionCode == 1
                            ? (false, false, "Automatically skipped: standard tool selected")
                            : (false, false, "Optional: awaiting tool acquisition decision");

                if (formType.Equals(FormNodeTypes.ToolRiskAssessment, StringComparison.OrdinalIgnoreCase)
                    || formType.Equals(FormNodeTypes.ToolMfgForm1554, StringComparison.OrdinalIgnoreCase))
                    return AcquisitionCode == 3
                        ? (false, true, "Optional: STL / Engineer may include or bypass")
                        : AcquisitionCode is 1 or 2
                            ? (false, false, "Automatically skipped: this pathway is not applicable")
                            : (false, false, "Optional: awaiting tool acquisition decision");

                return (false, false, string.Empty);
            }
        }

        private static string GenerateFolderCode(ATARecord record, Guid folderId)
        {
            var chapter = string.IsNullOrWhiteSpace(record.ATAChapterCode)
                ? "ATA"
                : record.ATAChapterCode.Trim();
            var safePart = string.IsNullOrWhiteSpace(record.PartNumber)
                ? "PART"
                : record.PartNumber.Trim();

            var chaos = folderId.ToString("N")[..8].ToUpperInvariant();
            return $"{chapter}-{safePart}-{chaos}";
        }

        /// <summary>PUT /api/evaluation-folders/{folderId} — update folder header.</summary>
        [HttpPut("{folderId:guid}")]
        public IActionResult Update(Guid folderId) => EngineNotWired($"PUT /api/evaluation-folders/{folderId} (update folder)");

        /// <summary>POST /api/evaluation-folders/{folderId}/sign-off — final sequential sign-off + lock.</summary>
        [HttpPost("{folderId:guid}/sign-off")]
        public IActionResult SignOff(Guid folderId) => EngineNotWired($"POST /api/evaluation-folders/{folderId}/sign-off");

        /// <summary>POST /api/evaluation-folders/{folderId}/report — consolidate the PDF report.</summary>
        [HttpPost("{folderId:guid}/report")]
        public IActionResult GenerateReport(Guid folderId) => EngineNotWired($"POST /api/evaluation-folders/{folderId}/report");

        /// <summary>GET /api/evaluation-folders/{folderId}/report — stream the PDF report.</summary>
        [HttpGet("{folderId:guid}/report")]
        public IActionResult DownloadReport(Guid folderId) => EngineNotWired($"GET /api/evaluation-folders/{folderId}/report");

        /// <summary>POST /api/evaluation-folders/{folderId}/revisions — raise a revision cycle.</summary>
        [HttpPost("{folderId:guid}/revisions")]
        public IActionResult RaiseRevision(Guid folderId) => EngineNotWired($"POST /api/evaluation-folders/{folderId}/revisions");

        /// <summary>GET /api/evaluation-folders/{folderId}/revisions — revision history.</summary>
        [HttpGet("{folderId:guid}/revisions")]
        public IActionResult ListRevisions(Guid folderId) => EngineNotWired($"GET /api/evaluation-folders/{folderId}/revisions");

        /// <summary>GET /api/evaluation-folders/{folderId}/competency-matrix.</summary>
        [HttpGet("{folderId:guid}/competency-matrix")]
        public IActionResult GetCompetencyMatrix(Guid folderId) => EngineNotWired($"GET /api/evaluation-folders/{folderId}/competency-matrix");

        /// <summary>PUT /api/evaluation-folders/{folderId}/competency-matrix.</summary>
        [HttpPut("{folderId:guid}/competency-matrix")]
        public IActionResult UpsertCompetency(Guid folderId) => EngineNotWired($"PUT /api/evaluation-folders/{folderId}/competency-matrix");

        /// <summary>GET /api/evaluation-folders/{folderId}/tool-equivalency-matrix.</summary>
        [HttpGet("{folderId:guid}/tool-equivalency-matrix")]
        public IActionResult GetToolEquivalencyMatrix(Guid folderId) => EngineNotWired($"GET /api/evaluation-folders/{folderId}/tool-equivalency-matrix");

        /// <summary>PUT /api/evaluation-folders/{folderId}/tool-equivalency-matrix.</summary>
        [HttpPut("{folderId:guid}/tool-equivalency-matrix")]
        public IActionResult UpsertToolEquivalency(Guid folderId) => EngineNotWired($"PUT /api/evaluation-folders/{folderId}/tool-equivalency-matrix");

        // =================================================================================
        // MAPPING HELPERS
        // =================================================================================

        private static FolderSummaryResponse ToSummary(EvaluationFolder f) => new FolderSummaryResponse
        {
            Id = f.Id,
            ATARecordId = f.ATARecordId,
            ShopId = f.ShopId,
            FolderCode = f.FolderCode,
            Title = f.Title,
            ATAChapterCode = f.ATAChapterCode,
            PartNumber = f.PartNumber,
            Status = f.Status,
            StatusLabel = ApprovalStatusInfo.Label(f.Status),
            CompletionPercent = f.CompletionPercent,
            PendingItems = f.PendingItems,
            ExpiredItems = f.ExpiredItems,
            IsComplete = f.IsComplete,
            IsLocked = f.IsLocked,
            RevisionNumber = f.RevisionNumber,
            RevisionDueDate = f.RevisionDueDate,
            CompletedAt = f.CompletedAt
        };

        private static TableOfContentsResponse ToTableOfContents(
            EvaluationFolder folder,
            User actor,
            ApprovalStatus ataStatus,
            ToolRouting routing)
        {
            var items = folder.Items
                .OrderBy(i => i.SectionOrder)
                .ThenBy(i => i.ItemOrder)
                .ToList();

            var sections = items
                .GroupBy(i => new { i.SectionCode, i.SectionTitle, i.SectionOrder })
                .OrderBy(g => g.Key.SectionOrder)
                .Select(g => new TableOfContentsSectionResponse
                {
                    Code = g.Key.SectionCode,
                    Title = g.Key.SectionTitle,
                    Order = g.Key.SectionOrder,
                    TotalItems = g.Count(),
                    ApprovedItems = g.Count(i => EffectiveStatus(i, routing) is ApprovalStatus.Approved or ApprovalStatus.Completed or ApprovalStatus.Locked),
                    PendingItems = g.Count(i => RoleHierarchy.IsPending(EffectiveStatus(i, routing))),
                    SkippedItems = g.Count(i => EffectiveStatus(i, routing) == ApprovalStatus.Skipped),
                    ExpiredItems = g.Count(i => i.IsExpired),
                    Items = g.Select(i => ToTocItem(i, actor, ataStatus, items, routing)).ToList()
                })
                .ToList();

            return new TableOfContentsResponse
            {
                FolderId = folder.Id,
                FolderCode = folder.FolderCode,
                Title = folder.Title,
                ATAChapterCode = folder.ATAChapterCode,
                PartNumber = folder.PartNumber,
                Status = folder.Status,
                StatusLabel = ApprovalStatusInfo.Label(folder.Status),
                CompletionPercent = folder.CompletionPercent,
                Sections = sections
            };
        }

        private static TableOfContentsItemResponse ToTocItem(
            EvaluationFolderItem item,
            User actor,
            ApprovalStatus ataStatus,
            IReadOnlyCollection<EvaluationFolderItem> allItems,
            ToolRouting routing)
        {
            var route = routing.For(item.FormType);
            var status = EffectiveStatus(item, routing);
            var pending = RoleHierarchy.IsPending(status);
            var missing = FormWorkflowCatalog.PrerequisiteFormTypes(item.FormType)
                .Where(type => !allItems.Any(other =>
                    string.Equals(other.FormType, type, StringComparison.OrdinalIgnoreCase)
                    && ApprovalStatusInfo.CountsAsComplete(other.Status)))
                .ToArray();
            var ataApproved = ataStatus == ApprovalStatus.Approved;
            var gateOpen = ataApproved && missing.Length == 0;
            var gateMessage = !ataApproved
                ? "Approve the ATA Record Workflow before starting Table of Contents approvals."
                : missing.Length > 0
                    ? "Complete first: " + string.Join(", ", missing.Select(FormWorkflowCatalog.TitleOf))
                    : string.Empty;

            return new TableOfContentsItemResponse
            {
                Id = item.Id,
                SectionCode = item.SectionCode,
                SectionTitle = item.SectionTitle,
                SectionOrder = item.SectionOrder,
                ItemOrder = item.ItemOrder,
                FormType = item.FormType,
                FormNo = item.FormNo,
                FormTitle = item.FormTitle,
                IsMandatory = route.label.Length > 0 ? route.mandatory : item.IsMandatory,
                IsOptionalByRegulatoryDate = item.IsOptionalByRegulatoryDate,

                // Read-side approximation: the authoritative MaySkipNow (regulatory target
                // date evaluation) lives on the workflow instance; the ToC uses the
                // denormalised item flag.
                MaySkipNow = route.maySkip || (item.IsOptionalByRegulatoryDate && !item.IsExpired),

                FormSubmissionId = item.FormSubmissionId,
                FormWorkflowInstanceId = item.FormWorkflowInstanceId,
                Status = status,
                StatusLabel = status == ApprovalStatus.Skipped ? "Skipped" : item.StatusLabel,
                LifecycleState = status == ApprovalStatus.Skipped ? FormLifecycleState.Skipped : item.LifecycleState,
                LifecycleStateLabel = status == ApprovalStatus.Skipped ? "Skipped" : item.LifecycleState.ToString(),
                TotalSteps = item.TotalSteps,
                CompletedSteps = status == ApprovalStatus.Skipped ? 1 : item.CompletedSteps,
                CurrentStepTitle = item.CurrentStepTitle,
                CurrentAssigneeUserId = item.CurrentAssigneeUserId,
                CurrentAssigneeName = item.CurrentAssigneeName,
                ExpiresAt = item.ExpiresAt,
                IsExpired = item.IsExpired,
                Remarks = string.IsNullOrWhiteSpace(route.label) ? item.Remarks : route.label + ". " + item.Remarks,
                RoutingLabel = route.label,
                RoutingReadOnly = route.label.StartsWith("Automatically skipped", StringComparison.OrdinalIgnoreCase),

                // Read-side approximations; the REAL gates are enforced server-side when
                // the draft is created (POST /api/workflow/forms) and when a step is
                // actioned, so a wrong optimistic flag here can never mutate state.
                CanIDraft = gateOpen
                    && status == ApprovalStatus.Draft
                    && !route.label.StartsWith("Automatically skipped", StringComparison.OrdinalIgnoreCase),
                CanIAct = gateOpen && pending && item.CurrentAssigneeUserId == actor.Id,
                ApprovalGateOpen = gateOpen,
                ApprovalGateMessage = gateMessage
            };
        }

        private static FolderProgressResponse ToProgress(
            EvaluationFolder folder,
            User actor,
            ApprovalStatus ataStatus,
            ToolRouting routing)
        {
            var items = folder.Items.ToList();

            var remaining = items
                .Where(i => !IsAutoSkipped(i, routing)
                         && (routing.For(i.FormType).label.Length > 0
                             ? routing.For(i.FormType).mandatory
                             : i.IsMandatory)
                         && !ApprovalStatusInfo.CountsAsComplete(EffectiveStatus(i, routing))
                         && !i.IsExpired)
                .OrderBy(i => i.SectionOrder)
                .ThenBy(i => i.ItemOrder)
                .Select(i => ToTocItem(i, actor, ataStatus, items, routing))
                .ToList();

            var total = folder.TotalItems > 0 ? folder.TotalItems : items.Count;
            var done = folder.ApprovedItems + folder.SkippedItems;
            var percent = total > 0 ? (int)Math.Round(done * 100.0 / total) : 0;

            return new FolderProgressResponse
            {
                FolderId = folder.Id,
                TotalItems = total,
                ApprovedItems = folder.ApprovedItems,
                SkippedItems = folder.SkippedItems,
                PendingItems = folder.PendingItems,
                ExpiredItems = folder.ExpiredItems,
                CompletionPercent = folder.CompletionPercent > 0 ? folder.CompletionPercent : percent,
                IsComplete = folder.IsComplete,
                IsLocked = folder.IsLocked,
                RemainingItems = remaining,
                ReportAvailable = folder.ReportGeneratedAt.HasValue,
                ReportGeneratedAt = folder.ReportGeneratedAt
            };
        }

        private static bool IsAutoSkipped(EvaluationFolderItem item, ToolRouting routing) =>
            routing.For(item.FormType).label.StartsWith(
                "Automatically skipped", StringComparison.OrdinalIgnoreCase);

        private static ApprovalStatus EffectiveStatus(EvaluationFolderItem item, ToolRouting routing) =>
            IsAutoSkipped(item, routing) ? ApprovalStatus.Skipped : item.Status;

        private async Task<ApprovalStatus> GetAtaStatusAsync(Guid ataRecordId, CancellationToken cancellationToken)
        {
            return await _context.ATARecords
                .AsNoTracking()
                .Where(r => r.Id == ataRecordId)
                .Select(r => (ApprovalStatus?)r.ApprovalStatus)
                .FirstOrDefaultAsync(cancellationToken) ?? ApprovalStatus.Draft;
        }

        private static bool CanSeeShop(User actor, Guid? shopId)
        {
            var canonical = RoleHierarchy.Normalize(actor.Role);
            if (canonical is not null && SeesEveryShopRoles.Contains(canonical))
                return true;

            if (!shopId.HasValue)
                return true;

            return actor.ShopId.HasValue && actor.ShopId.Value == shopId.Value;
        }

        private static IActionResult EngineNotWired(string action) =>
            new ObjectResult(new
            {
                code = EngineNotWiredCode,
                errorCode = EngineNotWiredCode,
                message = $"The evaluation-folder engine action '{action}' is not wired in this build. " +
                          "The read surface (list, detail, table of contents, progress) is fully served; " +
                          "wire the folder engine handlers to enable transitions."
            })
            {
                StatusCode = 501
            };

        private async Task<(User? user, IActionResult? failure)> RequireUserAsync(
            CancellationToken cancellationToken)
        {
            var user = await _currentUser.GetAsync(cancellationToken);
            if (user is null)
            {
                return (null, Unauthorized(new
                {
                    code = "NOT_AUTHENTICATED",
                    message = "The authenticated user could not be resolved."
                }));
            }
            return (user, null);
        }
    }
}