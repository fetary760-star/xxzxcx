using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace CMT.Application.SelfEvaluation.Services
{
    /// <summary>
    /// Outcome of an ET P/N resolution attempt.
    ///
    /// A STATUS ENUM, NOT AN EXCEPTION, ON PURPOSE.
    /// The ET P/N box on MNT-1229B / MNT-1325 must stay usable even when MaintainX is
    /// unreachable, so every failure mode is a value the UI can render as a hint next to a
    /// still-editable input. Throwing would block a controlled form from being filled in.
    /// </summary>
    public enum EtPartNumberResolutionStatus
    {
        /// <summary>The stock number was found and parsed. <c>EtPartNumber</c> is populated.</summary>
        Resolved = 0,

        /// <summary>
        /// The connector is switched off in configuration (the default until the on-prem
        /// scraper is deployed). The field stays manually editable and no error is shown.
        /// </summary>
        ConnectorDisabled = 1,

        /// <summary>MaintainX answered, but no task definition matched the ATA code.</summary>
        TaskDefinitionNotFound = 2,

        /// <summary>The task definition exists but its Applicability tab lists no part numbers.</summary>
        ApplicabilityNotFound = 3,

        /// <summary>Applicability was read, but the requested part number is not among its rows.</summary>
        PartNumberNotFound = 4,

        /// <summary>The part number's Details tab carried no stock-number entry.</summary>
        DetailsNotFound = 5,

        /// <summary>
        /// A Details entry was present but nothing usable survived parsing
        /// (for example the cell contained only "(SLIDE AY)").
        /// </summary>
        NotResolved = 6,

        /// <summary>Login to MaintainX failed or the session expired mid-scrape.</summary>
        AuthenticationFailed = 7,

        /// <summary>MaintainX was unreachable, or the call exceeded <c>TimeoutMs</c>.</summary>
        Unavailable = 8,

        /// <summary>The caller supplied no ATA code, or no part number, or neither.</summary>
        InvalidRequest = 9
    }

    /// <summary>
    /// What the caller knows before the scrape: which ATA and which part number.
    /// </summary>
    public sealed class EtPartNumberRequest
    {
        /// <summary>
        /// ATA chapter code or a full task definition code.
        /// <c>"25-61-33"</c>, <c>"256133"</c> and <c>"EMEH2561330DTC-JIC"</c> are all accepted;
        /// normalise with <see cref="MaintainXDetailParser.NormalizeAtaCode"/>.
        /// </summary>
        public string AtaCode { get; set; } = string.Empty;

        /// <summary>
        /// The manufacturer part number to look up on the Applicability tab, e.g. <c>"62773-336"</c>.
        /// </summary>
        public string PartNumber { get; set; } = string.Empty;

        /// <summary>
        /// Optional. When the caller already knows the exact task definition URL (because the
        /// TASK CARD tab just resolved it), passing it here lets the connector skip the search
        /// step entirely - the single biggest cost of the scrape.
        /// </summary>
        public string? TaskDefinitionUrl { get; set; }

        /// <summary>
        /// Optional form context, recorded in the audit trail so it is possible to prove WHICH
        /// controlled form a stock number was written onto. Expected values: <c>"MNT-1229B"</c>
        /// or <c>"MNT-1325"</c> - the only two forms with an ET P/N field.
        /// </summary>
        public string? FormNo { get; set; }

        /// <summary>Optional ATA Record id, for the audit trail.</summary>
        public string? AtaRecordId { get; set; }

        public bool IsValid =>
            !string.IsNullOrWhiteSpace(AtaCode) && !string.IsNullOrWhiteSpace(PartNumber);
    }

    /// <summary>
    /// Result of an ET P/N resolution, shaped like <c>TaskCardSearchResult</c> so the
    /// Documentation tabs and the two forms can present provenance identically.
    /// </summary>
    public sealed class EtPartNumberResult
    {
        public EtPartNumberResolutionStatus Status { get; set; } =
            EtPartNumberResolutionStatus.NotResolved;

        /// <summary>True only for <see cref="EtPartNumberResolutionStatus.Resolved"/>.</summary>
        public bool Found => Status == EtPartNumberResolutionStatus.Resolved
                             && !string.IsNullOrWhiteSpace(EtPartNumber);

        /// <summary>
        /// THE VALUE THE FORM NEEDS: the bare STOCK CODE read from the page behind the
        /// "Stock No:" entry, description stripped. In the worked example the Details tab
        /// shows <c>"25H0026 (SLIDE AY)"</c> under "Stock No:", but the ET P/N is the
        /// <c>Stock Code</c> on the page behind that link - <c>"25H0025"</c>. The old
        /// scraper stopped one hop early and returned the Stock No here; it now carries the
        /// Stock Code, and <see cref="StockNo"/> keeps the intermediate value for audit.
        /// </summary>
        public string? EtPartNumber { get; set; }

        /// <summary>
        /// The "Stock No:" value read on the Details tab, e.g. <c>"25H0026"</c>. This is the
        /// LINK TARGET, not the answer; kept so an auditor can prove the hop was followed.
        /// </summary>
        public string? StockNo { get; set; }

        /// <summary>
        /// The href of the "Stock No:" anchor that was clicked to reach the Stock Code page.
        /// Empty when the candidate came from the broad leaf scan (no link available).
        /// </summary>
        public string? StockNoUrl { get; set; }

        /// <summary>
        /// The "Stock Code:" value read from the page behind the stock entry, e.g.
        /// <c>"25H0025"</c>. When resolved this equals <see cref="EtPartNumber"/>; it is
        /// kept as a separate field so the audit trail names its source explicitly.
        /// </summary>
        public string? StockCode { get; set; }

        /// <summary>
        /// The parenthesised description (<c>"SLIDE AY"</c>). DIAGNOSTIC ONLY - it must never be
        /// concatenated into <see cref="EtPartNumber"/> or printed in the ET P/N cell.
        /// </summary>
        public string? EtPartDescription { get; set; }

        /// <summary>Exactly what the Details tab showed, before parsing. Kept for audit.</summary>
        public string? RawDetailEntry { get; set; }

        // ---------- provenance: how the value was reached ----------

        /// <summary>ATA code echoed back from the request.</summary>
        public string AtaCode { get; set; } = string.Empty;

        /// <summary>Part number echoed back from the request.</summary>
        public string PartNumber { get; set; } = string.Empty;

        /// <summary>The code actually submitted to MaintainX, e.g. <c>"256133"</c>.</summary>
        public string TaskCode { get; set; } = string.Empty;

        /// <summary>Task definition the Applicability tab was read from.</summary>
        public string TaskDefinitionCode { get; set; } = string.Empty;

        public string TaskDefinitionName { get; set; } = string.Empty;

        public string TaskDefinitionUrl { get; set; } = string.Empty;

        /// <summary>The Applicability row the Details tab was opened from.</summary>
        public string MatchedApplicabilityPartNumber { get; set; } = string.Empty;

        /// <summary>UTC instant the value was read, so staleness is visible on the form.</summary>
        public DateTime ResolvedAtUtc { get; set; } = DateTime.UtcNow;

        /// <summary>Which implementation answered: <c>"None"</c>, <c>"Scraper"</c>, <c>"Http"</c>.</summary>
        public string Provider { get; set; } = "None";

        /// <summary>
        /// Operator-facing explanation for any non-resolved status. Safe to display; must never
        /// contain MaintainX credentials.
        /// </summary>
        public string? Message { get; set; }

        /// <summary>Ordered trace of each navigation step, mirroring TaskCardSearchResult.</summary>
        public List<string> Steps { get; set; } = new List<string>();

        /// <summary>
        /// Every stock entry seen on the Details tab. Populated when more than one candidate
        /// exists so an operator can choose instead of silently accepting the first row.
        /// </summary>
        public List<string> Candidates { get; set; } = new List<string>();

        public static EtPartNumberResult Disabled(string message) => new EtPartNumberResult
        {
            Status = EtPartNumberResolutionStatus.ConnectorDisabled,
            Message = message
        };

        public static EtPartNumberResult Invalid(string message) => new EtPartNumberResult
        {
            Status = EtPartNumberResolutionStatus.InvalidRequest,
            Message = message
        };
    }

    /// <summary>
    /// Resolves the ET P/N (Ethiopian Airlines stock number) for a component by walking the
    /// MaintainX (Maintenix) UI path the business documented:
    ///
    ///   1. Open the task definition, e.g.
    ///      "EMEH2561330DTC-JIC (RESTORATION OF B777 EVAC. SLIDE/RAFT DOOR 3)"
    ///   2. Go to the "Applicability" tab
    ///   3. Navigate to the part number, e.g. "62773-336"
    ///   4. Open the "Availability" tab, then its "Details" sub-tab
    ///   5. Read the "Stock No:" entry, e.g. "25H0026 (SLIDE AY)"
    ///   6. CLICK the stock entry link and read the "Stock Code:" on the page behind it,
    ///      e.g. "25H0025" - THAT is the ET P/N. The Stock No itself is never the answer.
    ///
    /// IMPLEMENTATION CONTRACT
    /// -----------------------
    /// - This is the ONLY interface the on-prem scraper must satisfy for the ET P/N feature.
    ///   Register it AFTER the defaults so it wins:
    ///       services.AddScoped&lt;IMaintainXEtPartNumberResolver, MyOnPremScraper&gt;();
    ///   and set MaintainXConnector:Provider to "Scraper".
    /// - MUST NOT THROW for any MaintainX-side condition. Return the matching status instead;
    ///   the form must stay fillable. Only <see cref="OperationCanceledException"/> may surface.
    /// - MUST reuse <see cref="MaintainXDetailParser.ParseStockNumber"/> so the description is
    ///   stripped identically no matter which implementation runs.
    /// - Runs SERVER-SIDE ONLY. svdcmpa01 is intranet-only and the credentials must never be
    ///   exposed to the browser.
    /// </summary>
    public interface IMaintainXEtPartNumberResolver
    {
        /// <summary>
        /// True when this implementation is configured and expected to return live data.
        /// The UI uses it to decide whether to render the "Fetch from MaintainX" button at all.
        /// </summary>
        bool IsEnabled { get; }

        /// <summary>Short label of the backing implementation, for the audit trail.</summary>
        string ProviderName { get; }

        /// <summary>
        /// Resolves one ET P/N. Never throws for a MaintainX-side failure.
        /// </summary>
        Task<EtPartNumberResult> ResolveAsync(
            EtPartNumberRequest request,
            CancellationToken cancellationToken = default);
    }
}