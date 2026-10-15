using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using CMT.Application.SelfEvaluation.Options;

namespace CMT.Application.SelfEvaluation.Services
{
    // =====================================================================================
    // NullMaintainXConnectors.cs
    // -------------------------------------------------------------------------------------
    // THE DEFAULT, SHIPPED-ON IMPLEMENTATIONS of the two new connector interfaces.
    //
    // WHY THESE EXIST
    // ---------------
    // The on-prem MaintainX scraper is plugged in LATE. Without these registrations the DI
    // container could not activate the controller, the Signature Specimens page and the two
    // ET P/N forms would 500, and the whole Self-Evaluation module would regress - purely
    // because an external system is not wired yet.
    //
    // Instead these return a deterministic "ConnectorDisabled" result. The UI reads that status
    // and simply keeps the ET P/N input manually editable, and shows the Admin an honest
    // "MaintainX import is not configured" hint rather than a fabricated value.
    //
    // NEVER let these fabricate data. A wrong stock number on a controlled aviation form is far
    // worse than an empty one an engineer must type.
    //
    // HOW THE REAL SCRAPER REPLACES THEM
    // ----------------------------------
    //   services.AddScoped<IMaintainXEtPartNumberResolver, OnPremEtPartNumberScraper>();
    //   services.AddScoped<IMaintainXUserSignatureProvider, OnPremSignatureScraper>();
    // registered AFTER the defaults (last registration wins for a single resolve), plus
    //   "MaintainXConnector": { "Enabled": true, "Provider": "Scraper" }
    // No call site changes.
    // =====================================================================================

    /// <summary>
    /// ET P/N resolver used until the on-prem scraper is registered. Always reports
    /// <see cref="EtPartNumberResolutionStatus.ConnectorDisabled"/>.
    /// </summary>
    public sealed class NullMaintainXEtPartNumberResolver : IMaintainXEtPartNumberResolver
    {
        private readonly IOptionsMonitor<MaintainXConnectorOptions> _options;
        private readonly ILogger<NullMaintainXEtPartNumberResolver> _logger;

        public NullMaintainXEtPartNumberResolver(
            IOptionsMonitor<MaintainXConnectorOptions> options,
            ILogger<NullMaintainXEtPartNumberResolver> logger)
        {
            _options = options ?? throw new ArgumentNullException(nameof(options));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <summary>
        /// Always false. The null resolver cannot return live data, so the UI must not offer a
        /// "Fetch from MaintainX" button that is guaranteed to come back empty.
        /// </summary>
        public bool IsEnabled => false;

        public string ProviderName => "None (stub)";

        public Task<EtPartNumberResult> ResolveAsync(
            EtPartNumberRequest request,
            CancellationToken cancellationToken = default)
        {
            if (request == null) throw new ArgumentNullException(nameof(request));

            var options = _options.CurrentValue;

            var result = new EtPartNumberResult
            {
                Status = EtPartNumberResolutionStatus.ConnectorDisabled,
                AtaCode = request.AtaCode ?? string.Empty,
                PartNumber = request.PartNumber ?? string.Empty,
                TaskCode = MaintainXDetailParser.NormalizeAtaCode(request.AtaCode),
                Provider = ProviderName,
                Message = BuildMessage(options)
            };

            result.Steps.Add(
                "MaintainX ET P/N connector is not configured; no request was sent to svdcmpa01.");
            result.Steps.Add(
                "Register an IMaintainXEtPartNumberResolver implementation and set " +
                "MaintainXConnector:Enabled=true with Provider=Scraper to enable live lookups.");

            _logger.LogDebug(
                "ET P/N lookup skipped (connector disabled) for ATA '{Ata}' / P/N '{PartNumber}'.",
                result.AtaCode, result.PartNumber);

            return Task.FromResult(result);
        }

        private static string BuildMessage(MaintainXConnectorOptions options)
        {
            if (!options.Enabled)
            {
                return "MaintainX integration is disabled (MaintainXConnector:Enabled = false). " +
                       "Enter the ET P/N manually.";
            }

            if (!options.EtPartNumberEnabled)
            {
                return "MaintainX ET P/N lookup is disabled " +
                       "(MaintainXConnector:EtPartNumberEnabled = false). Enter the ET P/N manually.";
            }

            return "No MaintainX ET P/N connector is registered yet " +
                   "(MaintainXConnector:Provider = None). Enter the ET P/N manually.";
        }
    }

    /// <summary>
    /// Signature provider used until the on-prem scraper is registered. Always reports
    /// <see cref="MaintainXSignatureFetchStatus.ConnectorDisabled"/> so the Admin panel keeps
    /// working with manual uploads.
    /// </summary>
    public sealed class NullMaintainXUserSignatureProvider : IMaintainXUserSignatureProvider
    {
        private readonly IOptionsMonitor<MaintainXConnectorOptions> _options;
        private readonly ILogger<NullMaintainXUserSignatureProvider> _logger;

        public NullMaintainXUserSignatureProvider(
            IOptionsMonitor<MaintainXConnectorOptions> options,
            ILogger<NullMaintainXUserSignatureProvider> logger)
        {
            _options = options ?? throw new ArgumentNullException(nameof(options));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public bool IsEnabled => false;

        public string ProviderName => "None (stub)";

        public Task<MaintainXSignatureResult> FetchSignatureAsync(
            string maintainXUsername,
            long seUserId,
            CancellationToken cancellationToken = default)
        {
            var options = _options.CurrentValue;

            var result = new MaintainXSignatureResult
            {
                Status = MaintainXSignatureFetchStatus.ConnectorDisabled,
                MaintainXUsername = maintainXUsername ?? string.Empty,
                SeUserId = seUserId,
                Provider = ProviderName,
                Message = BuildMessage(options)
            };

            result.Steps.Add(
                "MaintainX signature connector is not configured; " +
                "References -> My User Details was never opened.");
            result.Steps.Add(
                "Admins can still upload a specimen manually on the Signature Specimens page.");

            _logger.LogDebug(
                "MaintainX signature fetch skipped (connector disabled) for SE user {UserId}.",
                seUserId);

            return Task.FromResult(result);
        }

        private static string BuildMessage(MaintainXConnectorOptions options)
        {
            if (!options.Enabled)
            {
                return "MaintainX integration is disabled (MaintainXConnector:Enabled = false). " +
                       "Upload the signature specimen manually.";
            }

            if (!options.SignatureImportEnabled)
            {
                return "MaintainX signature import is disabled " +
                       "(MaintainXConnector:SignatureImportEnabled = false). Upload manually.";
            }

            return "No MaintainX signature connector is registered yet " +
                   "(MaintainXConnector:Provider = None). Upload the specimen manually.";
        }
    }
}