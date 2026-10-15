using System;

namespace CMT.Application.SelfEvaluation.Options
{
    /// <summary>
    /// Bound from the "SignatureStorage" section of appsettings.json.
    /// Registered in Program.cs with:
    ///     builder.Services.Configure&lt;SignatureStorageOptions&gt;(
    ///         builder.Configuration.GetSection(SignatureStorageOptions.SectionName));
    /// </summary>
    public sealed class SignatureStorageOptions
    {
        public const string SectionName = "SignatureStorage";

        /// <summary>
        /// Root folder for signature specimens, relative to the content root.
        /// MUST be outside wwwroot so no specimen is ever statically servable.
        /// </summary>
        public string Root { get; set; } = "App_Data/signatures";

        /// <summary>Hard cap per file. Default 2 MB.</summary>
        public long MaxFileSizeBytes { get; set; } = 2 * 1024 * 1024;

        public string[] AllowedContentTypes { get; set; } =
        {
            "image/png", "image/jpeg", "image/webp", "application/pdf"
        };

        public string[] AllowedExtensions { get; set; } =
        {
            ".png", ".jpg", ".jpeg", ".webp", ".pdf"
        };
    }
}