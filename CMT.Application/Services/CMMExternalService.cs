using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using HtmlAgilityPack;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace CMT.Application.SelfEvaluation.Services
{
    /// <summary>
    /// FULLY AMENDED v5 - CMMExternalService
    /// 
    /// Key Fixes in v5:
    /// - Fixed: Always re-fetch search page with fresh GET before submitting (ensures valid __VIEWSTATE)
    /// - Fixed: ScanAllFormInputs uses ID as fallback when name attribute is missing
    /// - Fixed: SubmitSearchForm includes ALL form fields (text inputs, dropdowns) to prevent ASP.NET validation errors
    /// - Fixed: Runtime Error detection and retry logic
    /// - Fixed: Proper DetailIndex.aspx link detection from search results
    /// - Fixed: CMM row detection in Manual Attachments table (StartsWith match)
    /// - Added: Multiple search strategies with proper ViewState refresh between attempts
    /// </summary>
    public class CMMExternalService : ICMMExternalService
    {
        private readonly string _baseUrl;
        private readonly string _username;
        private readonly string _password;
        private readonly ILogger<CMMExternalService> _logger;

        public CMMExternalService(IConfiguration configuration, ILogger<CMMExternalService> logger)
        {
            _logger = logger;
            var section = configuration.GetSection("CMMExternalSystem");
            _baseUrl = section["BaseUrl"] ?? "http://svhqmcweb02:1500";
            _username = section["Username"] ?? "CMM";
            _password = section["Password"] ?? "12345678";
        }

        public async Task<CMMSearchResult> FetchLatestCMMRevision(string ataNumber, string partNumber)
        {
            var result = new CMMSearchResult { Found = false, SearchSteps = new List<string>() };

            try
            {
                _logger.LogInformation("CMM Fetch Started: ATA={ATA}, PN={PN}", ataNumber, partNumber);

                var handler = new HttpClientHandler
                {
                    CookieContainer = new CookieContainer(),
                    UseCookies = true,
                    AllowAutoRedirect = true,
                    ServerCertificateCustomValidationCallback = (_, _, _, _) => true
                };

                using var client = new HttpClient(handler) { BaseAddress = new Uri(_baseUrl) };
                client.Timeout = TimeSpan.FromSeconds(60);
                client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");

                // ================================================================
                // STEP 1: GET the Login page
                // ================================================================
                result.SearchSteps.Add("Step 1: Fetching login page...");
                var loginPageResponse = await client.GetAsync("/Login.aspx");
                if (!loginPageResponse.IsSuccessStatusCode)
                {
                    result.ErrorMessage = $"Cannot reach external system at {_baseUrl}. HTTP Status: {loginPageResponse.StatusCode}";
                    result.SearchSteps.Add($"FAILED: {result.ErrorMessage}");
                    return result;
                }

                var loginPageHtml = await loginPageResponse.Content.ReadAsStringAsync();
                var loginFormFields = ExtractAllHiddenFields(loginPageHtml);
                result.SearchSteps.Add($"Step 1: Login page loaded. {loginFormFields.Count} hidden fields found. Page length: {loginPageHtml.Length}");

                // Scan ALL inputs on the login page
                var allLoginInputs = ScanAllFormInputs(loginPageHtml);
                result.SearchSteps.Add($"Step 1: Login inputs found: {string.Join(", ", allLoginInputs.Select(i => i.Name))}");

                // Find username field, password field, login button
                var usernameField = allLoginInputs.FirstOrDefault(i =>
                    i.Type == "text" && (
                        i.Name.Contains("User", StringComparison.OrdinalIgnoreCase) ||
                        i.Name.Contains("Login", StringComparison.OrdinalIgnoreCase) ||
                        i.Name.Contains("txt", StringComparison.OrdinalIgnoreCase)
                    ))
                    ?? allLoginInputs.FirstOrDefault(i => i.Type == "text");

                var passwordField = allLoginInputs.FirstOrDefault(i => i.Type == "password");

                var loginButton = allLoginInputs.FirstOrDefault(i =>
                    i.Type == "submit" && (
                        i.Name.Contains("Login", StringComparison.OrdinalIgnoreCase) ||
                        i.Name.Contains("btn", StringComparison.OrdinalIgnoreCase) ||
                        i.Name.Contains("Sign", StringComparison.OrdinalIgnoreCase)
                    ))
                    ?? allLoginInputs.FirstOrDefault(i => i.Type == "submit")
                    ?? allLoginInputs.FirstOrDefault(i => i.Type == "image");

                result.SearchSteps.Add($"Step 1: Detected - User: {usernameField?.Name ?? "NOT FOUND"}, Pass: {passwordField?.Name ?? "NOT FOUND"}, Btn: {loginButton?.Name ?? "NOT FOUND"}");

                if (usernameField == null || passwordField == null)
                {
                    result.ErrorMessage = "Could not detect login form fields on the external system.";
                    result.RawHtmlSnippet = loginPageHtml.Length > 3000 ? loginPageHtml.Substring(0, 3000) : loginPageHtml;
                    result.SearchSteps.Add("FAILED: Cannot find username/password fields.");
                    return result;
                }

                // ================================================================
                // STEP 2: POST login credentials
                // ================================================================
                result.SearchSteps.Add("Step 2: Submitting login credentials...");
                var loginPostData = new List<KeyValuePair<string, string>>(loginFormFields);
                loginPostData.Add(new KeyValuePair<string, string>(usernameField.Name, _username));
                loginPostData.Add(new KeyValuePair<string, string>(passwordField.Name, _password));
                if (loginButton != null && !string.IsNullOrEmpty(loginButton.Name))
                    loginPostData.Add(new KeyValuePair<string, string>(loginButton.Name, loginButton.Value ?? "Login"));

                var loginResponse = await client.PostAsync("/Login.aspx", new FormUrlEncodedContent(loginPostData));
                var loginResultHtml = await loginResponse.Content.ReadAsStringAsync();
                var loginRedirectUrl = loginResponse.RequestMessage?.RequestUri?.PathAndQuery ?? "";

                // Verify login succeeded
                bool loginFailed = loginResultHtml.Contains("type=\"password\"", StringComparison.OrdinalIgnoreCase) &&
                                   !loginResultHtml.Contains("Logout", StringComparison.OrdinalIgnoreCase) &&
                                   !loginResultHtml.Contains("Welcome", StringComparison.OrdinalIgnoreCase) &&
                                   !loginResultHtml.Contains("Sign Out", StringComparison.OrdinalIgnoreCase) &&
                                   !loginResultHtml.Contains("Log Out", StringComparison.OrdinalIgnoreCase);

                if (loginFailed)
                {
                    result.ErrorMessage = "Failed to login to external CMM system. Please verify credentials.";
                    result.SearchSteps.Add("FAILED: Login unsuccessful - still on login page.");
                    result.RawHtmlSnippet = loginResultHtml.Length > 3000 ? loginResultHtml.Substring(0, 3000) : loginResultHtml;
                    return result;
                }

                _logger.LogInformation("Login successful to external CMM system.");
                result.SearchSteps.Add($"Step 2: Login successful. Redirected to: {loginRedirectUrl}. Post-login page length: {loginResultHtml.Length}");

                // ================================================================
                // STEP 3: Find the Search Page
                // ================================================================
                result.SearchSteps.Add("Step 3: Locating search page...");
                string searchPageHtml = loginResultHtml;
                string searchPageUrl = loginRedirectUrl;

                // Check if post-login page is already the search page
                var searchPageInputs = ScanAllFormInputs(searchPageHtml);
                bool hasSearchFields = searchPageInputs.Any(i =>
                    i.Name.Contains("Part", StringComparison.OrdinalIgnoreCase) ||
                    i.Name.Contains("ATA", StringComparison.OrdinalIgnoreCase) ||
                    i.Name.Contains("Mfg", StringComparison.OrdinalIgnoreCase) ||
                    i.Name.Contains("PN", StringComparison.OrdinalIgnoreCase));

                if (!hasSearchFields)
                {
                    var searchPageUrls = new[] {
                        "/Search.aspx", "/SearchPage.aspx", "/IndexSearch.aspx",
                        "/Default.aspx", "/Home.aspx", "/Main.aspx",
                        "/ComponentIndex.aspx", "/Index.aspx", "/Browse.aspx"
                    };

                    foreach (var url in searchPageUrls)
                    {
                        try
                        {
                            var resp = await client.GetAsync(url);
                            if (resp.IsSuccessStatusCode)
                            {
                                var html = await resp.Content.ReadAsStringAsync();
                                var inputs = ScanAllFormInputs(html);
                                if (inputs.Any(i =>
                                    i.Name.Contains("Part", StringComparison.OrdinalIgnoreCase) ||
                                    i.Name.Contains("ATA", StringComparison.OrdinalIgnoreCase) ||
                                    i.Name.Contains("Mfg", StringComparison.OrdinalIgnoreCase)))
                                {
                                    searchPageHtml = html;
                                    searchPageUrl = url;
                                    searchPageInputs = inputs;
                                    hasSearchFields = true;
                                    break;
                                }
                            }
                        }
                        catch { /* Skip unreachable pages */ }
                    }
                }

                if (!hasSearchFields)
                {
                    result.SearchSteps.Add("Step 3: WARNING - Could not confirm search page. Using post-login page as fallback.");
                }
                else
                {
                    result.SearchSteps.Add($"Step 3: Search page found at: {searchPageUrl}");
                }

                result.SearchSteps.Add($"Step 3: Search page fields: {string.Join(", ", searchPageInputs.Where(i => i.Type == "text" || i.Type == "submit").Select(i => $"{i.Name}[{i.Type}]"))}");

                // ================================================================
                // STEP 4: Submit search - WITH FRESH VIEWSTATE
                // ================================================================
                result.SearchSteps.Add("Step 4: Submitting search...");

                // CRITICAL FIX v5: Always do a fresh GET of the search page to get valid __VIEWSTATE
                // The post-login redirect HTML may have stale or missing ViewState
                var freshSearchResponse = await client.GetAsync(searchPageUrl);
                if (freshSearchResponse.IsSuccessStatusCode)
                {
                    searchPageHtml = await freshSearchResponse.Content.ReadAsStringAsync();
                    searchPageInputs = ScanAllFormInputs(searchPageHtml);
                }

                // Log hidden fields count from fresh search page
                var freshHiddenFields = ExtractAllHiddenFields(searchPageHtml);
                result.SearchSteps.Add($"Step 4: Fresh search page fetched. {freshHiddenFields.Count} hidden fields found.");

                // Detect form fields from the fresh page
                var partNoField = searchPageInputs.FirstOrDefault(i =>
                    i.Type == "text" && i.Name.Equals("txtMfgPartNo", StringComparison.OrdinalIgnoreCase))
                    ?? searchPageInputs.FirstOrDefault(i =>
                        i.Type == "text" && (
                            i.Name.Contains("Mfg", StringComparison.OrdinalIgnoreCase) ||
                            i.Name.Contains("Part", StringComparison.OrdinalIgnoreCase) ||
                            i.Name.Contains("PN", StringComparison.OrdinalIgnoreCase)
                        ));

                var ataField = searchPageInputs.FirstOrDefault(i =>
                    i.Type == "text" && i.Name.Equals("txtAta", StringComparison.OrdinalIgnoreCase))
                    ?? searchPageInputs.FirstOrDefault(i =>
                        i.Type == "text" && (
                            i.Name.Contains("ATA", StringComparison.OrdinalIgnoreCase) ||
                            i.Name.Contains("Index", StringComparison.OrdinalIgnoreCase) ||
                            i.Name.Contains("Chapter", StringComparison.OrdinalIgnoreCase)
                        ));

                var searchButton = searchPageInputs.FirstOrDefault(i =>
                    (i.Type == "submit") && i.Name.Equals("btnSearch", StringComparison.OrdinalIgnoreCase))
                    ?? searchPageInputs.FirstOrDefault(i =>
                        (i.Type == "submit" || i.Type == "button") && (
                            i.Name.Contains("Search", StringComparison.OrdinalIgnoreCase) ||
                            i.Name.Contains("btn", StringComparison.OrdinalIgnoreCase)
                        ))
                    ?? searchPageInputs.FirstOrDefault(i => i.Type == "submit");

                // If we couldn't find specific fields, try assigning by position
                if (partNoField == null && ataField == null)
                {
                    var textInputs = searchPageInputs.Where(i => i.Type == "text" && !i.Name.StartsWith("__")).ToList();
                    if (textInputs.Count >= 2)
                    {
                        ataField = textInputs[0];
                        partNoField = textInputs[1];
                    }
                    else if (textInputs.Count == 1)
                    {
                        partNoField = textInputs[0];
                    }
                }

                result.SearchSteps.Add($"Step 4: Fields - ATA: {ataField?.Name ?? "N/A"}, PN: {partNoField?.Name ?? "N/A"}, Btn: {searchButton?.Name ?? "N/A"}");

                // Search strategies
                string searchResultHtml = null;
                bool searchSuccess = false;

                // Search attempt 1: Part Number only
                if (!string.IsNullOrWhiteSpace(partNumber) && partNoField != null)
                {
                    result.SearchSteps.Add($"Step 4a: Trying search with Part Number '{partNumber}'...");
                    searchResultHtml = await SubmitSearchForm(client, searchPageUrl, searchPageHtml,
                        partNoField?.Name, partNumber, ataField?.Name, null, searchButton?.Name, searchButton?.Value);

                    // Check if the response is a Runtime Error
                    if (searchResultHtml != null && searchResultHtml.Contains("Runtime Error", StringComparison.OrdinalIgnoreCase))
                    {
                        result.SearchSteps.Add("Step 4a: Server returned Runtime Error. Retrying with fresh ViewState...");
                        // Retry with completely fresh page
                        var retryPage = await client.GetAsync(searchPageUrl);
                        if (retryPage.IsSuccessStatusCode)
                        {
                            var retryHtml = await retryPage.Content.ReadAsStringAsync();
                            searchResultHtml = await SubmitSearchForm(client, searchPageUrl, retryHtml,
                                partNoField?.Name, partNumber, ataField?.Name, null, searchButton?.Name, searchButton?.Value);
                        }
                    }

                    searchSuccess = IsValidSearchResult(searchResultHtml);

                    if (!searchSuccess)
                    {
                        result.SearchSteps.Add($"Step 4a: No results with PN only. IsError: {searchResultHtml?.Contains("Runtime Error") == true}");
                    }
                }

                // Search attempt 2: Both ATA + Part Number
                if (!searchSuccess && !string.IsNullOrWhiteSpace(ataNumber) && !string.IsNullOrWhiteSpace(partNumber))
                {
                    result.SearchSteps.Add($"Step 4b: Trying search with ATA '{ataNumber}' + PN '{partNumber}'...");
                    var freshPage = await client.GetAsync(searchPageUrl);
                    searchPageHtml = await freshPage.Content.ReadAsStringAsync();

                    searchResultHtml = await SubmitSearchForm(client, searchPageUrl, searchPageHtml,
                        partNoField?.Name, partNumber, ataField?.Name, ataNumber, searchButton?.Name, searchButton?.Value);
                    searchSuccess = IsValidSearchResult(searchResultHtml);

                    if (!searchSuccess)
                    {
                        result.SearchSteps.Add("Step 4b: No results with ATA+PN.");
                    }
                }

                // Search attempt 3: ATA only
                if (!searchSuccess && !string.IsNullOrWhiteSpace(ataNumber) && ataField != null)
                {
                    result.SearchSteps.Add($"Step 4c: Trying search with ATA '{ataNumber}' only...");
                    var freshPage = await client.GetAsync(searchPageUrl);
                    searchPageHtml = await freshPage.Content.ReadAsStringAsync();

                    searchResultHtml = await SubmitSearchForm(client, searchPageUrl, searchPageHtml,
                        null, null, ataField?.Name, ataNumber, searchButton?.Name, searchButton?.Value);
                    searchSuccess = IsValidSearchResult(searchResultHtml);

                    if (!searchSuccess)
                    {
                        result.SearchSteps.Add("Step 4c: No results with ATA only.");
                    }
                }

                if (!searchSuccess || string.IsNullOrEmpty(searchResultHtml))
                {
                    result.ErrorMessage = "No matching results found for the given ATA/Part Number in the external system.";
                    result.SearchSteps.Add("FAILED: All search strategies returned no results.");
                    result.RawHtmlSnippet = (searchResultHtml ?? searchPageHtml)?.Substring(0, Math.Min(3000, (searchResultHtml ?? searchPageHtml)?.Length ?? 0));
                    return result;
                }

                result.SearchSteps.Add($"Step 4: Search returned results. Response length: {searchResultHtml.Length}");

                // ================================================================
                // STEP 5: Parse search results - find the Index/Detail link
                // ================================================================
                result.SearchSteps.Add("Step 5: Parsing search results...");

                // First try: look for ET Rev No directly in search results
                var directRevision = ExtractETRevisionFromSearchResults(searchResultHtml, partNumber);
                if (directRevision != null)
                {
                    result.SearchSteps.Add($"Step 5: Found ET Rev No directly in search results: {directRevision}");
                }

                // Look for DetailIndex.aspx link
                var indexDetailUrl = FindDetailIndexLink(searchResultHtml, ataNumber, partNumber);

                if (string.IsNullOrEmpty(indexDetailUrl))
                {
                    indexDetailUrl = ParseSearchResultsForIndexLink(searchResultHtml, ataNumber, partNumber);
                }

                if (string.IsNullOrEmpty(indexDetailUrl))
                {
                    indexDetailUrl = FindFirstGridViewLink(searchResultHtml);
                }

                if (string.IsNullOrEmpty(indexDetailUrl))
                {
                    if (directRevision != null)
                    {
                        result.Found = true;
                        result.ManualType = "CMM";
                        result.RevisionNumber = directRevision;
                        result.SearchSteps.Add($"Step 5: Using ET Rev No from search results as CMM revision: {directRevision}");
                        return result;
                    }

                    result.ErrorMessage = "Search returned results but could not find a clickable Index link to navigate to details.";
                    result.SearchSteps.Add("FAILED: No Index link found in search results.");
                    result.RawHtmlSnippet = searchResultHtml.Length > 3000 ? searchResultHtml.Substring(0, 3000) : searchResultHtml;
                    return result;
                }

                result.SearchSteps.Add($"Step 5: Index detail link found: {indexDetailUrl}");

                // ================================================================
                // STEP 6: Navigate to Index Details page
                // ================================================================
                result.SearchSteps.Add("Step 6: Navigating to Index Details...");
                string detailHtml;

                if (indexDetailUrl.Contains("__doPostBack") || indexDetailUrl.Contains("javascript:"))
                {
                    detailHtml = await HandlePostback(client, searchPageUrl, searchResultHtml, indexDetailUrl);
                }
                else
                {
                    if (!indexDetailUrl.StartsWith("http") && !indexDetailUrl.StartsWith("/"))
                        indexDetailUrl = "/" + indexDetailUrl;

                    var detailResponse = await client.GetAsync(indexDetailUrl);
                    detailHtml = await detailResponse.Content.ReadAsStringAsync();
                }

                if (string.IsNullOrEmpty(detailHtml))
                {
                    result.ErrorMessage = "Failed to load the Index Details page from the external system.";
                    result.SearchSteps.Add("FAILED: Index Details page returned empty.");
                    return result;
                }

                result.SearchSteps.Add($"Step 6: Index Details loaded. Length: {detailHtml.Length} chars.");

                // ================================================================
                // STEP 7: Parse Index Details - Find Manual Attachments with CMM
                // ================================================================
                result.SearchSteps.Add("Step 7: Parsing Manual Attachments for CMM...");
                var cmmResult = ParseIndexDetailsForCMM(detailHtml);
                cmmResult.SearchSteps = result.SearchSteps;

                if (cmmResult.Found && !string.IsNullOrEmpty(cmmResult.PdfUrl) && !cmmResult.PdfUrl.StartsWith("http"))
                {
                    cmmResult.PdfUrl = _baseUrl.TrimEnd('/') + "/" + cmmResult.PdfUrl.TrimStart('/');
                }

                if (cmmResult.Found)
                {
                    cmmResult.SearchSteps.Add($"Step 7: CMM Found! Rev: {cmmResult.RevisionNumber}, PDF: {cmmResult.PdfUrl}");
                }
                else
                {
                    if (directRevision != null)
                    {
                        cmmResult.Found = true;
                        cmmResult.ManualType = "CMM";
                        cmmResult.RevisionNumber = directRevision;
                        cmmResult.SearchSteps.Add($"Step 7: CMM table not found in detail page, using ET Rev No from search: {directRevision}");
                    }
                    else
                    {
                        cmmResult.SearchSteps.Add($"Step 7: {cmmResult.ErrorMessage}");
                        cmmResult.RawHtmlSnippet = detailHtml.Length > 3000 ? detailHtml.Substring(0, 3000) : detailHtml;
                    }
                }

                _logger.LogInformation("CMM Fetch Complete: Found={Found}, Rev={Rev}, PDF={Pdf}",
                    cmmResult.Found, cmmResult.RevisionNumber, cmmResult.PdfUrl);

                return cmmResult;
            }
            catch (TaskCanceledException)
            {
                _logger.LogWarning("CMM External System request timed out.");
                result.ErrorMessage = "Connection to external CMM system timed out (60s). The server may be unreachable.";
                result.SearchSteps.Add("FAILED: Request timed out.");
                return result;
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "CMM External System HTTP error");
                result.ErrorMessage = $"Cannot connect to external CMM system at {_baseUrl}: {ex.Message}";
                result.SearchSteps.Add($"FAILED: HTTP error - {ex.Message}");
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "CMM External System unexpected error");
                result.ErrorMessage = $"Unexpected error while fetching CMM revision: {ex.Message}";
                result.SearchSteps.Add($"FAILED: {ex.Message}");
                return result;
            }
        }

        /// <summary>
        /// AMENDED v5: Checks if search result HTML is valid (has data, no errors).
        /// </summary>
        private bool IsValidSearchResult(string html)
        {
            if (string.IsNullOrEmpty(html)) return false;
            if (html.Contains("Runtime Error", StringComparison.OrdinalIgnoreCase)) return false;
            if (HasNoResultsMessage(html)) return false;
            if (!HasDataTable(html)) return false;
            return true;
        }

        /// <summary>
        /// AMENDED v5: Submits the search form with ALL required fields for ASP.NET WebForms.
        /// Includes all hidden fields (__VIEWSTATE, __EVENTVALIDATION), all text inputs,
        /// all dropdowns with their default values, and the submit button.
        /// </summary>
        private async Task<string> SubmitSearchForm(
            HttpClient client, string searchPageUrl, string searchPageHtml,
            string partNoFieldName, string partNumber,
            string ataFieldName, string ataNumber,
            string searchButtonName, string searchButtonValue)
        {
            var doc = new HtmlDocument();
            doc.LoadHtml(searchPageHtml);

            // Start with ALL hidden fields (__VIEWSTATE, __VIEWSTATEGENERATOR, __EVENTVALIDATION, etc.)
            var postData = ExtractAllHiddenFields(searchPageHtml);

            // Include ALL text input fields (even empty ones) - ASP.NET requires all rendered fields
            var allTextInputs = doc.DocumentNode.SelectNodes("//input[@type='text']");
            if (allTextInputs != null)
            {
                foreach (var input in allTextInputs)
                {
                    var name = input.GetAttributeValue("name", "");
                    var id = input.GetAttributeValue("id", "");
                    var effectiveName = !string.IsNullOrEmpty(name) ? name : id;

                    if (string.IsNullOrEmpty(effectiveName)) continue;

                    // Set the value based on which field this is
                    string value = "";
                    if (!string.IsNullOrWhiteSpace(partNoFieldName) &&
                        effectiveName.Equals(partNoFieldName, StringComparison.OrdinalIgnoreCase))
                    {
                        value = partNumber ?? "";
                    }
                    else if (!string.IsNullOrWhiteSpace(ataFieldName) &&
                             effectiveName.Equals(ataFieldName, StringComparison.OrdinalIgnoreCase))
                    {
                        value = ataNumber ?? "";
                    }

                    postData.Add(new KeyValuePair<string, string>(effectiveName, value));
                }
            }

            // Include all select/dropdown fields with their selected or default values
            var selectNodes = doc.DocumentNode.SelectNodes("//select");
            if (selectNodes != null)
            {
                foreach (var select in selectNodes)
                {
                    var selectName = select.GetAttributeValue("name", "");
                    var selectId = select.GetAttributeValue("id", "");
                    var effectiveName = !string.IsNullOrEmpty(selectName) ? selectName : selectId;

                    if (string.IsNullOrEmpty(effectiveName)) continue;
                    if (postData.Any(p => p.Key == effectiveName)) continue;

                    // Get the selected option value, or first option value as default
                    var selectedOption = select.SelectSingleNode(".//option[@selected]")
                        ?? select.SelectSingleNode(".//option");
                    var optionValue = selectedOption?.GetAttributeValue("value", "") ?? "";
                    postData.Add(new KeyValuePair<string, string>(effectiveName, optionValue));
                }
            }

            // CRITICAL: Include the search button name/value
            // ASP.NET WebForms uses this to determine which button was clicked (server-side event)
            if (!string.IsNullOrWhiteSpace(searchButtonName))
            {
                postData.Add(new KeyValuePair<string, string>(searchButtonName, searchButtonValue ?? "Search"));
            }
            else
            {
                // Fallback: use the known button name from the external system
                postData.Add(new KeyValuePair<string, string>("btnSearch", "Search"));
            }

            _logger.LogDebug("Search POST data: {Fields}",
                string.Join(", ", postData.Where(p => !p.Key.StartsWith("__")).Select(p => $"{p.Key}={p.Value}")));

            var response = await client.PostAsync(searchPageUrl, new FormUrlEncodedContent(postData));
            return await response.Content.ReadAsStringAsync();
        }

        /// <summary>
        /// AMENDED v5: Specifically looks for DetailIndex.aspx links in search results.
        /// Pattern: href="DetailIndex.aspx?iid=57706"
        /// </summary>
        private string FindDetailIndexLink(string html, string ataNumber, string partNumber)
        {
            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            // Look for all links that point to DetailIndex.aspx
            var detailLinks = doc.DocumentNode.SelectNodes("//a[contains(@href, 'DetailIndex.aspx')]");
            if (detailLinks == null || detailLinks.Count == 0)
            {
                detailLinks = doc.DocumentNode.SelectNodes("//a[contains(@href, 'Detail')]");
            }

            if (detailLinks == null || detailLinks.Count == 0)
                return null;

            // If we have an ATA number, try to find the link whose text contains it
            if (!string.IsNullOrWhiteSpace(ataNumber))
            {
                foreach (var link in detailLinks)
                {
                    var linkText = link.InnerText.Trim();
                    if (linkText.Contains(ataNumber, StringComparison.OrdinalIgnoreCase))
                    {
                        var href = link.GetAttributeValue("href", "");
                        if (!string.IsNullOrEmpty(href))
                            return WebUtility.HtmlDecode(href);
                    }
                }
            }

            // If we have a part number, check if the row containing the link also has the PN
            if (!string.IsNullOrWhiteSpace(partNumber))
            {
                foreach (var link in detailLinks)
                {
                    var parentRow = link.Ancestors("tr").FirstOrDefault();
                    if (parentRow != null)
                    {
                        var rowText = parentRow.InnerText;
                        if (rowText.Contains(partNumber, StringComparison.OrdinalIgnoreCase))
                        {
                            var href = link.GetAttributeValue("href", "");
                            if (!string.IsNullOrEmpty(href))
                                return WebUtility.HtmlDecode(href);
                        }
                    }
                }
            }

            // Fallback: return the first DetailIndex link found
            var firstLink = detailLinks.FirstOrDefault();
            if (firstLink != null)
            {
                var href2 = firstLink.GetAttributeValue("href", "");
                if (!string.IsNullOrEmpty(href2))
                    return WebUtility.HtmlDecode(href2);
            }

            return null;
        }

        /// <summary>
        /// Checks if the search results contain a data table.
        /// </summary>
        private bool HasDataTable(string html)
        {
            if (string.IsNullOrEmpty(html)) return false;
            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            var tables = doc.DocumentNode.SelectNodes("//table");
            if (tables == null) return false;

            foreach (var table in tables)
            {
                var rows = table.SelectNodes(".//tr");
                if (rows != null && rows.Count >= 2)
                {
                    var firstRow = rows[0];
                    var cells = firstRow.SelectNodes(".//th|.//td");
                    if (cells != null && cells.Count >= 3)
                        return true;
                }
            }

            return false;
        }

        /// <summary>
        /// Extracts the ET Revision No directly from search results table.
        /// </summary>
        private string ExtractETRevisionFromSearchResults(string html, string partNumber)
        {
            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            var tables = doc.DocumentNode.SelectNodes("//table");
            if (tables == null) return null;

            foreach (var table in tables)
            {
                var rows = table.SelectNodes(".//tr");
                if (rows == null || rows.Count < 2) continue;

                var headerCells = rows[0].SelectNodes(".//th|.//td");
                if (headerCells == null) continue;

                int etRevCol = -1;
                int mfgPartCol = -1;

                for (int i = 0; i < headerCells.Count; i++)
                {
                    var text = headerCells[i].InnerText.Trim().ToLower();
                    if (text.Contains("et rev") && text.Contains("no") && !text.Contains("date"))
                        etRevCol = i;
                    else if (text.Contains("et revision") && !text.Contains("date"))
                        etRevCol = i;
                    if (text.Contains("mfg part") || text.Contains("part no"))
                        mfgPartCol = i;
                }

                if (etRevCol < 0) continue;

                for (int r = 1; r < rows.Count; r++)
                {
                    var cells = rows[r].SelectNodes(".//td");
                    if (cells == null || cells.Count <= etRevCol) continue;

                    bool isMatch = true;
                    if (!string.IsNullOrWhiteSpace(partNumber) && mfgPartCol >= 0 && mfgPartCol < cells.Count)
                    {
                        var cellPN = cells[mfgPartCol].InnerText.Trim();
                        isMatch = cellPN.Contains(partNumber, StringComparison.OrdinalIgnoreCase) ||
                                  partNumber.Contains(cellPN, StringComparison.OrdinalIgnoreCase);
                    }

                    if (isMatch || r == 1)
                    {
                        var revValue = cells[etRevCol].InnerText.Trim();
                        if (!string.IsNullOrEmpty(revValue) && revValue != "&nbsp;" && revValue != "-")
                        {
                            return revValue;
                        }
                    }
                }
            }

            return null;
        }

        /// <summary>
        /// AMENDED v5: Scans ALL form inputs from the HTML.
        /// Uses ID as fallback when name attribute is missing.
        /// </summary>
        private List<FormInput> ScanAllFormInputs(string html)
        {
            var inputs = new List<FormInput>();
            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            // Get all <input> elements
            var inputNodes = doc.DocumentNode.SelectNodes("//input");
            if (inputNodes != null)
            {
                foreach (var node in inputNodes)
                {
                    var name = node.GetAttributeValue("name", "");
                    var type = node.GetAttributeValue("type", "text").ToLower();
                    var value = node.GetAttributeValue("value", "");
                    var id = node.GetAttributeValue("id", "");

                    // Use id as fallback when name is empty
                    var effectiveName = !string.IsNullOrEmpty(name) ? name : id;

                    if (!string.IsNullOrEmpty(effectiveName) && !effectiveName.StartsWith("__"))
                    {
                        inputs.Add(new FormInput { Name = effectiveName, Type = type, Value = value, Id = id });
                    }
                }
            }

            // Get all <select> elements
            var selectNodes = doc.DocumentNode.SelectNodes("//select");
            if (selectNodes != null)
            {
                foreach (var node in selectNodes)
                {
                    var name = node.GetAttributeValue("name", "");
                    var id = node.GetAttributeValue("id", "");
                    var effectiveName = !string.IsNullOrEmpty(name) ? name : id;
                    if (!string.IsNullOrEmpty(effectiveName))
                    {
                        inputs.Add(new FormInput { Name = effectiveName, Type = "select", Value = "", Id = id });
                    }
                }
            }

            // Get all <button> elements
            var buttonNodes = doc.DocumentNode.SelectNodes("//button");
            if (buttonNodes != null)
            {
                foreach (var node in buttonNodes)
                {
                    var name = node.GetAttributeValue("name", "");
                    var type = node.GetAttributeValue("type", "submit").ToLower();
                    var value = node.GetAttributeValue("value", node.InnerText.Trim());
                    var id = node.GetAttributeValue("id", "");
                    var effectiveName = !string.IsNullOrEmpty(name) ? name : id;
                    if (!string.IsNullOrEmpty(effectiveName))
                    {
                        inputs.Add(new FormInput { Name = effectiveName, Type = type, Value = value, Id = id });
                    }
                }
            }

            return inputs;
        }

        private class FormInput
        {
            public string Name { get; set; }
            public string Type { get; set; }
            public string Value { get; set; }
            public string Id { get; set; }
        }

        /// <summary>
        /// Checks if the search results HTML contains a "no results" message.
        /// </summary>
        private bool HasNoResultsMessage(string html)
        {
            if (string.IsNullOrEmpty(html)) return true;

            var noResultPatterns = new[] {
                "No records found", "No results found", "No data found",
                "0 record(s)", "No matching", "Nothing found",
                "Your search did not match", "No items to display",
                "No data to display", "EmptyDataText"
            };

            return noResultPatterns.Any(p => html.Contains(p, StringComparison.OrdinalIgnoreCase));
        }

        /// <summary>
        /// Parses search results HTML to find the clickable "Index" link.
        /// </summary>
        private string ParseSearchResultsForIndexLink(string html, string ataNumber, string partNumber)
        {
            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            var tables = doc.DocumentNode.SelectNodes("//table");
            if (tables == null) return null;

            foreach (var table in tables)
            {
                var rows = table.SelectNodes(".//tr");
                if (rows == null || rows.Count < 2) continue;

                var headerCells = rows[0].SelectNodes(".//th|.//td");
                if (headerCells == null || headerCells.Count < 3) continue;

                int indexCol = -1;
                int mfgPartNoCol = -1;

                for (int i = 0; i < headerCells.Count; i++)
                {
                    var text = headerCells[i].InnerText.Trim().ToLower();
                    if (text == "index" || text.Contains("index"))
                        indexCol = i;
                    if (text.Contains("mfg part") || text.Contains("part no"))
                        mfgPartNoCol = i;
                }

                if (indexCol < 0 && mfgPartNoCol < 0) continue;

                for (int r = 1; r < rows.Count; r++)
                {
                    var cells = rows[r].SelectNodes(".//td");
                    if (cells == null) continue;

                    bool isMatch = false;

                    if (!string.IsNullOrWhiteSpace(partNumber) && mfgPartNoCol >= 0 && mfgPartNoCol < cells.Count)
                    {
                        var cellPartNo = cells[mfgPartNoCol].InnerText.Trim();
                        isMatch = cellPartNo.Contains(partNumber, StringComparison.OrdinalIgnoreCase) ||
                                  partNumber.Contains(cellPartNo, StringComparison.OrdinalIgnoreCase);
                    }

                    if (!isMatch && !string.IsNullOrWhiteSpace(ataNumber))
                    {
                        if (indexCol >= 0 && indexCol < cells.Count)
                        {
                            isMatch = cells[indexCol].InnerText.Trim().Contains(ataNumber, StringComparison.OrdinalIgnoreCase);
                        }
                    }

                    if (!isMatch && r == 1)
                        isMatch = true;

                    if (isMatch)
                    {
                        // Look for links in the Index column first
                        int linkCol = indexCol >= 0 ? indexCol : 0;
                        if (linkCol < cells.Count)
                        {
                            var link = cells[linkCol].SelectSingleNode(".//a[@href]");
                            if (link != null)
                            {
                                var href = link.GetAttributeValue("href", "");
                                if (!string.IsNullOrEmpty(href))
                                    return WebUtility.HtmlDecode(href);
                            }
                        }

                        // Check ALL cells for any link
                        var allLinks = rows[r].SelectNodes(".//a[@href]");
                        if (allLinks != null)
                        {
                            foreach (var link in allLinks)
                            {
                                var href = link.GetAttributeValue("href", "");
                                if (!string.IsNullOrEmpty(href) && href != "#")
                                {
                                    if (href.Contains("DetailIndex", StringComparison.OrdinalIgnoreCase) ||
                                        href.Contains("__doPostBack") ||
                                        href.Contains("Detail", StringComparison.OrdinalIgnoreCase) ||
                                        href.Contains(".aspx", StringComparison.OrdinalIgnoreCase))
                                    {
                                        return WebUtility.HtmlDecode(href);
                                    }
                                }
                            }

                            foreach (var link in allLinks)
                            {
                                var href = link.GetAttributeValue("href", "");
                                if (!string.IsNullOrEmpty(href) && href != "#" && !href.Contains("Login"))
                                    return WebUtility.HtmlDecode(href);
                            }
                        }
                    }
                }
            }

            return null;
        }

        /// <summary>
        /// Finds the first GridView link in the HTML.
        /// </summary>
        private string FindFirstGridViewLink(string html)
        {
            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            var links = doc.DocumentNode.SelectNodes("//table//a[@href]");
            if (links == null) return null;

            foreach (var link in links)
            {
                var href = link.GetAttributeValue("href", "");
                var text = link.InnerText.Trim();

                if (string.IsNullOrEmpty(href) || href == "#" || href.Contains("Login"))
                    continue;

                if (href.Contains("DetailIndex", StringComparison.OrdinalIgnoreCase))
                    return WebUtility.HtmlDecode(href);

                if (href.Contains("__doPostBack"))
                    return WebUtility.HtmlDecode(href);

                if (Regex.IsMatch(text, @"\d{2}-\d{2}-\d{2}"))
                    return WebUtility.HtmlDecode(href);

                if (href.Contains("Detail", StringComparison.OrdinalIgnoreCase) ||
                    href.Contains("View", StringComparison.OrdinalIgnoreCase))
                    return WebUtility.HtmlDecode(href);
            }

            return null;
        }

        /// <summary>
        /// AMENDED v5: Parses the Index Details page to find the CMM entry.
        /// </summary>
        private CMMSearchResult ParseIndexDetailsForCMM(string html)
        {
            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            var result = new CMMSearchResult { Found = false };

            // Extract metadata
            result.IndexComponent = ExtractLabelValue(doc, new[] { "Component", "Index", "ATA Index" });
            result.MfgPartNo = ExtractLabelValue(doc, new[] { "MFG Part No", "Mfg Part No", "Manufacturer Part" });
            result.EtPartNo = ExtractLabelValue(doc, new[] { "ET Part No", "ET PN" });
            result.EtRevisionNo = ExtractLabelValue(doc, new[] { "ET Revision No", "ET Rev No", "ET Rev" });
            result.EtRevisionDate = ExtractLabelValue(doc, new[] { "ET Revision Date", "ET Rev Date" });
            result.VendorRevisionNo = ExtractLabelValue(doc, new[] { "Vendor Revision No", "Vendor Rev No" });
            result.VendorRevisionDate = ExtractLabelValue(doc, new[] { "Vendor Revision Date", "Vendor Rev Date" });
            result.SubscriptionDate = ExtractLabelValue(doc, new[] { "Subscription Date" });
            result.SubscriptionMethod = ExtractLabelValue(doc, new[] { "Subscription Method" });
            result.Vendor = ExtractLabelValue(doc, new[] { "Vendor" });
            result.Shop = ExtractLabelValue(doc, new[] { "Shop" });

            // Find Manual Attachments table
            var tables = doc.DocumentNode.SelectNodes("//table");
            if (tables == null)
            {
                result.ErrorMessage = "No tables found on Index Details page.";
                return result;
            }

            foreach (var table in tables)
            {
                var rows = table.SelectNodes(".//tr");
                if (rows == null || rows.Count < 2) continue;

                var headerCells = rows[0].SelectNodes(".//th|.//td");
                if (headerCells == null) continue;

                int associatedManualsCol = -1;
                int manualTypeCol = -1;
                int revisionCol = -1;

                for (int i = 0; i < headerCells.Count; i++)
                {
                    var text = headerCells[i].InnerText.Trim().ToLower();
                    if (text.Contains("associated manual") || text.Contains("manual name") || text.Contains("file") || text.Contains("document"))
                        associatedManualsCol = i;
                    if (text.Contains("manual type") || text.Contains("type"))
                        manualTypeCol = i;
                    if ((text.Contains("revision") || text.Contains("rev")) && !text.Contains("date"))
                        revisionCol = i;
                }

                if (manualTypeCol < 0) continue;

                // Search for CMM row
                for (int r = 1; r < rows.Count; r++)
                {
                    var cells = rows[r].SelectNodes(".//td");
                    if (cells == null || cells.Count <= manualTypeCol) continue;

                    var manualTypeText = cells[manualTypeCol].InnerText.Trim();

                    if (manualTypeText.Equals("CMM", StringComparison.OrdinalIgnoreCase) ||
                        manualTypeText.StartsWith("CMM", StringComparison.OrdinalIgnoreCase))
                    {
                        result.Found = true;
                        result.ManualType = "CMM";

                        if (revisionCol >= 0 && revisionCol < cells.Count)
                            result.RevisionNumber = cells[revisionCol].InnerText.Trim();

                        // Extract PDF link (ViewFile.aspx link)
                        var rowLinks = rows[r].SelectNodes(".//a[@href]");
                        if (rowLinks != null)
                        {
                            foreach (var link in rowLinks)
                            {
                                var href = link.GetAttributeValue("href", "");
                                if (!string.IsNullOrEmpty(href))
                                {
                                    result.PdfUrl = WebUtility.HtmlDecode(href);
                                    var linkText = link.InnerText.Trim();
                                    if (!string.IsNullOrEmpty(linkText) && linkText.Contains("CMM", StringComparison.OrdinalIgnoreCase))
                                    {
                                        result.PdfFileName = linkText;
                                    }
                                    break;
                                }
                            }
                        }

                        if (string.IsNullOrEmpty(result.PdfUrl) && associatedManualsCol >= 0 && associatedManualsCol < cells.Count)
                        {
                            var manualCell = cells[associatedManualsCol];
                            var manualLink = manualCell.SelectSingleNode(".//a[@href]");
                            if (manualLink != null)
                            {
                                result.PdfUrl = WebUtility.HtmlDecode(manualLink.GetAttributeValue("href", ""));
                            }
                        }

                        if (string.IsNullOrEmpty(result.RevisionDate))
                            result.RevisionDate = result.EtRevisionDate;

                        return result;
                    }
                }
            }

            // Fallback: if we found ET Revision No on the page, use it
            if (!string.IsNullOrEmpty(result.EtRevisionNo))
            {
                result.Found = true;
                result.ManualType = "CMM";
                result.RevisionNumber = result.EtRevisionNo;
                result.RevisionDate = result.EtRevisionDate;
                return result;
            }

            result.ErrorMessage = "CMM entry not found in Manual Attachments table.";
            return result;
        }

        /// <summary>
        /// Handles ASP.NET __doPostBack calls.
        /// </summary>
        private async Task<string> HandlePostback(HttpClient client, string pageUrl, string currentPageHtml, string postbackScript)
        {
            var decoded = WebUtility.HtmlDecode(postbackScript);

            var match = Regex.Match(decoded, @"__doPostBack\('([^']*)',\s*'([^']*)'\)");
            if (!match.Success)
            {
                match = Regex.Match(decoded, @"__doPostBack\(""([^""]*)"",\s*""([^""]*)""\\)");
            }
            if (!match.Success)
            {
                match = Regex.Match(postbackScript, @"__doPostBack\(&#39;([^&]*)&#39;,\s*&#39;([^&]*)&#39;\)");
            }

            string eventTarget = match.Success ? match.Groups[1].Value : "";
            string eventArgument = match.Success ? match.Groups[2].Value : "";

            var formFields = ExtractAllHiddenFields(currentPageHtml);
            formFields.RemoveAll(f => f.Key == "__EVENTTARGET" || f.Key == "__EVENTARGUMENT");
            formFields.Add(new KeyValuePair<string, string>("__EVENTTARGET", eventTarget));
            formFields.Add(new KeyValuePair<string, string>("__EVENTARGUMENT", eventArgument));

            var response = await client.PostAsync(pageUrl, new FormUrlEncodedContent(formFields));
            return await response.Content.ReadAsStringAsync();
        }

        /// <summary>
        /// Extracts a label/value pair from the HTML.
        /// </summary>
        private string ExtractLabelValue(HtmlDocument doc, string[] labelVariants)
        {
            foreach (var label in labelVariants)
            {
                var nodes = doc.DocumentNode.SelectNodes($"//*[contains(text(), '{label}')]");
                if (nodes != null)
                {
                    foreach (var node in nodes)
                    {
                        var nextSibling = node.NextSibling;
                        while (nextSibling != null && nextSibling.NodeType != HtmlNodeType.Element)
                            nextSibling = nextSibling.NextSibling;

                        if (nextSibling != null)
                        {
                            var value = WebUtility.HtmlDecode(nextSibling.InnerText.Trim());
                            if (!string.IsNullOrEmpty(value) && value != ":" && !value.Contains(label))
                                return value;
                        }

                        var fullText = node.InnerText;
                        var colonIdx = fullText.IndexOf(':');
                        if (colonIdx >= 0 && colonIdx < fullText.Length - 1)
                        {
                            var value = WebUtility.HtmlDecode(fullText.Substring(colonIdx + 1).Trim());
                            if (!string.IsNullOrEmpty(value))
                                return value;
                        }
                    }
                }

                var labelNodes = doc.DocumentNode.SelectNodes($"//span[contains(@id, '{label.Replace(" ", "")}')] | //label[contains(text(), '{label}')]");
                if (labelNodes != null)
                {
                    foreach (var node in labelNodes)
                    {
                        var value = WebUtility.HtmlDecode(node.InnerText.Trim());
                        if (!string.IsNullOrEmpty(value) && !value.Contains(label))
                            return value;
                    }
                }
            }
            return null;
        }

        /// <summary>
        /// Extracts all hidden form fields from an ASP.NET page.
        /// </summary>
        private List<KeyValuePair<string, string>> ExtractAllHiddenFields(string html)
        {
            var fields = new List<KeyValuePair<string, string>>();
            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            var hiddenInputs = doc.DocumentNode.SelectNodes("//input[@type='hidden']");
            if (hiddenInputs != null)
            {
                foreach (var input in hiddenInputs)
                {
                    var name = input.GetAttributeValue("name", "");
                    var value = input.GetAttributeValue("value", "");
                    if (!string.IsNullOrEmpty(name))
                    {
                        fields.Add(new KeyValuePair<string, string>(name, value));
                    }
                }
            }

            return fields;
        }
    }
}
