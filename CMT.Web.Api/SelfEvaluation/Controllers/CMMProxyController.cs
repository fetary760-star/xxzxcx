using System.Net;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CMT.Application.SelfEvaluation.Services;

namespace CMT.Web.Api.SelfEvaluation.Controllers
{
    [ApiController]
    [Route("api/self-evaluation/cmm-proxy")]
    [Authorize]
    public class CMMProxyController : ControllerBase
    {
        private readonly ICMMExternalService _cmmService;
        private readonly ILogger<CMMProxyController> _logger;

        public CMMProxyController(ICMMExternalService cmmService, ILogger<CMMProxyController> logger)
        {
            _cmmService = cmmService;
            _logger = logger;
        }

        /// <summary>
        /// Searches the external CMM system for the latest CMM revision.
        /// </summary>
        [HttpGet("search")]
        public async Task<IActionResult> SearchCMM(
            [FromQuery] string? ataNumber,
            [FromQuery] string? partNumber)
        {
            if (string.IsNullOrWhiteSpace(ataNumber) && string.IsNullOrWhiteSpace(partNumber))
            {
                return BadRequest(new CMMSearchResult
                {
                    Found = false,
                    ErrorMessage = "Either ATA number or Part Number is required."
                });
            }

            _logger.LogInformation("CMM Proxy Search: ATA={ATA}, PN={PN}, User={User}",
                ataNumber, partNumber, User.Identity?.Name ?? "unknown");

            var result = await _cmmService.FetchLatestCMMRevision(ataNumber ?? "", partNumber ?? "");

            _logger.LogInformation("CMM Proxy Result: Found={Found}, Rev={Rev}, Steps={Steps}",
                result.Found, result.RevisionNumber ?? "N/A", result.SearchSteps?.Count ?? 0);

            return Ok(result);
        }

        /// <summary>
        /// Diagnostic endpoint to test connectivity.
        /// </summary>
        [HttpGet("test-connection")]
        [AllowAnonymous]
        public async Task<IActionResult> TestConnection()
        {
            _logger.LogInformation("CMM Proxy: Testing connection to external system...");
            var result = await _cmmService.FetchLatestCMMRevision("31-30-40", "980-4700");
            return Ok(new
            {
                testAta = "31-30-40",
                testPartNumber = "980-4700",
                result,
                timestamp = DateTime.UtcNow
            });
        }

        /// <summary>
        /// Proxies a file download from the external system, including SharePoint-hosted images
        /// that require NTLM/Windows authentication.
        /// </summary>
        [HttpGet("pdf")]
        public async Task<IActionResult> GetPdf([FromQuery] string url)
        {
            if (string.IsNullOrWhiteSpace(url))
                return BadRequest(new { message = "PDF URL is required." });

            try
            {
                var fileResult = await DownloadExternalFileAsync(url, defaultFileName: "CMM_Revision.pdf");
                return fileResult;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error proxying PDF from: {Url}", url);
                return StatusCode(500, new { message = $"Error fetching PDF: {ex.Message}" });
            }
        }

        private async Task<IActionResult> DownloadExternalFileAsync(string url, string defaultFileName)
        {
            var uri = new Uri(url, UriKind.Absolute);
            var handler = CreateHttpHandler(uri);

            using var httpClient = new HttpClient(handler)
            {
                Timeout = TimeSpan.FromSeconds(60)
            };

            httpClient.DefaultRequestHeaders.Accept.Clear();
            httpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("*/*"));
            httpClient.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

            var response = await httpClient.GetAsync(uri);

            if (response.StatusCode == HttpStatusCode.Unauthorized && IsSharePointHost(uri.Host))
            {
                var retryHandler = CreateHttpHandler(uri, enableWindowsAuth: true);
                using var retryClient = new HttpClient(retryHandler)
                {
                    Timeout = TimeSpan.FromSeconds(60)
                };
                retryClient.DefaultRequestHeaders.Accept.Clear();
                retryClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("*/*"));
                retryClient.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

                response = await retryClient.GetAsync(uri);
            }

            if (!response.IsSuccessStatusCode)
                return StatusCode((int)response.StatusCode, new { message = $"Failed to fetch remote file. Status: {response.StatusCode}" });

            var content = await response.Content.ReadAsByteArrayAsync();
            var contentType = response.Content.Headers.ContentType?.ToString() ?? "application/octet-stream";
            var fileName = defaultFileName;

            if (response.Content.Headers.ContentDisposition?.FileName != null)
                fileName = response.Content.Headers.ContentDisposition.FileName.Trim('"');

            return File(content, contentType, fileName);
        }

        private static bool IsSharePointHost(string host)
        {
            return host.Contains("sharepoint", StringComparison.OrdinalIgnoreCase)
                   || host.Contains("portal.ethiopianairlines.com", StringComparison.OrdinalIgnoreCase);
        }

        private HttpClientHandler CreateHttpHandler(Uri uri, bool enableWindowsAuth = false)
        {
            var baseConfig = new HttpClientHandler
            {
                AllowAutoRedirect = true,
                UseCookies = true,
                ServerCertificateCustomValidationCallback = (_, _, _, _) => true
            };

            if (!enableWindowsAuth && !IsSharePointHost(uri.Host))
            {
                return baseConfig;
            }

            var domain = Configuration["ExternalFileProxy:Domain"];
            var username = Configuration["ExternalFileProxy:Username"];
            var password = Configuration["ExternalFileProxy:Password"];

            if (!string.IsNullOrWhiteSpace(username))
            {
                var credential = string.IsNullOrWhiteSpace(domain)
                    ? new NetworkCredential(username, password ?? string.Empty)
                    : new NetworkCredential(username, password ?? string.Empty, domain);

                baseConfig.Credentials = credential;
                baseConfig.PreAuthenticate = true;
            }
            else
            {
                baseConfig.UseDefaultCredentials = true;
                baseConfig.PreAuthenticate = true;
            }

            return baseConfig;
        }

        private IConfiguration Configuration => HttpContext.RequestServices.GetService<IConfiguration>() ?? new ConfigurationBuilder().AddJsonFile("appsettings.json", optional: true).Build();
    }
}
