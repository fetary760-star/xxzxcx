using System;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace CMT.Web.Api.SelfEvaluation.Converters
{
    /// <summary>
    /// Custom JSON converter for Guid? (nullable Guid).
    /// Handles empty strings, "null", and invalid GUID values gracefully
    /// by converting them to null instead of throwing a deserialization error.
    /// 
    /// This resolves the error:
    /// "The JSON value could not be converted to System.Nullable`1[System.Guid]"
    /// which occurs when the frontend sends "" (empty string) for optional GUID fields.
    /// </summary>
    public class NullableGuidConverter : JsonConverter<Guid?>
    {
        public override Guid? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            // Handle null token
            if (reader.TokenType == JsonTokenType.Null)
            {
                return null;
            }

            // Handle string token (could be valid GUID, empty, or "null")
            if (reader.TokenType == JsonTokenType.String)
            {
                var stringValue = reader.GetString();

                // Empty string or literal "null" → treat as null
                if (string.IsNullOrWhiteSpace(stringValue) ||
                    stringValue.Equals("null", StringComparison.OrdinalIgnoreCase) ||
                    stringValue.Equals("undefined", StringComparison.OrdinalIgnoreCase))
                {
                    return null;
                }

                // Try to parse as GUID
                if (Guid.TryParse(stringValue, out var guid))
                {
                    // Treat Guid.Empty as null (no selection made)
                    return guid == Guid.Empty ? null : guid;
                }

                // Invalid GUID string → treat as null rather than throwing
                return null;
            }

            // For any other token type, try reading as string
            try
            {
                var raw = reader.GetString();
                if (Guid.TryParse(raw, out var parsed))
                {
                    return parsed == Guid.Empty ? null : parsed;
                }
            }
            catch
            {
                // Swallow and return null
            }

            return null;
        }

        public override void Write(Utf8JsonWriter writer, Guid? value, JsonSerializerOptions options)
        {
            if (value.HasValue)
            {
                writer.WriteStringValue(value.Value.ToString());
            }
            else
            {
                writer.WriteNullValue();
            }
        }
    }
}