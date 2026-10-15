using System.Collections.Generic;
using System.Threading.Tasks;

namespace CMT.Application.SelfEvaluation.Services
{
    /// <summary>
    /// One task definition found in MaintainX's (Maintenix) Task Definition Search results.
    /// </summary>
    public class TaskCardItem
    {
        /// <summary>Task definition code, e.g. "ELEM2535100DTC-JIC".</summary>
        public string TaskDefinitionCode { get; set; } = string.Empty;

        /// <summary>Descriptive name, e.g. "REPAIR TASK OF ESSENCE BEVERAGE MAKER".</summary>
        public string TaskDefinitionName { get; set; } = string.Empty;

        /// <summary>Absolute URL of the task definition detail page (TaskDefinitionRedirector).</summary>
        public string TaskDefinitionUrl { get; set; } = string.Empty;

        /// <summary>
        /// Absolute URL resolved from the "Preview Task Cards" button.
        /// Null until the detail page has been opened.
        /// </summary>
        public string? PdfUrl { get; set; }

        /// <summary>Suggested file name for the downloaded task card.</summary>
        public string FileName { get; set; } = string.Empty;

        /// <summary>Revision label reported by MaintainX, when present.</summary>
        public string RevisionNumber { get; set; } = string.Empty;

        /// <summary>
        /// True for the DTC-JIC entry, which is the one the documented flow selects.
        /// </summary>
        public bool IsDtcJic { get; set; }

        /// <summary>
        /// True when the grid row that carried this link also mentioned the part number,
        /// which makes it the preferred match for the current P/N.
        /// </summary>
        public bool MatchesPartNumber { get; set; }

        /// <summary>
        /// Zero-based index of the results-grid row this link was parsed from.
        /// Used with Playwright's Locator.Nth(int) to click the real row instead of
        /// navigating straight to TaskDefinitionUrl, which preserves Maintenix's
        /// server-side navigation state. -1 means "unknown / not parsed from a grid".
        /// </summary>
        public int RowIndex { get; set; } = -1;
    }

    /// <summary>
    /// Result of searching MaintainX for the task cards of one ATA code / part number.
    /// Shaped like <see cref="CMMSearchResult"/> so both Documentation tabs behave identically.
    /// </summary>
    public class TaskCardSearchResult
    {
        public bool Found { get; set; }

        /// <summary>Part number the search was performed for.</summary>
        public string PartNumber { get; set; } = string.Empty;

        /// <summary>ATA chapter code supplied by the caller, e.g. "25-35-10".</summary>
        public string AtaChapterCode { get; set; } = string.Empty;

        /// <summary>The code actually submitted to aTaskCd that produced results, e.g. "253510".</summary>
        public string TaskCode { get; set; } = string.Empty;

        /// <summary>All task definitions matched by the search.</summary>
        public List<TaskCardItem> Items { get; set; } = new List<TaskCardItem>();

        /// <summary>The DTC-JIC entry the flow targets, when it could be identified.</summary>
        public TaskCardItem? PrimaryItem { get; set; }

        public string? ErrorMessage { get; set; }

        /// <summary>Ordered, human readable trace of every scraping step.</summary>
        public List<string> SearchSteps { get; set; } = new List<string>();

        /// <summary>Truncated HTML captured when a step fails, for diagnosis.</summary>
        public string? RawHtmlSnippet { get; set; }
    }

    /// <summary>
    /// Result of downloading one task card PDF from MaintainX.
    /// </summary>
    public class TaskCardPdfResult
    {
        public bool Success { get; set; }

        public byte[]? Content { get; set; }

        public string FileName { get; set; } = "TaskCard.pdf";

        public string ContentType { get; set; } = "application/pdf";

        /// <summary>Absolute URL the bytes were actually retrieved from.</summary>
        public string SourceUrl { get; set; } = string.Empty;

        public string TaskDefinitionUrl { get; set; } = string.Empty;

        public string TaskDefinitionCode { get; set; } = string.Empty;

        public string TaskDefinitionName { get; set; } = string.Empty;

        public string RevisionNumber { get; set; } = string.Empty;

        /// <summary>The code submitted to aTaskCd, kept so the caller can persist it.</summary>
        public string TaskCode { get; set; } = string.Empty;

        public string? ErrorMessage { get; set; }

        public List<string> SearchSteps { get; set; } = new List<string>();

        public string? RawHtmlSnippet { get; set; }
    }

    /// <summary>
    /// Scrapes the external MaintainX (Maintenix) application for task card PDFs.
    ///
    /// Reproduced flow:
    ///   1. POST credentials to /maintenix/common/security/login.jsp
    ///   2. Menu (#idMenuButton) -> Shop Technician -> Task Definition Search
    ///   3. Put the ATA code into "Task Definition Code:" (aTaskCd / #idTaskCode)
    ///   4. Click Search (#idButtonSearch)
    ///   5. Pick the DTC-JIC entry from the Task Definition column
    ///      (/maintenix/servlet/TaskDefinitionRedirector?...)
    ///   6. Click "Preview Task Cards" and capture the PDF
    ///
    /// All calls run server-side; svdcmpa01 is reachable only from the intranet and the
    /// credentials must never be exposed to the browser.
    /// </summary>
    public interface IMaintainXExternalService
    {
        /// <summary>
        /// Searches MaintainX for the task definitions matching an ATA code.
        /// </summary>
        /// <param name="ataCode">
        /// ATA chapter code or raw task code. "25-35-10" and "253510" behave identically;
        /// a full task code such as "ELEM2535100DTC-JIC" is also accepted.
        /// </param>
        /// <param name="partNumber">
        /// Part number, used to prefer the matching result row and to label the output.
        /// </param>
        Task<TaskCardSearchResult> SearchTaskCards(string ataCode, string partNumber);

        /// <summary>
        /// Opens a task definition page and downloads the PDF behind "Preview Task Cards".
        /// </summary>
        /// <param name="taskDefinitionUrl">
        /// Task definition URL returned by <see cref="SearchTaskCards"/>.
        /// </param>
        Task<TaskCardPdfResult> DownloadTaskCardPdf(string taskDefinitionUrl);

        /// <summary>
        /// Convenience path used by the "fetch and store" endpoint: searches for the ATA
        /// code, selects the DTC-JIC entry and downloads its PDF within one session.
        /// </summary>
        Task<TaskCardPdfResult> FetchPrimaryTaskCardPdf(string ataCode, string partNumber);
    }
}
