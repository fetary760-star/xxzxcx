using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.Playwright;
using CMT.Application.SelfEvaluation.Options;

namespace CMT.Application.SelfEvaluation.Services
{
    // =====================================================================================
    // MaintainXEtPartNumberScraper.cs  (v5 - POPUP FOLLOWING + ANCHOR-LEAF STOCK SCAN)
    // -------------------------------------------------------------------------------------
    // REAL Playwright implementation of IMaintainXEtPartNumberResolver.
    //
    // THE INCIDENT v3 FIXES ("Stock No: 'EVACUATION SLIDE/RAFT, DOOR-3' ... did not expose
    // a 'Stock Code:' value")
    // ---------------------------------------------------------------------------
    // On the Availability -> Details tab, Maintenix sometimes renders the ITEM DESCRIPTION
    // where v2 expected the stock entry, e.g. the "Stock No:" cell carries
    // "EVACUATION SLIDE/RAFT, DOOR-3" while the real stock entry "25H0026 (SLIDE AY)" sits
    // in a SIBLING CELL or ANCHOR of the same row. v2 had three compounding defects:
    //
    //   (A-1) WEAK SANITY RULES. "Has a digit" + "length >= 4" accepted the description -
    //         the digit "3" of "DOOR-3" passed - so v2 chased a description link that can
    //         never expose a "Stock Code:". v3 routes EVERY candidate through
    //         MaintainXDetailParser.IsPlausibleStockNumber (a strict shape test: no
    //         whitespace, no comma/slash/bracket, 3-32 chars, >= 1 digit).
    //
    //   (A-2) CELL-SCOPED READING. v2 read only the single value cell beside the label.
    //         v3's StockNo script is ROW-SCOPED: it also collects every anchor inside the
    //         label's own row, so "25H0026 (SLIDE AY)" is found even when the description
    //         occupies the value cell.
    //
    //   (A-3) FIRST-CANDIDATE-ONLY HOP. v2 attempted the Stock Code hop on stockHits[0]
    //         and gave up. v3 walks EVERY candidate in order, returning to the Details
    //         page between attempts, and only reports NotResolved when the LAST one also
    //         failed. Each candidate's outcome is traced in Steps.
    //
    //   (A-4) QUANTITY-LOOKING READS. A "Stock Code:" read that looks like a decimal
    //         quantity ("12.5") is rejected before the echo guard.
    //
    // THE INCIDENT v4 FIXES ("clicked '70167 (AIR CRUISERS)' ... exposed no 'Stock Code:'
    // label; labels present were Manufacturer Name:, Address:, City:, ...")
    // ---------------------------------------------------------------------------
    //   (B-8) The page-wide anchor sweep treated the Manufacturer and Vendor-Contact links
    //         of the Details table as stock candidates. Clicking one lands on a MANUFACTURER
    //         record that can never carry a "Stock Code:", and the hop burned its whole
    //         budget polling it. v4 gates the sweep by href token (stock/item/inventory
    //         only) and by text shape (purely numeric manufacturer codes, MNT/VC refs
    //         refused), and adds a wrong-page detector that skips such candidates
    //         immediately instead of starving the real one of time.
    //   (A-6) The real "Stock No" entries frequently render in COLUMN layout - "Stock No"
    //         is a <th> header and "25H0026 (SLIDE AY)" sits in the cell BELOW it - or
    //         inside a single "Stock No: 25H0026 (SLIDE AY)" cell. Neither the old
    //         row-scoped read nor the exact-text label test saw them, which is what forced
    //         the junk-producing sweep in the first place. v4's StockNoScript handles both
    //         layouts, so the genuine stock anchor is collected WITH its href before any
    //         sweep is needed.
    //
    // THE INCIDENT v5 FIXES ("The Details tab exposed no 'Stock No:' entry and no
    // clickable stock link" - ZERO candidates once the v4 junk gate refused everything)
    // ---------------------------------------------------------------------------
    //   The v4 gate correctly refused the manufacturer / MNT / VC links, which exposed the
    //   REAL root cause the junk had been masking: the scraper was never on the part
    //   record at all. Maintenix opens the part row in a NEW TAB; v3/v4 kept scraping the
    //   task definition page, so the 'Availability'/'Details' clicks hit the wrong panel
    //   and the only anchors on screen were the task page's own links - which is exactly
    //   the candidate set seen in the v3 trace ('MNT1242A', '70167 (AIR CRUISERS)',
    //   'VC03162', 'VC02833').
    //   (C-2) FollowActivePageAsync switches the scrape to the popup (or an in-place
    //         navigation) BEFORE any tab is clicked.
    //   (C-3) The leaf scan now includes <a> elements - a stock entry rendered as
    //         <td><a>25H0026 (SLIDE AY)</a></td> was invisible to the childless-leaf scan
    //         - and shares the same junk gate as the sweep.
    //   (C-4) The sweep no longer requires an href: onclick-only stock links are clicked
    //         by text via OpenStockEntryAsync.
    //   (C-5) The 'no stock candidates' failure now ALWAYS dumps the page HTML, so the
    //         next report is self-explanatory without enabling CaptureDiagnostics first.
    //
    // EVERYTHING THAT ALREADY WORKED IS PRESERVED (v2 architecture):
    //   * Phase 1 resolves the task definition through IMaintainXExternalService
    //     .SearchTaskCards - the battle-tested login/menu/search flow - and merges its
    //     step trace into the result.
    //   * Phase 2 opens the task definition and scrapes Applicability -> part number row
    //     -> Availability -> Details -> stock entry -> Stock Code hop.
    //   * ONE shared deadline derived from MaintainXConnector:TimeoutMs bounds every wait,
    //     so the scrape always returns a status with a step trace BEFORE the controller's
    //     cancellation fires.
    //   * NEVER throws for a MaintainX-side condition: every failure is an
    //     EtPartNumberResolutionStatus so the controlled form stays manually editable.
    //   * The Stock No is NEVER returned as the answer; the ET P/N is the Stock Code read
    //     from the page behind the stock entry, or nothing.
    // =====================================================================================
    public sealed class MaintainXEtPartNumberScraper : IMaintainXEtPartNumberResolver
    {
        private const string DefaultBaseUrl = "http://svdcmpa01";

        private const string UsernameSelector = "input[name='j_username'], input[type='text']:not([type='hidden'])";
        private const string PasswordSelector = "input[name='j_password'], input[type='password']";
        // Anchors on the stable Maintenix tab ids (#idTabApplicability_link,
        // #idTabAvailability_link, #idTabDetails_link). The visible-text match stays as the
        // fallback for rebranded builds.
        private const string ApplicabilityTabSelector =
            "#idTabApplicability_link, a:has-text('Applicability'), span:has-text('Applicability')";
        private const string AvailabilityTabSelector =
            "#idTabAvailability_link, a:has-text('Availability'), span:has-text('Availability')";
        private const string DetailsTabSelector =
            "#idTabDetails_link, a:has-text('Details'), span:has-text('Details')";

        /// <summary>
        /// A-2 FIX (row-scoped): anchors on the literal "Stock No:" label
        /// (idCellStockNoLabel) and returns the value cell text AND, additionally, every
        /// anchor inside the label's own row. When Maintenix renders the description in the
        /// value cell ("EVACUATION SLIDE/RAFT, DOOR-3"), the real stock entry
        /// ("25H0026 (SLIDE AY)") is still discovered through its row anchor - with the href
        /// that makes the Stock Code hop clickable.
        /// </summary>
        private const string StockNoScript =
            @"() => {
                const out = [];
                const seenAnchors = [];
                const cells = Array.from(document.querySelectorAll('td,th,span,div,label'));
                for (const c of cells) {
                    const t = (c.textContent || '').replace(/\u00A0/g, ' ').trim().replace(/[:.\s]+$/, '').trim().toLowerCase();
                    const idAttr = ((c.getAttribute && c.getAttribute('id')) || '').toLowerCase();
                    const isLabel =
                        t === 'stock no' || t === 'stock no.' || t === 'stock number' ||
                        t === 'stock' || t === 'stock item' || t === 'stock #' ||
                        idAttr.indexOf('stocknolabel') >= 0 || idAttr.indexOf('cellstockno') >= 0;
                    if (!isLabel) continue;

                    // Row-scoped sweep: every anchor in the label's row (or its immediate
                    // container when the layout is not a table) is a stock-entry candidate.
                    const row = c.closest ? (c.closest('tr') || c.parentElement) : null;
                    const rowAnchors = [];
                    if (row && row.querySelectorAll) {
                        for (const a of row.querySelectorAll('a')) {
                            const at = (a.textContent || '').trim();
                            if (!at || at.length > 120) continue;
                            const href = a.getAttribute('href') || '';
                            const key = at + '|' + href;
                            if (seenAnchors.indexOf(key) >= 0) continue;
                            seenAnchors.push(key);
                            rowAnchors.push({ text: at, href });
                        }
                    }

                    // A-5 FIX: plain-text sibling cells of the same row. The real stock entry
                    // ('25H0026 (SLIDE AY)') sometimes sits in a sibling cell WITHOUT being
                    // an anchor while the description occupies the value cell.
                    const rowCells = [];
                    if (row && row.querySelectorAll) {
                        for (const rc of row.querySelectorAll('td,th,span,div')) {
                            if (rc === c) continue;
                            if (rc.children && rc.children.length > 0) continue;
                            const rt = (rc.textContent || '').trim();
                            if (!rt || rt.length > 120) continue;
                            if (rowCells.indexOf(rt) >= 0) continue;
                            rowCells.push(rt);
                        }
                    }

                    let n = c.nextElementSibling;
                    while (n && !(n.textContent || '').trim()) n = n.nextElementSibling;
                    if (!n) { out.push({ v: '', href: '', rowAnchors, rowCells }); continue; }
                    const a = n.querySelector ? n.querySelector('a') : null;
                    const v = ((a && a.textContent) || n.textContent || '').trim();
                    out.push({ v: v && v.length <= 120 ? v : '', href: a ? (a.getAttribute('href') || '') : '', rowAnchors, rowCells });
                }
                return JSON.stringify(out);
            }";

        /// <summary>
        /// A-6 FIX: the two layouts v3's row-scoped label read could not see, which is why
        /// the real stock entry was missed and the junk-producing anchor sweep ran instead.
        /// (1) COLUMN layout - "Stock No" is a table HEADER cell and the entries
        ///     ("25H0026 (SLIDE AY)") sit in the cell BELOW it, typically as anchors.
        /// (2) SINGLE-CELL layout - one cell carries "Stock No: 25H0026 (SLIDE AY)".
        /// Returns the same {v, href, rowAnchors, rowCells} shape as StockNoScript so the
        /// caller can merge the results unchanged.
        /// </summary>
        private const string StockNoColumnScript =
            @"() => {
                const out = [];
                const seen = [];
                const push = (v, href) => {
                    if (!v) return;
                    const s = String(v).trim();
                    if (!s || s.length > 120) return;
                    const key = s + '|' + (href || '');
                    if (seen.indexOf(key) >= 0) return;
                    seen.push(key);
                    out.push({ v: s, href: href || '', rowAnchors: [], rowCells: [] });
                };

                const isStockNoLabel = (t) => {
                    const n = String(t || '').replace(/\u00A0/g, ' ').replace(/[:.\s]+$/, '').trim().toLowerCase();
                    return n === 'stock no' || n === 'stock no.' || n === 'stock number' ||
                           n === 'stock' || n === 'stock item' || n === 'stock #';
                };

                // ---- (1) column layout: header cell -> the cells below it in the same column.
                for (const table of document.querySelectorAll('table')) {
                    const rows = table.querySelectorAll('tr');
                    if (!rows || rows.length < 2) continue;
                    for (let r = 0; r < rows.length; r++) {
                        const head = rows[r].querySelectorAll('td,th');
                        let idx = -1;
                        for (let i = 0; i < head.length; i++) {
                            if (isStockNoLabel((head[i].textContent || '').trim())) { idx = i; break; }
                        }
                        if (idx < 0) continue;
                        for (let r2 = r + 1; r2 < rows.length; r2++) {
                            const data = rows[r2].querySelectorAll('td,th');
                            if (idx >= data.length) continue;
                            const cell = data[idx];
                            const a = cell.querySelector ? cell.querySelector('a') : null;
                            const at = a ? (a.textContent || '').trim() : '';
                            const ah = a ? (a.getAttribute('href') || '') : '';
                            const ct = (cell.textContent || '').trim();
                            if (at) push(at, ah);
                            else if (ct) push(ct, '');
                        }
                        break;
                    }
                }

                // ---- (2) single-cell layout: 'Stock No: 25H0026 (SLIDE AY)'.
                for (const c of document.querySelectorAll('td,th,span,div,label,p,b,strong')) {
                    const raw = (c.textContent || '').trim();
                    if (!raw || raw.length > 200) continue;
                    const m = raw.match(/^stock\s*no\.?\s*[:\-]\s*(.+)$/i);
                    if (!m) continue;
                    const rest = (m[1] || '').trim();
                    if (!rest) continue;
                    const a = c.querySelector ? c.querySelector('a') : null;
                    const at = a ? (a.textContent || '').trim() : '';
                    const ah = a ? (a.getAttribute('href') || '') : '';
                    if (at && at.length <= 120) push(at, ah);
                    if (rest.length <= 120) push(rest, ah);
                }

                return JSON.stringify(out);
            }";

        /// <summary>
        /// B-8 FIX: detects the page behind a MANUFACTURER / vendor link - it renders
        /// 'Manufacturer Name:', 'Address:', 'City:', 'ZIP Code:' etc. and can NEVER carry
        /// a 'Stock Code:'. ReadStockCodeAsync uses it to abandon such a hop immediately
        /// instead of polling it for the whole slice and starving the real candidate -
        /// exactly the reported failure ('70167 (AIR CRUISERS)' -> manufacturer record).
        /// </summary>
        private const string WrongPageScript =
            @"() => {
                const body = ((document.body && (document.body.innerText || document.body.textContent)) || '').replace(/\u00A0/g, ' ');
                if (/stock\s*code/i.test(body)) return 'has-stock-code';
                let hits = 0;
                for (const re of [/manufacturer\s*name/i, /address:/i, /\bcity:/i, /\bstate:/i, /country:/i, /zip\s*code/i, /fax:/i]) {
                    if (re.test(body)) hits++;
                }
                return hits >= 3 ? 'wrong-page' : 'unknown';
            }";

        /// <summary>
        /// v4: true only while a literal 'Stock No:' label is still on screen - the
        /// discriminator that lets the relaxed echo guard accept a legitimate
        /// 'Stock Code' == 'Stock No' match on the real stock record page (which shows
        /// 'Stock Code:' / 'Stock Name:' but never 'Stock No:').
        /// </summary>
        private const string StockNoLabelProbeScript =
            @"() => {
                const body = ((document.body && (document.body.innerText || document.body.textContent)) || '').replace(/\u00A0/g, ' ');
                return /stock\s*no\.?\s*[:\-]/i.test(body) ? 'yes' : 'no';
            }";

        /// <summary>
        /// A-2 FIX (row-scoped): reads the value cell beside the literal "Stock Code:" label
        /// on the page BEHIND the stock entry. When the value cell is empty, the label's own
        /// row is swept for an anchor, because Maintenix renders the code as a link on some
        /// builds. That value - not the "Stock No:" cell - is the ET P/N.
        /// </summary>
        private const string StockCodeScript =
            @"() => {
                const values = [];
                const labels = [];

                const push = (v) => {
                    if (v === undefined || v === null) return;
                    const s = String(v).trim();
                    if (!s || s.length > 120) return;
                    if (values.indexOf(s) < 0) values.push(s);
                };

                const isLabelText = (t) => {
                    const n = String(t || '').replace(/\u00A0/g, ' ').replace(/[:.\s]+$/, '').trim().toLowerCase();
                    return n === 'stock code' || n === 'stk code' || n === 'stock cd' ||
                           n === 'stockcode' || n === 'stock code no';
                };

                const cells = Array.from(document.querySelectorAll('td,th,span,div,label,p,b,strong'));

                // ---- B-1: label and value inside the SAME cell ('Stock Code: 25H0025').
                // The old exact-text test could never see this layout, which is the most
                // common reason the hop reported 'no Stock Code value'.
                for (const c of cells) {
                    const raw = (c.textContent || '').replace(/\u00A0/g, ' ').trim();
                    if (raw && raw.length <= 60 && /:\s*$/.test(raw) && labels.length < 60) {
                        if (labels.indexOf(raw) < 0) labels.push(raw);
                    }
                    if (!raw || raw.length > 200) continue;
                    const m = raw.match(/stock\s*code\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9._\-]{1,40})/i);
                    if (m) push(m[1]);
                }

                // ---- B-2: Maintenix id-based fields (idFieldStockCode, txtStockCode, ...).
                for (const el of document.querySelectorAll('[id],[name]')) {
                    const key = (((el.getAttribute('id') || '') + ' ' + (el.getAttribute('name') || ''))).toLowerCase();
                    if (key.indexOf('stockcode') < 0 && key.indexOf('stock_code') < 0 &&
                        key.indexOf('stockcd') < 0 && key.indexOf('stkcd') < 0 && key.indexOf('stk_code') < 0) continue;
                    if (key.indexOf('label') >= 0) continue;
                    const val = (el.value !== undefined && el.value !== null) ? String(el.value).trim() : '';
                    push(val || (el.textContent || '').trim());
                }

                // ---- B-3: the exact label cell -> its value cell, row anchors, row cells.
                for (const c of cells) {
                    if (!isLabelText((c.textContent || '').trim())) continue;

                    let n = c.nextElementSibling;
                    while (n && !(n.textContent || '').trim()) n = n.nextElementSibling;
                    if (n) {
                        const a = n.querySelector ? n.querySelector('a') : null;
                        push(((a && a.textContent) || n.textContent || '').trim());
                    }

                    const row = c.closest ? c.closest('tr') : null;
                    if (row && row.querySelectorAll) {
                        for (const a of row.querySelectorAll('a')) push((a.textContent || '').trim());
                        for (const rc of row.querySelectorAll('td,th,span,div')) {
                            if (rc === c) continue;
                            if (rc.children && rc.children.length > 0) continue;
                            push((rc.textContent || '').trim());
                        }
                    }
                }

                // ---- B-4: COLUMN layout - 'Stock Code' is a table header and the value sits
                // in the cell BELOW it, not beside it. Maintenix stock lists render this way.
                for (const table of document.querySelectorAll('table')) {
                    const rows = table.querySelectorAll('tr');
                    if (!rows || rows.length < 2) continue;
                    for (let r = 0; r < rows.length; r++) {
                        const head = rows[r].querySelectorAll('td,th');
                        let idx = -1;
                        for (let i = 0; i < head.length; i++) {
                            if (isLabelText((head[i].textContent || '').trim())) { idx = i; break; }
                        }
                        if (idx < 0) continue;
                        for (let r2 = r + 1; r2 < rows.length && r2 <= r + 6; r2++) {
                            const data = rows[r2].querySelectorAll('td,th');
                            if (idx < data.length) push((data[idx].textContent || '').trim());
                        }
                        break;
                    }
                }

                // ---- B-5: last resort - the rendered text of the whole document.
                const body = ((document.body && (document.body.innerText || document.body.textContent)) || '').replace(/\u00A0/g, ' ');
                const bm = body.match(/stock\s*code\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9._\-]{1,40})/i);
                if (bm) push(bm[1]);

                return JSON.stringify({ values, labels });
            }";

        /// <summary>One round-trip per frame: every anchor's text + href, plus every leaf cell text.</summary>
        private const string PageScanScript =
            @"() => {
                const anchors = [];
                for (const a of document.querySelectorAll('a')) {
                    const t = (a.textContent || '').trim();
                    if (t && t.length <= 120) anchors.push([t, a.getAttribute('href') || '']);
                }
                const leaves = [];
                for (const n of document.querySelectorAll('td, th, span, div, label, p, a')) {
                    if (n.children && n.children.length > 0) continue;
                    const t = (n.textContent || '').trim();
                    if (t && t.length <= 120) leaves.push(t);
                }
                return JSON.stringify({ anchors, leaves });
            }";

        /// <summary>A-4 FIX: values that look like decimal quantities are not stock codes.</summary>
        private static readonly Regex DecimalQuantityPattern =
            new Regex(@"^\d{1,4}(\.\d+)?$", RegexOptions.Compiled);

        private readonly IMaintainXExternalService _taskCards;
        private readonly MaintainXBrowserFactory _browserFactory;
        private readonly IOptionsMonitor<MaintainXConnectorOptions> _options;
        private readonly ILogger<MaintainXEtPartNumberScraper> _logger;

        private readonly string _baseUrl;
        private readonly string _username;
        private readonly string _password;
        private readonly string _loginPath;

        private readonly int _navigationTimeoutMs;
        private readonly int _actionTimeoutMs;
        private readonly bool _captureDiagnostics;
        private readonly string _diagnosticsPath;

        public MaintainXEtPartNumberScraper(
            IConfiguration configuration,
            IMaintainXExternalService taskCards,
            MaintainXBrowserFactory browserFactory,
            IOptionsMonitor<MaintainXConnectorOptions> options,
            ILogger<MaintainXEtPartNumberScraper> logger)
        {
            _taskCards = taskCards ?? throw new ArgumentNullException(nameof(taskCards));
            _browserFactory = browserFactory ?? throw new ArgumentNullException(nameof(browserFactory));
            _options = options ?? throw new ArgumentNullException(nameof(options));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));

            var section = configuration.GetSection("MaintainXSystem");
            _baseUrl = (section["BaseUrl"] ?? DefaultBaseUrl).TrimEnd('/');
            _username = section["Username"] ?? "21041";
            _password = section["Password"] ?? "1230";
            _loginPath = section["LoginPath"] ?? "/maintenix/common/security/login.jsp";

            var timeoutSeconds = ParseInt(section["TimeoutSeconds"], 90);
            _navigationTimeoutMs = timeoutSeconds * 1000;
            _actionTimeoutMs = Math.Max(15000, timeoutSeconds * 1000 / 3);

            _captureDiagnostics = ParseBool(section["CaptureDiagnostics"], false);
            _diagnosticsPath = section["DiagnosticsPath"] ?? Path.Combine("logs", "maintainx");
        }

        /// <summary>Drives the "Fetch from MaintainX" button visibility end to end.</summary>
        public bool IsEnabled => _options.CurrentValue.CanResolveEtPartNumber;

        public string ProviderName => "Scraper";

        // =================================================================================
        // PUBLIC API
        // =================================================================================

        public async Task<EtPartNumberResult> ResolveAsync(
            EtPartNumberRequest request,
            CancellationToken cancellationToken = default)
        {
            var result = new EtPartNumberResult { Provider = ProviderName };

            if (request == null)
                return EtPartNumberResult.Invalid("No ET P/N request was supplied.");

            result.AtaCode = request.AtaCode ?? string.Empty;
            result.PartNumber = request.PartNumber ?? string.Empty;
            result.TaskCode = MaintainXDetailParser.NormalizeAtaCode(request.AtaCode);

            if (!request.IsValid)
            {
                result.Status = EtPartNumberResolutionStatus.InvalidRequest;
                result.Message = "An ATA code and a part number are both required.";
                return result;
            }

            if (!IsEnabled)
            {
                result.Status = EtPartNumberResolutionStatus.ConnectorDisabled;
                result.Message =
                    "MaintainX ET P/N lookup is disabled in configuration. Enter the ET P/N manually.";
                return result;
            }

            // ONE shared deadline for the whole scrape. The controller cancels at TimeoutMs;
            // we stop 2s earlier so the result always carries the step trace that shows
            // exactly where the scrape stopped.
            var budget = Math.Max(20_000, _options.CurrentValue.TimeoutMs - 2_000);
            var deadline = DateTime.UtcNow.AddMilliseconds(budget);

            try
            {
                await RunAsync(request, result, deadline, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                // The controller's deadline fired mid-scrape. Return the partial result so
                // the step trace survives - actionable instead of a bare timeout.
                var lastStep = result.Steps.Count > 0 ? result.Steps[result.Steps.Count - 1] : "none";
                result.Status = EtPartNumberResolutionStatus.Unavailable;
                result.Message =
                    $"MaintainX did not finish within the request budget. Last step reached: " +
                    $"{Truncate(lastStep, 220)}. Enter the ET P/N manually.";
                result.Steps.Add("FAILED: request deadline reached; the trace above shows where the scrape stopped.");
            }
            catch (PlaywrightException ex) when (IsBrowserMissing(ex))
            {
                result.Status = EtPartNumberResolutionStatus.Unavailable;
                result.Message =
                    "The headless browser used to automate MaintainX is not installed on this server.";
                result.Steps.Add("FAILED: Playwright browser binaries are missing.");
                _logger.LogError(ex, "MaintainX ET P/N scraper: browser binaries missing");
            }
            catch (Exception ex)
            {
                result.Status = EtPartNumberResolutionStatus.Unavailable;
                result.Message =
                    "MaintainX could not be reached or the lookup timed out. Enter the ET P/N manually.";
                result.Steps.Add($"FAILED: {ex.GetType().Name} - {Truncate(ex.Message, 300)}");
                _logger.LogError(ex, "MaintainX ET P/N scraper failed for ATA {Ata} / PN {Pn}",
                    result.AtaCode, result.PartNumber);
            }

            result.ResolvedAtUtc = DateTime.UtcNow;
            return result;
        }

        // =================================================================================
        // PHASE 1: RESOLVE THE TASK DEFINITION THROUGH THE PROVEN TASK CARD FLOW
        // PHASE 2: OPEN IT AND SCRAPE APPLICABILITY -> PART -> DETAILS -> STOCK CODE
        // =================================================================================

        private async Task RunAsync(
            EtPartNumberRequest request,
            EtPartNumberResult result,
            DateTime deadline,
            CancellationToken ct)
        {
            var steps = result.Steps;

            // ---------------- phase 1 ----------------
            string taskDefinitionUrl = (request.TaskDefinitionUrl ?? string.Empty).Trim();

            if (string.IsNullOrWhiteSpace(taskDefinitionUrl))
            {
                steps.Add("Step 1: Resolving the task definition through the task card search " +
                          "flow (the same login -> menu -> search the TASK CARD tab uses) ...");

                var search = await _taskCards.SearchTaskCards(request.AtaCode, request.PartNumber);
                result.Steps.AddRange(search.SearchSteps);
                if (!string.IsNullOrWhiteSpace(search.TaskCode))
                    result.TaskCode = search.TaskCode;

                var primary = search.PrimaryItem
                              ?? search.Items.FirstOrDefault(i => i.IsDtcJic && i.MatchesPartNumber)
                              ?? search.Items.FirstOrDefault(i => i.IsDtcJic)
                              ?? search.Items.FirstOrDefault(i => i.MatchesPartNumber)
                              ?? search.Items.FirstOrDefault();

                if (primary == null || string.IsNullOrWhiteSpace(primary.TaskDefinitionUrl))
                {
                    result.Status = EtPartNumberResolutionStatus.TaskDefinitionNotFound;
                    result.Message = search.ErrorMessage ??
                        $"No task definition was found for ATA '{request.AtaCode}' in MaintainX.";
                    return;
                }

                taskDefinitionUrl = primary.TaskDefinitionUrl;
                result.TaskDefinitionCode = primary.TaskDefinitionCode;
                result.TaskDefinitionName = primary.TaskDefinitionName;
                steps.Add($"Step 2: Task definition '{primary.TaskDefinitionCode}' resolved " +
                          $"by the task card flow; opening its Applicability tab ...");
            }
            else
            {
                steps.Add("Step 1: Using the task definition URL supplied by the TASK CARD tab " +
                          $"({Shorten(taskDefinitionUrl)}) - search skipped.");
            }

            result.TaskDefinitionUrl = taskDefinitionUrl;

            if (RemainingMs(deadline) < 8_000)
            {
                result.Status = EtPartNumberResolutionStatus.Unavailable;
                result.Message = "MaintainX search consumed the lookup budget before the " +
                                 "Applicability scrape could start. Enter the ET P/N manually.";
                steps.Add("FAILED: out of time after task definition resolution.");
                return;
            }

            // ---------------- phase 2 ----------------
            var browser = await _browserFactory.GetBrowserAsync();
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
                result.Status = EtPartNumberResolutionStatus.AuthenticationFailed;
                result.Message =
                    "Failed to log in to MaintainX. Verify MaintainXSystem:Username / Password.";
                await DumpAsync(page, "etpn-login-failed", steps);
                return;
            }

            steps.Add($"Step 3: Opening the task definition {Shorten(taskDefinitionUrl)} ...");
            await SafeGotoAsync(page, Absolute(taskDefinitionUrl), deadline, ct);

            if (await FindFrameWithAsync(page, PasswordSelector, RemainingMs(deadline, 2_500)) != null)
            {
                result.Status = EtPartNumberResolutionStatus.AuthenticationFailed;
                result.Message = "MaintainX bounced back to the login form mid-scrape.";
                await DumpAsync(page, "etpn-bounced-login", steps);
                return;
            }

            // ---- Applicability tab ----
            if (!await ClickTabAsync(page, ApplicabilityTabSelector, "Applicability", steps, deadline))
            {
                result.Status = EtPartNumberResolutionStatus.ApplicabilityNotFound;
                result.Message =
                    "The task definition opened but its 'Applicability' tab was never rendered. " +
                    "Enable MaintainXSystem:CaptureDiagnostics and check logs/maintainx.";
                await DumpAsync(page, "etpn-no-applicability", steps);
                return;
            }

            // ---- locate the MFG part number row (batch scan, no per-anchor round-trips) ----
            var part = await WaitForPartNumberAsync(page, request.PartNumber, steps, deadline, ct);
            if (part == null)
            {
                result.Status = EtPartNumberResolutionStatus.PartNumberNotFound;
                result.Message =
                    $"'{request.PartNumber}' is not listed on the Applicability tab of this " +
                    "task definition. Verify the P/N in MaintainX manually.";
                await DumpAsync(page, "etpn-no-part-row", steps);
                return;
            }

            result.MatchedApplicabilityPartNumber = request.PartNumber;
            steps.Add($"Step 5: Part number row '{part.Text}' located; opening its detail page ...");

            // Click first (keeps Maintenix's JS state), fall back to the anchor's own href.
            var urlBeforePart = page.Url;
            var pagesBeforePart = context.Pages.Count;
            var opened = false;
            try
            {
                await part.Frame.Locator("a", new FrameLocatorOptions { HasText = part.Text }).First
                    .ClickAsync(new LocatorClickOptions { Timeout = RemainingMs(deadline, _actionTimeoutMs) });
                opened = true;
            }
            catch (Exception ex)
            {
                steps.Add($"Step 5: WARNING - clicking the part row failed ({Truncate(ex.Message, 160)}); " +
                          "trying href navigation.");
            }

            if (!opened && !string.IsNullOrWhiteSpace(part.Href))
            {
                await SafeGotoAsync(page, Absolute(part.Href), deadline, ct);
            }

            // C-2 FIX: Maintenix opens the part row in a NEW TAB. Without switching to the
            // popup, every later click (Availability, Details, stock entry) runs against the
            // task definition page - which is why the v3 trace chased the task page's own
            // links ('MNT1242A', '70167 (AIR CRUISERS)', 'VC03162', 'VC02833') instead of
            // the part's stock rows. The scrape must continue on whatever page the click
            // actually produced.
            page = await FollowActivePageAsync(context, page, urlBeforePart, pagesBeforePart, steps,
                "part record", RemainingMs(deadline, 4_000));

            // ---- Availability -> Details (NESTED, in that order) ----
            // The documented path is Availability FIRST, then Details - on the Maintenix part
            // page Details is a sub-tab rendered INSIDE the Availability panel. Both tabs are
            // attempted in order; the scrape only fails when NEITHER could be opened.
            var availabilityOpened = await ClickTabAsync(page, AvailabilityTabSelector, "Availability", steps, deadline);
            var detailsOpened = await ClickTabAsync(page, DetailsTabSelector, "Details", steps, deadline);

            if (!availabilityOpened && !detailsOpened)
            {
                result.Status = EtPartNumberResolutionStatus.DetailsNotFound;
                result.Message =
                    "The part detail page opened but neither its 'Availability' nor its 'Details' " +
                    "tab could be entered, so the 'Stock No:' value could not be read.";
                await DumpAsync(page, "etpn-no-details", steps);
                return;
            }

            // ---- collect the "Stock No:" candidates, then FOLLOW each to its "Stock Code:" ----
            // A-5 FIX: candidates are sourced ROW-SCOPED and ordered so that entries which
            // already look like a stock code ("25H0026 (SLIDE AY)") are chased FIRST, while a
            // description-only LINK ("EVACUATION SLIDE/RAFT, DOOR-3") is still kept as a
            // navigation fallback - it is never the answer, but the Stock Code sits behind it.
            var stockHits = await CollectStockCandidatesAsync(page, request, steps, deadline, ct);

            if (stockHits.Count == 0)
            {
                result.Status = EtPartNumberResolutionStatus.NotResolved;
                result.Message =
                    "The Details tab exposed no 'Stock No:' entry and no clickable stock link, " +
                    "so the Stock Code hop could not be started. The page HTML was saved to " +
                    "logs/maintainx (etpn-no-stock) even without CaptureDiagnostics enabled - " +
                    "open it and check (a) whether the part record really opened (Maintenix may " +
                    "have shown a new tab the scraper could not follow) and (b) whether the " +
                    "Availability -> Details tab lists a 'Stock No:' row at all.";
                await DumpAsync(page, "etpn-no-stock", steps, force: true);
                return;
            }

            result.Candidates = stockHits.Select(h => h.Text).ToList();
            steps.Add($"Step 6: {stockHits.Count} stock candidate(s) collected " +
                      $"({stockHits.Count(h => h.IsStrict)} match the stock-code shape, " +
                      $"{stockHits.Count(h => !h.IsStrict)} description-only link(s) kept as " +
                      "fallback); following each to read the 'Stock Code:' ...");

            // A-3 FIX: the hop walks EVERY candidate, returning to the Details page between
            // attempts, instead of betting on the first one.
            var (stockCode, chosen) = await ResolveStockCodeAsync(context, page, stockHits, steps, deadline, ct);

            if (chosen == null || string.IsNullOrWhiteSpace(stockCode))
            {
                // NEVER fall back to the Stock No - that is the one-hop-early bug itself.
                result.Status = EtPartNumberResolutionStatus.NotResolved;
                result.Message =
                    "The 'Stock No:' entries were read, but the page behind none of them exposed " +
                    "a 'Stock Code:' value. The ET P/N is the Stock Code, not the Stock No; " +
                    "nothing was resolved. Open the stock entry in MaintainX manually and copy " +
                    "the Stock Code.";
                await DumpAsync(page, "etpn-no-stock-code", steps);
                return;
            }

            result.StockNo = MaintainXDetailParser.ParseStockNumber(chosen.Text);
            result.StockNoUrl = chosen.Href;
            result.RawDetailEntry = chosen.Text;
            result.EtPartDescription = MaintainXDetailParser.ParseStockDescription(chosen.Text);
            result.StockCode = stockCode;
            result.EtPartNumber = stockCode;

            result.Status = EtPartNumberResolutionStatus.Resolved;
            steps.Add($"Step 7: ET P/N resolved via the Stock Code hop: '{result.RawDetailEntry}' " +
                      $"-> link -> Stock Code '{result.StockCode}' " +
                      $"(description '{result.EtPartDescription ?? "-"}' kept for audit only).");
        }

        // =================================================================================
        // PHASE 2 HELPERS
        // =================================================================================

        private async Task<bool> LoginAsync(IPage page, List<string> steps, DateTime deadline, CancellationToken ct)
        {
            var loginUrl = Absolute(_loginPath);
            steps.Add($"Step 2a: Opening the MaintainX login page {Shorten(loginUrl)} ...");

            await SafeGotoAsync(page, loginUrl, deadline, ct);

            var frame = await FindFrameWithAsync(page, PasswordSelector, RemainingMs(deadline, _actionTimeoutMs));
            if (frame == null)
            {
                steps.Add("Step 2a: FAILED - no frame on the login page exposes a password field.");
                return false;
            }

            await frame.Locator(UsernameSelector).First.FillAsync(_username,
                new LocatorFillOptions { Timeout = RemainingMs(deadline, 10_000) });
            await frame.Locator(PasswordSelector).First.FillAsync(_password,
                new LocatorFillOptions { Timeout = RemainingMs(deadline, 10_000) });

            steps.Add("Step 2b: Submitting credentials for the service account ...");
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
                // Maintenix keeps long-polling connections open; this timeout is normal.
            }

            if (await FindFrameWithAsync(page, "#idMenuButton, .menu-button, [id*='MenuButton']",
                    RemainingMs(deadline, 5_000)) == null)
            {
                steps.Add("Step 2b: FAILED - the application menu never appeared after login.");
                return false;
            }

            steps.Add($"Step 2b: Login accepted; landed on {Shorten(page.Url)}.");
            return true;
        }

        private sealed class PartHit
        {
            public IFrame Frame { get; init; } = null!;
            public string Text { get; init; } = string.Empty;
            public string Href { get; init; } = string.Empty;
        }

        /// <summary>
        /// One "Stock No:" candidate read from the Details tab: its display text and the href
        /// of the anchor behind it (empty when the broad leaf scan produced the candidate).
        /// The href is what makes the Stock Code hop auditable and clickable.
        /// </summary>
        private sealed class StockNoHit
        {
            public string Text { get; init; } = string.Empty;
            public string Href { get; init; } = string.Empty;

            /// <summary>
            /// A-5 FIX: true when the display text itself parses to a real stock-code shape
            /// ("25H0026 (SLIDE AY)"). False for a DESCRIPTION-ONLY link
            /// ("EVACUATION SLIDE/RAFT, DOOR-3"), which is still a legitimate NAVIGATION
            /// target - the Stock Code lives on the page behind it. Strict hits are chased
            /// first; the shape rules gate the ANSWER, never which link may be clicked.
            /// </summary>
            public bool IsStrict { get; init; }
        }

        /// <summary>
        /// A-1/A-2/A-5 FIX: gathers every stock-entry candidate from the Details tab.
        /// Search order: (1) the value cell beside the literal "Stock No:" label, (2) anchors
        /// in the label's own row, (3) plain-text sibling cells of that row, (4) the broad
        /// leaf scan, (5) the whole-tab anchor sweep.
        ///
        /// A-5 (the reported regression): the shape rules gate the ANSWER, not which link may
        /// be CLICKED. A description-only cell such as "EVACUATION SLIDE/RAFT, DOOR-3" is kept
        /// as a NAVIGATION candidate when it is a real link, because the documented path
        /// clicks exactly that link and reads "Stock Code:" on the page behind it. Rejecting
        /// it outright emptied the candidate list and produced "no stock-number entry that
        /// passes the stock-code shape rules" while the ET P/N was one hop away. Candidates
        /// whose own text looks like a stock code are still chased FIRST.
        /// </summary>
        private async Task<List<StockNoHit>> CollectStockCandidatesAsync(
            IPage page, EtPartNumberRequest request, List<string> steps,
            DateTime deadline, CancellationToken ct)
        {
            var hits = new List<StockNoHit>();

            // A-5 FIX: route every candidate through the shared gate so IsStrict is computed
            // once and consistently. The old inline Add() built the hit by hand and therefore
            // lost the strict/description distinction the hop ordering depends on.
            void Add(string text, string href) =>
                TryAddStockCandidate(hits, text, href ?? string.Empty,
                    allowDescriptionOnly: !string.IsNullOrWhiteSpace(href));

            while (TimeLeftMs(deadline) > 1_000)
            {
                ct.ThrowIfCancellationRequested();

                // ---- 1 + 2: the row-scoped label read ----
                var labelled = await ExtractStockNoByLabelAsync(page, steps);
                foreach (var hit in labelled) Add(hit.Text, hit.Href);

                // ---- 3: the broad Details scan, only when the label anchor found nothing ----
                if (hits.Count == 0)
                {
                    var scanned = await ExtractStockEntriesAsync(page, request, steps);
                    foreach (var entry in scanned) Add(entry, string.Empty);
                }

                // ---- 4: A-5 FIX - the ANCHOR sweep of the whole Details tab.
                // The leaf scan in step 3 skips any element that has children, so a stock
                // entry rendered as "<td><a>25H0026 (SLIDE AY)</a></td>" was never seen by
                // EITHER earlier path when the "Stock No:" label itself could not be matched.
                // These anchors carry an href, so they are clickable candidates.
                if (hits.Count == 0)
                {
                    foreach (var frame in page.Frames)
                    {
                        List<(string Text, string Href)> anchors;
                        try { anchors = await ScanAnchorsAsync(frame); }
                        catch { continue; /* frame detached */ }

                        foreach (var (text, href) in anchors)
                        {
                            // Never chase the MFG P/N row we arrived from, nor the task code.
                            if (MaintainXDetailParser.PartNumbersMatch(text, request.PartNumber)) continue;
                            if (text.Contains("DTC", StringComparison.OrdinalIgnoreCase)) continue;

                            // B-8 FIX: the sweep is a last resort, so it must only chase
                            // anchors that plausibly lead to a STOCK record. Manufacturer
                            // ('70167 (AIR CRUISERS)'), vendor-contact ('VC03162') and form
                            // ('MNT1242A') links all passed the generic shape test - a bare
                            // '70167' looks like a code - but their pages can NEVER carry a
                            // 'Stock Code:'. Chasing them produced the reported failure.
                            if (!IsSweepWorthyStockAnchor(text, href)) continue;

                            // C-4 FIX: an href-less anchor is still clickable BY TEXT via
                            // OpenStockEntryAsync, so the sweep no longer requires an href.
                            // Description-only text without a link is still dropped by the
                            // candidate gate - there would be nothing to click.
                            TryAddStockCandidate(hits, text, href,
                                allowDescriptionOnly: !string.IsNullOrWhiteSpace(href));
                        }
                    }

                    if (hits.Count > 0)
                        steps.Add($"Step 6: {hits.Count} stock candidate(s) recovered from the " +
                                  "Details tab anchor sweep (the 'Stock No:' label was not matched).");
                }

                if (hits.Count > 0) break;
                await page.WaitForTimeoutAsync(500);
            }

            // A-5 FIX: chase real-looking stock codes FIRST, then the description-only links.
            // Ordering keeps the happy path identical to v3 while the fallback still runs.
            return hits.OrderByDescending(h => h.IsStrict).ToList();
        }

        /// <summary>
        /// A-3 FIX: follows EACH "Stock No:" candidate to the page behind it and reads the
        /// "Stock Code:" value - the real ET P/N. Between candidates the Details page is
        /// re-opened, because a failed hop navigated away from it. Returns the first code
        /// that passes every guard together with the candidate that produced it; returns
        /// (null, null) - never a fallback to the Stock No - when every hop fails.
        /// </summary>
        private async Task<(string? Code, StockNoHit? Hit)> ResolveStockCodeAsync(
            IBrowserContext context, IPage page, List<StockNoHit> hits,
            List<string> steps, DateTime deadline, CancellationToken ct)
        {
            // D-1 FIX: the DETAILS page is tracked separately from the page the hop lands
            // on. A stock entry frequently opens in a NEW TAB; the old code kept reading the
            // context-wide page set, so the still-open Details tab (which always shows
            // 'Stock No:') poisoned the echo guard and the wrong-page detector - the exact
            // "none of them exposed a 'Stock Code:' value" failure. Every read is now
            // scoped to the page the click actually produced.
            var detailsPage = page;
            var detailsUrl = detailsPage.Url;

            for (var i = 0; i < hits.Count; i++)
            {
                var hit = hits[i];
                if (TimeLeftMs(deadline) < 2_000) break;
                ct.ThrowIfCancellationRequested();

                var label = hits.Count > 1 ? $" (candidate {i + 1} of {hits.Count})" : string.Empty;

                // B-6 FIX (the reported failure): give EACH candidate its own slice of the
                // budget. ReadStockCodeAsync polled until the GLOBAL deadline, so candidate 1
                // consumed every millisecond and candidates 2..n were skipped by the
                // `TimeLeftMs(deadline) < 2_000` guard above - the A-3 "try every candidate"
                // fix could never actually run, and the lookup ended with
                // "the page behind none of them exposed a 'Stock Code:' value".
                var remainingCandidates = hits.Count - i;
                var slice = Math.Max(8_000, TimeLeftMs(deadline) / Math.Max(1, remainingCandidates));
                var hopDeadline = DateTime.UtcNow.AddMilliseconds(slice);
                if (hopDeadline > deadline) hopDeadline = deadline;

                // D-5 FIX: snapshot the tab count BEFORE the hop so ReadStockCodeAsync can
                // adopt a stock record that opens in a LATE popup, and so every tab the hop
                // created can be closed afterwards without touching the Details tab.
                var pagesBeforeHop = context.Pages.Count;

                var (opened, stockPage) = await OpenStockEntryAsync(
                    context, detailsPage, hit, steps, deadline, label, ct);
                if (!opened) continue;

                var code = await ReadStockCodeAsync(context, stockPage, hit, steps, hopDeadline, ct, pagesBeforeHop);
                if (!string.IsNullOrWhiteSpace(code)) return (code, hit);

                steps.Add($"Step 6: WARNING{label} - candidate '{Truncate(hit.Text, 80)}' did not " +
                          "yield a 'Stock Code:' value.");

                // D-1/D-5: close every tab the hop opened (immediate or late popup) so it
                // cannot leak into the next candidate's page-scoped reads.
                var pagesNow = context.Pages;
                for (var pi = pagesBeforeHop; pi < pagesNow.Count; pi++)
                {
                    if (ReferenceEquals(pagesNow[pi], detailsPage)) continue;
                    try { await pagesNow[pi].CloseAsync(); } catch { /* already gone */ }
                }

                // Re-open the Details page so the NEXT candidate's anchor is present again.
                if (i < hits.Count - 1 && !string.IsNullOrWhiteSpace(detailsUrl) &&
                    detailsUrl.StartsWith("http", StringComparison.OrdinalIgnoreCase))
                {
                    steps.Add("Step 6: Returning to the Details tab for the next candidate ...");
                    await SafeGotoAsync(detailsPage, detailsUrl, deadline, ct);

                    // B-7 FIX: a bare re-navigation lands on the part page with its DEFAULT
                    // tab selected, so the next candidate's anchor was absent and every
                    // remaining hop failed. Re-enter Availability -> Details explicitly.
                    await ClickTabAsync(detailsPage, AvailabilityTabSelector, "Availability", steps, deadline);
                    await ClickTabAsync(detailsPage, DetailsTabSelector, "Details", steps, deadline);
                }
            }

            return (null, null);
        }

        /// <summary>
        /// Opens one stock entry: clicking the real anchor first so Maintenix's own
        /// navigation state applies, then the candidate's href when the click failed.
        /// </summary>
        private async Task<(bool Opened, IPage Page)> OpenStockEntryAsync(
            IBrowserContext context, IPage page, StockNoHit hit, List<string> steps, DateTime deadline,
            string candidateLabel, CancellationToken ct)
        {
            // D-2 FIX: the click may open the stock record in a NEW TAB (Maintenix does
            // this for many links). The old code returned `true` while the scrape stayed on
            // the Details page, so ReadStockCodeAsync scanned a page that still shows
            // 'Stock No:' and the hop was declared a failed navigation. FollowActivePageAsync
            // now hands back the page the navigation actually produced.
            var urlBefore = page.Url;
            var pagesBefore = context.Pages.Count;

            foreach (var frame in page.Frames)
            {
                if (TimeLeftMs(deadline) < 2_000) break;
                try
                {
                    var anchor = frame.Locator("a", new FrameLocatorOptions { HasText = hit.Text }).First;
                    if (await anchor.CountAsync() > 0)
                    {
                        await anchor.ClickAsync(new LocatorClickOptions
                        {
                            Timeout = RemainingMs(deadline, 10_000)
                        });
                        steps.Add($"Step 6{candidateLabel}: Clicked the '{Truncate(hit.Text, 80)}' stock entry.");

                        var landed = await FollowActivePageAsync(context, page, urlBefore, pagesBefore, steps,
                            "stock entry", RemainingMs(deadline, 4_000));

                        // D-5 FIX: the click was accepted but produced NO observable
                        // navigation - a javascript: handler whose popup opens late, or a
                        // click that only toggled a panel. When the anchor carries a real
                        // URL, follow it directly; a late popup is still adopted by
                        // ReadStockCodeAsync's post-click tab watch.
                        if (ReferenceEquals(landed, page) &&
                            string.Equals(landed.Url, urlBefore, StringComparison.Ordinal) &&
                            IsNavigableHref(hit.Href))
                        {
                            steps.Add($"Step 6{candidateLabel}: The click did not navigate; " +
                                      $"following the anchor href {Shorten(hit.Href)} directly ...");
                            await SafeGotoAsync(page, Absolute(hit.Href), deadline, ct);
                        }

                        return (true, landed);
                    }
                }
                catch { /* stale frame, keep looking */ }
            }

            if (IsNavigableHref(hit.Href))
            {
                steps.Add($"Step 6{candidateLabel}: Clicking the stock entry failed; navigating to " +
                          $"{Shorten(hit.Href)} ...");
                await SafeGotoAsync(page, Absolute(hit.Href), deadline, ct);
                return (true, page);
            }

            steps.Add($"Step 6{candidateLabel}: The '{Truncate(hit.Text, 80)}' entry carried no " +
                      "clickable link or navigable href.");
            return (false, page);
        }

        /// <summary>
        /// D-5 FIX: an href is only a navigation fallback when it is a real URL. Maintenix
        /// stock rows frequently carry href="javascript:openStock(...)" or href="#"; feeding
        /// those to GotoAsync produces a garbage URL and a silent failure.
        /// </summary>
        private static bool IsNavigableHref(string? href)
        {
            var h = (href ?? string.Empty).Trim();
            if (h.Length == 0) return false;
            if (h.StartsWith("javascript:", StringComparison.OrdinalIgnoreCase)) return false;
            if (h.StartsWith("#", StringComparison.Ordinal)) return false;
            return true;
        }

        /// <summary>
        /// A-1/A-4/C-1/B-8 FIX: reads and validates the "Stock Code:" value on the page
        /// behind a stock entry. The JSON payload from StockCodeScript is decoded first
        /// (C-1), then every candidate passes: shape rules (IsPlausibleStockNumber), the
        /// decimal-quantity guard, and a relaxed echo guard that only refuses a
        /// Stock Code == Stock No match while the Details panel is still on screen. A
        /// manufacturer/vendor page is abandoned at once (B-8).
        /// D-3 FIX: the read is scoped to the page the hop actually landed on (popup or
        /// in-place navigation), never the whole browser context. The context-wide scan
        /// saw the still-open Details tab's 'Stock No:' label and any leftover
        /// manufacturer tab at the same time - which is exactly why every legitimate
        /// 'Stock Code:' failed the guards and the hop reported "none of them exposed a
        /// 'Stock Code:' value".
        /// </summary>
        private async Task<string?> ReadStockCodeAsync(
            IBrowserContext context, IPage stockPage, StockNoHit hit,
            List<string> steps, DateTime deadline, CancellationToken ct, int pagesBeforeHop)
        {
            var stockNo = MaintainXDetailParser.ParseStockNumber(hit.Text);

            while (TimeLeftMs(deadline) > 1_000)
            {
                ct.ThrowIfCancellationRequested();

                // D-5 FIX: the stock record sometimes opens in a NEW TAB a beat AFTER the
                // click, outside FollowActivePageAsync's window. Adopt any page created
                // after the hop snapshot - still page-scoped, so the still-open Details tab
                // (which always shows 'Stock No:') can never answer for the stock record
                // and trip the echo guard again.
                if (context.Pages.Count > pagesBeforeHop)
                {
                    var newest = context.Pages[context.Pages.Count - 1];
                    if (!ReferenceEquals(newest, stockPage))
                    {
                        steps.Add("Step 6: The stock record opened in a late NEW TAB; " +
                                  $"switching the read to {Shorten(newest.Url)}.");
                        stockPage = newest;
                    }
                }

                // B-8 FIX: a manufacturer / vendor-contact page can NEVER carry a
                // 'Stock Code:' - abandon it immediately so the NEXT candidate still has
                // time. This is the reported failure: the hop clicked '70167 (AIR
                // CRUISERS)', landed on the manufacturer record, and polled it until the
                // slice expired while the real stock entry never got its turn.
                var kind = await DetectPageKindAsync(stockPage);
                if (kind == "wrong-page")
                {
                    steps.Add($"Step 6: The page behind '{Truncate(hit.Text, 80)}' is a " +
                              "manufacturer/vendor record ('Manufacturer Name:', 'Address:', " +
                              "'City:' labels, no 'Stock Code:') - skipping this candidate " +
                              "immediately instead of polling it.");
                    return null;
                }

                var raw = await ReadLabeledValueAsync(stockPage, StockCodeScript);
                if (!string.IsNullOrWhiteSpace(raw))
                {
                    // C-1 FIX: StockCodeScript returns JSON {values, labels}. The old code
                    // fed the WHOLE JSON document to ParseStockNumber, so even a perfect
                    // stock page failed every guard and the hop reported "no 'Stock Code:'
                    // value". Decode the values array first, then validate each candidate.
                    var candidates = ParseStockCodeValues(raw!);

                    foreach (var candidate in candidates)
                    {
                        var code = MaintainXDetailParser.ParseStockNumber(candidate);
                        if (string.IsNullOrWhiteSpace(code)) continue;

                        // A-1 FIX: strict shape rules replace "has a digit / length >= 4".
                        if (!MaintainXDetailParser.IsPlausibleStockNumber(code)) continue;

                        // A-4 FIX: "12.5" is a quantity, not a stock code.
                        if (DecimalQuantityPattern.IsMatch(code)) continue;

                        // Echo guard, RELAXED in v4: the old hard rejection broke the
                        // legitimate case where the Stock Code EQUALS the Stock No (the
                        // user's own example: entry '25H0025 (SLIDE AY)' -> 'Stock Code:
                        // 25H0025'). A page that really shows a 'Stock Code:' label proves
                        // the navigation worked; only a failed navigation that never left
                        // the Details panel still shows 'Stock No:' and must be refused.
                        if (MaintainXDetailParser.PartNumbersMatch(code, stockNo) &&
                            await StockNoLabelPresentAsync(stockPage))
                        {
                            steps.Add("Step 6: WARNING - the 'Stock Code:' read back equals the " +
                                      "'Stock No:' entry while the Details panel is still on " +
                                      "screen; the link likely did not navigate. Treating the " +
                                      "hop as unresolved.");
                            return null;
                        }

                        steps.Add($"Step 6: Stock Code '{code}' read from the page behind the stock entry.");
                        return code;
                    }

                    if (candidates.Count > 0)
                    {
                        // The page is loaded and shows 'Stock Code:' cells, but none of the
                        // values survives the guards (a manufacturer name, a quantity, ...).
                        steps.Add("Step 6: The 'Stock Code:' cell(s) '" +
                                  Truncate(string.Join(", ", candidates), 120) +
                                  "' carried no usable stock code.");
                        return null;
                    }
                }

                await stockPage.WaitForTimeoutAsync(500);
            }

            steps.Add("Step 6: The page behind the stock entry exposed no 'Stock Code:' value.");
            return null;
        }

        /// <summary>
        /// D-3 FIX: runs a label-reading script against every frame of ONE page only. The
        /// old context-wide scan let the still-open Details tab answer a 'Stock Code:' probe
        /// with its own 'Stock No:' panel content, which is what made every legitimate hop
        /// fail. The popup-vs-in-place case is handled by OpenStockEntryAsync, which hands
        /// the read the page the navigation actually produced.
        /// </summary>
        private static async Task<string?> ReadLabeledValueAsync(IPage page, string script)
        {
            foreach (var frame in page.Frames)
            {
                try
                {
                    var v = await frame.EvaluateAsync<string?>(script);
                    if (!string.IsNullOrWhiteSpace(v)) return v;
                }
                catch { /* page closing / frame detached */ }
            }

            return null;
        }

        private async Task<PartHit?> WaitForPartNumberAsync(
            IPage page, string partNumber, List<string> steps, DateTime deadline, CancellationToken ct)
        {
            while (TimeLeftMs(deadline) > 1_000)
            {
                ct.ThrowIfCancellationRequested();

                foreach (var frame in page.Frames)
                {
                    List<(string Text, string Href)> anchors;
                    try
                    {
                        anchors = await ScanAnchorsAsync(frame);
                    }
                    catch { continue; /* frame detached */ }

                    foreach (var (text, href) in anchors)
                    {
                        if (MaintainXDetailParser.PartNumbersMatch(text, partNumber) ||
                            text.Contains(partNumber, StringComparison.OrdinalIgnoreCase))
                        {
                            return new PartHit { Frame = frame, Text = text, Href = href };
                        }
                    }
                }

                await page.WaitForTimeoutAsync(500);
            }

            steps.Add("Step 5: No Applicability row matched the requested part number.");
            return null;
        }

        private static async Task<List<(string Text, string Href)>> ScanAnchorsAsync(IFrame frame)
        {
            var json = await frame.EvaluateAsync<string>(PageScanScript);
            var hits = new List<(string, string)>();
            if (string.IsNullOrWhiteSpace(json)) return hits;

            using var doc = System.Text.Json.JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("anchors", out var anchors)) return hits;

            foreach (var pair in anchors.EnumerateArray())
            {
                var text = pair[0].GetString() ?? string.Empty;
                var href = pair[1].GetString() ?? string.Empty;
                if (text.Length > 0) hits.Add((text, href));
            }

            return hits;
        }

        private async Task<bool> ClickTabAsync(
            IPage page, string selector, string label, List<string> steps, DateTime deadline)
        {
            var frame = await FindFrameWithAsync(page, selector, RemainingMs(deadline, _actionTimeoutMs));
            if (frame == null)
            {
                steps.Add($"'{label}' tab was never rendered.");
                return false;
            }

            try
            {
                await frame.Locator(selector).First
                    .ClickAsync(new LocatorClickOptions { Timeout = RemainingMs(deadline, 10_000) });
                steps.Add($"'{label}' tab clicked.");
                return true;
            }
            catch (Exception ex)
            {
                steps.Add($"WARNING - clicking the '{label}' tab failed: {Truncate(ex.Message, 160)}");
                return false;
            }
        }

        /// <summary>
        /// A-2/A-5 FIX (row-scoped): reads the value cell that follows the literal "Stock No:"
        /// label (idCellStockNoLabel), every anchor inside the label's own row, AND the row's
        /// plain-text sibling cells. When the value cell holds only the description, the row
        /// anchors and sibling cells still surface the real stock entry with its href.
        ///
        /// A-5: a description-only cell is NOT discarded when it is a real link - it is the
        /// very link the documented path clicks to reach "Stock Code:". Its text can never
        /// become the ET P/N (ReadStockCodeAsync validates the ANSWER separately), but it must
        /// remain clickable, otherwise the candidate list empties and the lookup fails with
        /// "no stock-number entry that passes the stock-code shape rules".
        /// </summary>
        private async Task<List<StockNoHit>> ExtractStockNoByLabelAsync(IPage page, List<string> steps)
        {
            var hits = new List<StockNoHit>();

            foreach (var frame in page.Frames)
            {
                string? json;
                try
                {
                    json = await frame.EvaluateAsync<string>(StockNoScript);
                }
                catch { continue; /* frame detached */ }

                if (string.IsNullOrWhiteSpace(json)) continue;

                try
                {
                    using var doc = System.Text.Json.JsonDocument.Parse(json);
                    foreach (var item in doc.RootElement.EnumerateArray())
                    {
                        var v = item.TryGetProperty("v", out var pv) ? pv.GetString() : null;
                        var href = item.TryGetProperty("href", out var ph) ? ph.GetString() : null;

                        // 1. The value cell itself. A-5 FIX: when it carries the DESCRIPTION
                        //    ("EVACUATION SLIDE/RAFT, DOOR-3") but IS a link, it stays a
                        //    navigation candidate - the documented path clicks this very
                        //    link and reads "Stock Code:" on the page behind it.
                        if (!string.IsNullOrWhiteSpace(v))
                        {
                            TryAddStockCandidate(hits, v!, href ?? string.Empty,
                                allowDescriptionOnly: true);
                        }

                        // 2. A-2 FIX: anchors in the same row - the salvage path when the
                        //    value cell carries the description and the real entry
                        //    ("25H0026 (SLIDE AY)") sits beside it.
                        if (item.TryGetProperty("rowAnchors", out var rowAnchors) &&
                            rowAnchors.ValueKind == System.Text.Json.JsonValueKind.Array)
                        {
                            foreach (var anchor in rowAnchors.EnumerateArray())
                            {
                                var at = anchor.TryGetProperty("text", out var pt) ? pt.GetString() : null;
                                var ah = anchor.TryGetProperty("href", out var phh) ? phh.GetString() : null;
                                if (string.IsNullOrWhiteSpace(at)) continue;
                                TryAddStockCandidate(hits, at!, ah ?? string.Empty,
                                    allowDescriptionOnly: true);
                            }
                        }

                        // 3. A-5 FIX: plain-text sibling cells of the same row. These carry
                        //    no href, so they are accepted ONLY when they already look like
                        //    a real stock code; OpenStockEntryAsync then finds their anchor
                        //    by text.
                        if (item.TryGetProperty("rowCells", out var rowCells) &&
                            rowCells.ValueKind == System.Text.Json.JsonValueKind.Array)
                        {
                            foreach (var cell in rowCells.EnumerateArray())
                            {
                                var ct2 = cell.GetString();
                                if (string.IsNullOrWhiteSpace(ct2)) continue;
                                TryAddStockCandidate(hits, ct2!, string.Empty);
                            }
                        }
                    }
                }
                catch { continue; }
            }

            // A-6 FIX: the column / single-cell layouts the row-scoped read cannot see.
            // The real "25H0026 (SLIDE AY)" entry frequently renders as a table COLUMN
            // under a "Stock No" header - WITH its href - so collecting it here keeps the
            // genuine stock anchor ahead of the page-wide sweep that produced the junk
            // candidates in the reported failure.
            foreach (var frame in page.Frames)
            {
                string? json;
                try
                {
                    json = await frame.EvaluateAsync<string>(StockNoColumnScript);
                }
                catch { continue; /* frame detached */ }

                if (string.IsNullOrWhiteSpace(json)) continue;

                try
                {
                    using var doc = System.Text.Json.JsonDocument.Parse(json);
                    foreach (var item in doc.RootElement.EnumerateArray())
                    {
                        var v = item.TryGetProperty("v", out var pv) ? pv.GetString() : null;
                        var href = item.TryGetProperty("href", out var ph) ? ph.GetString() : null;
                        if (string.IsNullOrWhiteSpace(v)) continue;
                        TryAddStockCandidate(hits, v!, href ?? string.Empty, allowDescriptionOnly: true);
                    }
                }
                catch { continue; }
            }

            if (hits.Count > 0)
                steps.Add($"Step 6: {hits.Count} stock entr(ies) read from the 'Stock No:' label row / column.");

            return hits;
        }

        /// <summary>
        /// Shared candidate gate. Parses the stock number out of the display text and applies
        /// the A-1 shape rules to decide whether the candidate is STRICT (its own text already
        /// looks like a stock code, e.g. "25H0026 (SLIDE AY)").
        ///
        /// A-5 FIX: a non-strict text is still admitted as a NAVIGATION candidate when
        /// <paramref name="allowDescriptionOnly"/> is set AND it carries a real href, because
        /// the Stock Code lives on the page behind that link. Non-strict candidates without a
        /// link are dropped - there would be nothing to click. Strict candidates are ordered
        /// first by the caller, so behaviour on a well-formed Details tab is unchanged.
        /// </summary>
        private static void TryAddStockCandidate(
            List<StockNoHit> hits, string text, string href, bool allowDescriptionOnly = false)
        {
            if (string.IsNullOrWhiteSpace(text)) return;

            var stock = MaintainXDetailParser.ParseStockNumber(text);
            var strict = !string.IsNullOrWhiteSpace(stock) &&
                         MaintainXDetailParser.IsPlausibleStockNumber(stock!);

            if (!strict)
            {
                // A-5 FIX (the reported regression): v3 dropped EVERY non-strict text, which
                // emptied the candidate list whenever Maintenix rendered only the description
                // in the "Stock No:" cell - producing "no stock-number entry that passes the
                // stock-code shape rules" even though the Stock Code was one click away.
                // A description is never an ANSWER, but a description LINK is a valid
                // navigation target, so keep it when it is actually clickable.
                if (!allowDescriptionOnly) return;
                if (string.IsNullOrWhiteSpace(href)) return;
                if (text.Trim().Length < 3) return;
            }

            if (hits.Any(h => h.Text == text)) return;
            hits.Add(new StockNoHit { Text = text, Href = href, IsStrict = strict });
        }

        /// <summary>
        /// B-8 FIX: gate for the page-wide anchor sweep. The sweep is a LAST resort, so it
        /// must only chase anchors that plausibly lead to a STOCK record. The reported
        /// failure chased '70167 (AIR CRUISERS)' (manufacturer), 'VC03162'/'VC02833'
        /// (vendor contacts) and 'MNT1242A' (a form number) - pages that can never carry
        /// a 'Stock Code:'. This tenant's stock codes are alphanumeric ('25H0026'), so a
        /// purely numeric bare code is a manufacturer code and is refused; MNT/VC prefixes
        /// and manufacturer/vendor/address hrefs are refused outright.
        /// </summary>
        private static bool IsSweepWorthyStockAnchor(string text, string href)
        {
            var t = text.Trim();

            if (t.StartsWith("MNT", StringComparison.OrdinalIgnoreCase)) return false;
            if (t.StartsWith("VC", StringComparison.OrdinalIgnoreCase) && t.Any(char.IsDigit)) return false;

            var h = (href ?? string.Empty).ToLowerInvariant();
            if (h.Contains("manufacturer") || h.Contains("vendor") || h.Contains("address")) return false;

            var bare = MaintainXDetailParser.ParseStockNumber(t);
            if (!string.IsNullOrWhiteSpace(bare) && bare!.All(char.IsDigit)) return false;

            if (h.Contains("stock") || h.Contains("item") || h.Contains("inventory")) return true;
            return !string.IsNullOrWhiteSpace(bare);
        }

        /// <summary>
        /// C-1 FIX: decode the {values, labels} JSON produced by StockCodeScript into the
        /// candidate list. A non-JSON payload is treated as a single raw candidate so the
        /// reader never silently drops a value.
        /// </summary>
        private static List<string> ParseStockCodeValues(string raw)
        {
            var values = new List<string>();
            if (string.IsNullOrWhiteSpace(raw)) return values;

            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(raw);
                if (doc.RootElement.TryGetProperty("values", out var arr) &&
                    arr.ValueKind == System.Text.Json.JsonValueKind.Array)
                {
                    foreach (var item in arr.EnumerateArray())
                    {
                        var v = item.GetString();
                        if (!string.IsNullOrWhiteSpace(v)) values.Add(v!);
                    }
                }
                return values;
            }
            catch
            {
                values.Add(raw.Trim());
                return values;
            }
        }

        /// <summary>
        /// B-8 FIX: classify ONE page as stock-record ('has-stock-code'),
        /// manufacturer/vendor ('wrong-page') or still-loading ('unknown'). D-3: page-scoped
        /// so a leftover manufacturer tab can no longer make a good hop look wrong, and the
        /// still-open Details tab can no longer mask a manufacturer hop as 'unknown'.
        /// </summary>
        private static async Task<string> DetectPageKindAsync(IPage page)
        {
            var wrongPage = false;

            foreach (var frame in page.Frames)
            {
                try
                {
                    var v = await frame.EvaluateAsync<string?>(WrongPageScript);
                    if (v == "has-stock-code") return "has-stock-code";
                    if (v == "wrong-page") wrongPage = true;
                }
                catch { /* page closing / frame detached */ }
            }

            return wrongPage ? "wrong-page" : "unknown";
        }

        /// <summary>
        /// v4: true while the stock page ITSELF still shows a literal 'Stock No:' label -
        /// the discriminator for the relaxed echo guard. D-3: scoped to ONE page so the
        /// still-open Details tab can never trip the guard and reject a legitimate
        /// 'Stock Code' == 'Stock No' match on the real stock record.
        /// </summary>
        private static async Task<bool> StockNoLabelPresentAsync(IPage page)
        {
            foreach (var frame in page.Frames)
            {
                try
                {
                    if (await frame.EvaluateAsync<string?>(StockNoLabelProbeScript) == "yes")
                        return true;
                }
                catch { /* frame detached */ }
            }

            return false;
        }

        /// <summary>
        /// C-2 FIX: waits briefly for the click on the part row to produce either a NEW TAB
        /// (Maintenix's usual behaviour) or an in-place navigation, and returns the page the
        /// scrape must continue on. Without this, the Availability/Details clicks run against
        /// the task definition page and the stock rows are never even rendered - the exact
        /// zero-candidate failure reported in v4.
        /// </summary>
        private async Task<IPage> FollowActivePageAsync(
            IBrowserContext context, IPage current, string urlBefore, int pagesBefore,
            List<string> steps, string what, int budgetMs)
        {
            // D-4 FIX: pagesBefore is now captured by the CALLER BEFORE the click. The old
            // in-method snapshot raced with the popup: a new tab that opened in the
            // milliseconds between ClickAsync returning and this line was already counted,
            // so neither the "new tab" nor the "URL changed" branch fired and the scrape
            // kept reading the Details page - producing "none of them exposed a 'Stock
            // Code:' value" even though the stock record was open in another tab.
            var probe = DateTime.UtcNow.AddMilliseconds(Math.Max(1_500, budgetMs));

            while (DateTime.UtcNow < probe)
            {
                var pages = context.Pages;
                if (pages.Count > pagesBefore)
                {
                    var popup = pages[pages.Count - 1];
                    try
                    {
                        await popup.WaitForLoadStateAsync(LoadState.DOMContentLoaded,
                            new PageWaitForLoadStateOptions
                            {
                                Timeout = Math.Max(1_500, (int)(probe - DateTime.UtcNow).TotalMilliseconds)
                            });
                    }
                    catch { /* the popup may still be usable without full load */ }

                    steps.Add($"Step 5: The {what} opened in a NEW TAB; the scrape switched " +
                              $"to {Shorten(popup.Url)}.");
                    return popup;
                }

                if (!string.Equals(current.Url, urlBefore, StringComparison.Ordinal))
                {
                    steps.Add($"Step 5: The {what} navigated in place to {Shorten(current.Url)}.");
                    return current;
                }

                try { await current.WaitForTimeoutAsync(250); }
                catch { break; }
            }

            steps.Add($"Step 5: No new tab or navigation detected after opening the {what}; " +
                      "continuing on the current page.");
            return current;
        }

        private async Task<List<string>> ExtractStockEntriesAsync(
            IPage page, EtPartNumberRequest request, List<string> steps)
        {
            var entries = new List<string>();

            foreach (var frame in page.Frames)
            {
                string? json;
                try
                {
                    json = await frame.EvaluateAsync<string>(PageScanScript);
                }
                catch { continue; }

                if (string.IsNullOrWhiteSpace(json)) continue;

                List<string> leaves;
                try
                {
                    using var doc = System.Text.Json.JsonDocument.Parse(json);
                    leaves = new List<string>();
                    if (doc.RootElement.TryGetProperty("leaves", out var arr))
                    {
                        foreach (var item in arr.EnumerateArray())
                        {
                            var v = item.GetString();
                            if (!string.IsNullOrWhiteSpace(v)) leaves.Add(v);
                        }
                    }
                }
                catch { continue; }

                foreach (var raw in leaves)
                {
                    var stock = MaintainXDetailParser.ParseStockNumber(raw);
                    if (string.IsNullOrWhiteSpace(stock)) continue;

                    // A-1 FIX: the strict shape rules replace "has a digit / length >= 4",
                    // so descriptions such as "EVACUATION SLIDE/RAFT, DOOR-3" are rejected.
                    if (!MaintainXDetailParser.IsPlausibleStockNumber(stock)) continue;

                    // C-3 FIX: the leaf scan shares the sweep's junk gate, so a purely
                    // numeric manufacturer code ("70167 (AIR CRUISERS)") that passes the
                    // shape test is still refused here instead of eating a candidate slot.
                    if (!IsSweepWorthyStockAnchor(raw, string.Empty)) continue;

                    // Never echo the requested MFG P/N or the task code back as the ET stock.
                    if (MaintainXDetailParser.PartNumbersMatch(stock, request.PartNumber)) continue;
                    if (string.Equals(stock, MaintainXDetailParser.NormalizeAtaCode(request.AtaCode),
                            StringComparison.OrdinalIgnoreCase)) continue;
                    if (stock.Contains("DTC", StringComparison.OrdinalIgnoreCase)) continue;

                    if (!entries.Contains(raw)) entries.Add(raw);
                }
            }

            if (entries.Count > 0)
                steps.Add($"Step 6: {entries.Count} stock entry candidate(s) found on the Details tab.");

            return entries;
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

        private async Task SafeGotoAsync(IPage page, string url, DateTime deadline, CancellationToken ct)
        {
            try
            {
                await page.GotoAsync(url, new PageGotoOptions
                {
                    WaitUntil = WaitUntilState.DOMContentLoaded,
                    Timeout = RemainingMs(deadline, _navigationTimeoutMs)
                });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "MaintainX ET P/N navigation to {Url} failed", url);
            }
        }

        private async Task DumpAsync(IPage page, string tag, List<string> steps, bool force = false)
        {
            // C-5 FIX: the zero-candidate failure ALWAYS dumps, even without
            // MaintainXSystem:CaptureDiagnostics - that report is otherwise undiagnosable.
            if (!_captureDiagnostics && !force) return;

            try
            {
                var folder = Path.Combine(Directory.GetCurrentDirectory(), _diagnosticsPath);
                Directory.CreateDirectory(folder);

                var stamp = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss");
                await page.ScreenshotAsync(new PageScreenshotOptions
                {
                    Path = Path.Combine(folder, $"{stamp}-{tag}.png"),
                    FullPage = true
                });
                await File.WriteAllTextAsync(Path.Combine(folder, $"{stamp}-{tag}.html"),
                    await page.ContentAsync());

                steps.Add($"Diagnostics saved: {stamp}-{tag}");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not write MaintainX ET P/N diagnostics");
            }
        }

        // =================================================================================
        // PURE HELPERS
        // =================================================================================

        private static int RemainingMs(DateTime deadline, int cap = int.MaxValue)
        {
            var remaining = (int)(deadline - DateTime.UtcNow).TotalMilliseconds;
            return Math.Max(1_500, Math.Min(cap, remaining));
        }

        /// <summary>
        /// Raw remaining time (can be zero or negative). MUST be used for loop exit
        /// conditions: RemainingMs floors at 1.5s (a safe Playwright timeout), which would
        /// make a `while (RemainingMs(...) > 1_000)` loop spin forever and get cancelled by
        /// the controller with no trace.
        /// </summary>
        private static int TimeLeftMs(DateTime deadline) =>
            (int)(deadline - DateTime.UtcNow).TotalMilliseconds;

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