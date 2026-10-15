using System;
using System.Security.Claims;

namespace CMT.Web.Api.SelfEvaluation.Extensions
{
    /// <summary>
    /// =====================================================================================
    /// AMENDED v23 — REAL ACTOR RESOLUTION (fixes records stamped as "system")
    /// File: CMT.Web.Api.SelfEvaluation/Extensions/ClaimsPrincipalExtensions.cs  (NEW)
    ///
    /// WHY THIS EXISTS:
    ///   Controllers identified the acting user with `User.Identity?.Name ?? "system"`.
    ///   Under this app's JWT authentication, `User.Identity.Name` does not reliably
    ///   resolve (the NameClaimType is not mapped to a claim the token carries in a way
    ///   the identity honours), so EVERY record was stamped "system" instead of the real
    ///   person's name — visible on the ATA Record stamp ("Created by — system").
    ///
    ///   The JWT itself (see CMT.Application.SelfEvaluation/Services/TokenHandlerService.cs) ALWAYS
    ///   carries, among others:
    ///     "fullName" / "FullName"      — the user's REAL display name (signature-worthy)
    ///     ClaimTypes.Name / unique_name — the username
    ///     "role" / ClaimTypes.Role      — the role (e.g. "TeamLeader", "Engineer")
    ///
    ///   TLPermissionsController already reads `User.FindFirst("fullName")` — this helper
    ///   generalizes that proven pattern for every controller in one place.
    ///
    /// USAGE (replaces every `User.Identity?.Name ?? "system"`):
    ///     command.CreatedBy = User.GetActorName();
    ///     command.UpdatedBy = User.GetActorName();
    /// =====================================================================================
    /// </summary>
    public static class ClaimsPrincipalExtensions
    {
        /// <summary>
        /// Resolves the real acting user's name for signature/audit fields.
        /// Priority: real full name first (it is what a signature block should show),
        /// then username fallbacks; "system" only as the last-resort guard so the
        /// field is never null/empty.
        /// </summary>
        public static string GetActorName(this ClaimsPrincipal user)
        {
            if (user == null) return "system";

            var name = FirstNonEmpty(
                user.FindFirst("fullName")?.Value,
                user.FindFirst("FullName")?.Value,
                user.FindFirst(ClaimTypes.Name)?.Value,
                user.FindFirst("unique_name")?.Value,
                user.Identity != null ? user.Identity.Name : null);

            return string.IsNullOrWhiteSpace(name) ? "system" : name.Trim();
        }

        /// <summary>
        /// True when a real user identity was resolved (i.e. NOT the "system" fallback).
        /// Useful for diagnostics/logging if the token ever lacks all name claims.
        /// </summary>
        public static bool HasRealActorName(this ClaimsPrincipal user)
        {
            if (user == null) return false;
            var name = FirstNonEmpty(
                user.FindFirst("fullName")?.Value,
                user.FindFirst("FullName")?.Value,
                user.FindFirst(ClaimTypes.Name)?.Value,
                user.FindFirst("unique_name")?.Value,
                user.Identity != null ? user.Identity.Name : null);
            return !string.IsNullOrWhiteSpace(name);
        }

        /// <summary>
        /// The acting user's role exactly as stored in the token
        /// (PascalCase, e.g. "TeamLeader", "Engineer"), or an empty string.
        /// </summary>
        public static string GetActorRole(this ClaimsPrincipal user)
        {
            if (user == null) return string.Empty;

            var role = FirstNonEmpty(
                user.FindFirst("role")?.Value,
                user.FindFirst(ClaimTypes.Role)?.Value);

            return role == null ? string.Empty : role.Trim();
        }

        /// <summary>Returns the first value that is not null/empty/whitespace, else null.</summary>
        private static string FirstNonEmpty(params string[] values)
        {
            if (values == null) return null;
            foreach (var value in values)
            {
                if (!string.IsNullOrWhiteSpace(value)) return value;
            }
            return null;
        }
    }
}