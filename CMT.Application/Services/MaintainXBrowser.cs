using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Playwright;

namespace CMT.Application.SelfEvaluation.Services
{
    // =====================================================================================
    // MaintainXBrowser.cs
    // -------------------------------------------------------------------------------------
    // CONTAINS THREE TYPES, ALL REQUIRED BY MaintainXExternalService:
    //
    //   1. CapturedPdf            - PDF bytes + where they came from
    //   2. MaintainXBrowserFactory- owns / reuses the Chromium (or Edge) instance
    //   3. MaintainXPdfCapture    - hooks popup / download / inline-response so the
    //                               "Preview Task Cards" PDF is captured no matter which
    //                               of the three ways Maintenix decides to deliver it
    //
    // WHY THE BUILD FAILED WITH CS1513 (line 349, '}' expected)
    // --------------------------------------------------------
    // The previous copy of this file ended right after MaintainXBrowserFactory.DisposeAsync().
    // Two closing braces were missing (the factory class was closed, the namespace was not),
    // and - more importantly - the whole MaintainXPdfCapture class had been truncated away
    // even though MaintainXExternalService.CapturePreviewPdf() does:
    //
    //     using var capture = new MaintainXPdfCapture(page, steps);
    //     var captured = await capture.WaitAsync(_pdfWaitTimeoutMs);
    //     ... capture.LastPopupUrl ... capture.FetchWithSessionAsync(url)
    //
    // So fixing CS1513 by simply adding "}" would immediately have produced CS0246
    // ("type or namespace 'MaintainXPdfCapture' could not be found"). This file restores the
    // complete, compilable set.
    // =====================================================================================

    /// <summary>
    /// PDF bytes captured from MaintainX, together with where they came from.
    /// </summary>
    public sealed class CapturedPdf
    {
        public byte[] Bytes { get; set; } = Array.Empty<byte>();
        public string Url { get; set; } = string.Empty;
        public string? SuggestedFileName { get; set; }
    }

    /// <summary>
    /// Owns the browser instance shared by every MaintainX scrape.
    ///
    /// Launching a browser costs roughly a second, so the instance is created once and reused;
    /// each scrape still gets its own isolated <see cref="IBrowserContext"/> (own cookie jar),
    /// which keeps concurrent fetches from stealing each other's Maintenix session.
    ///
    /// BROWSER RESOLUTION ORDER - important on locked-down intranet hosts where
    /// cdn.playwright.dev is unreachable (corporate TLS interception produces
    /// SELF_SIGNED_CERT_IN_CHAIN), so the bundled Chromium can never be downloaded:
    ///   1. MaintainXSystem:ExecutablePath  (explicit .exe on disk)
    ///   2. MaintainXSystem:BrowserChannel  (e.g. "msedge" / "chrome")
    ///   3. auto-detected Microsoft Edge, then Google Chrome, by channel then by path
    ///   4. Playwright's bundled Chromium (only this one needs the CDN)
    /// Edge ships with Windows Server 2019+ and Windows 10+, so step 3 normally succeeds
    /// with zero downloads and zero certificate configuration.
    ///
    /// Register the owning service as a SINGLETON so this factory is not rebuilt per request.
    /// </summary>
    public sealed class MaintainXBrowserFactory : IAsyncDisposable
    {
        private readonly SemaphoreSlim _gate = new SemaphoreSlim(1, 1);
        private readonly bool _headless;
        private readonly int _slowMoMs;
        private readonly string? _executablePath;
        private readonly string? _browserChannel;
        private readonly bool _autoInstallBrowser;
        private readonly ILogger _logger;

        private IPlaywright? _playwright;
        private IBrowser? _browser;
        private bool _installAttempted;

        /// <summary>Describes which browser actually launched, for the diagnostic trail.</summary>
        public string ResolvedBrowserDescription { get; private set; } = "(not started)";

        public MaintainXBrowserFactory(
            bool headless,
            int slowMoMs,
            string? executablePath,
            string? browserChannel,
            bool autoInstallBrowser,
            ILogger logger)
        {
            _headless = headless;
            _slowMoMs = slowMoMs;
            _executablePath = string.IsNullOrWhiteSpace(executablePath) ? null : executablePath;
            _browserChannel = string.IsNullOrWhiteSpace(browserChannel) ? null : browserChannel;
            _autoInstallBrowser = autoInstallBrowser;
            _logger = logger;
        }

        public async Task<IBrowser> GetBrowserAsync()
        {
            if (_browser != null && _browser.IsConnected) return _browser;

            await _gate.WaitAsync();
            try
            {
                if (_browser != null && _browser.IsConnected) return _browser;

                _playwright ??= await Playwright.CreateAsync();

                var failures = new List<string>();

                foreach (var candidate in BuildCandidates())
                {
                    try
                    {
                        _browser = await _playwright.Chromium.LaunchAsync(BuildOptions(candidate));
                        ResolvedBrowserDescription = candidate.Description;

                        _logger.LogInformation(
                            "MaintainX browser started via {Browser} (headless={Headless}).",
                            candidate.Description, _headless);

                        return _browser;
                    }
                    catch (PlaywrightException ex)
                    {
                        failures.Add($"{candidate.Description}: {FirstLine(ex.Message)}");
                        _logger.LogWarning("Could not launch {Browser}: {Reason}",
                            candidate.Description, FirstLine(ex.Message));
                    }
                }

                // Every pre-installed option failed. Try a one-off download only if allowed -
                // this is the step that fails behind a TLS-inspecting proxy.
                if (_autoInstallBrowser && !_installAttempted)
                {
                    _installAttempted = true;
                    _logger.LogWarning(
                        "No pre-installed browser could be launched; attempting 'playwright install'.");

                    var installLog = await InstallChromiumAsync();

                    try
                    {
                        _browser = await _playwright.Chromium.LaunchAsync(
                            BuildOptions(BrowserCandidate.BundledChromium));
                        ResolvedBrowserDescription = "bundled Chromium (freshly installed)";
                        return _browser;
                    }
                    catch (PlaywrightException ex)
                    {
                        failures.Add($"bundled Chromium after install: {FirstLine(ex.Message)}");
                        if (!string.IsNullOrWhiteSpace(installLog))
                            failures.Add($"installer: {installLog}");
                    }
                }

                throw new InvalidOperationException(
                    "MaintainX task card fetching needs a Chromium-based browser, but none could be " +
                    "launched. Attempts:" + Environment.NewLine +
                    string.Join(Environment.NewLine, failures.Select(f => "  - " + f)) +
                    Environment.NewLine + Environment.NewLine +
                    "FIX: this server has Microsoft Edge pre-installed - set " +
                    "\"MaintainXSystem:BrowserChannel\": \"msedge\" in appsettings.json. " +
                    "No download is then required. If you must use the bundled Chromium, the " +
                    "SELF_SIGNED_CERT_IN_CHAIN download failure is caused by corporate TLS " +
                    "interception: export NODE_EXTRA_CA_CERTS=<path-to-corporate-root-CA.crt> " +
                    "and re-run 'pwsh bin\\Debug\\net8.0\\playwright.ps1 install chromium " +
                    "chromium-headless-shell'.");
            }
            finally
            {
                _gate.Release();
            }
        }

        /// <summary>One browser we can try to launch, in priority order.</summary>
        private sealed class BrowserCandidate
        {
            public string? ExecutablePath { get; init; }
            public string? Channel { get; init; }
            public string Description { get; init; } = string.Empty;

            public static readonly BrowserCandidate BundledChromium =
                new BrowserCandidate { Description = "bundled Chromium" };
        }

        private IEnumerable<BrowserCandidate> BuildCandidates()
        {
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // 1. Explicit executable from configuration wins outright.
            if (_executablePath != null && File.Exists(_executablePath))
            {
                yield return new BrowserCandidate
                {
                    ExecutablePath = _executablePath,
                    Description = $"configured executable ({_executablePath})"
                };
            }
            else if (_executablePath != null)
            {
                _logger.LogWarning(
                    "MaintainXSystem:ExecutablePath points at '{Path}', which does not exist.",
                    _executablePath);
            }

            // 2. Explicit channel from configuration.
            if (_browserChannel != null && seen.Add(_browserChannel))
            {
                yield return new BrowserCandidate
                {
                    Channel = _browserChannel,
                    Description = $"configured channel '{_browserChannel}'"
                };
            }

            // 3. Channels that are almost always present on a Windows host. Edge first: it is
            //    part of the OS on Windows Server 2019+ / Windows 10+.
            foreach (var channel in new[] { "msedge", "chrome" })
            {
                if (seen.Add(channel))
                {
                    yield return new BrowserCandidate
                    {
                        Channel = channel,
                        Description = $"installed channel '{channel}'"
                    };
                }
            }

            // 4. Same browsers by absolute path, for hosts where channel registry lookup fails
            //    (common when the app pool identity cannot read HKCU).
            foreach (var path in ProbeWellKnownBrowserPaths())
            {
                yield return new BrowserCandidate
                {
                    ExecutablePath = path,
                    Description = $"detected executable ({path})"
                };
            }

            // 5. Last resort: whatever Playwright downloaded, if anything.
            yield return BrowserCandidate.BundledChromium;
        }

        private static IEnumerable<string> ProbeWellKnownBrowserPaths()
        {
            var roots = new[]
            {
                Environment.GetEnvironmentVariable("ProgramFiles"),
                Environment.GetEnvironmentVariable("ProgramFiles(x86)"),
                Environment.GetEnvironmentVariable("LOCALAPPDATA")
            };

            var relatives = new[]
            {
                @"Microsoft\Edge\Application\msedge.exe",
                @"Google\Chrome\Application\chrome.exe"
            };

            foreach (var root in roots)
            {
                if (string.IsNullOrWhiteSpace(root)) continue;

                foreach (var relative in relatives)
                {
                    string candidate;
                    try { candidate = Path.Combine(root, relative); }
                    catch { continue; }

                    if (File.Exists(candidate)) yield return candidate;
                }
            }
        }

        private BrowserTypeLaunchOptions BuildOptions(BrowserCandidate candidate) =>
            new BrowserTypeLaunchOptions
            {
                Headless = _headless,
                SlowMo = _slowMoMs > 0 ? _slowMoMs : null,
                ExecutablePath = candidate.ExecutablePath,
                Channel = candidate.Channel,
                // Downloads must be allowed for the "Preview Task Cards" attachment path.
                DownloadsPath = Path.Combine(Path.GetTempPath(), "maintainx-downloads"),
                Args = new[]
                {
                    // Required on locked-down Windows Server / container hosts.
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    // Maintenix is served over plain HTTP on the intranet.
                    "--allow-running-insecure-content",
                    // Corporate TLS interception also re-signs the intranet host.
                    "--ignore-certificate-errors",
                    // Keep the built-in PDF viewer from swallowing the stream.
                    "--disable-features=PdfUnseasoned",
                    // Maintenix opens the task card report in a popup.
                    "--disable-popup-blocking"
                }
            };

        /// <summary>
        /// Equivalent to `playwright install chromium chromium-headless-shell`, executed in-process.
        /// Node's TLS trust store is widened first: behind a TLS-inspecting proxy the download
        /// otherwise dies with SELF_SIGNED_CERT_IN_CHAIN.
        /// </summary>
        private static Task<string> InstallChromiumAsync() => Task.Run(() =>
        {
            var notes = new List<string>();

            // Preferred: point Node at the corporate root CA (keeps verification ON).
            var extraCa = Environment.GetEnvironmentVariable("NODE_EXTRA_CA_CERTS")
                          ?? Environment.GetEnvironmentVariable("MAINTAINX_CA_BUNDLE");

            if (!string.IsNullOrWhiteSpace(extraCa) && File.Exists(extraCa))
            {
                Environment.SetEnvironmentVariable("NODE_EXTRA_CA_CERTS", extraCa);
                notes.Add($"using CA bundle {extraCa}");
            }
            else if (string.Equals(
                         Environment.GetEnvironmentVariable("MAINTAINX_ALLOW_INSECURE_DOWNLOAD"),
                         "true", StringComparison.OrdinalIgnoreCase))
            {
                // Opt-in escape hatch for intranet-only servers with no CA bundle to hand.
                Environment.SetEnvironmentVariable("NODE_TLS_REJECT_UNAUTHORIZED", "0");
                notes.Add("TLS verification disabled for this download (opt-in)");
            }

            try
            {
                // "chromium-headless-shell" is a SEPARATE binary from "chromium" and is what
                // Headless = true actually launches - install both or headless mode fails with
                // "Executable doesn't exist at ...chromium_headless_shell...".
                var exit = Microsoft.Playwright.Program.Main(
                    new[] { "install", "chromium", "chromium-headless-shell" });

                notes.Add($"installer exit code {exit}");
            }
            catch (Exception ex)
            {
                notes.Add($"installer threw: {FirstLine(ex.Message)}");
            }
            finally
            {
                Environment.SetEnvironmentVariable("NODE_TLS_REJECT_UNAUTHORIZED", null);
            }

            return string.Join("; ", notes);
        });

        private static string FirstLine(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return "(no detail)";

            var line = value.Split('\n')
                            .Select(l => l.Trim())
                            .FirstOrDefault(l => l.Length > 0) ?? value.Trim();

            return line.Length <= 240 ? line : line.Substring(0, 240) + "...";
        }

        public async ValueTask DisposeAsync()
        {
            try
            {
                if (_browser != null) await _browser.CloseAsync();
            }
            catch { /* best effort */ }

            _playwright?.Dispose();
            _gate.Dispose();
        }
    }

    /// <summary>
    /// Captures the task card PDF produced by Maintenix's "Preview Task Cards" button.
    ///
    /// Maintenix delivers that report in one of THREE different ways depending on server
    /// configuration, browser version and report size, so all three are hooked up front,
    /// BEFORE the button is clicked:
    ///
    ///   (a) POPUP  - window.open() to a report servlet that renders the PDF inline.
    ///   (b) DOWNLOAD - Content-Disposition: attachment, handled by Chromium's download
    ///                  manager. The response body is then NOT readable through
    ///                  IResponse.BodyAsync(), which is why IDownload is hooked separately.
    ///   (c) INLINE NAVIGATION - the current tab (or a frame) navigates straight to
    ///                  application/pdf.
    ///
    /// Usage pattern (already implemented by MaintainXExternalService.CapturePreviewPdf):
    ///
    ///     using var capture = new MaintainXPdfCapture(page, steps);
    ///     await previewButton.ClickAsync();
    ///     var pdf = await capture.WaitAsync(timeoutMs)
    ///               ?? await capture.FetchWithSessionAsync(capture.LastPopupUrl!);
    ///
    /// Every event handler is fire-and-forget and fully guarded: a detached frame, a
    /// consumed body or a cancelled download must never bubble an exception into
    /// Playwright's event loop, because that would tear down the whole scrape.
    /// </summary>
    public sealed class MaintainXPdfCapture : IDisposable
    {
        /// <summary>Anything smaller than this is an error page, not a task card.</summary>
        private const int MinimumPdfBytes = 400;

        /// <summary>URL fragments that identify a Maintenix report / attachment stream.</summary>
        private static readonly string[] ReportUrlHints =
        {
            "taskcard", "task_card", "report", "jasper", "print", "preview",
            "attachment", "download", "servlet/document", "pdf"
        };

        private static readonly StringComparison OIC = StringComparison.OrdinalIgnoreCase;

        private readonly IPage _page;
        private readonly IBrowserContext _context;
        private readonly List<string> _steps;
        private readonly object _sync = new object();
        private readonly List<IPage> _tracked = new List<IPage>();
        private readonly HashSet<string> _inspected = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        private readonly TaskCompletionSource<CapturedPdf?> _completion =
            new TaskCompletionSource<CapturedPdf?>(TaskCreationOptions.RunContinuationsAsynchronously);

        private bool _disposed;

        /// <summary>
        /// URL of the most recent popup / new tab opened after the click. Used by the caller as
        /// a last resort: the popup may render the PDF through a plugin stream we cannot
        /// intercept, but re-requesting the same URL with the session cookies works.
        /// </summary>
        public string? LastPopupUrl { get; private set; }

        public MaintainXPdfCapture(IPage page, List<string> steps)
        {
            _page = page ?? throw new ArgumentNullException(nameof(page));
            _context = page.Context;
            _steps = steps ?? new List<string>();

            // New tabs / popups can be reported on the context as well as on the opener page,
            // so both are hooked; Track() is idempotent.
            _context.Page += OnContextPage;
            Track(page);
        }

        // =================================================================================
        // PUBLIC API
        // =================================================================================

        /// <summary>
        /// Waits until a PDF has been captured or the timeout expires.
        /// Returns null when nothing usable arrived - the caller then falls back to
        /// <see cref="FetchWithSessionAsync"/>.
        /// </summary>
        public async Task<CapturedPdf?> WaitAsync(int timeoutMs)
        {
            var budget = Math.Max(2000, timeoutMs);

            var finished = await Task.WhenAny(_completion.Task, Task.Delay(budget));
            if (finished == _completion.Task) return await _completion.Task;

            Note($"Step 8: No PDF stream was intercepted within {budget / 1000}s " +
                 $"(popup seen: {(string.IsNullOrWhiteSpace(LastPopupUrl) ? "no" : "yes")}).");
            return null;
        }

        /// <summary>
        /// Re-requests a URL through the browser context's own request API, so the live
        /// Maintenix session cookies are replayed. This recovers the PDF when the popup
        /// rendered it with a plugin whose stream Playwright cannot read.
        /// </summary>
        public async Task<CapturedPdf?> FetchWithSessionAsync(string url)
        {
            if (string.IsNullOrWhiteSpace(url)) return null;

            try
            {
                var response = await _context.APIRequest.GetAsync(url, new APIRequestContextOptions
                {
                    IgnoreHTTPSErrors = true,
                    Timeout = 120000,
                    Headers = new Dictionary<string, string>
                    {
                        ["Accept"] = "application/pdf,application/octet-stream,*/*"
                    }
                });

                if (!response.Ok)
                {
                    Note($"Step 8: Re-request of {Shorten(url)} returned HTTP {response.Status}.");
                    return null;
                }

                var bytes = await response.BodyAsync();
                if (!LooksLikePdf(bytes))
                {
                    Note($"Step 8: Re-request of {Shorten(url)} returned " +
                         $"{bytes?.Length ?? 0} bytes that are not a PDF.");
                    return null;
                }

                response.Headers.TryGetValue("content-disposition", out var disposition);

                var captured = new CapturedPdf
                {
                    Bytes = bytes!,
                    Url = url,
                    SuggestedFileName = FileNameFromDisposition(disposition) ?? FileNameFromUrl(url)
                };

                Note($"Step 8: PDF recovered by re-requesting the popup URL " +
                     $"({captured.Bytes.Length} bytes).");

                Complete(captured, "session re-request");
                return captured;
            }
            catch (Exception ex)
            {
                Note($"Step 8: Re-request of {Shorten(url)} failed: {FirstLine(ex.Message)}");
                return null;
            }
        }

        // =================================================================================
        // EVENT WIRING
        // =================================================================================

        private void Track(IPage page)
        {
            if (page == null) return;

            lock (_sync)
            {
                if (_disposed || _tracked.Contains(page)) return;
                _tracked.Add(page);
            }

            page.Response += OnResponse;
            page.Download += OnDownload;
            page.Popup += OnPopup;
        }

        private void Untrack(IPage page)
        {
            try
            {
                page.Response -= OnResponse;
                page.Download -= OnDownload;
                page.Popup -= OnPopup;
            }
            catch { /* page already closed */ }
        }

        private void OnContextPage(object? sender, IPage newPage) => RegisterNewWindow(newPage, "tab");

        private void OnPopup(object? sender, IPage popup) => RegisterNewWindow(popup, "popup");

        private void RegisterNewWindow(IPage newPage, string kind)
        {
            if (newPage == null) return;

            Track(newPage);
            _ = InspectNewWindowAsync(newPage, kind);
        }

        /// <summary>
        /// A popup that renders a PDF inline often reports about:blank first and only later
        /// resolves to the report URL, so the URL is re-read after the load settles.
        /// </summary>
        private async Task InspectNewWindowAsync(IPage newPage, string kind)
        {
            try
            {
                RememberPopupUrl(newPage.Url);

                try
                {
                    await newPage.WaitForLoadStateAsync(LoadState.DOMContentLoaded,
                        new PageWaitForLoadStateOptions { Timeout = 15000 });
                }
                catch { /* a pure PDF stream never fires DOMContentLoaded */ }

                RememberPopupUrl(newPage.Url);

                var url = newPage.Url;
                if (string.IsNullOrWhiteSpace(url) || IsBlank(url)) return;

                Note($"Step 8: MaintainX opened a {kind} -> {Shorten(url)}");

                // If the popup is clearly the report itself and nothing has been intercepted
                // yet, pull it straight away instead of waiting out the full timeout.
                if (!_completion.Task.IsCompleted && LooksLikeReportUrl(url) && MarkInspected(url))
                    await FetchWithSessionAsync(url);
            }
            catch (Exception ex)
            {
                Note($"Step 8: WARNING - could not inspect the {kind}: {FirstLine(ex.Message)}");
            }
        }

        private void OnResponse(object? sender, IResponse response) =>
            _ = TryCaptureResponseAsync(response);

        private void OnDownload(object? sender, IDownload download) =>
            _ = TryCaptureDownloadAsync(download);

        // =================================================================================
        // CAPTURE PATHS
        // =================================================================================

        /// <summary>(a) / (c): the PDF arrives as a readable HTTP response body.</summary>
        private async Task TryCaptureResponseAsync(IResponse response)
        {
            if (_completion.Task.IsCompleted || _disposed || response == null) return;

            try
            {
                var url = response.Url ?? string.Empty;
                if (url.Length == 0 || url.StartsWith("data:", OIC) || IsBlank(url)) return;
                if (response.Status >= 400) return;

                var headers = response.Headers ?? new Dictionary<string, string>();
                headers.TryGetValue("content-type", out var contentType);
                headers.TryGetValue("content-disposition", out var disposition);

                if (!LooksLikePdfResponse(url, contentType, disposition)) return;

                byte[] bytes;
                try
                {
                    bytes = await response.BodyAsync();
                }
                catch (PlaywrightException)
                {
                    // Chromium turned this response into a download, so the body is gone.
                    // The IDownload handler picks it up instead - nothing to do here.
                    return;
                }

                if (!LooksLikePdf(bytes)) return;

                Complete(new CapturedPdf
                {
                    Bytes = bytes,
                    Url = url,
                    SuggestedFileName = FileNameFromDisposition(disposition) ?? FileNameFromUrl(url)
                }, "inline response");
            }
            catch (Exception ex)
            {
                Note($"Step 8: WARNING - a response could not be inspected: {FirstLine(ex.Message)}");
            }
        }

        /// <summary>(b): Content-Disposition: attachment, handled by the download manager.</summary>
        private async Task TryCaptureDownloadAsync(IDownload download)
        {
            if (_completion.Task.IsCompleted || _disposed || download == null) return;

            try
            {
                var failure = await download.FailureAsync();
                if (!string.IsNullOrWhiteSpace(failure))
                {
                    Note($"Step 8: WARNING - the task card download failed: {failure}");
                    return;
                }

                var bytes = await ReadDownloadAsync(download);
                if (!LooksLikePdf(bytes))
                {
                    Note($"Step 8: WARNING - the download produced {bytes?.Length ?? 0} bytes " +
                         "that are not a PDF.");
                    return;
                }

                Complete(new CapturedPdf
                {
                    Bytes = bytes!,
                    Url = download.Url ?? string.Empty,
                    SuggestedFileName = string.IsNullOrWhiteSpace(download.SuggestedFilename)
                        ? FileNameFromUrl(download.Url ?? string.Empty)
                        : download.SuggestedFilename
                }, "download");
            }
            catch (Exception ex)
            {
                Note($"Step 8: WARNING - the download could not be read: {FirstLine(ex.Message)}");
            }
        }

        private static async Task<byte[]?> ReadDownloadAsync(IDownload download)
        {
            // PathAsync() is the cheapest route; CreateReadStreamAsync() is the fallback for
            // hosts where the download directory is not writable by the app pool identity.
            try
            {
                var path = await download.PathAsync();
                if (!string.IsNullOrWhiteSpace(path) && File.Exists(path))
                    return await File.ReadAllBytesAsync(path);
            }
            catch { /* fall through to the stream */ }

            try
            {
                using var stream = await download.CreateReadStreamAsync();
                if (stream == null) return null;

                using var buffer = new MemoryStream();
                await stream.CopyToAsync(buffer);
                return buffer.ToArray();
            }
            catch { return null; }
        }

        // =================================================================================
        // HELPERS
        // =================================================================================

        private void Complete(CapturedPdf captured, string via)
        {
            if (_completion.TrySetResult(captured))
                Note($"Step 8: PDF captured via {via} ({captured.Bytes.Length} bytes) " +
                     $"from {Shorten(captured.Url)}.");
        }

        private void RememberPopupUrl(string? url)
        {
            if (string.IsNullOrWhiteSpace(url) || IsBlank(url!)) return;
            LastPopupUrl = url;
        }

        private bool MarkInspected(string url)
        {
            lock (_sync) { return _inspected.Add(url); }
        }

        private void Note(string message)
        {
            lock (_sync)
            {
                if (_steps.Count < 400) _steps.Add(message);
            }
        }

        private static bool IsBlank(string url) =>
            url.StartsWith("about:", OIC) || url.Equals("chrome://newtab/", OIC);

        private static bool LooksLikePdfResponse(string url, string? contentType, string? disposition)
        {
            if (!string.IsNullOrWhiteSpace(contentType))
            {
                if (contentType!.Contains("pdf", OIC)) return true;

                // Maintenix report servlets frequently stream octet-stream / "text/plain"
                // with the real type only visible in the disposition or the URL.
                var generic = contentType.Contains("octet-stream", OIC) ||
                              contentType.Contains("force-download", OIC) ||
                              contentType.Contains("binary", OIC);

                if (generic && (LooksLikeReportUrl(url) || MentionsPdf(disposition))) return true;
            }

            if (MentionsPdf(disposition)) return true;

            return url.Contains(".pdf", OIC);
        }

        private static bool MentionsPdf(string? disposition) =>
            !string.IsNullOrWhiteSpace(disposition) && disposition!.Contains(".pdf", OIC);

        private static bool LooksLikeReportUrl(string url) =>
            !string.IsNullOrWhiteSpace(url) &&
            ReportUrlHints.Any(hint => url.Contains(hint, OIC));

        /// <summary>%PDF must appear in the first bytes; anything else is an HTML error page.</summary>
        private static bool LooksLikePdf(byte[]? bytes)
        {
            if (bytes == null || bytes.Length < MinimumPdfBytes) return false;

            var probe = Math.Min(bytes.Length, 1024);
            for (var i = 0; i + 3 < probe; i++)
            {
                if (bytes[i] == (byte)'%' &&
                    bytes[i + 1] == (byte)'P' &&
                    bytes[i + 2] == (byte)'D' &&
                    bytes[i + 3] == (byte)'F')
                {
                    return true;
                }
            }

            return false;
        }

        private static string? FileNameFromDisposition(string? disposition)
        {
            if (string.IsNullOrWhiteSpace(disposition)) return null;

            // filename*=UTF-8''My%20Card.pdf  wins over  filename="My Card.pdf"
            var extended = Regex.Match(disposition, @"filename\*\s*=\s*[^']*''([^;]+)",
                RegexOptions.IgnoreCase);
            if (extended.Success)
            {
                try { return Uri.UnescapeDataString(extended.Groups[1].Value.Trim(' ', '"')); }
                catch { /* keep going */ }
            }

            var plain = Regex.Match(disposition, @"filename\s*=\s*""?([^"";]+)""?",
                RegexOptions.IgnoreCase);
            return plain.Success ? plain.Groups[1].Value.Trim() : null;
        }

        private static string? FileNameFromUrl(string url)
        {
            if (string.IsNullOrWhiteSpace(url)) return null;

            try
            {
                var path = Uri.TryCreate(url, UriKind.Absolute, out var uri) ? uri.AbsolutePath : url;
                var name = Path.GetFileName(path);

                if (string.IsNullOrWhiteSpace(name)) return null;
                return name.Contains('.') ? name : name + ".pdf";
            }
            catch { return null; }
        }

        private static string FirstLine(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return "(no detail)";

            var line = value!.Split('\n')
                             .Select(l => l.Trim())
                             .FirstOrDefault(l => l.Length > 0) ?? value.Trim();

            return line.Length <= 200 ? line : line.Substring(0, 200) + "...";
        }

        private static string Shorten(string? value)
        {
            if (string.IsNullOrEmpty(value)) return "(unknown)";
            return value!.Length <= 160 ? value : value.Substring(0, 160) + "...";
        }

        public void Dispose()
        {
            List<IPage> pages;

            lock (_sync)
            {
                if (_disposed) return;
                _disposed = true;
                pages = _tracked.ToList();
                _tracked.Clear();
            }

            try { _context.Page -= OnContextPage; } catch { /* context closed */ }

            foreach (var page in pages) Untrack(page);

            // Unblock any waiter that is still parked on WaitAsync().
            _completion.TrySetResult(null);
        }
    }
}