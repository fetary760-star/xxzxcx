using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using CMT.Application.SelfEvaluation.Options;
using CMT.Domain.Models.SelfEvaluation;

namespace CMT.Application.SelfEvaluation.Services
{
    // =====================================================================================
    // MaintainXUserIdentityResolver.cs  (v2 - THE ID MAPPING FIX)
    // -------------------------------------------------------------------------------------
    // THE BUG THIS FILE FIXES
    // -----------------------
    // The Admin coverage table renders a user as "#105 · 21041", i.e.
    //     #{SignatureCoverageRow.UserId} · {SignatureCoverageRow.Username}
    // so SE user 105 already carries the MaintainX staff number 21041 in `User.Username`.
    // MaintainX shows exactly "21041" on References -> My User Details -> Electronic
    // Signature. The two systems therefore agreed all along, yet the import failed.
    //
    // WHY v1 STILL MISSED IT - three concrete failure modes, all seen in this data set:
    //
    //   (a) STRICT ALL-DIGIT GATE. `LooksLikeStaffNumber` required `value.All(char.IsDigit)`.
    //       Any staff number seeded with a stray space, a non-breaking space, a zero-width
    //       character pasted from Excel, or a legitimate alphanumeric badge ("E21041")
    //       was classified `SourceFieldNotAStaffNumber` and never sent upstream. The user
    //       looked mapped in the UI and unmapped to the connector.
    //
    //   (b) NO NORMALISATION ON EITHER SIDE. "021041", "21041 ", "21041 (SMITH)" and
    //       "21041" are the SAME account, but v1 compared raw strings, so the signature
    //       scraper's verification step ("MaintainX showed account X instead of Y") aborted
    //       the import even when the right person's page was open.
    //
    //   (c) ONLY ONE OVERRIDE KEY. Overrides were keyed by `User.Username` alone. An operator
    //       looking at "#105 · 21041" naturally writes the override as "105" - the id the UI
    //       shows first - and nothing matched.
    //
    // WHAT v2 DOES
    //   1. `MaintainXStaffNumber` - ONE canonicalisation used by BOTH this resolver and
    //      `MaintainXSignatureScraper`, so "the ID matching rule" exists in exactly one place.
    //      It strips whitespace / zero-width / punctuation, uppercases, drops a trailing
    //      "(NAME)" annotation, and drops leading zeros for all-digit values.
    //   2. Override lookup by `Username`, by `Id` ("105"), by "#105", and by `Email`, so any
    //      identifier visible in the Admin table works as an override key.
    //   3. `Candidates` - the ordered list of staff numbers worth trying upstream. The
    //      scraper walks it, so "21041" still resolves when the stored value is "021041".
    //   4. A widened but still SAFE staff-number test: alphanumeric, must contain a digit,
    //      and known role-style logins ("director", "admin", ...) stay rejected, because
    //      sending a login name upstream can match an UNRELATED account and stamp the wrong
    //      person's signature onto a controlled form.
    // =====================================================================================

    /// <summary>
    /// Canonicalisation of a MaintainX staff number. Shared by the identity resolver and the
    /// signature scraper so a mapping decision and its later verification cannot disagree.
    /// </summary>
    public static class MaintainXStaffNumber
    {
        /// <summary>
        /// Login names that must NEVER be sent to MaintainX as a staff number. Sending one
        /// risks matching an unrelated upstream account and importing the wrong signature.
        /// </summary>
        private static readonly HashSet<string> ReservedLogins = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "admin", "administrator", "director", "manager", "engineer", "inspector",
            "technician", "supervisor", "teamleader", "stl", "user", "test", "demo",
            "system", "service", "guest", "root"
        };

        /// <summary>
        /// Uppercase, alphanumeric-only form, with a trailing "(NAME)" annotation removed and
        /// leading zeros dropped for a purely numeric value.
        ///
        /// <code>
        /// "21041"          -> "21041"
        /// " 21041 "        -> "21041"
        /// "021041"         -> "21041"
        /// "21041 (SMITH)"  -> "21041"
        /// "#105"           -> "105"
        /// "E-21041"        -> "E21041"
        /// </code>
        /// </summary>
        public static string Canonical(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return string.Empty;

            var text = value.Trim();

            // "21041 (SMITH)" / "21041 - SMITH": keep only the identifier in front.
            var bracket = text.IndexOf('(');
            if (bracket > 0) text = text.Substring(0, bracket);

            var buffer = new char[text.Length];
            var length = 0;

            foreach (var c in text)
            {
                // Zero-width and non-breaking characters survive an Excel paste; drop them.
                if (c == '\u200B' || c == '\u200C' || c == '\u200D' || c == '\uFEFF' || c == '\u00A0')
                    continue;

                if (char.IsLetterOrDigit(c)) buffer[length++] = char.ToUpperInvariant(c);
            }

            var canonical = new string(buffer, 0, length);
            if (canonical.Length == 0) return string.Empty;

            // "021041" and "21041" are the same badge in Maintenix.
            if (canonical.All(char.IsDigit))
            {
                var trimmed = canonical.TrimStart('0');
                return trimmed.Length == 0 ? "0" : trimmed;
            }

            return canonical;
        }

        /// <summary>
        /// True when two identifiers denote the same MaintainX account. THIS is the comparison
        /// that makes "#105 · 21041" in the Admin table match username "21041" upstream.
        /// </summary>
        public static bool Matches(string? left, string? right)
        {
            var a = Canonical(left);
            return a.Length > 0 && a == Canonical(right);
        }

        /// <summary>
        /// A plausible staff number: 3-20 characters, alphanumeric after canonicalisation, at
        /// least one digit, and not a reserved role-style login.
        /// </summary>
        public static bool LooksLikeStaffNumber(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return false;
            if (ReservedLogins.Contains(value.Trim())) return false;

            var canonical = Canonical(value);
            if (canonical.Length < 3 || canonical.Length > 20) return false;
            if (ReservedLogins.Contains(canonical)) return false;

            return canonical.Any(char.IsDigit);
        }

        /// <summary>True when the value is a pure staff NUMBER (all digits).</summary>
        public static bool IsNumeric(string? value)
        {
            var canonical = Canonical(value);
            return canonical.Length > 0 && canonical.All(char.IsDigit);
        }
    }

    /// <summary>Why an SE user could not be matched to a MaintainX account.</summary>
    public enum MaintainXIdentityStatus
    {
        /// <summary>A staff number was produced.</summary>
        Mapped = 0,

        /// <summary>No override exists and the configured source field is empty.</summary>
        SourceFieldEmpty = 1,

        /// <summary>
        /// The source field held a value that cannot be a MaintainX staff number - typically a
        /// seeded login name such as <c>"director"</c> rather than <c>"21041"</c>.
        /// </summary>
        SourceFieldNotAStaffNumber = 2,

        /// <summary>
        /// <c>UserIdSource</c> is <c>ConfigurationOverrideOnly</c> and this user has no entry in
        /// <c>UserIdOverrides</c>.
        /// </summary>
        OverrideMissing = 3
    }

    /// <summary>Result of mapping one SE user onto a MaintainX account.</summary>
    public sealed class MaintainXIdentity
    {
        public MaintainXIdentityStatus Status { get; set; } = MaintainXIdentityStatus.SourceFieldEmpty;

        public bool IsMapped => Status == MaintainXIdentityStatus.Mapped
                                && !string.IsNullOrWhiteSpace(MaintainXUsername);

        /// <summary>The MaintainX staff number as it should be SHOWN, e.g. <c>"21041"</c>.</summary>
        public string MaintainXUsername { get; set; } = string.Empty;

        /// <summary>
        /// Canonical form used for COMPARISON. Serialised so the Admin page can prove the
        /// match it renders ("#105 · 21041 -> MaintainX 21041") without re-deriving the rule.
        /// </summary>
        public string CanonicalStaffNumber { get; set; } = string.Empty;

        public long SeUserId { get; set; }

        /// <summary>The SE username the mapping started from, echoed for the Admin table.</summary>
        public string SeUsername { get; set; } = string.Empty;

        /// <summary>Where the value came from: <c>"Override"</c> or <c>"Username"</c>.</summary>
        public string Source { get; set; } = string.Empty;

        /// <summary>
        /// Every staff number worth trying upstream, best first. The signature scraper walks
        /// this list, so a stored "021041" still resolves the account shown as "21041".
        /// </summary>
        public List<string> Candidates { get; set; } = new List<string>();

        /// <summary>Operator-facing explanation when unmapped.</summary>
        public string? Message { get; set; }
    }

    /// <summary>
    /// Maps an SE <see cref="User"/> onto its MaintainX (Maintenix) account. Swapping to a
    /// future <c>User.MaintainXUserId</c> column means changing ONLY this class.
    /// </summary>
    public interface IMaintainXUserIdentityResolver
    {
        /// <summary>Maps a user. Never throws.</summary>
        MaintainXIdentity Resolve(User user);
    }

    /// <inheritdoc />
    public sealed class MaintainXUserIdentityResolver : IMaintainXUserIdentityResolver
    {
        private readonly IOptionsMonitor<MaintainXConnectorOptions> _options;
        private readonly ILogger<MaintainXUserIdentityResolver> _logger;

        public MaintainXUserIdentityResolver(
            IOptionsMonitor<MaintainXConnectorOptions> options,
            ILogger<MaintainXUserIdentityResolver> logger)
        {
            _options = options ?? throw new ArgumentNullException(nameof(options));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public MaintainXIdentity Resolve(User user)
        {
            if (user == null) throw new ArgumentNullException(nameof(user));

            var options = _options.CurrentValue;
            var username = user.Username?.Trim() ?? string.Empty;

            // ---- 1. Explicit configuration override always wins ----------------------------
            // Keyed by ANY identifier the Admin table shows, because an operator reading
            // "#105 · 21041" may legitimately write the override as "105", "#105" or "21041".
            var overrideValue = FindOverride(options, user, username);

            if (!string.IsNullOrWhiteSpace(overrideValue))
            {
                return Mapped(user, username, overrideValue!, "Override");
            }

            if (options.UserIdSource == MaintainXUserIdSource.ConfigurationOverrideOnly)
            {
                return new MaintainXIdentity
                {
                    Status = MaintainXIdentityStatus.OverrideMissing,
                    SeUserId = user.Id,
                    SeUsername = username,
                    Source = "Override",
                    Message =
                        $"User '{username}' (#{user.Id}) has no MaintainXConnector:UserIdOverrides " +
                        "entry, and UserIdSource is ConfigurationOverrideOnly. Add an entry keyed " +
                        $"by '{username}' or by '{user.Id}'."
                };
            }

            // ---- 2. Fall back to User.Username -------------------------------------------
            if (string.IsNullOrWhiteSpace(username))
            {
                return new MaintainXIdentity
                {
                    Status = MaintainXIdentityStatus.SourceFieldEmpty,
                    SeUserId = user.Id,
                    SeUsername = string.Empty,
                    Source = "Username",
                    Message = "The user has no username, so no MaintainX account can be matched."
                };
            }

            if (!MaintainXStaffNumber.LooksLikeStaffNumber(username))
            {
                _logger.LogDebug(
                    "SE user {UserId} ('{Username}') does not look like a MaintainX staff number.",
                    user.Id, username);

                return new MaintainXIdentity
                {
                    Status = MaintainXIdentityStatus.SourceFieldNotAStaffNumber,
                    SeUserId = user.Id,
                    SeUsername = username,
                    Source = "Username",
                    Message =
                        $"'{username}' is not a MaintainX staff number (e.g. 21041). " +
                        $"Add a MaintainXConnector:UserIdOverrides entry keyed by '{username}' " +
                        $"or by '{user.Id}'."
                };
            }

            return Mapped(user, username, username, "Username");
        }

        // =================================================================================
        // HELPERS
        // =================================================================================

        /// <summary>
        /// Looks the user up in <c>UserIdOverrides</c> under every identifier the Admin page
        /// exposes. First hit wins, in the order most specific -> least specific.
        /// </summary>
        private static string? FindOverride(
            MaintainXConnectorOptions options, User user, string username)
        {
            var overrides = options.UserIdOverrides;
            if (overrides == null || overrides.Count == 0) return null;

            var keys = new List<string>();
            if (!string.IsNullOrWhiteSpace(username)) keys.Add(username);
            keys.Add(user.Id.ToString());
            keys.Add($"#{user.Id}");

            var email = TryGetEmail(user);
            if (!string.IsNullOrWhiteSpace(email)) keys.Add(email!);

            foreach (var key in keys)
            {
                if (overrides.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value))
                    return value.Trim();
            }

            // Last resort: a canonical comparison of the KEYS, so an override written as
            // "021041" or "21041 " still matches username "21041".
            var canonicalUsername = MaintainXStaffNumber.Canonical(username);
            if (canonicalUsername.Length == 0) return null;

            foreach (var pair in overrides)
            {
                if (string.IsNullOrWhiteSpace(pair.Value)) continue;
                if (MaintainXStaffNumber.Canonical(pair.Key) == canonicalUsername)
                    return pair.Value.Trim();
            }

            return null;
        }

        /// <summary>
        /// Reads <c>User.Email</c> when the domain model has one, without taking a hard
        /// compile-time dependency on that property.
        /// </summary>
        private static string? TryGetEmail(User user)
        {
            var property = user.GetType().GetProperty("Email");
            if (property == null || property.PropertyType != typeof(string)) return null;

            return property.GetValue(user) as string;
        }

        private static MaintainXIdentity Mapped(User user, string seUsername, string rawValue, string source)
        {
            var display = rawValue.Trim();
            var canonical = MaintainXStaffNumber.Canonical(display);

            return new MaintainXIdentity
            {
                Status = MaintainXIdentityStatus.Mapped,
                MaintainXUsername = display,
                CanonicalStaffNumber = canonical,
                SeUserId = user.Id,
                SeUsername = seUsername,
                Source = source,
                Candidates = BuildCandidates(display, canonical)
            };
        }

        /// <summary>
        /// Ordered staff numbers to try upstream. Maintenix stores badges inconsistently
        /// (zero-padded in some tenants), so the exact stored value is tried first and the
        /// canonical / zero-padded variants follow.
        /// </summary>
        private static List<string> BuildCandidates(string display, string canonical)
        {
            var candidates = new List<string>();

            void Add(string? value)
            {
                if (string.IsNullOrWhiteSpace(value)) return;
                var trimmed = value!.Trim();
                if (!candidates.Contains(trimmed, StringComparer.OrdinalIgnoreCase))
                    candidates.Add(trimmed);
            }

            Add(display);
            Add(canonical);

            if (MaintainXStaffNumber.IsNumeric(canonical))
            {
                Add(canonical.PadLeft(5, '0'));
                Add(canonical.PadLeft(6, '0'));
            }

            return candidates;
        }
    }
}