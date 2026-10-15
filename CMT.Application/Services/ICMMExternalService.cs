using System.Collections.Generic;
using System.Threading.Tasks;

namespace CMT.Application.SelfEvaluation.Services
{
    public class CMMSearchResult
    {
        public bool Found { get; set; }
        public string ManualType { get; set; }
        public string RevisionNumber { get; set; }
        public string RevisionDate { get; set; }
        public string PdfUrl { get; set; }
        public string PdfFileName { get; set; }
        public string ErrorMessage { get; set; }

        // Additional fields from the Index Details page
        public string IndexComponent { get; set; }
        public string MfgPartNo { get; set; }
        public string EtPartNo { get; set; }
        public string EtRevisionNo { get; set; }
        public string EtRevisionDate { get; set; }
        public string VendorRevisionNo { get; set; }
        public string VendorRevisionDate { get; set; }
        public string SubscriptionDate { get; set; }
        public string SubscriptionMethod { get; set; }
        public string InspectionNo { get; set; }
        public string InspectionDate { get; set; }
        public string Remark { get; set; }
        public string Vendor { get; set; }
        public string Shop { get; set; }
        public string Effectivity { get; set; }

        public List<string> SearchSteps { get; set; } = new List<string>();
        public string RawHtmlSnippet { get; set; }
    }

    public interface ICMMExternalService
    {
        Task<CMMSearchResult> FetchLatestCMMRevision(string ataNumber, string partNumber);
    }
}
