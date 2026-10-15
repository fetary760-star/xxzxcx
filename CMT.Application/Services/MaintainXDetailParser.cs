using System;
using System.Linq;
using System.Text.RegularExpressions;

namespace CMT.Application.SelfEvaluation.Services
{
    /// <summary>
    /// Pure, side-effect-free parsing of the values MaintainX renders on the
    /// Applicability -&gt; part number -&gt; Details path.
    ///
    /// WHY THIS IS A SEPARATE STATIC CLASS
    /// -----------------------------------
    /// The on-prem scraper and any future HTTP connector must produce byte-identical output for
    /// the same MaintainX text. Putting the rule in one place means a scraper rewrite cannot
    /// silently change what lands in the ET P/N box of a controlled aviation form.
    ///
    /// v3 AMENDMENT (Fix A - the "EVACUATION SLIDE/RAFT, DOOR-3" incident)
    /// -------------------------------------------------------------------
    /// The Details tab sometimes renders only the item DESCRIPTION in (or beside) the
    /// "Stock No:" cell. The old sanity rules ("has a digit", "length &gt;= 4") let
    /// "EVACUATION SLIDE/RAFT, DOOR-3" through - the digit "3" of "DOOR-3" passed them -
    /// so the scraper chased a description link that never exposes a "Stock Code:".
    /// <see cref="IsPlausibleStockNumber"/> is the strict shape test every stock candidate
    /// must now pass BEFORE it is chased, in both the scraper and (mirrored) the TS client.
    /// </summary>
    public static class MaintainXDetailParser
    {
        /// <summary>
        /// Matches a Maintenix "Details" entry of the form
        /// <c>25H0026 (SLIDE AY)</c> and captures the stock number and the description.
        /// The description is optional because Maintenix omits it on some rows.
        /// </summary>
        private static readonly Regex StockEntryPattern = new Regex(
            @"^\s*(?<pn>[^()\s][^()]*?)\s*(?:\(\s*(?<desc>[^()]*?)\s*\))?\s*$",
            RegexOptions.Compiled | RegexOptions.CultureInvariant);

        /// <summary>
        /// Extracts ONLY the part number from a Details entry, dropping the parenthesised
        /// description exactly as the requirement specifies.
        ///
        /// <code>
        /// "25H0026 (SLIDE AY)"   -> "25H0026"
        /// "  25H0026(SLIDE AY) " -> "25H0026"
        /// "25H0026"              -> "25H0026"
        /// "(SLIDE AY)"           -> null   // no part number present
        /// ""                     -> null
        /// </code>
        ///
        /// NOTE: the return value is a raw parse, NOT a validation. Always pair it with
        /// <see cref="IsPlausibleStockNumber"/> before chasing the value upstream.
        /// </summary>
        /// <returns>The trimmed stock number, or null when the text carries none.</returns>
        public static string? ParseStockNumber(string? rawDetailEntry)
        {
            if (string.IsNullOrWhiteSpace(rawDetailEntry)) return null;

            var collapsed = CollapseWhitespace(rawDetailEntry);

            var match = StockEntryPattern.Match(collapsed);
            if (!match.Success) return null;

            var partNumber = match.Groups["pn"].Value.Trim();

            // A trailing separator such as "25H0026 -" or "25H0026:" is noise, not part of the P/N.
            partNumber = partNumber.TrimEnd('-', ':', ',', ';', '.').Trim();

            return string.IsNullOrWhiteSpace(partNumber) ? null : partNumber;
        }

        /// <summary>
        /// Extracts the parenthesised description, e.g. <c>"SLIDE AY"</c>.
        /// Kept only for the diagnostic trail: it must NEVER be written into the ET P/N field.
        /// </summary>
        public static string? ParseStockDescription(string? rawDetailEntry)
        {
            if (string.IsNullOrWhiteSpace(rawDetailEntry)) return null;

            var match = StockEntryPattern.Match(CollapseWhitespace(rawDetailEntry));
            if (!match.Success) return null;

            var description = match.Groups["desc"].Value.Trim();
            return string.IsNullOrWhiteSpace(description) ? null : description;
        }

        /// <summary>
        /// v3 (Fix A): shape test for a real Maintenix stock code such as <c>"25H0025"</c>.
        ///
        /// A stock code NEVER contains whitespace, commas, slashes or brackets; it is
        /// 3-32 characters, starts alphanumerically, and carries at least one digit.
        ///
        /// <code>
        /// "25H0025"                          -> true
        /// "25H0026 (SLIDE AY)"               -> false  // full entry, not the bare code
        /// "EVACUATION SLIDE/RAFT, DOOR-3"    -> false  // description: spaces, comma, slash
        /// "SLIDE AY"                         -> false  // no digit
        /// "12.5"                             -> true*  // *pairs with the quantity guard in
        ///                                                //  the scraper (short numeric read)
        /// "62210-00016-04"                   -> true   // hyphenated codes are legitimate
        /// </code>
        /// </summary>
        public static bool IsPlausibleStockNumber(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return false;

            var candidate = value.Trim();

            // Descriptions such as "EVACUATION SLIDE/RAFT, DOOR-3" carry separators and
            // whitespace that Maintenix stock codes never do.
            if (candidate.Any(char.IsWhiteSpace)) return false;
            if (candidate.IndexOfAny(new[] { ',', '/', '\\', '(', ')' }) >= 0) return false;

            // Size window: "25H0025" is 7 characters; 3..32 leaves room for other tenants.
            if (candidate.Length < 3 || candidate.Length > 32) return false;

            // Must contain at least one digit and must start alphanumerically.
            if (!candidate.Any(char.IsDigit)) return false;
            if (!char.IsLetterOrDigit(candidate[0])) return false;

            // Only code characters survive: letters, digits, hyphen and dot.
            return candidate.All(c => char.IsLetterOrDigit(c) || c == '-' || c == '.');
        }

        /// <summary>
        /// Normalises an ATA chapter code for MaintainX's <c>aTaskCd</c> field:
        /// <c>"25-39-44"</c> and <c>"253944"</c> both become <c>"253944"</c>.
        /// A full task code such as <c>"EMEH2561330DTC-JIC"</c> is returned unchanged, because
        /// Maintenix accepts it verbatim.
        /// </summary>
        public static string NormalizeAtaCode(string? ataCode)
        {
            if (string.IsNullOrWhiteSpace(ataCode)) return string.Empty;

            var trimmed = ataCode.Trim();

            // Contains letters -> already a task definition code, leave it alone.
            foreach (var c in trimmed)
            {
                if (char.IsLetter(c)) return trimmed;
            }

            return trimmed.Replace("-", string.Empty).Replace(" ", string.Empty);
        }

        /// <summary>
        /// True when two part numbers refer to the same item, ignoring case, spaces and
        /// hyphens. Maintenix prints <c>62773-336</c> where SE stores <c>62773336</c>.
        /// </summary>
        public static bool PartNumbersMatch(string? left, string? right)
        {
            var a = CanonicalPartNumber(left);
            var b = CanonicalPartNumber(right);
            return a.Length > 0 && a == b;
        }

        /// <summary>Uppercase, alphanumeric-only form of a part number.</summary>
        public static string CanonicalPartNumber(string? partNumber)
        {
            if (string.IsNullOrWhiteSpace(partNumber)) return string.Empty;

            var buffer = new char[partNumber.Length];
            var length = 0;

            foreach (var c in partNumber)
            {
                if (char.IsLetterOrDigit(c)) buffer[length++] = char.ToUpperInvariant(c);
            }

            return new string(buffer, 0, length);
        }

        private static string CollapseWhitespace(string value)
        {
            return Regex.Replace(value, @"\s+", " ").Trim();
        }
    }
}