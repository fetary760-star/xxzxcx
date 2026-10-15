using System;

namespace CMT.Application.SelfEvaluation.Options
{
    /// <summary>
    /// Which concrete implementation backs the MaintainX connector interfaces.
    /// </summary>
    public enum MaintainXConnectorProvider
    {
        /// <summary>
        /// DEFAULT. The null connectors are used: every call returns
        /// <c>ConnectorDisabled</c> and the UI keeps the field manually editable.
        /// This is the state until the on-prem scraper is deployed.
        /// </summary>
        None = 0,

        /// <summary>
        /// An on-prem Playwright/HTML scraper is registered in DI. Selecting this value does
        /// NOT itself provide an implementation - it only asserts that one is expected, so a
        /// misconfigured host fails loudly at boot instead of silently returning "not resolved".
        /// </summary>
        Scraper = 1,

        /// <summary>
        /// A remote HTTP service (typically the on-prem scraper exposed as an API) is
        /// registered in DI and reachable at <see cref="MaintainXConnectorOptions.ScraperBaseUrl"/>.
        /// </summary>
        Http = 2
    }

    /// <summary>
    /// How an SE <c>User</c> row is mapped onto a MaintainX (Maintenix) user account.
    /// </summary>
    public enum MaintainXUserIdSource
    {
        /// <summary>
        /// DEFAULT. Use <c>User.Username</c>, which in this deployment is the staff number
        /// (for example <c>21041</c>). Requires no schema change.
        /// </summary>
        Username = 0,

        /// <summary>
        /// Use <c>User.JobTitle</c>-independent explicit mapping supplied by configuration
        /// (<see cref="MaintainXConnectorOptions.UserIdOverrides"/>) and nothing else.
        /// Useful while only a handful of approvers are onboarded.
        /// </summary>
        ConfigurationOverrideOnly = 1
    }

    /// <summary>
    /// Bound from the "MaintainXConnector" section of appsettings.json.
    ///
    /// Register in Program.cs with:
    ///     builder.Services.Configure&lt;MaintainXConnectorOptions&gt;(
    ///         builder.Configuration.GetSection(MaintainXConnectorOptions.SectionName));
    ///
    /// DELIBERATELY SEPARATE FROM "MaintainXSystem".
    /// "MaintainXSystem" configures the EXISTING task-card scrape (base URL + credentials).
    /// This section configures only the TWO NEW capabilities (ET P/N resolution and signature
    /// specimen import) so they can be switched on independently, one shop at a time, without
    /// touching the task-card flow that already works in production.
    /// </summary>
    public sealed class MaintainXConnectorOptions
    {
        public const string SectionName = "MaintainXConnector";

        /// <summary>
        /// Master switch. When false (the default) BOTH new capabilities report
        /// <c>ConnectorDisabled</c> regardless of <see cref="Provider"/>.
        /// </summary>
        public bool Enabled { get; set; }

        /// <summary>Which implementation is expected to be registered in DI.</summary>
        public MaintainXConnectorProvider Provider { get; set; } = MaintainXConnectorProvider.None;

        /// <summary>Enables ET P/N resolution specifically (requires <see cref="Enabled"/>).</summary>
        public bool EtPartNumberEnabled { get; set; } = true;

        /// <summary>Enables signature specimen import specifically (requires <see cref="Enabled"/>).</summary>
        public bool SignatureImportEnabled { get; set; } = true;

        /// <summary>How an SE user is matched to a MaintainX account.</summary>
        public MaintainXUserIdSource UserIdSource { get; set; } = MaintainXUserIdSource.Username;

        /// <summary>
        /// Explicit "SE username -&gt; MaintainX staff number" overrides, applied BEFORE
        /// <see cref="UserIdSource"/>. Lets seeded accounts such as <c>director</c> be mapped to a
        /// real staff number (<c>21041</c>) without a migration.
        /// Example: <c>{ "director": "21041", "engineer": "21055" }</c>
        /// </summary>
        public System.Collections.Generic.Dictionary<string, string> UserIdOverrides { get; set; } =
            new System.Collections.Generic.Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        /// <summary>
        /// Base URL of the on-prem scraper when <see cref="Provider"/> is
        /// <see cref="MaintainXConnectorProvider.Http"/>. Ignored otherwise.
        /// </summary>
        public string? ScraperBaseUrl { get; set; }

        /// <summary>Per-call timeout for a connector operation. Default 45s (scraping is slow).</summary>
        public int TimeoutMs { get; set; } = 45_000;

        /// <summary>
        /// Cap for a downloaded signature image, mirroring SignatureStorageOptions so an
        /// oversized remote file is rejected before it reaches the storage pipeline.
        /// </summary>
        public long MaxSignatureBytes { get; set; } = 2 * 1024 * 1024;

        /// <summary>
        /// When true a re-import that produces byte-identical content is skipped instead of
        /// creating a new version. Keeps the version history meaningful.
        /// </summary>
        public bool SkipImportWhenUnchanged { get; set; } = true;

        /// <summary>True when ET P/N resolution may actually be attempted.</summary>
        public bool CanResolveEtPartNumber =>
            Enabled && EtPartNumberEnabled && Provider != MaintainXConnectorProvider.None;

        /// <summary>True when signature import may actually be attempted.</summary>
        public bool CanImportSignatures =>
            Enabled && SignatureImportEnabled && Provider != MaintainXConnectorProvider.None;
    }
}