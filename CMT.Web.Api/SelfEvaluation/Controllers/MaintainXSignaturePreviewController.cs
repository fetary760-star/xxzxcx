using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
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
    /// <summary>
    /// Response of GET /api/maintainx/signatures/preview?userId={id}.
    /// Mirrors the TypeScript <c>MaintainXSignaturePreview</c> declared in
    /// SignatureSpecimenPanel.tsx field for field, so the panel's tolerant parser
    /// (dataUrl OR contentBase64 + contentType, camelCase OR PascalCase) always finds a
    /// value and never has to fall back to "preview unavailable".
    /// </summary>
    public sealed class MaintainXSignaturePreviewResponse
    {
        /// <summary>Mirrors MaintainXSignatureFetchStatus; the panel accepts name or ordinal.</summary>
        public MaintainXSignatureFetchStatus Status { get; set; } =
            MaintainXSignatureFetchStatus.SignatureNotRegistered;

        /// <summary>True only when real bytes were read AND encoded for display.</summary>
        public bool Found { get; set; }

        /// <summary>The ALIGNED upstream account the specimen belongs to, e.g. "34953".</summary>
        public string MaintainXUsername { get; set; } = string.Empty;

        /// <summary>Canonical (comparison) form of the account, e.g. "34953".</summary>
        public string CanonicalStaffNumber { get; set; } = string.Empty;

        /// <summary>The identifier that was searched for, echoed even on failure.</summary>
        public string RequestedIdentifier { get; set; } = string.Empty;

        public long SeUserId { get; set; }

        public string ContentType { get; set; } = string.Empty;

        /// <summary>Ready-to-render data URL: "data:image/png;base64,...". Empty when none.</summary>
        public string DataUrl { get; set; } = string.Empty;

        /// <summary>Bare base64, for a client that prefers to build its own data URL.</summary>
        public string ContentBase64 { get; set; } = string.Empty;

        public long SizeBytes { get; set; }

        /// <summary>The upstream image URL. Admin-visible provenance only.</summary>
        public string SourceUrl { get; set; } = string.Empty;

        /// <summary>Lowercase hex SHA-256 of the previewed bytes, when the scraper computed one.</summary>
        public string Sha256 { get; set; } = string.Empty;

        /// <summary>True when the bytes came from the in-process read-only preview cache.</summary>
        public bool FromCache { get; set; }

        public string Provider { get; set; } = "None";

        /// <summary>Operator-facing explanation. NEVER contains MaintainX credentials.</summary>
        public string? Message { get; set; }

        public List<string> Steps { get; set; } = new List<string>();

        public DateTime FetchedAtUtc { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// Serves the READ-ONLY MaintainX specimen preview consumed by the Admin
    /// "MaintainX specimen" column. See the file header for the full root-cause analysis.
    /// </summary>
    [ApiController]
    [Route("api/maintainx")]
    [Authorize]
    public class MaintainXSignaturePreviewController : ControllerBase
    {
        private readonly IOptionsMonitor<MaintainXConnectorOptions> _options;
        private readonly IMaintainXUserIdentityResolver _identityResolver;
        private readonly IMaintainXUserSignatureProvider _signatureProvider;
        private readonly IServiceProvider _services;
        private readonly ICurrentUserAccessor _currentUser;
        private readonly ApplicationDbContext _context;
        private readonly ILogger<MaintainXSignaturePreviewController> _logger;

        public MaintainXSignaturePreviewController(
            IOptionsMonitor<MaintainXConnectorOptions> options,
            IMaintainXUserIdentityResolver identityResolver,
            IMaintainXUserSignatureProvider signatureProvider,
            IServiceProvider services,
            ICurrentUserAccessor currentUser,
            ApplicationDbContext context,
            ILogger<MaintainXSignaturePreviewController> logger)
        {
            _options = options;
            _identityResolver = identityResolver;
            _signatureProvider = signatureProvider;
            _services = services;
            _currentUser = currentUser;
            _context = context;
            _logger = logger;
        }

        /// <summary>
        /// GET /api/maintainx/signatures/preview?userId={id}
        ///
        /// Reads the Electronic Signature tab of the ALIGNED MaintainX account and returns
        /// the specimen as a base64 data URL. Nothing is persisted: no specimen version, no
        /// storage key, no audit row. Admin-or-self only.
        /// </summary>
        [HttpGet("signatures/preview")]
        public async Task<IActionResult> PreviewSignature(
            [FromQuery] long userId,
            CancellationToken cancellationToken)
        {
            var me = await _currentUser.GetAsync(cancellationToken);
            if (me is null)
            {
                return Unauthorized(new
                {
                    message = "Your session has expired. Sign in again to continue.",
                    status = nameof(MaintainXSignatureFetchStatus.AuthenticationFailed)
                });
            }

            if (userId <= 0)
            {
                // Still a 200: the panel renders the message beside the row instead of
                // treating a bad query string as "the endpoint does not exist".
                return Ok(Failed(
                    userId,
                    MaintainXSignatureFetchStatus.UserIdNotMapped,
                    "No user id was supplied, so no MaintainX account could be looked up."));
            }

            var target = await _context.Users
                .FirstOrDefaultAsync(
                    u => u.Id == userId && u.RecordStatus != RecordStatus.Deleted,
                    cancellationToken);

            if (target is null)
            {
                return Ok(Failed(
                    userId,
                    MaintainXSignatureFetchStatus.UserIdNotMapped,
                    "No such user in the Self-Evaluation directory."));
            }

            if (me.Id != target.Id && !IsAdmin(me))
            {
                return StatusCode(StatusCodes.Status403Forbidden, new
                {
                    message = "Only an Admin may read another user's MaintainX specimen.",
                    status = nameof(MaintainXSignatureFetchStatus.AuthenticationFailed)
                });
            }

            var options = _options.CurrentValue;

            // Master switch off (the shipped default): an HONEST 200 + ConnectorDisabled, so
            // the column says "not configured" instead of the old, misleading 404.
            if (!options.CanImportSignatures || !_signatureProvider.IsEnabled)
            {
                var disabled = Failed(
                    target.Id,
                    MaintainXSignatureFetchStatus.ConnectorDisabled,
                    "MaintainX signature preview is not configured on this server. " +
                    "Set MaintainXConnector:Enabled = true with Provider = \"Scraper\", " +
                    "or upload the specimen manually.");
                disabled.Provider = _signatureProvider.ProviderName;
                disabled.Steps.Add("MaintainX signature connector is not configured; nothing was fetched.");
                return Ok(disabled);
            }

            // ---- Build the alignment request -------------------------------------------
            // A preview WRITES NOTHING, so unlike `signatures/import` it does not abort when
            // the username is a role login: it hands the scraper every hint SE holds and
            // opts in to the role-alignment pass. The scraper still refuses a role-only
            // match unless a real staff-number label is rendered upstream.
            var identity = _identityResolver.Resolve(target);

            var candidates = new List<string>();
            void AddCandidate(string? value)
            {
                if (string.IsNullOrWhiteSpace(value)) return;
                var trimmed = value!.Trim();
                if (!candidates.Contains(trimmed, StringComparer.OrdinalIgnoreCase))
                    candidates.Add(trimmed);
            }

            AddCandidate(identity.MaintainXUsername);
            if (identity.Candidates != null)
                foreach (var candidate in identity.Candidates) AddCandidate(candidate);
            AddCandidate(target.Username);

            var request = MaintainXSignatureRequest.Create(
                seUserId: target.Id,
                staffNumber: candidates.Count > 0 ? candidates[0] : target.Username,
                candidates: candidates,
                fullName: target.FullName,
                roleHint: target.Role,
                email: target.Email,
                allowRoleOnlyMatch: true);

            _logger.LogInformation(
                "MaintainX specimen PREVIEW (read-only): SE user={TargetUser} (id {Id}), " +
                "identity={Status}/{StaffNo}, requested by {Actor}",
                target.Username,
                target.Id,
                identity.Status,
                string.IsNullOrWhiteSpace(identity.MaintainXUsername) ? "-" : identity.MaintainXUsername,
                me.Username);

            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeoutCts.CancelAfter(TimeSpan.FromMilliseconds(Math.Max(1000, options.TimeoutMs)));

            MaintainXSignaturePreviewResult preview;
            try
            {
                preview = await FetchPreviewAsync(request, timeoutCts.Token);
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                var timedOut = Failed(
                    target.Id,
                    MaintainXSignatureFetchStatus.Unavailable,
                    "MaintainX did not answer in time. It is intranet-only, so it may be slow " +
                    "or unreachable right now. Nothing was saved.");
                timedOut.Provider = _signatureProvider.ProviderName;
                timedOut.MaintainXUsername = identity.MaintainXUsername;
                timedOut.CanonicalStaffNumber = identity.CanonicalStaffNumber;
                timedOut.RequestedIdentifier = candidates.Count > 0 ? candidates[0] : string.Empty;
                return Ok(timedOut);
            }
            catch (OperationCanceledException)
            {
                throw; // the client navigated away; let ASP.NET Core handle it
            }
            catch (Exception ex)
            {
                // Defensive: a provider that breaks its "never throw" contract must still not
                // 500 the Admin dashboard.
                _logger.LogError(ex, "MaintainX specimen preview threw unexpectedly for user {Id}.", target.Id);
                var broken = Failed(
                    target.Id,
                    MaintainXSignatureFetchStatus.Unavailable,
                    "The MaintainX specimen preview failed unexpectedly. Nothing was saved.");
                broken.Provider = _signatureProvider.ProviderName;
                return Ok(broken);
            }

            return Ok(Project(preview, target.Id, identity, candidates));
        }

        // ============================ preview capability resolution ============================

        /// <summary>
        /// Resolves the read-only preview capability without requiring a Program.cs change.
        /// Tier 1: an explicitly registered IMaintainXSignatureSpecimenPreview.
        /// Tier 2: the registered signature provider, which IS the scraper implementing it.
        /// Tier 3: the provider's plain fetch, base64-encoded here — still read-only, because
        ///         IMaintainXUserSignatureProvider is contractually forbidden from writing.
        /// </summary>
        private async Task<MaintainXSignaturePreviewResult> FetchPreviewAsync(
            MaintainXSignatureRequest request,
            CancellationToken cancellationToken)
        {
            var registered = _services.GetService<IMaintainXSignatureSpecimenPreview>();
            if (registered is not null && registered.IsEnabled)
                return await registered.FetchPreviewAsync(request, cancellationToken);

            if (_signatureProvider is IMaintainXSignatureSpecimenPreview capable && capable.IsEnabled)
                return await capable.FetchPreviewAsync(request, cancellationToken);

            // Tier 3 — the legacy string signature still carries every alignment hint through
            // the descriptor, so a role login is not silently downgraded here either.
            var descriptor = MaintainXSignatureDescriptor.Build(
                staffNumber: request.StaffNumber,
                candidates: request.Candidates,
                fullName: request.FullName,
                roleHint: request.RoleHint,
                email: request.Email,
                seUserId: request.SeUserId,
                allowRoleOnlyMatch: request.AllowRoleOnlyMatch);

            var fetched = await _signatureProvider.FetchSignatureAsync(
                descriptor, request.SeUserId, cancellationToken);

            var projected = MaintainXSignaturePreviewResult.From(fetched);
            projected.Steps.Add(
                "Preview produced by the import provider in read-only mode; nothing was persisted.");
            return projected;
        }

        // ============================ helpers ============================

        /// <summary>Projects the service result onto the exact shape the panel parses.</summary>
        private MaintainXSignaturePreviewResponse Project(
            MaintainXSignaturePreviewResult preview,
            long seUserId,
            MaintainXIdentity identity,
            IReadOnlyList<string> candidates)
        {
            if (preview is null)
            {
                return Failed(
                    seUserId,
                    MaintainXSignatureFetchStatus.SignatureNotRegistered,
                    "MaintainX returned no specimen for this user.");
            }

            var requested = !string.IsNullOrWhiteSpace(preview.RequestedIdentifier)
                ? preview.RequestedIdentifier
                : (candidates.Count > 0 ? candidates[0] : string.Empty);

            // Always name an account, even on failure, so the column can never render a bare
            // empty cell the operator cannot interpret.
            var username = !string.IsNullOrWhiteSpace(preview.MaintainXUsername)
                ? preview.MaintainXUsername
                : (!string.IsNullOrWhiteSpace(identity.MaintainXUsername) ? identity.MaintainXUsername : requested);

            var canonical = !string.IsNullOrWhiteSpace(preview.CanonicalStaffNumber)
                ? preview.CanonicalStaffNumber
                : (!string.IsNullOrWhiteSpace(identity.CanonicalStaffNumber)
                    ? identity.CanonicalStaffNumber
                    : Canonical(username));

            var contentType = string.IsNullOrWhiteSpace(preview.ContentType) ? "image/png" : preview.ContentType;

            var dataUrl = preview.DataUrl ?? string.Empty;
            if (dataUrl.Length == 0 && !string.IsNullOrEmpty(preview.ContentBase64))
                dataUrl = "data:" + contentType + ";base64," + preview.ContentBase64;

            var found = preview.Status == MaintainXSignatureFetchStatus.Fetched && dataUrl.Length > 0;

            var response = new MaintainXSignaturePreviewResponse
            {
                Status = preview.Status,
                Found = found,
                MaintainXUsername = username ?? string.Empty,
                CanonicalStaffNumber = canonical ?? string.Empty,
                RequestedIdentifier = requested,
                SeUserId = preview.SeUserId > 0 ? preview.SeUserId : seUserId,
                ContentType = found ? contentType : (preview.ContentType ?? string.Empty),
                DataUrl = dataUrl,
                ContentBase64 = preview.ContentBase64 ?? string.Empty,
                SizeBytes = preview.SizeBytes,
                SourceUrl = preview.SourceUrl ?? string.Empty,
                Sha256 = (preview.Sha256 ?? string.Empty).ToLowerInvariant(),
                FromCache = preview.FromCache,
                Provider = string.IsNullOrWhiteSpace(preview.Provider)
                    ? _signatureProvider.ProviderName
                    : preview.Provider,
                Message = preview.Message,
                Steps = preview.Steps ?? new List<string>(),
                FetchedAtUtc = preview.FetchedAtUtc == default ? DateTime.UtcNow : preview.FetchedAtUtc
            };

            if (string.IsNullOrWhiteSpace(response.Message))
            {
                response.Message = found
                    ? "Specimen read from the Electronic Signature tab in MaintainX."
                    : "MaintainX returned no specimen for this user.";
            }

            // A "Fetched" status with no renderable bytes would show an empty box with a
            // success label; downgrade it so the column stays honest.
            if (preview.Status == MaintainXSignatureFetchStatus.Fetched && !found)
            {
                response.Status = MaintainXSignatureFetchStatus.SignatureNotRegistered;
                response.Message =
                    "MaintainX reported a specimen but returned no displayable image bytes.";
                response.Steps.Add("Downgraded to SignatureNotRegistered: no bytes were available to render.");
            }

            _logger.LogInformation(
                "MaintainX specimen preview result: user={Id}, status={Status}, account={Account}, bytes={Bytes}, cached={Cached}",
                response.SeUserId, response.Status, response.MaintainXUsername, response.SizeBytes, response.FromCache);

            return response;
        }

        private MaintainXSignaturePreviewResponse Failed(
            long seUserId,
            MaintainXSignatureFetchStatus status,
            string message) => new MaintainXSignaturePreviewResponse
            {
                Status = status,
                Found = false,
                SeUserId = seUserId,
                Provider = _signatureProvider?.ProviderName ?? "None",
                Message = message
            };

        /// <summary>
        /// Local mirror of the staff-number canonicaliser, used ONLY as a last-resort
        /// fallback when neither the resolver nor the preview supplied a canonical form.
        /// Uppercase, alphanumeric-only, a trailing "(NAME)" annotation removed and leading
        /// zeros dropped for a purely numeric value — so "021041", "21041\u00A0" and
        /// "21041 (ABEBE K.)" all collapse onto "21041".
        /// </summary>
        private static string Canonical(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return string.Empty;

            var text = value!.Replace('\u00A0', ' ').Trim();

            var parenthesis = text.IndexOf('(');
            if (parenthesis > 0) text = text.Substring(0, parenthesis);

            var buffer = new System.Text.StringBuilder(text.Length);
            foreach (var c in text)
                if (char.IsLetterOrDigit(c)) buffer.Append(char.ToUpperInvariant(c));

            var canonical = buffer.ToString();
            if (canonical.Length == 0) return string.Empty;

            if (canonical.All(char.IsDigit))
            {
                var trimmed = canonical.TrimStart('0');
                return trimmed.Length > 0 ? trimmed : "0";
            }

            return canonical;
        }

        private static bool IsAdmin(User user) =>
            string.Equals(
                RoleHierarchy.Normalize(user.Role),
                OrgRoles.Admin,
                StringComparison.OrdinalIgnoreCase);
    }
}