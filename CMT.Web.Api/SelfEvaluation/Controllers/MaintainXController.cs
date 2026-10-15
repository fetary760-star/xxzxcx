/*
 * =====================================================================================
 * MaintainXController.cs — THE SERVER HALF OF THE MAINTAINX CONNECTOR CONTRACT
 * -------------------------------------------------------------------------------------
 * Copy to: CMT.Web.Api.SelfEvaluation/Controllers/MaintainXController.cs
 *
 * WHAT THIS CONTROLLER IS
 * -----------------------
 * The single ASP.NET Core surface behind the Next.js credential proxy
 * (CMT.Frontend/src/app/api/maintainx/[[...path]]/route.ts) and consumed by the typed
 * client (CMT.Frontend/src/lib/maintainx/maintainx-connector.ts):
 *
 *   GET  /api/maintainx/connector-status        -> is the connector switched on?
 *   POST /api/maintainx/et-part-number          -> resolve one ET P/N (MNT-1229B / MNT-1325)
 *   GET  /api/maintainx/user-identity?userId=   -> SE user  ->  MaintainX staff number
 *   POST /api/maintainx/signatures/import       -> import one Electronic Signature specimen
 *
 * WHY A STATUS, NEVER A 500
 * -------------------------
 * Every MaintainX-side outcome is returned as HTTP 200 carrying a status enum the UI
 * renders as a hint beside a still-editable field: a controlled aviation form must stay
 * fillable when svdcmpa01 is unreachable, and "connector disabled" must remain
 * distinguishable from "MaintainX unreachable" — the whole point of the connector
 * contract. Only a missing session, an authorisation refusal, or an SE-side storage
 * failure produce a non-200.
 *
 * SECURITY
 * --------
 * - [Authorize] on the class: no anonymous access to staff-number mappings or specimens.
 * - user-identity and signatures/import are Admin-or-self only.
 * - MaintainX credentials live in appsettings.json and are used ONLY by the server-side
 *   connector implementations; nothing here can forward them to the browser.
 * - Signature persistence is delegated to IUserSignatureService.UploadAsync (versioning,
 *   supersede-and-revoke, audit log). This controller never touches storage paths.
 *
 * v3 AMENDMENT (Fix B - the "#105 · 21041" import abort)
 * ------------------------------------------------------
 * The scraper's in-source account gate is canonical (MaintainXStaffNumber.Matches), but
 * ImportSignature re-verified the fetched username with a RAW Trim() + OrdinalIgnoreCase
 * compare. Maintenix renders the Electronic Signature label as "21041\u00A0" or
 * "21041 (ABEBE K.)" - Trim() strips neither the NBSP nor the annotation - so a CORRECT
 * fetch was aborted here with "returned a signature for a different account". The
 * verification now runs through MaintainXStaffNumber.Matches, the ONE comparison rule
 * shared by the identity resolver, the scraper and this controller.
 *
 * Also added: CanonicalStaffNumber on the response, so the Admin table can render
 * "#105 · 21041 -> MaintainX 21041" with the proof the resolver produced.
 *
 * DI REQUIREMENTS (Program.cs)
 * ----------------------------
 * The connector interfaces must be registered for the controller to activate:
 *   builder.Services.Configure<MaintainXConnectorOptions>(
 *       builder.Configuration.GetSection(MaintainXConnectorOptions.SectionName));
 *   builder.Services.AddScoped<IMaintainXEtPartNumberResolver, NullMaintainXEtPartNumberResolver>();
 *   builder.Services.AddScoped<IMaintainXUserSignatureProvider, NullMaintainXUserSignatureProvider>();
 *   builder.Services.AddScoped<IMaintainXUserIdentityResolver, MaintainXUserIdentityResolver>();
 * Replace the two Null* registrations with the on-prem scrapers and set
 * "MaintainXConnector": { "Enabled": true, "Provider": "Scraper" } — no call-site changes.
 * =====================================================================================
 */

using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using CMT.Application.SelfEvaluation.Options;
using CMT.Application.SelfEvaluation.Services;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.Shared;
using User = CMT.Domain.Models.SelfEvaluation.User;
using RecordStatus = CMT.Domain.Models.Shared.RecordStatus;

namespace CMT.Web.Api.SelfEvaluation.Controllers
{
    /// <summary>Request body of POST /api/maintainx/signatures/import.</summary>
    public sealed class MaintainXSignatureImportRequest
    {
        /// <summary>The SE user whose MaintainX specimen should be imported.</summary>
        public long UserId { get; set; }
    }

    /// <summary>
    /// Response of POST /api/maintainx/signatures/import. Mirrors the TypeScript
    /// MaintainXSignatureImportResult in maintainx-connector.ts field for field.
    /// </summary>
    public sealed class MaintainXSignatureImportResponse
    {
        public MaintainXSignatureFetchStatus Status { get; set; } =
            MaintainXSignatureFetchStatus.SignatureNotRegistered;

        /// <summary>True when a specimen version was actually created.</summary>
        public bool Imported { get; set; }

        /// <summary>True when the bytes were identical and the version was not bumped.</summary>
        public bool SkippedUnchanged { get; set; }

        public string MaintainXUsername { get; set; } = string.Empty;

        /// <summary>
        /// v3: the canonicalised staff number (uppercase, alphanumeric-only, zero-padding
        /// dropped). Lets the Admin table PROVE the "#105 · 21041" alignment without
        /// re-deriving the rule in the browser.
        /// </summary>
        public string CanonicalStaffNumber { get; set; } = string.Empty;

        public long SeUserId { get; set; }
        public Guid? SignatureId { get; set; }
        public int Version { get; set; }
        public string ContentType { get; set; } = string.Empty;
        public string FileName { get; set; } = string.Empty;

        /// <summary>Lowercase hex SHA-256. The client displays only a short prefix.</summary>
        public string Sha256 { get; set; } = string.Empty;

        public string Provider { get; set; } = "None";
        public string? Message { get; set; }
        public List<string> Steps { get; set; } = new List<string>();
    }

    /// <summary>
    /// Server side of the two NEW MaintainX capabilities: ET P/N resolution and
    /// signature specimen import. See the file header for the full contract.
    /// </summary>
    [ApiController]
    [Route("api/maintainx")]
    [Authorize]
    public class MaintainXController : ControllerBase
    {
        private readonly IOptionsMonitor<MaintainXConnectorOptions> _options;
        private readonly IMaintainXEtPartNumberResolver _etResolver;
        private readonly IMaintainXUserIdentityResolver _identityResolver;
        private readonly IMaintainXUserSignatureProvider _signatureProvider;
        private readonly IUserSignatureService _signatures;
        private readonly ICurrentUserAccessor _currentUser;
        private readonly ApplicationDbContext _context;
        private readonly ILogger<MaintainXController> _logger;

        public MaintainXController(
            IOptionsMonitor<MaintainXConnectorOptions> options,
            IMaintainXEtPartNumberResolver etResolver,
            IMaintainXUserIdentityResolver identityResolver,
            IMaintainXUserSignatureProvider signatureProvider,
            IUserSignatureService signatures,
            ICurrentUserAccessor currentUser,
            ApplicationDbContext context,
            ILogger<MaintainXController> logger)
        {
            _options = options;
            _etResolver = etResolver;
            _identityResolver = identityResolver;
            _signatureProvider = signatureProvider;
            _signatures = signatures;
            _currentUser = currentUser;
            _context = context;
            _logger = logger;
        }

        // ============================ 1. connector status ============================

        /// <summary>
        /// GET /api/maintainx/connector-status
        /// Drives whether the "Fetch from MaintainX" affordance is rendered at all.
        /// </summary>
        [HttpGet("connector-status")]
        public IActionResult GetConnectorStatus()
        {
            var o = _options.CurrentValue;

            return Ok(new
            {
                enabled = o.Enabled,
                provider = o.Provider.ToString(),
                etPartNumberEnabled = o.EtPartNumberEnabled,
                signatureImportEnabled = o.SignatureImportEnabled,
                userIdSource = o.UserIdSource.ToString(),
                canResolveEtPartNumber = o.CanResolveEtPartNumber && _etResolver.IsEnabled,
                canImportSignatures = o.CanImportSignatures && _signatureProvider.IsEnabled
            });
        }

        // ============================ 2. ET P/N resolution ============================

        /// <summary>
        /// POST /api/maintainx/et-part-number
        /// Never throws for a MaintainX-side condition; the result carries the status.
        /// The v3 scraper behind this endpoint shape-validates every stock candidate and
        /// walks every "Stock No:" candidate through the Stock Code hop, so a
        /// description-only Details cell ("EVACUATION SLIDE/RAFT, DOOR-3") can never be
        /// chased or returned.
        /// </summary>
        [HttpPost("et-part-number")]
        public async Task<IActionResult> ResolveEtPartNumber(
            [FromBody] EtPartNumberRequest? request,
            CancellationToken cancellationToken)
        {
            request ??= new EtPartNumberRequest();
            request.AtaCode = (request.AtaCode ?? string.Empty).Trim();
            request.PartNumber = (request.PartNumber ?? string.Empty).Trim();

            if (!request.IsValid)
            {
                return Ok(EtPartNumberResult.Invalid(
                    "An ATA code and a part number are both required. Fill them on the ATA Record first."));
            }

            var options = _options.CurrentValue;

            // Master switch off (the shipped default): the field stays manually editable.
            if (!options.CanResolveEtPartNumber || !_etResolver.IsEnabled)
            {
                return Ok(new EtPartNumberResult
                {
                    Status = EtPartNumberResolutionStatus.ConnectorDisabled,
                    AtaCode = request.AtaCode,
                    PartNumber = request.PartNumber,
                    TaskCode = MaintainXDetailParser.NormalizeAtaCode(request.AtaCode),
                    Provider = _etResolver.ProviderName,
                    Message = "MaintainX lookup is not configured on this server, so the ET P/N stays manual. Type the stock number."
                });
            }

            _logger.LogInformation(
                "MaintainX ET P/N lookup: ATA={ATA}, PN={PN}, Form={Form}, User={User}",
                request.AtaCode, request.PartNumber, request.FormNo ?? "-", User.Identity?.Name ?? "unknown");

            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeoutCts.CancelAfter(TimeSpan.FromMilliseconds(Math.Max(1000, options.TimeoutMs)));

            EtPartNumberResult result;
            try
            {
                result = await _etResolver.ResolveAsync(request, timeoutCts.Token);
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                return Ok(new EtPartNumberResult
                {
                    Status = EtPartNumberResolutionStatus.Unavailable,
                    AtaCode = request.AtaCode,
                    PartNumber = request.PartNumber,
                    Provider = _etResolver.ProviderName,
                    Message = "MaintainX did not answer in time. It is intranet-only, so it may be slow or unreachable right now."
                });
            }
            catch (OperationCanceledException)
            {
                throw; // the client went away; let ASP.NET Core handle it
            }
            catch (Exception ex)
            {
                // Defensive: a connector implementation that breaks its "never throw"
                // contract must still not 500 a controlled form.
                _logger.LogError(ex, "MaintainX ET P/N resolver threw unexpectedly.");
                return Ok(new EtPartNumberResult
                {
                    Status = EtPartNumberResolutionStatus.Unavailable,
                    AtaCode = request.AtaCode,
                    PartNumber = request.PartNumber,
                    Provider = _etResolver.ProviderName,
                    Message = "MaintainX lookup failed unexpectedly. Enter the ET P/N manually."
                });
            }

            if (result is null)
                result = new EtPartNumberResult { Status = EtPartNumberResolutionStatus.NotResolved };
            if (string.IsNullOrWhiteSpace(result.Provider))
                result.Provider = _etResolver.ProviderName;

            _logger.LogInformation(
                "MaintainX ET P/N result: Status={Status}, Value={Value}",
                result.Status, result.EtPartNumber ?? "-");

            return Ok(result);
        }

        // ============================ 3. user identity mapping ============================

        /// <summary>
        /// GET /api/maintainx/user-identity?userId={id}
        /// Admin-or-self only. The resolver owns the mapping rule; this endpoint only
        /// renders its verdict, so the rule lives in exactly one place.
        /// </summary>
        [HttpGet("user-identity")]
        public async Task<IActionResult> GetUserIdentity(
            [FromQuery] long userId,
            CancellationToken cancellationToken)
        {
            var me = await _currentUser.GetAsync(cancellationToken);
            if (me is null)
                return Unauthorized(new { message = "Your session has expired. Sign in again to continue." });

            if (userId <= 0)
                return Ok(UnmappedIdentity(userId, "No user id was supplied."));

            if (me.Id != userId && !IsAdmin(me))
                return StatusCode(StatusCodes.Status403Forbidden, new
                {
                    message = "Only an Admin may inspect another user's MaintainX mapping."
                });

            var target = await _context.Users
                .FirstOrDefaultAsync(
                    u => u.Id == userId && u.RecordStatus != RecordStatus.Deleted,
                    cancellationToken);

            if (target is null)
                return Ok(UnmappedIdentity(userId, "No such user in the Self-Evaluation directory."));

            return Ok(_identityResolver.Resolve(target));
        }

        // ============================ 4. signature specimen import ============================

        /// <summary>
        /// POST /api/maintainx/signatures/import  { userId }
        /// Walks References -> user details -> Electronic Signature upstream, verifies
        /// the returned account matches the requested staff number (v3: through the
        /// canonicaliser, not a raw Trim compare), and hands the bytes to
        /// IUserSignatureService.UploadAsync — which keeps versioning, supersede-and-revoke
        /// and the audit log in one place. This controller never writes storage paths and
        /// never receives one.
        /// </summary>
        [HttpPost("signatures/import")]
        public async Task<IActionResult> ImportSignature(
            [FromBody] MaintainXSignatureImportRequest? request,
            CancellationToken cancellationToken)
        {
            if (request is null || request.UserId <= 0)
                return BadRequest(new { message = "A positive userId is required." });

            var me = await _currentUser.GetAsync(cancellationToken);
            if (me is null)
                return Unauthorized(new { message = "Your session has expired. Sign in again to continue." });

            var target = await _context.Users
                .FirstOrDefaultAsync(
                    u => u.Id == request.UserId && u.RecordStatus != RecordStatus.Deleted,
                    cancellationToken);

            if (target is null)
                return BadRequest(new { message = "No such user in the Self-Evaluation directory." });

            if (me.Id != target.Id && !IsAdmin(me))
                return StatusCode(StatusCodes.Status403Forbidden, new
                {
                    message = "Only an Admin may import another user's signature specimen."
                });

            var options = _options.CurrentValue;
            var response = new MaintainXSignatureImportResponse { SeUserId = target.Id };

            if (!options.CanImportSignatures || !_signatureProvider.IsEnabled)
            {
                response.Status = MaintainXSignatureFetchStatus.ConnectorDisabled;
                response.Provider = _signatureProvider.ProviderName;
                response.Message =
                    "MaintainX signature import is not configured on this server. Upload the specimen manually.";
                response.Steps.Add("MaintainX signature connector is not configured; nothing was fetched.");
                return Ok(response);
            }

            var identity = _identityResolver.Resolve(target);
            if (!identity.IsMapped)
            {
                response.Status = MaintainXSignatureFetchStatus.UserIdNotMapped;
                response.Provider = _signatureProvider.ProviderName;
                response.Message = identity.Message ??
                    "This user could not be matched to a MaintainX account. " +
                    "Add a MaintainXConnector:UserIdOverrides entry for the username.";
                response.Steps.Add("Identity mapping failed: " + (identity.Message ?? "unmapped"));
                return Ok(response);
            }

            response.MaintainXUsername = identity.MaintainXUsername;
            response.CanonicalStaffNumber = identity.CanonicalStaffNumber;
            response.Provider = _signatureProvider.ProviderName;
            response.Steps.Add(
                $"Mapped SE user {target.Username} -> MaintainX staff number {identity.MaintainXUsername} ({identity.Source}).");

            _logger.LogInformation(
                "MaintainX signature import: SE user={TargetUser} (id {Id}) -> MaintainX {StaffNo}, by {Actor}",
                target.Username, target.Id, identity.MaintainXUsername, me.Username);

            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeoutCts.CancelAfter(TimeSpan.FromMilliseconds(Math.Max(1000, options.TimeoutMs)));

            MaintainXSignatureResult fetched;
            try
            {
                fetched = await _signatureProvider.FetchSignatureAsync(
                    identity.MaintainXUsername, target.Id, timeoutCts.Token);
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                response.Status = MaintainXSignatureFetchStatus.Unavailable;
                response.Message = "MaintainX did not answer in time. Nothing was saved.";
                return Ok(response);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "MaintainX signature provider threw unexpectedly.");
                response.Status = MaintainXSignatureFetchStatus.Unavailable;
                response.Message = "MaintainX signature import failed unexpectedly. Nothing was saved.";
                return Ok(response);
            }

            response.Steps.AddRange(fetched.Steps);
            response.Provider = string.IsNullOrWhiteSpace(fetched.Provider)
                ? _signatureProvider.ProviderName
                : fetched.Provider;

            if (fetched.Status != MaintainXSignatureFetchStatus.Fetched)
            {
                response.Status = fetched.Status;
                response.Message = fetched.Message;
                return Ok(response);
            }

            // "My User Details" is session-scoped in Maintenix: a stale session could return
            // the WRONG person's signature and silently stamp it onto an approval. Never
            // persist a specimen whose account does not match the requested staff number.
            //
            // B-FIX (v3): the comparison goes through MaintainXStaffNumber.Matches, the
            // canonicaliser shared with the resolver and the scraper. Maintenix renders the
            // Electronic Signature label as "21041\u00A0" or "21041 (ABEBE K.)" - a raw
            // Trim() compare strips neither the NBSP nor the annotation, so the CORRECT
            // fetch was aborted here with "a different account". Canonicalised, "21041" ==
            // "21041 (ABEBE K.)" == "021041", so a correct specimen is no longer rejected
            // while a genuinely different account (21042) is still refused.
            if (!MaintainXStaffNumber.Matches(
                    fetched.MaintainXUsername,
                    identity.MaintainXUsername))
            {
                _logger.LogWarning(
                    "MaintainX returned account {Returned} for requested staff number {Requested}; import aborted.",
                    fetched.MaintainXUsername, identity.MaintainXUsername);

                response.Status = MaintainXSignatureFetchStatus.AuthenticationFailed;
                response.Message =
                    "MaintainX returned a signature for a different account than requested; nothing was saved.";
                response.Steps.Add(
                    "Account verification FAILED: returned username does not match the requested staff number.");
                return Ok(response);
            }

            response.Steps.Add(
                "Account verification passed: returned username matches the requested staff number " +
                $"(canonical '{identity.CanonicalStaffNumber}').");

            var content = fetched.Content ?? Array.Empty<byte>();

            if (content.Length == 0)
            {
                response.Status = MaintainXSignatureFetchStatus.SignatureNotRegistered;
                response.Message =
                    "This user has never registered an electronic signature in MaintainX.";
                return Ok(response);
            }

            if (content.LongLength > options.MaxSignatureBytes)
            {
                response.Status = MaintainXSignatureFetchStatus.FileTooLarge;
                response.Message =
                    "The MaintainX specimen exceeds the configured size limit and was rejected.";
                return Ok(response);
            }

            // Magic-number sniffing, exactly as the Admin upload path does.
            if (SignatureFileRules.DetectKind(content) is null)
            {
                response.Status = MaintainXSignatureFetchStatus.ContentInvalid;
                response.Message =
                    "The downloaded file is not a valid image (magic-number check failed), so it was rejected.";
                return Ok(response);
            }

            var sha256 = string.IsNullOrWhiteSpace(fetched.Sha256)
                ? Convert.ToHexString(SHA256.HashData(content)).ToLowerInvariant()
                : fetched.Sha256.Trim().ToLowerInvariant();
            response.Sha256 = sha256;

            // Keep the file name traceable to the CANONICAL account, so "021041" and
            // "21041" map onto the same specimen lineage in storage.
            var fileName = string.IsNullOrWhiteSpace(fetched.FileName)
                ? $"maintainx-signature-{identity.CanonicalStaffNumber}.png"
                : fetched.FileName;
            var contentType = string.IsNullOrWhiteSpace(fetched.ContentType)
                ? "image/png"
                : fetched.ContentType;

            // Skip a re-import that would produce a byte-identical new version, so the
            // version history stays meaningful.
            if (options.SkipImportWhenUnchanged)
            {
                var active = await _signatures.GetActiveAsync(target.Id, cancellationToken);
                if (active is not null &&
                    string.Equals(active.FileSha256, sha256, StringComparison.OrdinalIgnoreCase))
                {
                    response.Status = MaintainXSignatureFetchStatus.Fetched;
                    response.Imported = false;
                    response.SkippedUnchanged = true;
                    response.SignatureId = active.Id;
                    response.Version = active.Version;
                    response.ContentType = active.ContentType;
                    response.FileName = active.FileName;
                    response.Message =
                        "Specimen unchanged since the last import; no new version was created.";
                    response.Steps.Add("SHA-256 matches the active specimen; import skipped.");
                    return Ok(response);
                }
            }

            await using var stream = new MemoryStream(content);

            var upload = await _signatures.UploadAsync(
                me,
                target.Id,
                stream,
                fileName,
                contentType,
                content.LongLength,
                $"Imported from MaintainX account {identity.MaintainXUsername}.",
                cancellationToken);

            if (!upload.Success || upload.Data is null)
            {
                // SE-side storage failure: honest 500, nothing was changed.
                _logger.LogError(
                    "MaintainX signature upload failed for user {Id}: {Message}",
                    target.Id, upload.Message ?? "unknown");
                return StatusCode(StatusCodes.Status500InternalServerError, new
                {
                    message = upload.Message ?? "The specimen could not be stored. Nothing was changed."
                });
            }

            response.Status = MaintainXSignatureFetchStatus.Fetched;
            response.Imported = true;
            response.SignatureId = upload.Data.Id;
            response.Version = upload.Data.Version;
            response.ContentType = upload.Data.ContentType;
            response.FileName = upload.Data.FileName;
            response.Message = $"Specimen imported from MaintainX (version {upload.Data.Version}).";
            response.Steps.Add(
                $"Stored as version {upload.Data.Version} via IUserSignatureService.UploadAsync.");

            return Ok(response);
        }

        // ============================ helpers ============================

        private static bool IsAdmin(User user) =>
            string.Equals(
                RoleHierarchy.Normalize(user.Role),
                OrgRoles.Admin,
                StringComparison.OrdinalIgnoreCase);

        private static MaintainXIdentity UnmappedIdentity(long userId, string message) => new MaintainXIdentity
        {
            Status = MaintainXIdentityStatus.SourceFieldEmpty,
            SeUserId = userId,
            Source = string.Empty,
            Message = message
        };
    }
}