using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Playwright;

namespace CMT.Application.SelfEvaluation.Services
{
    // =====================================================================================
    // MaintainXExternalService v4 - REAL BROWSER AUTOMATION (Playwright)
    // =====================================================================================
    //
    // WHY v1..v3 (HttpClient + HtmlAgilityPack) COULD NOT WORK
    // --------------------------------------------------------
    // The diagnostic trail you captured is conclusive:
    //
    //   Step 2: Login successful ... landed on /maintenix/common/ToDoList.jsp  <- auth is FINE
    //   Step 4: no document containing 'idTaskCode' was found                  <- form never reached
    //   Step 5: ... 5 parameter(s), 0 hidden state field(s)
    //   Step 5: Search returned 40064 / 40135 / 40165 chars                     <- same shell, 3x
    //   Step 6: Parsed 0 task definition link(s)
    //
    // Maintenix builds its left menu with JavaScript. The working menu entry you pasted is:
    //
    //   /maintenix/web/taskdefn/TaskDefinitionSearch.jsp
    //       ?aReturnToPage=%2Fmaintenix%3A87c27d6dbdd84a7aa48b4cce01d2ff62
    //
    // That "aReturnToPage" value is a per-session PAGE TOKEN. Request TaskDefinitionSearch.jsp
    // WITHOUT it and Maintenix serves the outer frameset shell instead of the real search form -
    // which is exactly a ~40 KB document with zero hidden state fields and zero grid rows.
    // v3's regex hunt for the menu link could never find that token because the link does not
    // exist in the static HTML; it is created at runtime by the menu script. So v3 always fell
    // back to the bare configured path and always got the shell. Identical response length for
    // '256133', '*256133*' and '256133*' proves the code was never even evaluated.
    //
    // On top of that, this flow needs THREE more things a raw HttpClient cannot do:
    //   * onClick_idButtonSearch() assembles the search payload in JS before submitting
    //   * the results grid and the task definition detail page live in nested frames
    //   * "Preview Task Cards" opens a popup window whose PDF is streamed by a servlet
    //
    // v4 THEREFORE DRIVES A REAL HEADLESS CHROMIUM
    // --------------------------------------------
    // The exact manual flow is reproduced by clicking, so every session token, hidden field
    // and JS handler is produced by Maintenix itself:
    //
    //   1. GOTO   /maintenix/common/security/login.jsp   -> fill j_username / j_password
    //   2. CLICK  #idMenuButton
    //   3. CLICK  "Shop Technician"
    //   4. CLICK  the "Task Definition Search" anchor  (carries the live aReturnToPage token)
    //   5. FILL   #idTaskCode  (aTaskCd) with the ATA code, frame-aware
    //   6. CLICK  #idButtonSearch
    //   7. PICK   the DTC-JIC row from the Task Definition column
    //   8. CLICK  "Preview Task Cards" and capture the PDF bytes from the popup / download
    //
    // The public contract is UNCHANGED, so TaskCardProxyController, TaskCardDocument,
    // taskcard-proxy/[...path]/route.ts and TaskCardFetcher.tsx need no modification.
    // =====================================================================================
    public class MaintainXExternalService : IMaintainXExternalService, IAsyncDisposable
    {
        // ---- defaults (overridable through the MaintainXSystem configuration section) ----
        private const string DefaultBaseUrl = "http://svdcmpa01";
        private const string DefaultLoginPath = "/maintenix/common/security/login.jsp";
        private const string DefaultSearchPath = "/maintenix/web/taskdefn/TaskDefinitionSearch.jsp";

        private const string PreviewButtonText = "Preview Task Cards";

        // Selectors are written as CSS lists so the first matching variant wins.
        private const string PasswordSelector = "input[name='j_password'], input[type='password']";
        private const string UsernameSelector = "input[name='j_username'], input[type='text']:not([type='hidden'])";
        private const string MenuButtonSelector = "#idMenuButton, .menu-button, [id*='MenuButton']";
        private const string ShopTechnicianSelector = "a.menu-anchor:has-text('Shop Technician'), a:has-text('Shop Technician')";
        private const string TaskDefinitionSearchSelector = "a[href*='TaskDefinitionSearch.jsp'], a:has-text('Task Definition Search')";
        private const string TaskCodeSelector = "#idTaskCode, input[name='aTaskCd']";
        private const string SearchButtonSelector = "#idButtonSearch, a[id='idButtonSearch'], a[title='Search']";
        private const string ResultRowSelector = "a[href*='TaskDefinitionRedirector']";
        private const string PreviewButtonSelector =
            "a:has(span.largeButtonTextCell:has-text('Preview Task Cards')), " +
            "a:has-text('Preview Task Cards'), " +
            "span.largeButtonTextCell:has-text('Preview Task Cards')";

        private readonly MaintainXBrowserFactory _browserFactory;
        private readonly ILogger<MaintainXExternalService> _logger;

        private readonly string _baseUrl;
        private readonly string _username;
        private readonly string _password;
        private readonly string _loginPath;
        private readonly string _searchPath;

        private readonly int _navigationTimeoutMs;
        private readonly int _actionTimeoutMs;
        private readonly int _pdfWaitTimeoutMs;
        private readonly bool _captureDiagnostics;
        private readonly string _diagnosticsPath;

        public MaintainXExternalService(
            IConfiguration configuration,
            ILogger<MaintainXExternalService> logger)
        {
            _logger = logger;
            var section = configuration.GetSection("MaintainXSystem");

            _baseUrl = (section["BaseUrl"] ?? DefaultBaseUrl).TrimEnd('/');
            _username = section["Username"] ?? "21041";
            _password = section["Password"] ?? "1230";
            _loginPath = section["LoginPath"] ?? DefaultLoginPath;
            _searchPath = section["SearchPath"] ?? DefaultSearchPath;

            var timeoutSeconds = ParseInt(section["TimeoutSeconds"], 90);
            _navigationTimeoutMs = timeoutSeconds * 1000;
            _actionTimeoutMs = Math.Max(15000, timeoutSeconds * 1000 / 3);
            _pdfWaitTimeoutMs = Math.Max(20000, timeoutSeconds * 1000 / 2);

            _captureDiagnostics = ParseBool(section["CaptureDiagnostics"], false);
            _diagnosticsPath = section["DiagnosticsPath"] ?? Path.Combine("logs", "maintainx");

            _browserFactory = new MaintainXBrowserFactory(
                headless: ParseBool(section["Headless"], true),
                slowMoMs: ParseInt(section["SlowMoMs"], 0),
                executablePath: section["ExecutablePath"],
                browserChannel: section["BrowserChannel"],
                autoInstallBrowser: ParseBool(section["AutoInstallBrowser"], true),
                logger: logger);
        }

        // =================================================================================
        // PUBLIC API - contract identical to v3
        // =================================================================================

        public async Task<TaskCardSearchResult> SearchTaskCards(string ataCode, string partNumber)
        {
            var result = new TaskCardSearchResult
            {
                Found = false,
                PartNumber = partNumber ?? string.Empty,
                AtaChapterCode = ataCode ?? string.Empty
            };

            var candidates = BuildTaskCodeCandidates(ataCode);
            if (candidates.Count == 0)
            {
                result.ErrorMessage = "No usable ATA / task definition code was supplied.";
                result.SearchSteps.Add("FAILED: empty task code after normalization.");
                return result;
            }

            result.TaskCode = candidates[0];

            await RunInBrowser(result.SearchSteps, async page =>
            {
                var search = await RunSearchFlow(page, candidates, partNumber, result.SearchSteps);

                if (search.Items.Count == 0)
                {
                    result.ErrorMessage = search.ErrorMessage ?? NoResultsMessage(ataCode, candidates);
                    result.RawHtmlSnippet = search.LastHtml;
                    return;
                }

                result.TaskCode = search.TaskCode;
                result.Items = search.Items;
                result.PrimaryItem = SelectPrimaryItem(search.Items);
                result.Found = true;
                result.SearchSteps.Add(
                    $"Step 6: {result.Items.Count} task definition(s) found. " +
                    $"Primary: {result.PrimaryItem?.TaskDefinitionCode ?? "n/a"}");
            },
            onError: message =>
            {
                result.ErrorMessage = message;
            });

            return result;
        }

        public async Task<TaskCardPdfResult> FetchPrimaryTaskCardPdf(string ataCode, string partNumber)
        {
            var result = new TaskCardPdfResult { Success = false };

            var candidates = BuildTaskCodeCandidates(ataCode);
            if (candidates.Count == 0)
            {
                result.ErrorMessage = "No usable ATA / task definition code was supplied.";
                result.SearchSteps.Add("FAILED: empty task code after normalization.");
                return result;
            }

            result.TaskCode = candidates[0];

            await RunInBrowser(result.SearchSteps, async page =>
            {
                var search = await RunSearchFlow(page, candidates, partNumber, result.SearchSteps);

                if (search.Items.Count == 0)
                {
                    result.ErrorMessage = search.ErrorMessage ?? NoResultsMessage(ataCode, candidates);
                    result.RawHtmlSnippet = search.LastHtml;
                    return;
                }

                var primary = SelectPrimaryItem(search.Items);
                if (primary == null)
                {
                    result.ErrorMessage = "Search results did not contain a usable task definition link.";
                    result.SearchSteps.Add("FAILED: no task definition link to open.");
                    result.RawHtmlSnippet = search.LastHtml;
                    return;
                }

                result.TaskCode = search.TaskCode;
                result.TaskDefinitionUrl = primary.TaskDefinitionUrl;
                result.TaskDefinitionCode = primary.TaskDefinitionCode;
                result.TaskDefinitionName = primary.TaskDefinitionName;
                result.RevisionNumber = primary.RevisionNumber;

                result.SearchSteps.Add(
                    $"Step 7: Opening task definition '{primary.TaskDefinitionCode}' " +
                    $"(row {primary.RowIndex}) from the results grid ...");

                var opened = await OpenTaskDefinitionFromGrid(page, primary, result.SearchSteps);
                if (!opened)
                {
                    result.ErrorMessage = "The task definition page could not be opened from the search results.";
                    return;
                }

                await CapturePreviewPdf(page, result);
            },
            onError: message =>
            {
                result.ErrorMessage = message;
            });

            return result;
        }

        public async Task<TaskCardPdfResult> DownloadTaskCardPdf(string taskDefinitionUrl)
        {
            var result = new TaskCardPdfResult
            {
                Success = false,
                TaskDefinitionUrl = taskDefinitionUrl ?? string.Empty
            };

            if (string.IsNullOrWhiteSpace(taskDefinitionUrl))
            {
                result.ErrorMessage = "Task definition URL is required.";
                result.SearchSteps.Add("FAILED: no task definition URL supplied.");
                return result;
            }

            await RunInBrowser(result.SearchSteps, async page =>
            {
                var target = Absolute(taskDefinitionUrl!);
                result.SearchSteps.Add($"Step 7: Navigating straight to the task definition page {target} ...");

                await page.GotoAsync(target, new PageGotoOptions
                {
                    WaitUntil = WaitUntilState.DOMContentLoaded,
                    Timeout = _navigationTimeoutMs
                });

                if (await IsOnLoginPage(page))
                {
                    result.ErrorMessage = "MaintainX bounced back to the login form - the session was not accepted.";
                    result.SearchSteps.Add("FAILED: task definition page redirected to login.");
                    return;
                }

                await CapturePreviewPdf(page, result);
            },
            onError: message =>
            {
                result.ErrorMessage = message;
            });

            return result;
        }

        // =================================================================================
        // BROWSER SESSION ENVELOPE - login happens once per call, then the body runs
        // =================================================================================

        private async Task RunInBrowser(List<string> steps, Func<IPage, Task> body, Action<string> onError)
        {
            IBrowserContext? context = null;
            IPage? page = null;

            try
            {
                var browser = await _browserFactory.GetBrowserAsync();

                context = await browser.NewContextAsync(new BrowserNewContextOptions
                {
                    IgnoreHTTPSErrors = true,
                    AcceptDownloads = true,
                    ViewportSize = new ViewportSize { Width = 1680, Height = 1050 }
                });
                context.SetDefaultTimeout(_actionTimeoutMs);
                context.SetDefaultNavigationTimeout(_navigationTimeoutMs);

                page = await context.NewPageAsync();

                if (!await Login(page, steps))
                {
                    onError(
                        "Failed to log in to MaintainX. Verify MaintainXSystem:Username / Password and " +
                        "confirm the API server can reach " + _baseUrl + " on the intranet.");
                    await Dump(page, "login-failed", steps);
                    return;
                }

                await body(page);
            }
            catch (PlaywrightException ex) when (IsBrowserMissing(ex))
            {
                _logger.LogError(ex, "Playwright browser binaries are missing");
                steps.Add("FAILED: the headless browser is not installed on this server.");
                onError(
                    "The headless browser used to automate MaintainX is not installed. Run " +
                    "\"pwsh bin/Debug/net8.0/playwright.ps1 install chromium\" (or " +
                    "\"dotnet run -- install chromium\") once on the API server, then retry.");
            }
            catch (TimeoutException ex)
            {
                _logger.LogWarning(ex, "MaintainX automation timed out");
                steps.Add($"FAILED: a step timed out - {ex.Message}");
                onError($"The MaintainX automation timed out: {ex.Message}");
                if (page != null) await Dump(page, "timeout", steps);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "MaintainX automation failed");
                steps.Add($"FAILED: {ex.GetType().Name} - {ex.Message}");
                onError($"Unexpected error while automating MaintainX: {ex.Message}");
                if (page != null) await Dump(page, "error", steps);
            }
            finally
            {
                if (context != null)
                {
                    try { await context.CloseAsync(); } catch { /* best effort */ }
                }
            }
        }

        // =================================================================================
        // STEP 1-2: LOGIN
        // =================================================================================

        private async Task<bool> Login(IPage page, List<string> steps)
        {
            var loginUrl = Absolute(_loginPath);
            steps.Add($"Step 1: Opening the MaintainX login page {loginUrl} in a real browser ...");

            await page.GotoAsync(loginUrl, new PageGotoOptions
            {
                WaitUntil = WaitUntilState.DOMContentLoaded,
                Timeout = _navigationTimeoutMs
            });

            // login.jsp is only 1.3 KB because it is a frameset shell; the credential form
            // lives in a nested frame. A real browser loads that frame for us, we just have
            // to look inside it.
            var frame = await FindFrameWith(page, PasswordSelector, _actionTimeoutMs);
            if (frame == null)
            {
                steps.Add("Step 1: FAILED - no frame on the login page exposes a password field.");
                return false;
            }

            steps.Add($"Step 1: Credential form located in frame {Shorten(frame.Url)}.");

            await frame.Locator(UsernameSelector).First.FillAsync(_username,
                new LocatorFillOptions { Timeout = _actionTimeoutMs });
            await frame.Locator(PasswordSelector).First.FillAsync(_password,
                new LocatorFillOptions { Timeout = _actionTimeoutMs });

            steps.Add($"Step 2: Submitting credentials for user '{_username}' ...");

            // Pressing Enter inside the password field triggers whatever the page wires up
            // (submit button, onkeypress handler or j_security_check form action).
            try
            {
                await frame.Locator(PasswordSelector).First.PressAsync("Enter",
                    new LocatorPressOptions { Timeout = _actionTimeoutMs });
            }
            catch
            {
                var submit = frame.Locator("input[type='submit'], button[type='submit'], a:has-text('Login')").First;
                await submit.ClickAsync(new LocatorClickOptions { Timeout = _actionTimeoutMs });
            }

            try
            {
                await page.WaitForLoadStateAsync(LoadState.NetworkIdle,
                    new PageWaitForLoadStateOptions { Timeout = _actionTimeoutMs });
            }
            catch (TimeoutException)
            {
                // Maintenix keeps long-polling connections open; a network-idle timeout here
                // is normal and not an error.
            }

            if (await IsOnLoginPage(page))
            {
                steps.Add($"Step 2: FAILED - still on the login form after submitting ({Shorten(page.Url)}).");
                return false;
            }

            steps.Add($"Step 2: Login accepted; landed on {Shorten(page.Url)}.");
            return true;
        }

        private async Task<bool> IsOnLoginPage(IPage page)
        {
            // Logged in <=> the application chrome (menu button) is reachable in some frame.
            if (await FindFrameWith(page, MenuButtonSelector, 2500) != null) return false;
            return await FindFrameWith(page, PasswordSelector, 1500) != null;
        }

        // =================================================================================
        // STEP 3-6: MENU -> TASK DEFINITION SEARCH -> RESULTS
        // =================================================================================

        private sealed class FlowResult
        {
            public List<TaskCardItem> Items { get; } = new List<TaskCardItem>();
            public string TaskCode { get; set; } = string.Empty;
            public string? ErrorMessage { get; set; }
            public string? LastHtml { get; set; }
        }

        private async Task<FlowResult> RunSearchFlow(
            IPage page, List<string> candidates, string? partNumber, List<string> steps)
        {
            var outcome = new FlowResult { TaskCode = candidates.FirstOrDefault() ?? string.Empty };

            if (!await NavigateToTaskDefinitionSearch(page, steps))
            {
                outcome.ErrorMessage =
                    "Could not reach the Task Definition Search form. The menu " +
                    "(Shop Technician -> Task Definition Search) did not open the search page.";
                outcome.LastHtml = await SafeContent(page);
                await Dump(page, "no-search-form", steps);
                return outcome;
            }

            foreach (var candidate in candidates)
            {
                var items = await SubmitSearch(page, candidate, partNumber, steps);
                outcome.LastHtml = await SafeContent(page);

                if (items.Count > 0)
                {
                    outcome.TaskCode = candidate;
                    outcome.Items.AddRange(items);
                    return outcome;
                }

                steps.Add($"Step 6: No task definitions for '{candidate}'; trying the next code form.");

                // Go back to a clean search form before the next attempt.
                if (!await NavigateToTaskDefinitionSearch(page, steps)) break;
            }

            await Dump(page, "no-rows", steps);
            return outcome;
        }

        /// <summary>
        /// Reproduces the manual menu walk. Clicking the real anchor is essential: its href
        /// carries the per-session aReturnToPage page token, without which Maintenix serves
        /// the frameset shell instead of the search form (the v3 root cause).
        /// </summary>
        private async Task<bool> NavigateToTaskDefinitionSearch(IPage page, List<string> steps)
        {
            if (await FindFrameWith(page, TaskCodeSelector, 1500) != null)
            {
                steps.Add("Step 4: The Task Definition Search form is already open.");
                return true;
            }

            steps.Add("Step 3: Opening the menu (#idMenuButton) -> Shop Technician -> Task Definition Search ...");

            await TryClick(page, MenuButtonSelector, "menu button", steps, _actionTimeoutMs);
            await TryClick(page, ShopTechnicianSelector, "Shop Technician", steps, _actionTimeoutMs);

            // Capture the live href BEFORE clicking so we can fall back to a direct
            // navigation that still carries the session page token.
            var liveHref = await ReadAttribute(page, TaskDefinitionSearchSelector, "href", 4000);
            if (!string.IsNullOrWhiteSpace(liveHref))
                steps.Add($"Step 3: Live menu link captured: {Shorten(Absolute(liveHref!))}");

            await TryClick(page, TaskDefinitionSearchSelector, "Task Definition Search", steps, _actionTimeoutMs);

            var frame = await FindFrameWith(page, TaskCodeSelector, _actionTimeoutMs);
            if (frame != null)
            {
                steps.Add($"Step 4: Search form (idTaskCode) reached in frame {Shorten(frame.Url)}.");
                return true;
            }

            // Fallback 1: navigate to the captured token-bearing URL.
            if (!string.IsNullOrWhiteSpace(liveHref))
            {
                steps.Add("Step 4: Menu click did not render the form; navigating to the captured menu URL ...");
                await SafeGoto(page, Absolute(liveHref!));
                frame = await FindFrameWith(page, TaskCodeSelector, _actionTimeoutMs);
                if (frame != null)
                {
                    steps.Add($"Step 4: Search form reached through the captured menu URL ({Shorten(frame.Url)}).");
                    return true;
                }
            }

            // Fallback 2: the plain configured path. This is what v3 used exclusively and it
            // normally yields the shell only - kept purely as a last resort.
            steps.Add($"Step 4: Falling back to the configured search path {_searchPath} ...");
            await SafeGoto(page, Absolute(_searchPath));
            frame = await FindFrameWith(page, TaskCodeSelector, _actionTimeoutMs);
            if (frame != null)
            {
                steps.Add($"Step 4: Search form reached through the configured path ({Shorten(frame.Url)}).");
                return true;
            }

            steps.Add("Step 4: FAILED - no frame exposes 'idTaskCode' / 'aTaskCd'.");
            return false;
        }

        private async Task<List<TaskCardItem>> SubmitSearch(
            IPage page, string taskCode, string? partNumber, List<string> steps)
        {
            var frame = await FindFrameWith(page, TaskCodeSelector, _actionTimeoutMs);
            if (frame == null)
            {
                steps.Add("Step 5: FAILED - the search form disappeared before the code could be typed.");
                return new List<TaskCardItem>();
            }

            steps.Add($"Step 5: Typing task definition code '{taskCode}' into idTaskCode (aTaskCd) ...");

            var input = frame.Locator(TaskCodeSelector).First;
            await input.FillAsync(string.Empty, new LocatorFillOptions { Timeout = _actionTimeoutMs });
            await input.FillAsync(taskCode, new LocatorFillOptions { Timeout = _actionTimeoutMs });

            steps.Add("Step 5: Clicking Search (#idButtonSearch) ...");

            var clicked = await TryClickInFrame(frame, SearchButtonSelector, "Search", steps, _actionTimeoutMs);
            if (!clicked)
            {
                // onClick_idButtonSearch() is the documented handler; call it directly when the
                // anchor itself is not clickable (hidden behind an overlay, for example).
                steps.Add("Step 5: Search anchor not clickable; invoking onClick_idButtonSearch() directly ...");
                try
                {
                    await frame.EvaluateAsync(
                        "() => { if (typeof onClick_idButtonSearch === 'function') { onClick_idButtonSearch(); } }");
                }
                catch (Exception ex)
                {
                    steps.Add($"Step 5: WARNING - onClick_idButtonSearch() failed: {ex.Message}");
                }
            }

            var resultsFrame = await FindFrameWith(page, ResultRowSelector, _actionTimeoutMs);
            if (resultsFrame == null)
            {
                steps.Add("Step 5: The results grid contained no TaskDefinitionRedirector links.");
                return new List<TaskCardItem>();
            }

            steps.Add($"Step 5: Results grid rendered in frame {Shorten(resultsFrame.Url)}.");
            return await ParseResults(resultsFrame, partNumber, steps);
        }

        private async Task<List<TaskCardItem>> ParseResults(
            IFrame frame, string? partNumber, List<string> steps)
        {
            var items = new List<TaskCardItem>();
            var anchors = await frame.QuerySelectorAllAsync(ResultRowSelector);
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var index = 0;

            foreach (var anchor in anchors)
            {
                var href = await anchor.GetAttributeAsync("href") ?? string.Empty;
                if (string.IsNullOrWhiteSpace(href) || href == "#") continue;

                var absolute = Absolute(href);
                if (!seen.Add(absolute)) continue;

                var text = Normalize(await anchor.TextContentAsync() ?? string.Empty);
                if (string.IsNullOrWhiteSpace(text)) continue;

                // Row text is used to detect the P/N and any revision label in the same row.
                var rowText = Normalize(await anchor.EvaluateAsync<string>(
                    "e => { const r = e.closest('tr'); return r ? r.innerText : e.textContent; }") ?? text);

                var code = text;
                var name = string.Empty;
                var paren = text.IndexOf('(');
                if (paren > 0)
                {
                    code = text.Substring(0, paren).Trim();
                    name = text.Substring(paren).Trim(' ', '(', ')');
                }

                var item = new TaskCardItem
                {
                    TaskDefinitionCode = Truncate(code, 200),
                    TaskDefinitionName = Truncate(name, 500),
                    TaskDefinitionUrl = Truncate(absolute, 1000),
                    IsDtcJic = text.Contains("DTC-JIC", StringComparison.OrdinalIgnoreCase),
                    MatchesPartNumber = RowMentionsPartNumber(rowText, partNumber),
                    RevisionNumber = ExtractRevision(rowText),
                    RowIndex = index
                };
                item.FileName = BuildFileName(partNumber, item.TaskDefinitionCode);
                items.Add(item);
                index++;
            }

            steps.Add($"Step 6: Parsed {items.Count} task definition link(s) " +
                      $"({items.Count(i => i.IsDtcJic)} DTC-JIC, " +
                      $"{items.Count(i => i.MatchesPartNumber)} matching the P/N).");
            return items;
        }

        // =================================================================================
        // STEP 7: OPEN THE DTC-JIC ENTRY AND CAPTURE "PREVIEW TASK CARDS"
        // =================================================================================

        private async Task<bool> OpenTaskDefinitionFromGrid(
            IPage page, TaskCardItem item, List<string> steps)
        {
            var frame = await FindFrameWith(page, ResultRowSelector, 5000);

            if (frame != null)
            {
                // Clicking the real row keeps Maintenix's navigation state intact, which a
                // bare GET of the TaskDefinitionRedirector URL does not always do.
                var locator = frame.Locator(ResultRowSelector).Nth(item.RowIndex);
                try
                {
                    await locator.ClickAsync(new LocatorClickOptions { Timeout = _actionTimeoutMs });
                    if (await FindFrameWith(page, PreviewButtonSelector, _actionTimeoutMs) != null)
                    {
                        steps.Add("Step 7: Task definition page opened by clicking the grid row.");
                        return true;
                    }
                }
                catch (Exception ex)
                {
                    steps.Add($"Step 7: WARNING - clicking the grid row failed: {ex.Message}");
                }
            }

            steps.Add($"Step 7: Navigating directly to {Shorten(item.TaskDefinitionUrl)} ...");
            await SafeGoto(page, item.TaskDefinitionUrl);

            if (await FindFrameWith(page, PreviewButtonSelector, _actionTimeoutMs) != null)
            {
                steps.Add("Step 7: Task definition page opened by direct navigation.");
                return true;
            }

            steps.Add("Step 7: FAILED - the 'Preview Task Cards' button was never rendered.");
            await Dump(page, "no-preview-button", steps);
            return false;
        }

        private async Task CapturePreviewPdf(IPage page, TaskCardPdfResult result)
        {
            var steps = result.SearchSteps;

            var frame = await FindFrameWith(page, PreviewButtonSelector, _actionTimeoutMs);
            if (frame == null)
            {
                result.ErrorMessage =
                    "The 'Preview Task Cards' button was not found on the task definition page. " +
                    "This task definition may have no task card attached.";
                steps.Add("Step 8: FAILED - Preview Task Cards button not present.");
                await Dump(page, "no-preview-button", steps);
                return;
            }

            if (string.IsNullOrWhiteSpace(result.RevisionNumber))
                result.RevisionNumber = await ReadLabelledValue(frame, "Revision");

            if (string.IsNullOrWhiteSpace(result.TaskDefinitionCode))
                result.TaskDefinitionCode = await ReadLabelledValue(frame, "Task Definition Code");

            steps.Add("Step 8: Clicking 'Preview Task Cards' and waiting for the PDF stream ...");

            // The PDF may arrive as: (a) a popup window rendering it inline, (b) a download,
            // or (c) an inline navigation inside the current tab. The capture hooks all three.
            using var capture = new MaintainXPdfCapture(page, steps);

            try
            {
                await frame.Locator(PreviewButtonSelector).First.ClickAsync(
                    new LocatorClickOptions { Timeout = _actionTimeoutMs });
            }
            catch (Exception ex)
            {
                steps.Add($"Step 8: WARNING - direct click failed ({ex.Message}); retrying on the button label.");
                try
                {
                    await frame.Locator("span.largeButtonTextCell:has-text('Preview Task Cards')").First
                        .ClickAsync(new LocatorClickOptions { Timeout = _actionTimeoutMs, Force = true });
                }
                catch (Exception inner)
                {
                    result.ErrorMessage = $"Could not click 'Preview Task Cards': {inner.Message}";
                    steps.Add($"Step 8: FAILED - {inner.Message}");
                    return;
                }
            }

            var captured = await capture.WaitAsync(_pdfWaitTimeoutMs);

            // Last resort: a popup opened but streamed nothing we could intercept - refetch
            // its URL through the browser's own request context so the session cookies apply.
            if (captured == null)
            {
                var popupUrl = capture.LastPopupUrl;
                if (!string.IsNullOrWhiteSpace(popupUrl))
                {
                    steps.Add($"Step 8: Nothing intercepted; re-requesting the popup URL {Shorten(popupUrl!)} ...");
                    captured = await capture.FetchWithSessionAsync(popupUrl!);
                }
            }

            if (captured == null)
            {
                result.ErrorMessage =
                    "MaintainX did not return a PDF for 'Preview Task Cards'. The task definition " +
                    "may have no task card attached, or the report took longer than " +
                    $"{_pdfWaitTimeoutMs / 1000}s to render.";
                steps.Add("Step 8: FAILED - no PDF bytes were captured.");
                await Dump(page, "no-pdf", steps);
                return;
            }

            result.Success = true;
            result.Content = captured.Bytes;
            result.ContentType = "application/pdf";
            result.SourceUrl = Truncate(captured.Url, 1000);
            result.FileName = ResolveFileName(captured, result.TaskDefinitionCode);
            steps.Add($"Step 8: Task card PDF retrieved ({captured.Bytes.Length} bytes) from {Shorten(captured.Url)}.");
        }

        // =================================================================================
        // FRAME / DOM HELPERS
        // =================================================================================

        private static async Task<IFrame?> FindFrameWith(IPage page, string selector, int timeoutMs)
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
                    catch
                    {
                        // Frame detached mid-walk; ignore and continue.
                    }
                }

                if (DateTime.UtcNow >= deadline) return null;

                try { await page.WaitForTimeoutAsync(250); }
                catch { return null; }
            }
        }

        private async Task<bool> TryClick(IPage page, string selector, string label, List<string> steps, int timeoutMs)
        {
            var frame = await FindFrameWith(page, selector, timeoutMs);
            if (frame == null)
            {
                steps.Add($"Step 3: '{label}' was not found (selector: {selector}).");
                return false;
            }
            return await TryClickInFrame(frame, selector, label, steps, timeoutMs);
        }

        private async Task<bool> TryClickInFrame(
            IFrame frame, string selector, string label, List<string> steps, int timeoutMs)
        {
            try
            {
                await frame.Locator(selector).First.ClickAsync(new LocatorClickOptions { Timeout = timeoutMs });
                steps.Add($"Clicked '{label}' in frame {Shorten(frame.Url)}.");
                return true;
            }
            catch (Exception ex)
            {
                steps.Add($"WARNING - clicking '{label}' failed: {ex.Message}");
                return false;
            }
        }

        private static async Task<string?> ReadAttribute(IPage page, string selector, string attribute, int timeoutMs)
        {
            var frame = await FindFrameWith(page, selector, timeoutMs);
            if (frame == null) return null;

            try
            {
                var element = await frame.QuerySelectorAsync(selector);
                return element == null ? null : await element.GetAttributeAsync(attribute);
            }
            catch { return null; }
        }

        private static async Task<string> ReadLabelledValue(IFrame frame, string label)
        {
            try
            {
                var value = await frame.EvaluateAsync<string?>(
                    @"(label) => {
                        const cells = Array.from(document.querySelectorAll('td,th,span,label,div'));
                        for (const cell of cells) {
                            const text = (cell.textContent || '').trim().replace(/:$/, '').trim();
                            if (text.toLowerCase() !== label.toLowerCase()) continue;
                            const next = cell.nextElementSibling;
                            if (next && next.textContent && next.textContent.trim()) {
                                return next.textContent.trim();
                            }
                        }
                        return null;
                    }", label);

                return Truncate(Normalize(value ?? string.Empty), 100);
            }
            catch { return string.Empty; }
        }

        private async Task SafeGoto(IPage page, string url)
        {
            try
            {
                await page.GotoAsync(url, new PageGotoOptions
                {
                    WaitUntil = WaitUntilState.DOMContentLoaded,
                    Timeout = _navigationTimeoutMs
                });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "MaintainX navigation to {Url} failed", url);
            }
        }

        private static async Task<string?> SafeContent(IPage page)
        {
            try
            {
                var html = await page.ContentAsync();
                return html.Length > 3000 ? html.Substring(0, 3000) : html;
            }
            catch { return null; }
        }

        private async Task Dump(IPage page, string tag, List<string> steps)
        {
            if (!_captureDiagnostics) return;

            try
            {
                var folder = Path.Combine(Directory.GetCurrentDirectory(), _diagnosticsPath);
                Directory.CreateDirectory(folder);

                var stamp = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss");
                var shot = Path.Combine(folder, $"{stamp}-{tag}.png");
                var html = Path.Combine(folder, $"{stamp}-{tag}.html");

                await page.ScreenshotAsync(new PageScreenshotOptions { Path = shot, FullPage = true });
                await File.WriteAllTextAsync(html, await page.ContentAsync());

                steps.Add($"Diagnostics saved: {shot}");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not write MaintainX diagnostics");
            }
        }

        // =================================================================================
        // PURE HELPERS
        // =================================================================================

        /// <summary>
        /// Task definition codes embed the ATA digits in the middle, e.g. ATA 25-61-33 becomes
        /// "EMEH2561330DTC-JIC". An exact match on "256133" therefore returns nothing, which is
        /// why the wildcard forms are tried as well.
        /// </summary>
        private static List<string> BuildTaskCodeCandidates(string? ataCode)
        {
            var candidates = new List<string>();
            if (string.IsNullOrWhiteSpace(ataCode)) return candidates;

            var raw = ataCode.Trim();
            var digits = Regex.Replace(raw, @"\D", "");
            var hasLetters = Regex.IsMatch(raw, "[A-Za-z]");

            void Add(string? value)
            {
                if (string.IsNullOrWhiteSpace(value)) return;
                if (!candidates.Contains(value, StringComparer.OrdinalIgnoreCase)) candidates.Add(value);
            }

            if (hasLetters) { Add(raw); Add(digits); }
            else { Add(digits); Add(raw); }

            if (digits.Length >= 4)
            {
                Add($"*{digits}*");
                Add($"{digits}*");
                Add($"%{digits}%");
            }

            return candidates;
        }

        private static TaskCardItem? SelectPrimaryItem(List<TaskCardItem> items) =>
            items.FirstOrDefault(i => i.IsDtcJic && i.MatchesPartNumber)
            ?? items.FirstOrDefault(i => i.IsDtcJic)
            ?? items.FirstOrDefault(i => i.MatchesPartNumber)
            ?? items.FirstOrDefault();

        private static bool RowMentionsPartNumber(string rowText, string? partNumber)
        {
            if (string.IsNullOrWhiteSpace(partNumber) || string.IsNullOrWhiteSpace(rowText)) return false;
            if (rowText.Contains(partNumber, StringComparison.OrdinalIgnoreCase)) return true;

            var digits = Regex.Replace(partNumber, @"\D", "");
            if (digits.Length < 4) return false;

            return Regex.Replace(rowText, @"\D", "").Contains(digits, StringComparison.Ordinal);
        }

        private static string ExtractRevision(string rowText)
        {
            var match = Regex.Match(rowText, @"\brev\.?\s*([A-Z]?\d{1,3})\b", RegexOptions.IgnoreCase);
            return match.Success ? Truncate(match.Groups[1].Value, 100) : string.Empty;
        }

        private static string ResolveFileName(CapturedPdf captured, string taskDefinitionCode)
        {
            if (!string.IsNullOrWhiteSpace(captured.SuggestedFileName))
                return Sanitize(EnsurePdfExtension(captured.SuggestedFileName!));

            var fallback = string.IsNullOrWhiteSpace(taskDefinitionCode) ? "TaskCard" : taskDefinitionCode;
            return Sanitize($"{fallback}.pdf");
        }

        private static string EnsurePdfExtension(string name) =>
            name.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase) ? name : name + ".pdf";

        private static string BuildFileName(string? partNumber, string taskDefinitionCode)
        {
            var pn = string.IsNullOrWhiteSpace(partNumber) ? "PN" : partNumber;
            var code = string.IsNullOrWhiteSpace(taskDefinitionCode) ? "TaskCard" : taskDefinitionCode;
            return Sanitize($"{pn}_{code}.pdf");
        }

        private static string Sanitize(string fileName)
        {
            var cleaned = Regex.Replace(fileName, @"[^A-Za-z0-9._\- ]", "_").Trim();
            return string.IsNullOrWhiteSpace(cleaned) ? "TaskCard.pdf" : Truncate(cleaned, 200);
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

        private static string NoResultsMessage(string? ataCode, List<string> candidates) =>
            $"No task definitions found in MaintainX for ATA code '{ataCode}' " +
            $"(tried: {string.Join(", ", candidates)}). The search form was reached in a real " +
            "browser, so this now means the code genuinely has no task definition - check the " +
            "code in MaintainX manually, or enable MaintainXSystem:CaptureDiagnostics to review " +
            "the rendered results page.";

        private static bool IsBrowserMissing(PlaywrightException ex) =>
            ex.Message.Contains("Executable doesn't exist", StringComparison.OrdinalIgnoreCase) ||
            ex.Message.Contains("playwright install", StringComparison.OrdinalIgnoreCase) ||
            ex.Message.Contains("browserType.launch", StringComparison.OrdinalIgnoreCase);

        private static string Normalize(string value) =>
            Regex.Replace(value ?? string.Empty, @"\s+", " ").Trim();

        private static string Shorten(string? value) =>
            string.IsNullOrEmpty(value) ? "(unknown)" : Truncate(value, 160);

        private static string Truncate(string? value, int max)
        {
            if (string.IsNullOrEmpty(value)) return string.Empty;
            return value.Length <= max ? value : value.Substring(0, max);
        }

        private static int ParseInt(string? raw, int fallback) =>
            int.TryParse(raw, out var parsed) && parsed > 0 ? parsed : fallback;

        private static bool ParseBool(string? raw, bool fallback) =>
            bool.TryParse(raw, out var parsed) ? parsed : fallback;

        public async ValueTask DisposeAsync() => await _browserFactory.DisposeAsync();
    }
}