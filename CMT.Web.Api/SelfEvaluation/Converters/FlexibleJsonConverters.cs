// =====================================================================================
// AMENDED v32 — PHASE 1 / BACKEND DELIVERABLE 1 (NEW FILE)
// Copy to: CMT.Web.Api.SelfEvaluation/Converters/FlexibleJsonConverters.cs
//
// THE DEFECT THIS FILE FIXES
// -------------------------------------------------------------------------------------
// Reported 400 on POST /api/self-evaluation/forms :
//
//   {
//     "title": "One or more validation errors occurred.",
//     "status": 400,
//     "errors": {
//       "command": ["The command field is required."],
//       "$.revDate": ["The JSON value could not be converted to
//                      System.Nullable`1[System.DateTime].
//                      Path: $.revDate | LineNumber: 0 | BytePositionInLine: 129."]
//     }
//   }
//
// ROOT CAUSE (one defect, two messages)
// -------------------------------------------------------------------------------------
// Every controlled document declares its revision date as the string PRINTED ON THE
// HARD COPY, not as an ISO date:
//
//   ADForm.tsx                     const FORM_REV_DATE = 'MAR 11 2021'
//   ToolNeedAnalysisReportForm.tsx const FORM_REV_DATE = '01-July-2024'
//   InspectionProficiencyForm.tsx  const FORM_REV_DATE = 'August 31, 2018'
//   Form918ACAA.tsx                const FORM_REV_DATE = '20-OCT-2022'
//   SBForm.tsx                     const FORM_REV_DATE = '11-Mar-2021'
//   PeriodicSelfAuditForm.tsx      const FORM_REV_DATE = '24-April-2023'
//   Form918FAA.tsx                 const FORM_REV_DATE = '15-May-2023'
//
// useFormData.ts forwards that value verbatim as `revDate`, and
// CreateFormSubmissionCommand.RevDate is `DateTime?`. System.Text.Json cannot convert
// "MAR 11 2021" to DateTime?, so it THROWS and ABORTS model binding for the WHOLE body.
// Because binding aborted, the action's `command` parameter was never materialised, so
// ASP.NET *additionally* reports "The command field is required."
//
// Therefore "The command field is required" is a SYMPTOM, not a second bug. Adding a
// `command` wrapper, renaming the DTO, or making RevDate non-nullable would all be
// wrong fixes. The correct fix is to make the boundary accept the formats the
// controlled documents actually print — and that is what this file does.
//
// WHY THE EXISTING FRONTEND SANITISER DID NOT CATCH IT
// -------------------------------------------------------------------------------------
// src/lib/http/payload-sanitize.ts only converts BLANK strings ("" / "   ") to null.
// 'MAR 11 2021' is not blank, so it passed through untouched and still killed binding.
// The companion amendment to that file now coerces printed dates to ISO; THIS file is
// the server-side guarantee that also protects Swagger, Postman, integration tests and
// any future caller that does not go through the Next.js proxy.
//
// WHY NullableGuidConverter NEVER WORKED EITHER
// -------------------------------------------------------------------------------------
// CMT.Web.Api.SelfEvaluation/Converters/NullableGuidConverter.cs already exists in the solution, but
// Program.cs calls a bare `builder.Services.AddControllers();` with NO AddJsonOptions,
// so the converter was NEVER registered and `"assignedToUserId": ""` produces exactly
// the same class of 400. SelfEvaluationJsonBinding.cs registers it alongside these.
//
// SIX HARD RULES OBSERVED HERE
//   (1) NEVER invent a value. An unreadable value becomes null on a NULLABLE contract
//       and a clear JsonException on a NON-NULLABLE one. A date is never guessed.
//   (2) NEVER change the WIRE FORMAT OF RESPONSES. Write() uses the Utf8JsonWriter
//       DateTime overload, which emits byte-identical output to the framework default,
//       so no existing screen, export or PDF changes.
//   (3) NEVER swallow a real conversion problem silently on a required field.
//   (4) NEVER throw out of Read() for a nullable contract — that is the abort that
//       produced the reported 400.
//   (5) CULTURE-INVARIANT. 'MAR', 'Mar', 'March', 'MARCH' all parse identically on any
//       server locale.
//   (6) ADDITIVE ONLY. No existing command, entity, table or endpoint changes shape.
// =====================================================================================

using System;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace CMT.Web.Api.SelfEvaluation.Converters
{
    /// <summary>
    /// Shared vocabulary for the "flexible" converters.
    /// </summary>
    internal static class FlexibleValueTokens
    {
        /// <summary>
        /// Strings that a controlled form legitimately prints to mean "no value".
        /// On a NULLABLE contract every one of them becomes null.
        /// Compared case-insensitively after trimming.
        /// </summary>
        private static readonly string[] NullSentinels =
        {
            "",
            "-",
            "--",
            "---",
            "/",
            "n/a",
            "n/a.",
            "na",
            "n.a",
            "n.a.",
            "not applicable",
            "none",
            "nil",
            "no",
            "tbd",
            "tba",
            "t.b.d.",
            "pending",
            "null",
            "undefined",
            "nan",
            "invalid date",
            "0000-00-00"
        };

        /// <summary>True when the raw text means "no value" on a nullable contract.</summary>
        internal static bool IsNullSentinel(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return true;

            var probe = raw.Trim();
            foreach (var sentinel in NullSentinels)
            {
                if (string.Equals(probe, sentinel, StringComparison.OrdinalIgnoreCase))
                    return true;
            }
            return false;
        }

        /// <summary>
        /// Reads the current token as text regardless of whether it arrived as a JSON
        /// string, number or boolean. Objects and arrays are skipped and reported as null,
        /// so a malformed payload can never hang or crash the reader.
        /// </summary>
        internal static string? ReadAsText(ref Utf8JsonReader reader)
        {
            switch (reader.TokenType)
            {
                case JsonTokenType.Null:
                    return null;

                case JsonTokenType.String:
                    return reader.GetString();

                case JsonTokenType.Number:
                    if (reader.TryGetInt64(out var asLong))
                        return asLong.ToString(CultureInfo.InvariantCulture);
                    if (reader.TryGetDecimal(out var asDecimal))
                        return asDecimal.ToString(CultureInfo.InvariantCulture);
                    return null;

                case JsonTokenType.True:
                    return "true";

                case JsonTokenType.False:
                    return "false";

                default:
                    reader.Skip();
                    return null;
            }
        }
    }

    /// <summary>
    /// Parses the date formats actually printed on the controlled documents.
    /// Shared by the nullable and non-nullable DateTime converters so both accept
    /// exactly the same vocabulary.
    /// </summary>
    internal static class ControlledDocumentDate
    {
        /// <summary>
        /// Every layout observed on a signed hard copy, plus the ISO forms the UI sends
        /// once the amended frontend helper is in place.
        ///
        ///   'MAR 11 2021'      -> "MMM dd yyyy"      (ADForm / MNT-1420B)
        ///   '01-July-2024'     -> "dd-MMMM-yyyy"     (MNT-1229B)
        ///   'August 31, 2018'  -> "MMMM dd, yyyy"    (MNT-1378)
        ///   '20-OCT-2022'      -> "dd-MMM-yyyy"      (MNT-918A)
        ///   '11-Mar-2021'      -> "dd-MMM-yyyy"      (MNT-1420A)
        ///   '24-April-2023'    -> "dd-MMMM-yyyy"     (MNT-1325)
        ///   '15-May-2023'      -> "dd-MMM-yyyy"      (MNT-918)
        /// </summary>
        private static readonly string[] AcceptedFormats =
        {
            // ---- ISO / sortable (what the amended frontend now sends) ----
            "yyyy-MM-dd",
            "yyyy-M-d",
            "yyyy/MM/dd",
            "yyyy.MM.dd",
            "yyyyMMdd",
            "yyyy-MM-ddTHH:mm:ss",
            "yyyy-MM-ddTHH:mm:ss.fff",
            "yyyy-MM-dd HH:mm:ss",

            // ---- day first, month spelled out ----
            "d-MMM-yyyy",
            "dd-MMM-yyyy",
            "d-MMMM-yyyy",
            "dd-MMMM-yyyy",
            "d MMM yyyy",
            "dd MMM yyyy",
            "d MMMM yyyy",
            "dd MMMM yyyy",
            "d/MMM/yyyy",
            "dd/MMM/yyyy",
            "d.MMM.yyyy",
            "dd.MMM.yyyy",

            // ---- month first, month spelled out ----
            "MMM d yyyy",
            "MMM dd yyyy",
            "MMMM d yyyy",
            "MMMM dd yyyy",
            "MMM d, yyyy",
            "MMM dd, yyyy",
            "MMMM d, yyyy",
            "MMMM dd, yyyy",
            "MMM-d-yyyy",
            "MMM-dd-yyyy",
            "MMMM-d-yyyy",
            "MMMM-dd-yyyy",

            // ---- all numeric ----
            "MM/dd/yyyy",
            "M/d/yyyy",
            "MM-dd-yyyy",
            "dd/MM/yyyy",

            // ---- month or year precision (a revision block sometimes prints only these) ----
            "MMM yyyy",
            "MMMM yyyy",
            "MMM-yyyy",
            "MMMM-yyyy",
            "yyyy"
        };

        private const DateTimeStyles Styles =
            DateTimeStyles.AllowWhiteSpaces | DateTimeStyles.NoCurrentDateDefault;

        /// <summary>
        /// Normalises the cosmetic noise a printed date carries: non-breaking spaces,
        /// ordinal suffixes ("1st"), doubled separators and trailing punctuation.
        /// </summary>
        private static string Normalise(string raw)
        {
            var text = raw
                .Replace('\u00A0', ' ')
                .Replace('\u2013', '-')   // en dash
                .Replace('\u2014', '-')   // em dash
                .Trim();

            // "August 31st, 2018" -> "August 31, 2018"
            text = System.Text.RegularExpressions.Regex.Replace(
                text, @"(?<=\d)(st|nd|rd|th)\b", string.Empty,
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);

            // Collapse runs of whitespace and strip a trailing '.' or ','.
            text = System.Text.RegularExpressions.Regex.Replace(text, @"\s+", " ").Trim();
            text = text.TrimEnd('.', ',', ';');

            return text;
        }

        /// <summary>
        /// Attempts every accepted layout. Returns false ONLY when the text carries no
        /// recoverable date at all — it never guesses (rule 1).
        /// </summary>
        internal static bool TryParse(string? raw, out DateTime value)
        {
            value = default;
            if (string.IsNullOrWhiteSpace(raw)) return false;

            var text = Normalise(raw);
            if (text.Length == 0) return false;

            // Attempt 1 — the exact printed layouts, as written.
            if (DateTime.TryParseExact(text, AcceptedFormats,
                    CultureInfo.InvariantCulture, Styles, out value))
                return true;

            // Attempt 2 — the same layouts after title-casing, so a shouted month name
            // such as 'MAR 11 2021' or '20-OCT-2022' is matched on every server locale.
            var titled = CultureInfo.InvariantCulture.TextInfo
                .ToTitleCase(text.ToLowerInvariant());
            if (DateTime.TryParseExact(titled, AcceptedFormats,
                    CultureInfo.InvariantCulture, Styles, out value))
                return true;

            // Attempt 3 — invariant free parse (covers ISO 8601 with offset / 'Z').
            if (DateTime.TryParse(text, CultureInfo.InvariantCulture,
                    DateTimeStyles.AllowWhiteSpaces | DateTimeStyles.RoundtripKind, out value))
                return true;

            // Attempt 4 — en-US free parse, the culture the hard copies were typed in.
            if (DateTime.TryParse(text, new CultureInfo("en-US"),
                    DateTimeStyles.AllowWhiteSpaces, out value))
                return true;

            return false;
        }

        /// <summary>Interprets a JSON number as an epoch stamp or a bare year.</summary>
        internal static bool TryFromNumber(long number, out DateTime value)
        {
            value = default;
            try
            {
                // Epoch milliseconds (Date.now()).
                if (number >= 100_000_000_000L)
                {
                    value = DateTimeOffset.FromUnixTimeMilliseconds(number).UtcDateTime;
                    return true;
                }
                // Epoch seconds.
                if (number >= 100_000_000L)
                {
                    value = DateTimeOffset.FromUnixTimeSeconds(number).UtcDateTime;
                    return true;
                }
                // A bare year, e.g. 2024.
                if (number >= 1900 && number <= 2200)
                {
                    value = new DateTime((int)number, 1, 1);
                    return true;
                }
            }
            catch (ArgumentOutOfRangeException)
            {
                // Fall through to "not a date".
            }
            return false;
        }

        internal const string Guidance =
            "Send an ISO-8601 date (yyyy-MM-dd), null, or one of the printed " +
            "controlled-document formats (e.g. '11-Mar-2021', 'MAR 11 2021', " +
            "'01-July-2024', 'August 31, 2018').";
    }

    /// <summary>
    /// DateTime? that accepts the printed controlled-document revision dates.
    /// THIS is the converter that resolves the reported "$.revDate" 400.
    ///
    /// Read():
    ///   null / "" / "N/A" / "-" / "TBD"        -> null
    ///   'MAR 11 2021' / '01-July-2024' / ISO   -> the parsed DateTime
    ///   anything genuinely unreadable          -> null  (never throws: rule 4)
    ///
    /// Write(): the Utf8JsonWriter DateTime overload, i.e. byte-identical to the
    /// framework default, so no response payload changes (rule 2).
    /// </summary>
    public sealed class FlexibleNullableDateTimeConverter : JsonConverter<DateTime?>
    {
        public override DateTime? Read(ref Utf8JsonReader reader, Type typeToConvert,
            JsonSerializerOptions options)
        {
            if (reader.TokenType == JsonTokenType.Null) return null;

            if (reader.TokenType == JsonTokenType.Number)
            {
                if (reader.TryGetInt64(out var number) &&
                    ControlledDocumentDate.TryFromNumber(number, out var fromNumber))
                    return fromNumber;
                return null;
            }

            if (reader.TokenType == JsonTokenType.StartObject ||
                reader.TokenType == JsonTokenType.StartArray)
            {
                reader.Skip();
                return null;
            }

            var text = FlexibleValueTokens.ReadAsText(ref reader);

            // "" / "N/A" / "-" / "TBD" -> null. The user simply did not fill the box.
            if (FlexibleValueTokens.IsNullSentinel(text)) return null;

            if (ControlledDocumentDate.TryParse(text, out var parsed)) return parsed;

            // Rule 4: a nullable contract must NEVER abort binding. Returning null keeps
            // the rest of the body — FormDataJson, FormType, ATARecordId — intact, and the
            // hard-copy text itself is still preserved verbatim inside FormDataJson.
            return null;
        }

        public override void Write(Utf8JsonWriter writer, DateTime? value,
            JsonSerializerOptions options)
        {
            if (value.HasValue) writer.WriteStringValue(value.Value);
            else writer.WriteNullValue();
        }
    }

    /// <summary>
    /// Non-nullable DateTime with the same accepted vocabulary.
    /// A REQUIRED date is never invented: an unreadable value raises a JsonException whose
    /// message names the accepted formats, and ASP.NET attaches the JSON path (rule 3).
    /// </summary>
    public sealed class FlexibleDateTimeConverter : JsonConverter<DateTime>
    {
        public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert,
            JsonSerializerOptions options)
        {
            if (reader.TokenType == JsonTokenType.Number &&
                reader.TryGetInt64(out var number) &&
                ControlledDocumentDate.TryFromNumber(number, out var fromNumber))
                return fromNumber;

            if (reader.TokenType == JsonTokenType.StartObject ||
                reader.TokenType == JsonTokenType.StartArray)
            {
                reader.Skip();
                throw new JsonException(
                    "A date was expected but an object or array was supplied. " +
                    ControlledDocumentDate.Guidance);
            }

            var text = FlexibleValueTokens.ReadAsText(ref reader);

            if (ControlledDocumentDate.TryParse(text, out var parsed)) return parsed;

            throw new JsonException(
                $"The value '{text ?? "null"}' could not be read as a date. " +
                ControlledDocumentDate.Guidance);
        }

        public override void Write(Utf8JsonWriter writer, DateTime value,
            JsonSerializerOptions options) => writer.WriteStringValue(value);
    }

    /// <summary>
    /// long? that tolerates "", "N/A" and a numeric string.
    /// Protects DelegateFormSubmissionCommand.DelegateToUserId, every *UserId on the
    /// signature and assignment contracts, and the HR routing payloads — all of which
    /// would otherwise fail exactly like revDate the first time a select is left empty.
    /// </summary>
    public sealed class FlexibleNullableLongConverter : JsonConverter<long?>
    {
        public override long? Read(ref Utf8JsonReader reader, Type typeToConvert,
            JsonSerializerOptions options)
        {
            if (reader.TokenType == JsonTokenType.Null) return null;

            if (reader.TokenType == JsonTokenType.Number)
                return reader.TryGetInt64(out var direct) ? direct : (long?)null;

            if (reader.TokenType == JsonTokenType.StartObject ||
                reader.TokenType == JsonTokenType.StartArray)
            {
                reader.Skip();
                return null;
            }

            var text = FlexibleValueTokens.ReadAsText(ref reader);
            if (FlexibleValueTokens.IsNullSentinel(text)) return null;

            return long.TryParse(text!.Trim(), NumberStyles.Integer,
                CultureInfo.InvariantCulture, out var parsed) ? parsed : (long?)null;
        }

        public override void Write(Utf8JsonWriter writer, long? value,
            JsonSerializerOptions options)
        {
            if (value.HasValue) writer.WriteNumberValue(value.Value);
            else writer.WriteNullValue();
        }
    }

    /// <summary>int? that tolerates "", "N/A" and a numeric string.</summary>
    public sealed class FlexibleNullableIntConverter : JsonConverter<int?>
    {
        public override int? Read(ref Utf8JsonReader reader, Type typeToConvert,
            JsonSerializerOptions options)
        {
            if (reader.TokenType == JsonTokenType.Null) return null;

            if (reader.TokenType == JsonTokenType.Number)
                return reader.TryGetInt32(out var direct) ? direct : (int?)null;

            if (reader.TokenType == JsonTokenType.StartObject ||
                reader.TokenType == JsonTokenType.StartArray)
            {
                reader.Skip();
                return null;
            }

            var text = FlexibleValueTokens.ReadAsText(ref reader);
            if (FlexibleValueTokens.IsNullSentinel(text)) return null;

            return int.TryParse(text!.Trim(), NumberStyles.Integer,
                CultureInfo.InvariantCulture, out var parsed) ? parsed : (int?)null;
        }

        public override void Write(Utf8JsonWriter writer, int? value,
            JsonSerializerOptions options)
        {
            if (value.HasValue) writer.WriteNumberValue(value.Value);
            else writer.WriteNullValue();
        }
    }

    /// <summary>
    /// decimal? that tolerates "", "N/A" and a numeric string — the tolerance,
    /// dimension and calibration-interval boxes on MNT-1229B.
    /// </summary>
    public sealed class FlexibleNullableDecimalConverter : JsonConverter<decimal?>
    {
        public override decimal? Read(ref Utf8JsonReader reader, Type typeToConvert,
            JsonSerializerOptions options)
        {
            if (reader.TokenType == JsonTokenType.Null) return null;

            if (reader.TokenType == JsonTokenType.Number)
                return reader.TryGetDecimal(out var direct) ? direct : (decimal?)null;

            if (reader.TokenType == JsonTokenType.StartObject ||
                reader.TokenType == JsonTokenType.StartArray)
            {
                reader.Skip();
                return null;
            }

            var text = FlexibleValueTokens.ReadAsText(ref reader);
            if (FlexibleValueTokens.IsNullSentinel(text)) return null;

            return decimal.TryParse(text!.Trim(),
                NumberStyles.Float | NumberStyles.AllowThousands,
                CultureInfo.InvariantCulture, out var parsed) ? parsed : (decimal?)null;
        }

        public override void Write(Utf8JsonWriter writer, decimal? value,
            JsonSerializerOptions options)
        {
            if (value.HasValue) writer.WriteNumberValue(value.Value);
            else writer.WriteNullValue();
        }
    }

    /// <summary>bool? that tolerates "", "yes"/"no", "Y"/"N", "1"/"0".</summary>
    public sealed class FlexibleNullableBooleanConverter : JsonConverter<bool?>
    {
        public override bool? Read(ref Utf8JsonReader reader, Type typeToConvert,
            JsonSerializerOptions options)
        {
            if (reader.TokenType == JsonTokenType.Null) return null;
            if (reader.TokenType == JsonTokenType.True) return true;
            if (reader.TokenType == JsonTokenType.False) return false;

            if (reader.TokenType == JsonTokenType.Number)
                return reader.TryGetInt64(out var n) ? n != 0 : (bool?)null;

            if (reader.TokenType == JsonTokenType.StartObject ||
                reader.TokenType == JsonTokenType.StartArray)
            {
                reader.Skip();
                return null;
            }

            var text = FlexibleValueTokens.ReadAsText(ref reader);
            if (string.IsNullOrWhiteSpace(text)) return null;

            switch (text.Trim().ToLowerInvariant())
            {
                case "true":
                case "yes":
                case "y":
                case "1":
                case "x":
                case "checked":
                    return true;
                case "false":
                case "no":
                case "n":
                case "0":
                case "unchecked":
                    return false;
                default:
                    return null;
            }
        }

        public override void Write(Utf8JsonWriter writer, bool? value,
            JsonSerializerOptions options)
        {
            if (value.HasValue) writer.WriteBooleanValue(value.Value);
            else writer.WriteNullValue();
        }
    }
}