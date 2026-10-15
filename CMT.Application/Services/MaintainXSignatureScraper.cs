using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.Playwright;
using CMT.Application.SelfEvaluation.Options;
using CMT.Domain.Models.SelfEvaluation;

namespace CMT.Application.SelfEvaluation.Services
{
    // =====================================================================================
    // MaintainXSignatureScraper.cs  (v6 - THE "MaintainX specimen" COLUMN FINALLY RESOLVES)
    // Copy to: CMT.Application.SelfEvaluation/Services/MaintainXSignatureScraper.cs
    // -------------------------------------------------------------------------------------
    // WHY THE COLUMN SHOWED NOTHING
    //   1. NO READ-ONLY SOURCE OF BYTES. The only upstream call was
    //      IMaintainXUserSignatureProvider.FetchSignatureAsync, consumed exclusively by the
    //      IMPORT path (which PERSISTS a version). A dashboard column cannot persist on
    //      render, so nothing could ever be displayed.
    //      -> v6 exposes IMaintainXSignatureSpecimenPreview: it returns the specimen as a
    //         base64 data URL and NEVER writes to the database.
    //   2. ROLE LOGINS NEVER REACHED UPSTREAM. The dashboard row is "#105 . director".
    //      MaintainXUserIdentityResolver classifies "director" as SourceFieldNotAStaffNumber,
    //      so the caller passed no usable id and the scraper aborted with UserIdNotMapped.
    //      But the specimens are filed upstream by ROLE AND ID, so the role label is a
    //      legitimate directory search term.
    //      -> v6 adds a ROLE SEARCH pass (MaintainXReachKind.RoleSearch) after the id probe
    //         and the person-name search, and adopts the staff number the page renders.
    //   3. EVERY ROW RE-SCRAPED FROM SCRATCH. "Preview all" drove one full
    //      login -> menu -> search -> tab walk per row, so later rows exhausted the budget
    //      and returned Unavailable, which rendered as an empty cell.
    //      -> v6 adds a short-lived in-process preview cache keyed by the aligned account.
    //   4. A FAILED PREVIEW CARRIED NO ID, so the panel could not even name the account it
    //      looked for. -> v6 always echoes RequestedIdentifier.
    //
    // SAFETY INVARIANT THAT IS NOT RELAXED
    //   A role identifies a POST, never a PERSON. A role-only match is refused unless the
    //   caller opts in with AllowRoleOnlyMatch, and even then only when the page renders a
    //   real staff-number label, which is adopted and reported as a UserIdOverrides hint.
    //
    // PRESERVED: one shared deadline bounds every wait; never throws for a MaintainX-side
    // condition; never writes to the database; never touches UserSignature.StoragePath;
    // magic-number sniffing plus SHA-256; bytes downloaded through the AUTHENTICATED browser
    // context; the canonical identity gate; the wide specimen locator (img/srcset, canvas,
    // embed/object/iframe, SVG image, CSS background); soft 'Electronic Signature' tab
    // failure.
    // =====================================================================================

    // Everything usable to align an SE user with its MaintainX account.
    public sealed class MaintainXSignatureRequest
    {
        public long SeUserId { get; set; }

        // Best known staff number, e.g. "21041". May be a role-style login.
        public string? StaffNumber { get; set; }

        // Ordered staff numbers worth trying (MaintainXIdentity.Candidates).
        public IReadOnlyList<string>? Candidates { get; set; }

        // The person's full name as SE knows it, e.g. "ABEBE KEBEDE".
        public string? FullName { get; set; }

        // Role label, e.g. "director". v6: disambiguates AND searches.
        public string? RoleHint { get; set; }

        // Optional e-mail, used as an extra directory search term.
        public string? Email { get; set; }

        // v6 OPT-IN. Allows a row found by ROLE ALONE to be accepted when SE knows no person
        // name - but only if a real staff-number label is rendered, which is then adopted.
        // Leave false for anything that PERSISTS; the read-only dashboard preview may set it.
        public bool AllowRoleOnlyMatch { get; set; }

        // Skips the in-process preview cache for this call.
        public bool BypassCache { get; set; }

        public static MaintainXSignatureRequest Create(
            long seUserId,
            string? staffNumber,
            IEnumerable<string>? candidates = null,
            string? fullName = null,
            string? roleHint = null,
            string? email = null,
            bool allowRoleOnlyMatch = false)
        {
            var ordered = new List<string>();

            void Add(string? value)
            {
                if (string.IsNullOrWhiteSpace(value)) return;
                var trimmed = value!.Trim();
                if (!ordered.Contains(trimmed, StringComparer.OrdinalIgnoreCase)) ordered.Add(trimmed);
            }

            Add(staffNumber);
            if (candidates != null)
                foreach (var candidate in candidates) Add(candidate);

            return new MaintainXSignatureRequest
            {
                SeUserId = seUserId,
                StaffNumber = ordered.Count > 0 ? ordered[0] : staffNumber,
                Candidates = ordered,
                FullName = fullName,
                RoleHint = roleHint,
                Email = email,
                AllowRoleOnlyMatch = allowRoleOnlyMatch
            };
        }
    }

    // Builds / parses the descriptor accepted by the LEGACY
    // FetchSignatureAsync(string, long, ct) signature, so a caller that cannot change its
    // call shape can still hand over the alignment hints. Example:
    //   Build("director", identity.Candidates, "ABEBE KEBEDE", "director")
    //     -> "director|name=ABEBE KEBEDE|role=director"
    public static class MaintainXSignatureDescriptor
    {
        public static string Build(
            string? staffNumber,
            IEnumerable<string>? candidates = null,
            string? fullName = null,
            string? roleHint = null,
            string? email = null,
            long seUserId = 0,
            bool allowRoleOnlyMatch = false)
        {
            var segments = new List<string>();

            void AddCandidate(string? value)
            {
                if (string.IsNullOrWhiteSpace(value)) return;
                var trimmed = Sanitize(value!);
                if (trimmed.Length == 0) return;
                if (!segments.Contains(trimmed, StringComparer.OrdinalIgnoreCase)) segments.Add(trimmed);
            }

            AddCandidate(staffNumber);
            if (candidates != null)
                foreach (var candidate in candidates) AddCandidate(candidate);

            if (!string.IsNullOrWhiteSpace(fullName)) segments.Add("name=" + Sanitize(fullName!));
            if (!string.IsNullOrWhiteSpace(roleHint)) segments.Add("role=" + Sanitize(roleHint!));
            if (!string.IsNullOrWhiteSpace(email)) segments.Add("email=" + Sanitize(email!));
            if (seUserId > 0) segments.Add("id=" + seUserId.ToString());
            if (allowRoleOnlyMatch) segments.Add("allowrole=true");

            return string.Join("|", segments);
        }

        public static MaintainXSignatureRequest Parse(string? descriptor, long seUserId) =>
            MaintainXSignatureScraper.ParseDescriptor(descriptor, seUserId);

        private static string Sanitize(string value) =>
            value.Replace('|', ' ').Replace(';', ' ').Replace('=', ' ').Trim();
    }

    // READ-ONLY outcome the Admin "MaintainX specimen" column renders. Carries the bytes as
    // a base64 data URL so the dashboard can display the EXISTING upstream image without any
    // specimen version being created.
    public sealed class MaintainXSignaturePreviewResult
    {
        public MaintainXSignatureFetchStatus Status { get; set; } =
            MaintainXSignatureFetchStatus.SignatureNotRegistered;

        public bool Found =>
            Status == MaintainXSignatureFetchStatus.Fetched && !string.IsNullOrEmpty(ContentBase64);

        // The ALIGNED upstream account the specimen belongs to, e.g. "21041".
        public string MaintainXUsername { get; set; } = string.Empty;

        public string CanonicalStaffNumber { get; set; } = string.Empty;

        // v6: the identifier the caller ASKED for, echoed even on failure.
        public string RequestedIdentifier { get; set; } = string.Empty;

        // v6: true when the bytes came from the in-process preview cache.
        public bool FromCache { get; set; }

        public long SeUserId { get; set; }
        public string ContentType { get; set; } = string.Empty;
        public string ContentBase64 { get; set; } = string.Empty;

        // Ready-to-render data URL: "data:image/png;base64,...".
        public string DataUrl { get; set; } = string.Empty;

        public long SizeBytes { get; set; }
        public string SourceUrl { get; set; } = string.Empty;
        public string Sha256 { get; set; } = string.Empty;
        public string Provider { get; set; } = "None";
        public string? Message { get; set; }
        public List<string> Steps { get; set; } = new List<string>();
        public DateTime FetchedAtUtc { get; set; } = DateTime.UtcNow;

        // Projects a fetch result into a display-only preview.
        public static MaintainXSignaturePreviewResult From(MaintainXSignatureResult source)
        {
            if (source == null) throw new ArgumentNullException(nameof(source));

            var preview = new MaintainXSignaturePreviewResult
            {
                Status = source.Status,
                MaintainXUsername = source.MaintainXUsername ?? string.Empty,
                CanonicalStaffNumber = MaintainXStaffNumber.Canonical(source.MaintainXUsername),
                SeUserId = source.SeUserId,
                ContentType = source.ContentType ?? string.Empty,
                SourceUrl = source.SourceUrl ?? string.Empty,
                Sha256 = source.Sha256 ?? string.Empty,
                Provider = string.IsNullOrWhiteSpace(source.Provider) ? "None" : source.Provider,
                Message = source.Message,
                Steps = source.Steps ?? new List<string>(),
                FetchedAtUtc = source.FetchedAtUtc
            };

            var content = source.Content;
            if (source.Status == MaintainXSignatureFetchStatus.Fetched && content != null && content.Length > 0)
            {
                var contentType = string.IsNullOrWhiteSpace(preview.ContentType) ? "image/png" : preview.ContentType;
                preview.ContentType = contentType;
                preview.SizeBytes = content.LongLength;
                preview.ContentBase64 = Convert.ToBase64String(content);
                preview.DataUrl = "data:" + contentType + ";base64," + preview.ContentBase64;
            }

            return preview;
        }

        public MaintainXSignaturePreviewResult Clone() => new MaintainXSignaturePreviewResult
        {
            Status = Status,
            MaintainXUsername = MaintainXUsername,
            CanonicalStaffNumber = CanonicalStaffNumber,
            RequestedIdentifier = RequestedIdentifier,
            FromCache = FromCache,
            SeUserId = SeUserId,
            ContentType = ContentType,
            ContentBase64 = ContentBase64,
            DataUrl = DataUrl,
            SizeBytes = SizeBytes,
            SourceUrl = SourceUrl,
            Sha256 = Sha256,
            Provider = Provider,
            Message = Message,
            Steps = new List<string>(Steps),
            FetchedAtUtc = FetchedAtUtc
        };
    }

    // The READ-ONLY capability the Admin dashboard needs. Additive: a provider that cannot
    // preview simply does not implement it, and the endpoint falls back to the import
    // provider plus its own base64 encoding.
    // CONTRACT: never throw for a MaintainX-side condition; never write to the database;
    // never touch UserSignature.StoragePath; always echo the ALIGNED upstream account.
    public interface IMaintainXSignatureSpecimenPreview
    {
        bool IsEnabled { get; }

        string ProviderName { get; }

        Task<MaintainXSignaturePreviewResult> FetchPreviewAsync(
            MaintainXSignatureRequest request,
            CancellationToken cancellationToken = default);

        Task<MaintainXSignaturePreviewResult> FetchPreviewAsync(
            string maintainXUsernameOrDescriptor,
            long seUserId,
            CancellationToken cancellationToken = default);

        // Drops every cached preview, e.g. after a manual upload or an import.
        void ClearPreviewCache();
    }

    // Person-name canonicalisation shared by the directory search and the identity gate.
    public static class MaintainXPersonName
    {
        private static readonly HashSet<string> NoiseTokens = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "MR", "MRS", "MS", "DR", "ENG", "ENGR", "PROF", "THE", "OF"
        };

        // Uppercase alphabetic tokens of 2+ chars, honorifics removed.
        public static List<string> Tokens(string? value)
        {
            var tokens = new List<string>();
            if (string.IsNullOrWhiteSpace(value)) return tokens;

            var buffer = new StringBuilder();

            void Flush()
            {
                if (buffer.Length >= 2)
                {
                    var token = buffer.ToString();
                    if (!NoiseTokens.Contains(token) && !tokens.Contains(token, StringComparer.Ordinal))
                        tokens.Add(token);
                }
                buffer.Clear();
            }

            foreach (var c in value)
            {
                if (char.IsLetter(c)) buffer.Append(char.ToUpperInvariant(c));
                else Flush();
            }
            Flush();

            return tokens;
        }

        // True when both strings denote the same person.
        public static bool Matches(string? left, string? right)
        {
            var a = Tokens(left);
            var b = Tokens(right);
            if (a.Count == 0 || b.Count == 0) return false;

            var shared = a.Count(token => b.Contains(token, StringComparer.Ordinal));
            if (shared == 0) return false;

            return shared >= Math.Min(2, Math.Min(a.Count, b.Count));
        }

        // The longest (most selective) token, used as the search term.
        public static string PrimaryToken(string? value)
        {
            var tokens = Tokens(value);
            if (tokens.Count == 0) return string.Empty;

            var best = tokens[0];
            foreach (var token in tokens)
                if (token.Length > best.Length) best = token;

            return best;
        }
    }

    // How the user-details page currently on screen was reached.
    internal enum MaintainXReachKind
    {
        None = 0,
        StaffNumber = 1,
        NameSearch = 2,
        SelfPage = 3,
        RoleSearch = 4
    }

    public sealed class MaintainXSignatureScraper
        : IMaintainXUserSignatureProvider, IMaintainXSignatureSpecimenPreview
    {
        private const string DefaultBaseUrl = "http://svdcmpa01";
        private const string DefaultLoginPath = "/maintenix/common/security/login.jsp";
        private const string DefaultUserDetailsPath = "/maintenix/web/security/MyUserDetails.jsp";
        private const string DefaultAdminUserDetailsPath = "/maintenix/web/security/UserDetails.jsp";
        private const string DefaultUserSearchPath = "/maintenix/web/security/UserSearch.jsp";

        private const string UsernameSelector = "input[name='j_username'], input[type='text']:not([type='hidden'])";
        private const string PasswordSelector = "input[name='j_password'], input[type='password']";
        private const string MenuButtonSelector = "#idMenuButton, .menu-button, [id*='MenuButton']";
        private const string ReferencesSelector =
            "a.menu-anchor:has-text('References'), a:has-text('References'), [id*='References']";
        private const string MyUserDetailsSelector =
            "a[href*='UserDetails'], a:has-text('My User Details'), a:has-text('User Details')";
        private const string UsersAdminSelector =
            "a:has-text('Users'), a[href*='UserDetails.jsp'], a[href*='useradmin']";
        private const string SignatureTabSelector =
            "a:has-text('Electronic Signature'), span:has-text('Electronic Signature'), [id*='ignature']";
        private const string SearchInputSelector =
            "input[type='text'], input:not([type]), input[name*='user' i], input[name*='name' i]";

        private const string ReadUsernameScript =
            @"() => {
                const labels = ['user id', 'user name', 'username', 'staff number', 'staff no',
                                'employee id', 'employee no', 'badge', 'login', 'user'];
                const cells = Array.from(document.querySelectorAll('td,th,span,label,div,dt'));
                for (const cell of cells) {
                    const text = (cell.textContent || '').trim().replace(/:$/, '').trim().toLowerCase();
                    if (labels.indexOf(text) < 0) continue;
                    const next = cell.nextElementSibling;
                    if (next) {
                        const input = next.querySelector ? next.querySelector('input') : null;
                        const iv = input && input.value ? input.value.trim() : '';
                        if (iv) return iv;
                        const tv = (next.textContent || '').trim();
                        if (tv) return tv;
                    }
                }
                for (const inp of document.querySelectorAll('input')) {
                    const key = ((inp.name || '') + ' ' + (inp.id || '')).toLowerCase();
                    if (!/user\s*(id|name)|username|staff|badge|employee/.test(key)) continue;
                    const v = (inp.value || '').trim();
                    if (v) return v;
                }
                const m = (document.body ? document.body.innerText : '').match(
                    /user\s*(?:id|name)\s*[:=]\s*([A-Za-z0-9_-]{3,20})/i);
                return m ? m[1] : '';
            }";

        private const string ReadFullNameScript =
            @"() => {
                const labels = ['name', 'full name', 'user full name', 'employee name',
                                'person', 'display name'];
                const cells = Array.from(document.querySelectorAll('td,th,span,label,div,dt'));
                for (const cell of cells) {
                    const text = (cell.textContent || '').trim().replace(/:$/, '').trim().toLowerCase();
                    if (labels.indexOf(text) < 0) continue;
                    const next = cell.nextElementSibling;
                    if (!next) continue;
                    const input = next.querySelector ? next.querySelector('input') : null;
                    const iv = input && input.value ? input.value.trim() : '';
                    if (iv) return iv;
                    const tv = (next.textContent || '').trim();
                    if (tv) return tv;
                }
                for (const inp of document.querySelectorAll('input')) {
                    const key = ((inp.name || '') + ' ' + (inp.id || '')).toLowerCase();
                    if (!/name/.test(key)) continue;
                    if (/user\s*name|username|file/.test(key)) continue;
                    const v = (inp.value || '').trim();
                    if (v) return v;
                }
                return '';
            }";

        // In-page scoring of every plausible media source, absolutised via baseURI.
        private const string FindSignatureSourceScript =
            @"() => {
                const EXCLUDE = /logo|icon|spacer|blank|pixel|transparent|header|footer|banner|button|btn|arrow|nav|menu|tree|bullet|help|print|calendar|loading|throbber|sort|expand|collapse|close|search|clear|required|star/i;
                const SIGN = /sign|specimen|autograph/i;
                const results = [];

                const absolute = function (raw) {
                    if (!raw) return '';
                    const value = String(raw).trim();
                    if (!value || value === '#' || value.indexOf('javascript:') === 0) return '';
                    if (value.indexOf('data:') === 0) return value;
                    try { return new URL(value, document.baseURI).href; } catch (e) { return ''; }
                };

                const meta = function (el) {
                    try {
                        return [el.getAttribute('alt') || '', el.getAttribute('title') || '', el.id || '',
                                typeof el.className === 'string' ? el.className : '',
                                el.getAttribute('name') || ''].join(' ');
                    } catch (e) { return ''; }
                };

                const contextText = function (el) {
                    let node = el, text = '';
                    for (let depth = 0; node && depth < 5; depth++) {
                        try { text += ' ' + (node.textContent || '').slice(0, 400); } catch (e) { break; }
                        node = node.parentElement;
                    }
                    return text;
                };

                const consider = function (el, raw, kind) {
                    const url = absolute(raw);
                    if (!url) return;

                    const descriptor = meta(el) + ' ' + String(raw).slice(0, 200);
                    if (EXCLUDE.test(descriptor) && !SIGN.test(descriptor)) return;

                    let width = 0, height = 0;
                    try {
                        width = el.naturalWidth || el.width || el.offsetWidth || el.clientWidth || 0;
                        height = el.naturalHeight || el.height || el.offsetHeight || el.clientHeight || 0;
                    } catch (e) { }

                    if ((kind === 'img' || kind === 'canvas') && width > 0 && height > 0 &&
                        (width < 32 || height < 12)) return;

                    let score = 0;
                    if (SIGN.test(descriptor)) score += 4000;
                    if (SIGN.test(contextText(el))) score += 1200;
                    if (kind === 'embed') score += 900;
                    if (kind === 'canvas') score += 700;
                    if (url.indexOf('data:') === 0) score += 600;
                    if (/\.(png|jpe?g|webp|gif|bmp|pdf)(\?|$)/i.test(url)) score += 200;
                    score += Math.min(1500, Math.round((width * height) / 40));

                    results.push({ url: url, score: score });
                };

                for (const img of document.querySelectorAll('img')) {
                    consider(img, img.getAttribute('src'), 'img');
                    const srcset = img.getAttribute('srcset');
                    if (srcset) {
                        const first = srcset.split(',')[0].trim().split(/\s+/)[0];
                        consider(img, first, 'img');
                    }
                }
                for (const el of document.querySelectorAll('embed,object,iframe')) {
                    consider(el, el.getAttribute('src') || el.getAttribute('data'), 'embed');
                }
                for (const el of document.querySelectorAll('image')) {
                    consider(el, el.getAttribute('href') || el.getAttribute('xlink:href'), 'embed');
                }
                for (const cv of document.querySelectorAll('canvas')) {
                    try {
                        const w = cv.width || 0, h = cv.height || 0;
                        if (w < 32 || h < 12) continue;
                        const data = cv.toDataURL('image/png');
                        if (data && data.length > 2000) consider(cv, data, 'canvas');
                    } catch (e) { }
                }
                for (const el of document.querySelectorAll('div,span,td,a')) {
                    let background = '';
                    try { background = window.getComputedStyle(el).backgroundImage || ''; }
                    catch (e) { continue; }
                    if (!background || background === 'none') continue;
                    const m = /url\(\s*['|\x22]?([^'\x22\)]+)['|\x22]?\s*\)/.exec(background);
                    if (m && m[1]) consider(el, m[1], 'background');
                }

                if (results.length === 0) return '';
                results.sort(function (a, b) { return b.score - a.score; });
                return results[0].url;
            }";

        private sealed class PreviewCacheEntry
        {
            public MaintainXSignaturePreviewResult Result = new MaintainXSignaturePreviewResult();
            public DateTime ExpiresAtUtc;
        }

        // v6 PREVIEW CACHE. The dashboard renders one cell per user and offers "Preview all",
        // so without this every row drove a fresh login -> menu -> search -> tab walk and the
        // later rows simply ran out of budget and rendered empty. Static so it survives the
        // scoped lifetime the connector is normally registered with.
        private static readonly ConcurrentDictionary<string, PreviewCacheEntry> PreviewCache =
            new ConcurrentDictionary<string, PreviewCacheEntry>(StringComparer.OrdinalIgnoreCase);

        private const int PreviewCacheCapacity = 256;

        private readonly MaintainXBrowserFactory _browserFactory;
        private readonly IOptionsMonitor<MaintainXConnectorOptions> _options;
        private readonly ILogger<MaintainXSignatureScraper> _logger;

        private readonly string _baseUrl;
        private readonly string _username;
        private readonly string _password;
        private readonly string _loginPath;
        private readonly string _userDetailsPath;
        private readonly string _adminUserDetailsPath;
        private readonly string _userDetailsUrlTemplate;
        private readonly string _userSearchPath;

        private readonly int _navigationTimeoutMs;
        private readonly int _actionTimeoutMs;
        private readonly bool _captureDiagnostics;
        private readonly string _diagnosticsPath;
        private readonly TimeSpan _previewCacheTtl;

        public MaintainXSignatureScraper(
            IConfiguration configuration,
            MaintainXBrowserFactory browserFactory,
            IOptionsMonitor<MaintainXConnectorOptions> options,
            ILogger<MaintainXSignatureScraper> logger)
        {
            _browserFactory = browserFactory ?? throw new ArgumentNullException(nameof(browserFactory));
            _options = options ?? throw new ArgumentNullException(nameof(options));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));

            var section = configuration.GetSection("MaintainXSystem");
            _baseUrl = (section["BaseUrl"] ?? DefaultBaseUrl).TrimEnd('/');
            _username = section["Username"] ?? "21041";
            _password = section["Password"] ?? "1230";
            _loginPath = section["LoginPath"] ?? DefaultLoginPath;
            _userDetailsPath = section["UserDetailsPath"] ?? DefaultUserDetailsPath;
            _adminUserDetailsPath = section["AdminUserDetailsPath"] ?? DefaultAdminUserDetailsPath;
            _userDetailsUrlTemplate = (section["UserDetailsUrlTemplate"] ?? string.Empty).Trim();
            _userSearchPath = section["UserSearchPath"] ?? DefaultUserSearchPath;

            var timeoutSeconds = ParseInt(section["TimeoutSeconds"], 90);
            _navigationTimeoutMs = timeoutSeconds * 1000;
            _actionTimeoutMs = Math.Max(15000, timeoutSeconds * 1000 / 3);

            _captureDiagnostics = ParseBool(section["CaptureDiagnostics"], false);
            _diagnosticsPath = section["DiagnosticsPath"] ?? Path.Combine("logs", "maintainx");

            // 0 disables caching entirely; the default keeps a coverage table responsive
            // without ever showing a stale specimen for a whole admin session.
            _previewCacheTtl = TimeSpan.FromSeconds(Math.Max(0, ParseInt(section["PreviewCacheSeconds"], 300)));
        }

        public bool IsEnabled => _options.CurrentValue.CanImportSignatures;

        public string ProviderName => "Scraper";

        // ================================ PUBLIC API =====================================

        public Task<MaintainXSignatureResult> FetchSignatureAsync(
            string maintainXUsername,
            long seUserId,
            CancellationToken cancellationToken = default) =>
            FetchSignatureAsync(ParseDescriptor(maintainXUsername, seUserId), cancellationToken);

        // Preferred entry point. Fetches the specimen for one SE user, aligning with the
        // EXISTING MaintainX id when SE only knows a role-style login. Never throws for a
        // MaintainX-side condition.
        public async Task<MaintainXSignatureResult> FetchSignatureAsync(
            MaintainXSignatureRequest request,
            CancellationToken cancellationToken = default)
        {
            if (request == null) throw new ArgumentNullException(nameof(request));

            var staffNumber = (request.StaffNumber ?? string.Empty).Trim();
            var fullName = (request.FullName ?? string.Empty).Trim();
            var roleHint = (request.RoleHint ?? string.Empty).Trim();

            var result = new MaintainXSignatureResult
            {
                SeUserId = request.SeUserId,
                MaintainXUsername = staffNumber,
                Provider = ProviderName
            };

            // v6: a role label alone is now a usable STARTING POINT, so the "nothing to go on"
            // gate must consider it too - otherwise "#105 . director" with no full name was
            // rejected here and the specimen column stayed empty forever.
            if (staffNumber.Length == 0 && fullName.Length == 0 && roleHint.Length == 0)
            {
                result.Status = MaintainXSignatureFetchStatus.UserIdNotMapped;
                result.Message =
                    "Neither a MaintainX staff number, a full name nor a role label was supplied, so no " +
                    "upstream account can be aligned. Add a MaintainXConnector:UserIdOverrides entry for " +
                    "this user, or give the user a full name.";
                return result;
            }

            if (!IsEnabled)
            {
                result.Status = MaintainXSignatureFetchStatus.ConnectorDisabled;
                result.Message =
                    "MaintainX signature import is disabled in configuration. Upload the specimen manually.";
                return result;
            }

            var budget = Math.Max(20_000, _options.CurrentValue.TimeoutMs - 2_000);
            var deadline = DateTime.UtcNow.AddMilliseconds(budget);

            try
            {
                await RunAsync(request, result, deadline, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                var lastStep = result.Steps.Count > 0 ? result.Steps[result.Steps.Count - 1] : "none";
                result.Status = MaintainXSignatureFetchStatus.Unavailable;
                result.Message =
                    "MaintainX did not finish within the request budget. Last step reached: " +
                    Truncate(lastStep, 220) + ". Nothing was saved.";
                result.Steps.Add("FAILED: request deadline reached; the trace above shows where it stopped.");
            }
            catch (PlaywrightException ex) when (IsBrowserMissing(ex))
            {
                result.Status = MaintainXSignatureFetchStatus.Unavailable;
                result.Message =
                    "The headless browser used to automate MaintainX is not installed on this server.";
                result.Steps.Add("FAILED: Playwright browser binaries are missing.");
                _logger.LogError(ex, "MaintainX signature scraper: browser binaries missing");
            }
            catch (Exception ex)
            {
                result.Status = MaintainXSignatureFetchStatus.Unavailable;
                result.Message = "MaintainX could not be reached or the fetch timed out. Nothing was saved.";
                result.Steps.Add("FAILED: " + ex.GetType().Name + " - " + Truncate(ex.Message, 300));
                _logger.LogError(ex, "MaintainX signature scraper failed for '{Staff}'", staffNumber);
            }

            result.FetchedAtUtc = DateTime.UtcNow;
            return result;
        }

        public Task<MaintainXSignaturePreviewResult> FetchPreviewAsync(
            string maintainXUsernameOrDescriptor,
            long seUserId,
            CancellationToken cancellationToken = default) =>
            FetchPreviewAsync(ParseDescriptor(maintainXUsernameOrDescriptor, seUserId), cancellationToken);

        // Reads the Electronic Signature tab of the ALIGNED account and returns the specimen
        // as a base64 data URL. NOTHING is persisted: no version, no storage key, no audit
        // row. "Import" remains the only operation that writes.
        public async Task<MaintainXSignaturePreviewResult> FetchPreviewAsync(
            MaintainXSignatureRequest request,
            CancellationToken cancellationToken = default)
        {
            if (request == null) throw new ArgumentNullException(nameof(request));

            var requested = BuildRequestedIdentifier(request);
            var cacheKey = BuildCacheKey(request);

            if (!request.BypassCache && TryGetCachedPreview(cacheKey, out var cached) && cached != null)
            {
                cached.FromCache = true;
                cached.SeUserId = request.SeUserId;
                cached.RequestedIdentifier = requested;
                cached.Steps.Add(
                    "Served from the read-only preview cache; MaintainX was not contacted again for this row.");
                return cached;
            }

            var fetched = await FetchSignatureAsync(request, cancellationToken);
            var preview = MaintainXSignaturePreviewResult.From(fetched);

            if (preview.SeUserId == 0) preview.SeUserId = request.SeUserId;
            if (string.IsNullOrWhiteSpace(preview.Provider)) preview.Provider = ProviderName;

            // Always echo what was asked for, even on failure, so the dashboard can name the
            // account it looked for instead of rendering a bare empty cell.
            preview.RequestedIdentifier = requested;
            if (string.IsNullOrWhiteSpace(preview.MaintainXUsername) && requested.Length > 0)
            {
                preview.MaintainXUsername = requested;
                preview.CanonicalStaffNumber = MaintainXStaffNumber.Canonical(requested);
            }

            if (string.IsNullOrWhiteSpace(preview.Message))
            {
                preview.Message = preview.Found
                    ? "Specimen read from the Electronic Signature tab in MaintainX."
                    : "MaintainX returned no specimen for this user.";
            }

            if (preview.Found)
            {
                preview.Steps.Add(
                    "Preview only: " + preview.SizeBytes + " bytes of " + preview.ContentType +
                    " were encoded for display. No specimen version was created.");
                StoreCachedPreview(cacheKey, preview);
            }

            return preview;
        }

        public void ClearPreviewCache() => PreviewCache.Clear();

        // ============================== PREVIEW CACHE ====================================

        private static string BuildRequestedIdentifier(MaintainXSignatureRequest request)
        {
            var staff = (request.StaffNumber ?? string.Empty).Trim();
            if (staff.Length > 0) return staff;

            var name = (request.FullName ?? string.Empty).Trim();
            if (name.Length > 0) return name;

            return (request.RoleHint ?? string.Empty).Trim();
        }

        private static string BuildCacheKey(MaintainXSignatureRequest request)
        {
            var canonical = MaintainXStaffNumber.Canonical(request.StaffNumber);
            if (canonical.Length > 0) return "staff:" + canonical;

            var name = string.Join('-', MaintainXPersonName.Tokens(request.FullName));
            if (name.Length > 0) return "name:" + name;

            var role = MaintainXStaffNumber.Canonical(request.RoleHint);
            if (role.Length > 0) return "role:" + role + "#" + request.SeUserId;

            return "user:" + request.SeUserId;
        }

        private bool TryGetCachedPreview(string cacheKey, out MaintainXSignaturePreviewResult? preview)
        {
            preview = null;
            if (_previewCacheTtl <= TimeSpan.Zero) return false;
            if (!PreviewCache.TryGetValue(cacheKey, out var entry)) return false;

            if (entry.ExpiresAtUtc <= DateTime.UtcNow)
            {
                PreviewCache.TryRemove(cacheKey, out _);
                return false;
            }

            preview = entry.Result.Clone();
            return true;
        }

        private void StoreCachedPreview(string cacheKey, MaintainXSignaturePreviewResult preview)
        {
            if (_previewCacheTtl <= TimeSpan.Zero) return;

            if (PreviewCache.Count >= PreviewCacheCapacity)
            {
                // Cheap eviction: drop whatever expires soonest rather than grow unbounded.
                var oldest = PreviewCache
                    .OrderBy(pair => pair.Value.ExpiresAtUtc)
                    .Select(pair => pair.Key)
                    .FirstOrDefault();
                if (oldest != null) PreviewCache.TryRemove(oldest, out _);
            }

            PreviewCache[cacheKey] = new PreviewCacheEntry
            {
                Result = preview.Clone(),
                ExpiresAtUtc = DateTime.UtcNow.Add(_previewCacheTtl)
            };
        }

        // ============================== BROWSER SESSION ==================================

        private async Task RunAsync(
            MaintainXSignatureRequest request,
            MaintainXSignatureResult result,
            DateTime deadline,
            CancellationToken ct)
        {
            var steps = result.Steps;
            var requestedStaff = (request.StaffNumber ?? string.Empty).Trim();
            var requestedName = (request.FullName ?? string.Empty).Trim();
            var requestedRole = (request.RoleHint ?? string.Empty).Trim();

            var browser = await LaunchBrowserAsync(deadline, steps);
            if (browser == null)
            {
                result.Status = MaintainXSignatureFetchStatus.Unavailable;
                result.Message =
                    "The headless browser did not start within the request budget. Nothing was saved.";
                return;
            }

            await using var context = await browser.NewContextAsync(new BrowserNewContextOptions
            {
                IgnoreHTTPSErrors = true,
                AcceptDownloads = true,
                ViewportSize = new ViewportSize { Width = 1680, Height = 1050 }
            });
            context.SetDefaultTimeout(RemainingMs(deadline, _actionTimeoutMs));
            context.SetDefaultNavigationTimeout(RemainingMs(deadline, _navigationTimeoutMs));

            var page = await context.NewPageAsync();

            if (!await LoginAsync(page, steps, deadline, ct))
            {
                result.Status = MaintainXSignatureFetchStatus.AuthenticationFailed;
                result.Message = "Failed to log in to MaintainX. Verify MaintainXSystem:Username / Password.";
                await DumpAsync(page, "sig-login-failed", steps);
                return;
            }

            var variants = BuildStaffNumberVariants(requestedStaff, request.Candidates);
            var probeable = variants.Where(MaintainXStaffNumber.LooksLikeStaffNumber).ToList();

            if (variants.Count > 0)
            {
                steps.Add("Step 3: Identifiers known for this user: " +
                          string.Join(", ", variants.Select(v => "'" + v + "'")) + ".");
            }

            if (probeable.Count == 0)
            {
                steps.Add("Step 3: '" + (requestedStaff.Length == 0 ? "(none)" : requestedStaff) +
                          "' is a role-style login, not a MaintainX staff number, so it is NOT probed as an " +
                          "id. Aligning by person name" +
                          (requestedRole.Length == 0 ? "" : " and then by role label") +
                          " instead - the real staff number will be read back from the Electronic " +
                          "Signature tab.");
            }

            var reach = MaintainXReachKind.None;
            string? reachedFor = null;

            foreach (var variant in probeable)
            {
                if (RemainingMs(deadline) < 10_000) break;
                ct.ThrowIfCancellationRequested();

                steps.Add("Step 3: Probing user details for staff number '" + variant + "' ...");
                if (await TryReachByStaffNumberAsync(page, variant, steps, deadline, ct))
                {
                    reach = MaintainXReachKind.StaffNumber;
                    reachedFor = variant;
                    break;
                }
            }

            if (reach == MaintainXReachKind.None && requestedName.Length > 0 && RemainingMs(deadline) > 12_000)
            {
                steps.Add("Step 3: Searching the MaintainX user directory for '" + requestedName + "'" +
                          (requestedRole.Length == 0 ? " ..." : " (role hint '" + requestedRole + "') ..."));

                if (await TryReachByNameAsync(page, request, steps, deadline, ct))
                {
                    reach = MaintainXReachKind.NameSearch;
                    reachedFor = requestedName;
                }
            }

            // v6 ROLE SEARCH. The specimens are filed upstream by role AND id, so the role
            // label the Admin page shows is a legitimate directory search term. Tried only
            // after the id and the person name; the identity gate still refuses an
            // unverifiable row.
            if (reach == MaintainXReachKind.None && requestedRole.Length > 0 && RemainingMs(deadline) > 12_000)
            {
                steps.Add("Step 3: Searching the MaintainX user directory by role label '" +
                          requestedRole + "' ...");

                if (await TryReachByRoleAsync(page, request, steps, deadline, ct))
                {
                    reach = MaintainXReachKind.RoleSearch;
                    reachedFor = requestedRole;
                }
            }

            if (reach == MaintainXReachKind.None && RemainingMs(deadline) > 8_000)
            {
                steps.Add("Step 3: Last resort - the session-scoped My User Details page (valid only when " +
                          "the service account IS the target user) ...");

                if (await TryReachSelfPageAsync(page, steps, deadline, ct))
                {
                    reach = MaintainXReachKind.SelfPage;
                    reachedFor = _username;
                }
            }

            if (reach == MaintainXReachKind.None)
            {
                result.Status = MaintainXSignatureFetchStatus.UserNotFoundInMaintainX;
                result.Message = BuildNotFoundMessage(requestedStaff, requestedName, requestedRole, probeable);
                await DumpAsync(page, "sig-no-user-details", steps);
                return;
            }

            // A tab that cannot be CLICKED is no longer fatal.
            var tabOpened = await ClickTabAsync(page, SignatureTabSelector, "Electronic Signature", steps, deadline);
            if (!tabOpened)
            {
                steps.Add("Step 4: WARNING - the 'Electronic Signature' tab could not be clicked. Scanning the " +
                          "page as currently rendered, because some Maintenix skins show the specimen inline.");
            }

            var shownUsername = (await ReadFrameValueAsync(page, ReadUsernameScript)).Trim();
            var shownName = (await ReadFrameValueAsync(page, ReadFullNameScript)).Trim();

            if (!await VerifyAndAlignAsync(page, request, result, reach, reachedFor, variants,
                    shownUsername, shownName, steps))
            {
                return;
            }

            var imageSrc = await FindSignatureImageSrcAsync(page, steps, deadline, ct);
            if (string.IsNullOrWhiteSpace(imageSrc))
            {
                result.Status = MaintainXSignatureFetchStatus.SignatureNotRegistered;
                result.Message = tabOpened
                    ? "MaintainX account '" + result.MaintainXUsername + "' exists but has never registered " +
                      "an electronic signature, so there is no image to display."
                    : "MaintainX account '" + result.MaintainXUsername + "' was opened but the 'Electronic " +
                      "Signature' tab could neither be clicked nor scanned for a specimen. Set " +
                      "MaintainXSystem:UserDetailsUrlTemplate to the real user-details URL, or confirm " +
                      "upstream that a specimen exists.";
                await DumpAsync(page, "sig-no-image", steps);
                return;
            }

            result.SourceUrl = Truncate(imageSrc!, 1000);
            steps.Add("Step 5: Signature image located at " + Shorten(imageSrc!) + ".");

            var bytes = await DownloadAsync(context, page, imageSrc!, result, deadline);
            if (bytes == null) return;

            if (bytes.Length == 0)
            {
                result.Status = MaintainXSignatureFetchStatus.DownloadFailed;
                result.Message = "MaintainX returned an empty signature file.";
                return;
            }

            var maxBytes = Math.Max(1024, _options.CurrentValue.MaxSignatureBytes);
            if (bytes.LongLength > maxBytes)
            {
                result.Status = MaintainXSignatureFetchStatus.FileTooLarge;
                result.Message =
                    "The MaintainX specimen is " + bytes.Length + " bytes, above the " + maxBytes +
                    " byte limit. It was rejected before storage.";
                return;
            }

            var contentType = SniffContentType(bytes);
            if (contentType == null || SignatureFileRules.DetectKind(bytes) is null)
            {
                result.Status = MaintainXSignatureFetchStatus.ContentInvalid;
                result.Message = "The downloaded file is not a valid PNG / JPEG / WebP / PDF specimen.";
                return;
            }

            var alignedId = MaintainXStaffNumber.Canonical(result.MaintainXUsername);
            if (alignedId.Length == 0) alignedId = "unknown";

            result.Status = MaintainXSignatureFetchStatus.Fetched;
            result.Content = bytes;
            result.ContentType = contentType;
            result.FileName = "maintainx-signature-" + alignedId + ExtensionFor(contentType);
            result.Sha256 = ToHex(System.Security.Cryptography.SHA256.HashData(bytes));
            result.Message =
                "Specimen read from the Electronic Signature tab of MaintainX account '" +
                result.MaintainXUsername + "'.";
            steps.Add("Step 6: " + bytes.Length + " bytes of " + contentType +
                      " fetched and sniffed OK for MaintainX account '" + result.MaintainXUsername + "'.");
        }

        // ====================== IDENTITY GATE AND ID ADOPTION ============================

        private async Task<bool> VerifyAndAlignAsync(
            IPage page,
            MaintainXSignatureRequest request,
            MaintainXSignatureResult result,
            MaintainXReachKind reach,
            string? reachedFor,
            List<string> variants,
            string shownUsername,
            string shownName,
            List<string> steps)
        {
            var requestedStaff = (request.StaffNumber ?? string.Empty).Trim();
            var requestedName = (request.FullName ?? string.Empty).Trim();
            var requestedRole = (request.RoleHint ?? string.Empty).Trim();
            var labelRead = shownUsername.Length > 0;

            if (shownName.Length > 0)
                steps.Add("Step 4: The page identifies the person as '" + Truncate(shownName, 120) + "'.");

            // ---- reached by a directory SEARCH (person name or role label) ----------------
            if (reach == MaintainXReachKind.NameSearch || reach == MaintainXReachKind.RoleSearch)
            {
                var nameKnown = requestedName.Length > 0;

                if (nameKnown && !MaintainXPersonName.Matches(shownName, requestedName))
                {
                    result.Status = MaintainXSignatureFetchStatus.UserNotFoundInMaintainX;
                    result.Message =
                        "The MaintainX row opened for '" + requestedName + "' renders '" +
                        (shownName.Length == 0 ? "(no name)" : shownName) +
                        "', which is a different person. Nothing was fetched.";
                    steps.Add("Account verification FAILED: rendered person name does not match the SE user.");
                    await DumpAsync(page, "sig-name-mismatch", steps);
                    return false;
                }

                // ROLE-ONLY match. A role identifies a POST, not a PERSON, so accepting an
                // arbitrary row would risk stamping the wrong signature onto a controlled
                // form. Refused unless the caller explicitly opted in.
                if (!nameKnown && reach == MaintainXReachKind.RoleSearch && !request.AllowRoleOnlyMatch)
                {
                    result.Status = MaintainXSignatureFetchStatus.UserIdNotMapped;
                    result.Message =
                        "A MaintainX row was found for role '" + requestedRole + "', but Self-Evaluation " +
                        "knows no person name to verify it with, so it was NOT accepted - a role identifies " +
                        "a post, not a person. Add MaintainXConnector:UserIdOverrides['" +
                        (requestedStaff.Length == 0 ? requestedRole : requestedStaff) + "'] = '" +
                        (labelRead ? MaintainXStaffNumber.Canonical(shownUsername) : "<staff number>") +
                        "' to make this user unambiguous.";
                    steps.Add("Account verification REFUSED: role-only match is not allowed for this call.");
                    await DumpAsync(page, "sig-role-only-refused", steps);
                    return false;
                }

                if (!labelRead)
                {
                    result.Status = MaintainXSignatureFetchStatus.UserNotFoundInMaintainX;
                    result.Message =
                        "'" + (nameKnown ? requestedName : requestedRole) + "' was found in MaintainX but " +
                        "the page rendered no user-id label, so the SE user cannot be aligned with an " +
                        "upstream staff number. Nothing was fetched.";
                    steps.Add("Account verification FAILED: no staff number was readable to align with.");
                    await DumpAsync(page, "sig-no-id-label", steps);
                    return false;
                }

                result.MaintainXUsername = shownUsername;
                var canonical = MaintainXStaffNumber.Canonical(shownUsername);

                steps.Add("Step 4: ALIGNED - SE user #" + request.SeUserId + " ('" +
                          (requestedStaff.Length == 0 ? (nameKnown ? requestedName : requestedRole) : requestedStaff) +
                          "') is MaintainX account '" + shownUsername + "' (canonical '" + canonical +
                          "'), matched by " + (nameKnown ? "person name" : "role label '" + requestedRole + "'") +
                          " and confirmed on the Electronic Signature tab.");

                if (!nameKnown)
                {
                    steps.Add("Step 4: WARNING - this alignment rests on a ROLE label only. Persist it as a " +
                              "MaintainXConnector:UserIdOverrides entry ('" +
                              (requestedStaff.Length == 0 ? requestedRole : requestedStaff) + "' or '" +
                              request.SeUserId + "' -> '" + canonical + "') before importing the specimen.");
                }

                if (requestedStaff.Length > 0 && !MaintainXStaffNumber.Matches(shownUsername, requestedStaff))
                {
                    steps.Add("Step 4: NOTE - Self-Evaluation stores '" + requestedStaff + "'. Add " +
                              "MaintainXConnector:UserIdOverrides['" + requestedStaff + "'] = '" + canonical +
                              "' (or key it by the SE user id) so future lookups skip the directory search.");
                }

                return true;
            }

            // ---- reached by a direct staff-number probe or the self page ------------------
            if (labelRead) result.MaintainXUsername = shownUsername;

            if (labelRead && !variants.Any(variant => MaintainXStaffNumber.Matches(shownUsername, variant)))
            {
                if (requestedName.Length > 0 && MaintainXPersonName.Matches(shownName, requestedName))
                {
                    steps.Add("Step 4: ALIGNED - MaintainX shows account '" + shownUsername + "' for '" +
                              Truncate(shownName, 80) + "', the same person as SE user #" + request.SeUserId +
                              ". Using the upstream id.");
                    return true;
                }

                result.Status = MaintainXSignatureFetchStatus.UserNotFoundInMaintainX;
                result.Message =
                    "MaintainX showed account '" + shownUsername + "' instead of the requested '" +
                    requestedStaff + "'. Nothing was fetched.";
                steps.Add("Account verification FAILED at the source; lookup aborted upstream.");
                await DumpAsync(page, "sig-account-mismatch", steps);
                return false;
            }

            var urlConfirms = variants.Any(v => page.Url.Contains(v, StringComparison.OrdinalIgnoreCase));

            if (!labelRead && !urlConfirms)
            {
                result.Status = MaintainXSignatureFetchStatus.UserNotFoundInMaintainX;
                result.Message =
                    "MaintainX opened a user details page but never confirmed account '" + requestedStaff +
                    "' (no username label and no id in the URL). Nothing was fetched.";
                steps.Add("Account verification FAILED: no positive signal that the page belongs to the " +
                          "requested staff number.");
                await DumpAsync(page, "sig-unverified-account", steps);
                return false;
            }

            if (!labelRead)
            {
                result.MaintainXUsername = requestedStaff;
                steps.Add("Step 4: Username label not rendered; account confirmed via the user-details URL " +
                          "carrying the staff number.");
            }

            steps.Add("Step 4: Electronic Signature tab confirmed for MaintainX account '" +
                      result.MaintainXUsername + "'" +
                      (reachedFor != null && !MaintainXStaffNumber.Matches(reachedFor, requestedStaff)
                          ? " (reached via '" + reachedFor + "')."
                          : "."));
            return true;
        }

        // ============================== REACH STRATEGIES =================================

        private async Task<bool> TryReachByStaffNumberAsync(
            IPage page, string staffNumber, List<string> steps, DateTime deadline, CancellationToken ct)
        {
            foreach (var url in BuildUserDetailsCandidates(staffNumber))
            {
                if (RemainingMs(deadline) < 6_000) break;
                ct.ThrowIfCancellationRequested();

                steps.Add("Step 3: Trying " + Shorten(url) + " ...");
                await SafeGotoAsync(page, url, RemainingMs(deadline, 12_000), ct);

                if (await FindFrameWithAsync(page, SignatureTabSelector, RemainingMs(deadline, 3_000)) != null)
                    return true;
            }

            if (RemainingMs(deadline) > 12_000)
            {
                steps.Add("Step 3: Direct URLs did not expose the Electronic Signature tab; walking " +
                          "References -> Users administration and opening the row for '" + staffNumber + "' ...");

                await TryClickAsync(page, MenuButtonSelector, "menu button", steps, deadline);
                await TryClickAsync(page, ReferencesSelector, "References", steps, deadline);
                await TryClickAsync(page, UsersAdminSelector, "Users", steps, deadline);

                var safeStaff = staffNumber.Replace("'", string.Empty);
                await TryClickAsync(page, "a:has-text('" + safeStaff + "')",
                    "user row '" + staffNumber + "'", steps, deadline);

                if (await FindFrameWithAsync(page, SignatureTabSelector, RemainingMs(deadline, 10_000)) != null)
                    return true;
            }

            if (RemainingMs(deadline) > 10_000)
            {
                steps.Add("Step 3: Falling back to the Users search directory " +
                          "(MaintainXSystem:UserSearchPath) ...");
                return await TryUserSearchAsync(page, staffNumber, staffNumber, null, steps, deadline, ct);
            }

            return false;
        }

        private async Task<bool> TryReachByNameAsync(
            IPage page, MaintainXSignatureRequest request, List<string> steps, DateTime deadline, CancellationToken ct)
        {
            var fullName = (request.FullName ?? string.Empty).Trim();
            var terms = new List<string>();

            void AddTerm(string? value)
            {
                if (string.IsNullOrWhiteSpace(value)) return;
                var trimmed = value!.Trim();
                if (!terms.Contains(trimmed, StringComparer.OrdinalIgnoreCase)) terms.Add(trimmed);
            }

            AddTerm(fullName);
            AddTerm(MaintainXPersonName.PrimaryToken(fullName));
            AddTerm(request.Email);

            foreach (var term in terms)
            {
                if (RemainingMs(deadline) < 10_000) break;
                ct.ThrowIfCancellationRequested();

                if (await TryUserSearchAsync(page, term, fullName, request.RoleHint, steps, deadline, ct))
                    return true;
            }

            if (RemainingMs(deadline) > 10_000)
            {
                steps.Add("Step 3: Walking References -> Users administration for the row of '" +
                          fullName + "' ...");

                await TryClickAsync(page, MenuButtonSelector, "menu button", steps, deadline);
                await TryClickAsync(page, ReferencesSelector, "References", steps, deadline);
                await TryClickAsync(page, UsersAdminSelector, "Users", steps, deadline);

                if (await ClickMatchingRowAsync(page, fullName, request.RoleHint, steps, deadline, ct) &&
                    await FindFrameWithAsync(page, SignatureTabSelector, RemainingMs(deadline, 12_000)) != null)
                {
                    return true;
                }
            }

            return false;
        }

        // v6: searches the directory by the ROLE label the Self-Evaluation Admin page shows,
        // e.g. "director". Reaching a row this way is NOT by itself an identity proof - the
        // gate in VerifyAndAlignAsync still decides whether it is acceptable.
        private async Task<bool> TryReachByRoleAsync(
            IPage page, MaintainXSignatureRequest request, List<string> steps, DateTime deadline, CancellationToken ct)
        {
            var role = (request.RoleHint ?? string.Empty).Trim();
            if (role.Length == 0) return false;

            var expected = (request.FullName ?? string.Empty).Trim();
            if (expected.Length == 0) expected = role;

            if (RemainingMs(deadline) > 10_000 &&
                await TryUserSearchAsync(page, role, expected, role, steps, deadline, ct))
            {
                return true;
            }

            if (RemainingMs(deadline) > 10_000)
            {
                steps.Add("Step 3: Walking References -> Users administration for a row labelled '" +
                          role + "' ...");

                await TryClickAsync(page, MenuButtonSelector, "menu button", steps, deadline);
                await TryClickAsync(page, ReferencesSelector, "References", steps, deadline);
                await TryClickAsync(page, UsersAdminSelector, "Users", steps, deadline);

                if (await ClickMatchingRowAsync(page, expected, role, steps, deadline, ct) &&
                    await FindFrameWithAsync(page, SignatureTabSelector, RemainingMs(deadline, 12_000)) != null)
                {
                    return true;
                }
            }

            return false;
        }

        private async Task<bool> TryReachSelfPageAsync(
            IPage page, List<string> steps, DateTime deadline, CancellationToken ct)
        {
            await SafeGotoAsync(page, Absolute(_userDetailsPath), RemainingMs(deadline, 12_000), ct);

            if (await FindFrameWithAsync(page, SignatureTabSelector, RemainingMs(deadline, 3_000)) == null)
            {
                await TryClickAsync(page, MenuButtonSelector, "menu button", steps, deadline);
                await TryClickAsync(page, ReferencesSelector, "References", steps, deadline);
                await TryClickAsync(page, MyUserDetailsSelector, "My User Details", steps, deadline);
            }

            return await FindFrameWithAsync(page, SignatureTabSelector, RemainingMs(deadline, 15_000)) != null;
        }

        // ================================ FLOW HELPERS ===================================

        private List<string> BuildUserDetailsCandidates(string staffNumber)
        {
            var escaped = Uri.EscapeDataString(staffNumber);
            var admin = Absolute(_adminUserDetailsPath);
            var candidates = new List<string>();

            // MaintainXSystem:UserDetailsUrlTemplate is the AUTHORITATIVE shape: Maintenix
            // record ids are encrypted, so a plaintext ?aUserId=21465 probe is normally
            // rejected. Paste the real address-bar URL with {USER} where the staff number
            // goes and every other probe becomes unnecessary.
            if (!string.IsNullOrWhiteSpace(_userDetailsUrlTemplate) &&
                _userDetailsUrlTemplate.Contains("{USER}", StringComparison.OrdinalIgnoreCase))
            {
                candidates.Add(Absolute(_userDetailsUrlTemplate)
                    .Replace("{USER}", escaped, StringComparison.OrdinalIgnoreCase));
            }

            candidates.Add(admin + "?aUserId=" + escaped);
            candidates.Add(admin + "?userId=" + escaped);
            candidates.Add(admin + "?j_userId=" + escaped);
            candidates.Add(admin + "?aUserName=" + escaped);

            return candidates;
        }

        private async Task<bool> TryUserSearchAsync(
            IPage page,
            string term,
            string expectedText,
            string? roleHint,
            List<string> steps,
            DateTime deadline,
            CancellationToken ct)
        {
            var searchUrl = Absolute(_userSearchPath);
            steps.Add("Step 3: Opening the user search page " + Shorten(searchUrl) + " for '" + term + "' ...");
            await SafeGotoAsync(page, searchUrl, RemainingMs(deadline, 12_000), ct);

            var frame = await FindFrameWithAsync(page, SearchInputSelector, RemainingMs(deadline, 8_000));
            if (frame == null)
            {
                steps.Add("Step 3: The user search page exposed no text input.");
                return false;
            }

            try
            {
                var input = frame.Locator("input[type='text'], input:not([type])").First;
                await input.FillAsync(term, new LocatorFillOptions { Timeout = RemainingMs(deadline, 8_000) });
                await input.PressAsync("Enter", new LocatorPressOptions { Timeout = RemainingMs(deadline, 8_000) });
                steps.Add("Step 3: Searched the user directory for '" + term + "'.");
            }
            catch (Exception ex)
            {
                steps.Add("Step 3: WARNING - the user search could not be submitted: " +
                          Truncate(ex.Message, 160));
                return false;
            }

            if (!await ClickMatchingRowAsync(page, expectedText, roleHint, steps, deadline, ct)) return false;

            return await FindFrameWithAsync(page, SignatureTabSelector, RemainingMs(deadline, 15_000)) != null;
        }

        private async Task<bool> ClickMatchingRowAsync(
            IPage page,
            string expectedText,
            string? roleHint,
            List<string> steps,
            DateTime deadline,
            CancellationToken ct)
        {
            var isName = MaintainXPersonName.Tokens(expectedText).Count >= 2;
            var roleOnly = !isName && !string.IsNullOrWhiteSpace(roleHint) &&
                           MaintainXStaffNumber.Matches(expectedText, roleHint);

            while (TimeLeftMs(deadline) > 1_000)
            {
                ct.ThrowIfCancellationRequested();

                ILocator? bestAnchor = null;
                var bestScore = 0;

                foreach (var frame in page.Frames)
                {
                    try
                    {
                        var anchors = await frame.Locator("a").AllAsync();
                        foreach (var anchor in anchors)
                        {
                            string text;
                            try { text = await anchor.TextContentAsync() ?? string.Empty; }
                            catch { continue; }

                            if (string.IsNullOrWhiteSpace(text)) continue;

                            var score = 0;

                            if (isName)
                            {
                                if (MaintainXPersonName.Matches(text, expectedText)) score += 100;
                            }
                            else if (text.Contains(expectedText, StringComparison.OrdinalIgnoreCase) ||
                                     MaintainXStaffNumber.Matches(text, expectedText))
                            {
                                score += 100;
                            }

                            // v6: on a ROLE-ONLY pass the anchor text is usually the person's
                            // name, not the role, so also accept a row whose surrounding text
                            // carries the role label.
                            if (score == 0 && roleOnly && RowMentionsRole(text, roleHint!)) score += 60;

                            if (score == 0) continue;

                            if (!string.IsNullOrWhiteSpace(roleHint) &&
                                text.Contains(roleHint!, StringComparison.OrdinalIgnoreCase))
                            {
                                score += 20;
                            }

                            if (score > bestScore)
                            {
                                bestScore = score;
                                bestAnchor = anchor;
                            }
                        }
                    }
                    catch { /* frame detached */ }
                }

                if (bestAnchor != null)
                {
                    try
                    {
                        await bestAnchor.ClickAsync(new LocatorClickOptions
                        {
                            Timeout = RemainingMs(deadline, 8_000)
                        });
                        steps.Add("Step 3: Opened the directory row matching '" +
                                  Truncate(expectedText, 80) + "'.");
                        return true;
                    }
                    catch { /* stale row, keep scanning */ }
                }

                await page.WaitForTimeoutAsync(500);
            }

            steps.Add("Step 3: The user directory returned no row matching '" +
                      Truncate(expectedText, 80) + "'.");
            return false;
        }

        private static bool RowMentionsRole(string anchorText, string roleHint) =>
            anchorText.Contains(roleHint, StringComparison.OrdinalIgnoreCase);

        private async Task<bool> LoginAsync(IPage page, List<string> steps, DateTime deadline, CancellationToken ct)
        {
            var loginUrl = Absolute(_loginPath);
            steps.Add("Step 1: Opening the MaintainX login page " + Shorten(loginUrl) + " ...");

            await SafeGotoAsync(page, loginUrl, RemainingMs(deadline, _navigationTimeoutMs), ct);

            var frame = await FindFrameWithAsync(page, PasswordSelector, RemainingMs(deadline, _actionTimeoutMs));
            if (frame == null)
            {
                steps.Add("Step 1: FAILED - no frame on the login page exposes a password field.");
                return false;
            }

            await frame.Locator(UsernameSelector).First.FillAsync(_username,
                new LocatorFillOptions { Timeout = RemainingMs(deadline, 10_000) });
            await frame.Locator(PasswordSelector).First.FillAsync(_password,
                new LocatorFillOptions { Timeout = RemainingMs(deadline, 10_000) });

            steps.Add("Step 2: Submitting credentials for the service account ...");
            try
            {
                await frame.Locator(PasswordSelector).First.PressAsync("Enter",
                    new LocatorPressOptions { Timeout = RemainingMs(deadline, 10_000) });
            }
            catch
            {
                var submit = frame.Locator("input[type='submit'], button[type='submit'], a:has-text('Login')").First;
                await submit.ClickAsync(new LocatorClickOptions { Timeout = RemainingMs(deadline, 10_000) });
            }

            try
            {
                await page.WaitForLoadStateAsync(LoadState.NetworkIdle,
                    new PageWaitForLoadStateOptions { Timeout = RemainingMs(deadline, 15_000) });
            }
            catch (TimeoutException)
            {
                // Maintenix long-polling makes network-idle timeouts normal.
            }

            if (await FindFrameWithAsync(page, MenuButtonSelector, RemainingMs(deadline, 5_000)) == null)
            {
                steps.Add("Step 2: FAILED - the application menu never appeared after login.");
                return false;
            }

            steps.Add("Step 2: Login accepted; landed on " + Shorten(page.Url) + ".");
            return true;
        }

        // Evaluates a reader script in every frame and returns the first hit.
        private async Task<string> ReadFrameValueAsync(IPage page, string script)
        {
            foreach (var frame in page.Frames)
            {
                try
                {
                    var value = await frame.EvaluateAsync<string?>(script);
                    if (!string.IsNullOrWhiteSpace(value)) return value!;
                }
                catch { /* frame detached */ }
            }

            return string.Empty;
        }

        private async Task<string?> FindSignatureImageSrcAsync(
            IPage page, List<string> steps, DateTime deadline, CancellationToken ct)
        {
            while (TimeLeftMs(deadline) > 1_000)
            {
                ct.ThrowIfCancellationRequested();

                var best = await ReadFrameValueAsync(page, FindSignatureSourceScript);
                if (!string.IsNullOrWhiteSpace(best)) return best;

                await page.WaitForTimeoutAsync(500);
            }

            steps.Add("Step 5: No signature image, canvas, embedded PDF or background specimen was rendered " +
                      "on the Electronic Signature tab.");
            return null;
        }

        private async Task<byte[]?> DownloadAsync(
            IBrowserContext context,
            IPage page,
            string imageSrc,
            MaintainXSignatureResult result,
            DateTime deadline)
        {
            if (imageSrc.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
            {
                var comma = imageSrc.IndexOf(',');
                if (comma < 0)
                {
                    result.Status = MaintainXSignatureFetchStatus.DownloadFailed;
                    result.Message = "The inline signature data URL was malformed.";
                    return null;
                }

                try
                {
                    return Convert.FromBase64String(imageSrc.Substring(comma + 1));
                }
                catch (FormatException)
                {
                    result.Status = MaintainXSignatureFetchStatus.DownloadFailed;
                    result.Message = "The inline signature image could not be decoded.";
                    return null;
                }
            }

            var downloadUrl = Absolute(imageSrc);
            try
            {
                var response = await context.APIRequest.GetAsync(downloadUrl, new APIRequestContextOptions
                {
                    IgnoreHTTPSErrors = true,
                    Timeout = RemainingMs(deadline, 20_000),
                    Headers = new Dictionary<string, string>
                    {
                        ["Accept"] = "image/*,application/pdf,*/*",
                        ["Referer"] = page.Url
                    }
                });

                if (!response.Ok)
                {
                    result.Status = MaintainXSignatureFetchStatus.DownloadFailed;
                    result.Message = "MaintainX returned HTTP " + response.Status +
                                     " for the signature image.";
                    return null;
                }

                return await response.BodyAsync() ?? Array.Empty<byte>();
            }
            catch (Exception ex)
            {
                result.Status = MaintainXSignatureFetchStatus.DownloadFailed;
                result.Message = "The signature image could not be downloaded: " + Truncate(ex.Message, 160);
                return null;
            }
        }

        private async Task<bool> ClickTabAsync(
            IPage page, string selector, string label, List<string> steps, DateTime deadline)
        {
            var frame = await FindFrameWithAsync(page, selector, RemainingMs(deadline, _actionTimeoutMs));
            if (frame == null)
            {
                steps.Add("'" + label + "' tab was never rendered.");
                return false;
            }

            try
            {
                await frame.Locator(selector).First
                    .ClickAsync(new LocatorClickOptions { Timeout = RemainingMs(deadline, 10_000) });
                steps.Add("'" + label + "' tab clicked.");
                return true;
            }
            catch (Exception ex)
            {
                steps.Add("WARNING - clicking the '" + label + "' tab failed: " + Truncate(ex.Message, 160));
                return false;
            }
        }

        private async Task TryClickAsync(
            IPage page, string selector, string label, List<string> steps, DateTime deadline)
        {
            var frame = await FindFrameWithAsync(page, selector, RemainingMs(deadline, 6_000));
            if (frame == null)
            {
                steps.Add("'" + label + "' was not found.");
                return;
            }

            try
            {
                await frame.Locator(selector).First
                    .ClickAsync(new LocatorClickOptions { Timeout = RemainingMs(deadline, 10_000) });
            }
            catch (Exception ex)
            {
                steps.Add("WARNING - clicking '" + label + "' failed: " + Truncate(ex.Message, 160));
            }
        }

        private async Task<IFrame?> FindFrameWithAsync(IPage page, string selector, int timeoutMs)
        {
            var deadline = DateTime.UtcNow.AddMilliseconds(Math.Max(500, timeoutMs));

            while (true)
            {
                foreach (var frame in page.Frames)
                {
                    try
                    {
                        if (await frame.QuerySelectorAsync(selector) != null) return frame;
                    }
                    catch { /* frame detached */ }
                }

                if (DateTime.UtcNow >= deadline) return null;

                try { await page.WaitForTimeoutAsync(250); }
                catch { return null; }
            }
        }

        private async Task SafeGotoAsync(IPage page, string url, int timeoutMs, CancellationToken ct)
        {
            try
            {
                await page.GotoAsync(url, new PageGotoOptions
                {
                    WaitUntil = WaitUntilState.DOMContentLoaded,
                    Timeout = Math.Max(1_500, timeoutMs)
                });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "MaintainX signature navigation to {Url} failed", url);
            }
        }

        private async Task DumpAsync(IPage page, string tag, List<string> steps)
        {
            if (!_captureDiagnostics) return;

            try
            {
                var folder = Path.Combine(Directory.GetCurrentDirectory(), _diagnosticsPath);
                Directory.CreateDirectory(folder);

                var stamp = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss");
                await page.ScreenshotAsync(new PageScreenshotOptions
                {
                    Path = Path.Combine(folder, stamp + "-" + tag + ".png"),
                    FullPage = true
                });
                await File.WriteAllTextAsync(Path.Combine(folder, stamp + "-" + tag + ".html"),
                    await page.ContentAsync());

                steps.Add("Diagnostics saved: " + stamp + "-" + tag);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not write MaintainX signature diagnostics");
            }
        }

        // ==================== DESCRIPTOR PARSING AND ID VARIANTS =========================

        // Turns the legacy single-string argument into a full request. Segments split on
        // '|' or ';'; a "key=value" segment supplies a hint (name, role, email, id,
        // allowrole), every other segment is a staff-number candidate.
        public static MaintainXSignatureRequest ParseDescriptor(string? descriptor, long seUserId)
        {
            var request = new MaintainXSignatureRequest { SeUserId = seUserId };
            var candidates = new List<string>();

            foreach (var rawSegment in (descriptor ?? string.Empty)
                     .Split(new[] { '|', ';' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var segment = rawSegment.Trim();
                if (segment.Length == 0) continue;

                var equals = segment.IndexOf('=');
                if (equals > 0)
                {
                    var key = segment.Substring(0, equals).Trim().ToLowerInvariant();
                    var value = segment.Substring(equals + 1).Trim();
                    if (value.Length == 0) continue;

                    if (key == "name" || key == "fullname" || key == "full_name")
                    {
                        request.FullName = value;
                        continue;
                    }
                    if (key == "role" || key == "rolelabel")
                    {
                        request.RoleHint = value;
                        continue;
                    }
                    if (key == "email" || key == "mail")
                    {
                        request.Email = value;
                        continue;
                    }
                    if (key == "id" || key == "userid" || key == "seuserid")
                    {
                        if (long.TryParse(value, out var parsed) && parsed > 0) request.SeUserId = parsed;
                        continue;
                    }
                    if (key == "allowrole" || key == "allowroleonly")
                    {
                        request.AllowRoleOnlyMatch =
                            value.Equals("true", StringComparison.OrdinalIgnoreCase) || value == "1";
                        continue;
                    }
                    if (key == "nocache" || key == "bypasscache")
                    {
                        request.BypassCache =
                            value.Equals("true", StringComparison.OrdinalIgnoreCase) || value == "1";
                        continue;
                    }
                    if (key == "staff" || key == "staffnumber" || key == "username")
                    {
                        if (!candidates.Contains(value, StringComparer.OrdinalIgnoreCase)) candidates.Add(value);
                        continue;
                    }

                    if (!candidates.Contains(value, StringComparer.OrdinalIgnoreCase)) candidates.Add(value);
                    continue;
                }

                if (!candidates.Contains(segment, StringComparer.OrdinalIgnoreCase)) candidates.Add(segment);
            }

            if (candidates.Count > 0)
            {
                request.StaffNumber = candidates[0];
                request.Candidates = candidates;
            }

            return request;
        }

        private static List<string> BuildStaffNumberVariants(
            string staffNumber, IReadOnlyList<string>? extraCandidates)
        {
            var variants = new List<string>();

            void Add(string? value)
            {
                if (string.IsNullOrWhiteSpace(value)) return;
                var trimmed = value!.Trim();
                if (!variants.Contains(trimmed, StringComparer.OrdinalIgnoreCase)) variants.Add(trimmed);
            }

            Add(staffNumber);

            if (extraCandidates != null)
                foreach (var candidate in extraCandidates) Add(candidate);

            var canonical = MaintainXStaffNumber.Canonical(staffNumber);
            Add(canonical);

            if (MaintainXStaffNumber.IsNumeric(canonical))
            {
                Add(canonical.PadLeft(5, '0'));
                Add(canonical.PadLeft(6, '0'));
            }

            return variants;
        }

        private static string BuildNotFoundMessage(
            string requestedStaff, string requestedName, string requestedRole, List<string> probeable)
        {
            if (probeable.Count == 0)
            {
                return
                    "'" + (requestedStaff.Length == 0 ? "(no id)" : requestedStaff) + "' is a role-style " +
                    "login, not a MaintainX staff number, and " +
                    (requestedName.Length == 0
                        ? (requestedRole.Length == 0
                            ? "the user has no full name or role label to search the MaintainX directory with. "
                            : "no MaintainX user could be reached through the role label '" + requestedRole + "'. ")
                        : "no MaintainX user matching '" + requestedName + "' was found in the directory. ") +
                    "Add a MaintainXConnector:UserIdOverrides entry mapping this user to the real staff " +
                    "number shown on References -> My User Details -> Electronic Signature.";
            }

            return
                "MaintainX has no user details page with an 'Electronic Signature' tab for staff number '" +
                requestedStaff + "' (tried: " + string.Join(", ", probeable) + ")" +
                (requestedName.Length == 0 ? "" : ", and no directory row matched '" + requestedName + "'") +
                (requestedRole.Length == 0 ? "" : ", and the role label '" + requestedRole + "' matched no row") +
                ". Verify the number upstream, or set MaintainXSystem:UserDetailsUrlTemplate.";
        }

        // ================================ PURE HELPERS ===================================

        private static int RemainingMs(DateTime deadline, int cap = int.MaxValue)
        {
            var remaining = (int)(deadline - DateTime.UtcNow).TotalMilliseconds;
            return Math.Max(1_500, Math.Min(cap, remaining));
        }

        // Raw remaining time; MUST be used for loop exit conditions.
        private static int TimeLeftMs(DateTime deadline) =>
            (int)(deadline - DateTime.UtcNow).TotalMilliseconds;

        private async Task<IBrowser?> LaunchBrowserAsync(DateTime deadline, List<string> steps)
        {
            var launchTask = _browserFactory.GetBrowserAsync();
            var finished = await Task.WhenAny(
                launchTask, Task.Delay(RemainingMs(deadline), CancellationToken.None));

            if (finished != launchTask)
            {
                steps.Add("FAILED: browser launch exceeded the request budget.");
                return null;
            }

            return await launchTask;
        }

        private static string? SniffContentType(byte[] bytes)
        {
            if (bytes.Length < 12) return null;

            if (bytes[0] == 0x25 && bytes[1] == 0x50 && bytes[2] == 0x44 && bytes[3] == 0x46)
                return "application/pdf";
            if (bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47)
                return "image/png";
            if (bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF)
                return "image/jpeg";
            if (bytes[0] == 0x52 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x46 &&
                bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50)
                return "image/webp";

            return null;
        }

        private static string ExtensionFor(string contentType) => contentType switch
        {
            "application/pdf" => ".pdf",
            "image/jpeg" => ".jpg",
            "image/webp" => ".webp",
            _ => ".png"
        };

        private static string ToHex(byte[] hash)
        {
            var builder = new StringBuilder(hash.Length * 2);
            foreach (var b in hash) builder.Append(b.ToString("x2"));
            return builder.ToString();
        }

        private string Absolute(string url)
        {
            if (string.IsNullOrWhiteSpace(url)) return _baseUrl;
            if (url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) return url;

            var baseUri = new Uri(_baseUrl + "/");
            return url.StartsWith("/")
                ? new Uri(baseUri, url).ToString()
                : new Uri(baseUri, url.TrimStart('/')).ToString();
        }

        private static bool IsBrowserMissing(PlaywrightException ex) =>
            ex.Message.Contains("Executable doesn't exist", StringComparison.OrdinalIgnoreCase) ||
            ex.Message.Contains("playwright install", StringComparison.OrdinalIgnoreCase) ||
            ex.Message.Contains("browserType.launch", StringComparison.OrdinalIgnoreCase);

        private static string Shorten(string? value) =>
            string.IsNullOrEmpty(value) ? "(unknown)" : Truncate(value!, 160);

        private static string Truncate(string? value, int max)
        {
            if (string.IsNullOrEmpty(value)) return string.Empty;
            return value!.Length <= max ? value : value.Substring(0, max);
        }

        private static int ParseInt(string? raw, int fallback) =>
            int.TryParse(raw, out var parsed) && parsed > 0 ? parsed : fallback;

        private static bool ParseBool(string? raw, bool fallback) =>
            bool.TryParse(raw, out var parsed) ? parsed : fallback;
    }
}