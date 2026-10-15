using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace CMT.Application.SelfEvaluation.Services
{
    /// <summary>
    /// Outcome of fetching a signature specimen from MaintainX.
    ///
    /// Like ET P/N resolution this is a STATUS, never an exception: a missing specimen is a
    /// compliance gap that must be VISIBLE in the Admin coverage table, not an error that
    /// breaks the Signature Specimens page or blocks an approval.
    /// </summary>
    public enum MaintainXSignatureFetchStatus
    {
        /// <summary>The specimen image was downloaded. <c>Content</c> is populated.</summary>
        Fetched = 0,

        /// <summary>Signature import is switched off in configuration (the default).</summary>
        ConnectorDisabled = 1,

        /// <summary>
        /// The SE user could not be mapped onto a MaintainX account - typically because
        /// <c>User.Username</c> is not a staff number and no override was configured.
        /// </summary>
        UserIdNotMapped = 2,

        /// <summary>The staff number was mapped but MaintainX has no such user.</summary>
        UserNotFoundInMaintainX = 3,

        /// <summary>
        /// The user exists but the "Electronic Signature" tab carries no image - the person has
        /// simply never registered a specimen upstream.
        /// </summary>
        SignatureNotRegistered = 4,

        /// <summary>The image URL was found but the bytes could not be downloaded.</summary>
        DownloadFailed = 5,

        /// <summary>
        /// The downloaded bytes are not a supported image, or the declared content type does
        /// not match the sniffed magic number.
        /// </summary>
        ContentInvalid = 6,

        /// <summary>The file exceeded <c>MaintainXConnectorOptions.MaxSignatureBytes</c>.</summary>
        FileTooLarge = 7,

        /// <summary>Login to MaintainX failed or the session expired.</summary>
        AuthenticationFailed = 8,

        /// <summary>MaintainX was unreachable or the call timed out.</summary>
        Unavailable = 9
    }

    /// <summary>
    /// A signature specimen retrieved from MaintainX, before it enters the SE storage pipeline.
    /// </summary>
    public sealed class MaintainXSignatureResult
    {
        public MaintainXSignatureFetchStatus Status { get; set; } =
            MaintainXSignatureFetchStatus.SignatureNotRegistered;

        public bool Found => Status == MaintainXSignatureFetchStatus.Fetched
                             && Content != null
                             && Content.Length > 0;

        /// <summary>
        /// The MaintainX username shown on the "Electronic Signature" tab, e.g. <c>"21041"</c>.
        /// Echoed back so the caller can PROVE the specimen belongs to the intended account.
        /// </summary>
        public string MaintainXUsername { get; set; } = string.Empty;

        /// <summary>The SE user this specimen is destined for.</summary>
        public long SeUserId { get; set; }

        /// <summary>Raw bytes of the signature image.</summary>
        public byte[]? Content { get; set; }

        /// <summary>Sniffed content type, e.g. <c>"image/png"</c>.</summary>
        public string ContentType { get; set; } = "image/png";

        /// <summary>
        /// File name to hand to the storage pipeline. Derived from the MaintainX username so a
        /// stored specimen is traceable to its source account.
        /// </summary>
        public string FileName { get; set; } = "maintainx-signature.png";

        /// <summary>
        /// The <c>src</c> of the signature <c>&lt;img&gt;</c> tag the bytes came from.
        /// Recorded for audit; never rendered to a non-admin.
        /// </summary>
        public string SourceUrl { get; set; } = string.Empty;

        /// <summary>
        /// SHA-256 (lowercase hex) of <see cref="Content"/>. Lets the import service skip a
        /// re-import that would produce a byte-identical new version.
        /// </summary>
        public string? Sha256 { get; set; }

        public DateTime FetchedAtUtc { get; set; } = DateTime.UtcNow;

        /// <summary>Which implementation answered: <c>"None"</c>, <c>"Scraper"</c>, <c>"Http"</c>.</summary>
        public string Provider { get; set; } = "None";

        /// <summary>Operator-facing explanation. Must NEVER contain MaintainX credentials.</summary>
        public string? Message { get; set; }

        public List<string> Steps { get; set; } = new List<string>();

        public static MaintainXSignatureResult Disabled(string message) => new MaintainXSignatureResult
        {
            Status = MaintainXSignatureFetchStatus.ConnectorDisabled,
            Message = message
        };

        public static MaintainXSignatureResult NotMapped(long seUserId, string message) =>
            new MaintainXSignatureResult
            {
                Status = MaintainXSignatureFetchStatus.UserIdNotMapped,
                SeUserId = seUserId,
                Message = message
            };
    }

    /// <summary>
    /// Fetches a user's electronic signature specimen from MaintainX by walking the documented
    /// UI path:
    ///
    ///   1. Click "References"
    ///   2. Click "My User Details"
    ///   3. Open the "Electronic Signature" tab
    ///   4. Read the username (e.g. "21041") and the signature &lt;img&gt; src, then download it
    ///
    /// IMPLEMENTATION CONTRACT
    /// -----------------------
    /// - The ONLY interface the on-prem scraper must satisfy for signature import. Register with
    ///       services.AddScoped&lt;IMaintainXUserSignatureProvider, MyOnPremScraper&gt;();
    ///   and set MaintainXConnector:Provider to "Scraper".
    /// - MUST NOT THROW for a MaintainX-side condition; return the matching status.
    /// - MUST NOT write to the database and MUST NOT touch UserSignature.StoragePath. Persisting
    ///   is the exclusive job of <c>IUserSignatureService.UploadAsync</c>, which owns versioning,
    ///   supersede-and-revoke and the audit log.
    /// - MUST verify that the fetched <see cref="MaintainXSignatureResult.MaintainXUsername"/>
    ///   equals the staff number that was requested. "My User Details" is session-scoped in
    ///   Maintenix, so a stale session could otherwise return the WRONG person's signature and
    ///   silently stamp it onto an approval.
    /// </summary>
    public interface IMaintainXUserSignatureProvider
    {
        /// <summary>True when configured to return live data; drives the Admin UI affordance.</summary>
        bool IsEnabled { get; }

        /// <summary>Short label of the backing implementation, for the audit trail.</summary>
        string ProviderName { get; }

        /// <summary>
        /// Fetches the specimen for one MaintainX staff number.
        /// </summary>
        /// <param name="maintainXUsername">
        /// The MaintainX username / staff number, e.g. <c>"21041"</c>, produced by
        /// <see cref="IMaintainXUserIdentityResolver"/>.
        /// </param>
        /// <param name="seUserId">The SE user the specimen will be linked to, echoed back.</param>
        Task<MaintainXSignatureResult> FetchSignatureAsync(
            string maintainXUsername,
            long seUserId,
            CancellationToken cancellationToken = default);
    }
}