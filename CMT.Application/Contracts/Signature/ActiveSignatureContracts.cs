/*
 * =====================================================================================
 * AMENDED v29 — PHASE 1 / DELIVERABLE 1 (NEW FILE): THE READ-ONLY SPECIMEN CONTRACT
 * Copy to: CMT.Application.SelfEvaluation/Contracts/Signature/ActiveSignatureContracts.cs
 *
 * WHY THIS FILE IS THE ACTUAL ROOT CAUSE OF THE BLANK NAME / SIGNATURE
 * -------------------------------------------------------------------
 * Your diagnosis was right about the frontend chain, and v27/v28 already closed the
 * "nothing reads the logged-in user" gap: `current-signer.ts` now feeds
 * `signature-blocks.ts -> signature-print.ts -> AutoSignatureCell/Line`, so the NAME and the
 * DATE have a source. But the SIGNATURE IMAGE — and, on any deployment where the provisional
 * fill is disabled, the whole block — still resolves through ONE module:
 *
 *     CMT.Frontend/src/lib/workflow/signature-render.ts  ->  resolveUncached(userId)
 *         1. GET /api/signatures/user/{userId}/active      <-- DOES NOT EXIST
 *         2. GET /api/admin/signatures/user/{userId}       <-- 403 SIGNATURE_ADMIN_ONLY
 *         3. typed name only
 *
 * Step 1 has NO Next.js route handler (`src/app/api/` contains `admin/signatures/[[...path]]`
 * but nothing at `signatures/`), so the browser receives the Next.js 404 HTML page.
 * `getJson()` swallows it and returns null. Step 2 is guarded by
 * `RoleHierarchy.Normalize(me.Role) != OrgRoles.Admin` inside `AdminSignaturesController`,
 * so a Shop Team Leader, a Manager, a Director or an Inspector gets 403. The resolver then
 * falls to step 3 and EVERY signature cell of EVERY controlled form paints empty — exactly
 * the "TNA SYSTEM.png" symptom, on a chain that is otherwise correct.
 *
 * THIS PHASE THEREFORE CREATES ONLY THE TWO ENDPOINTS YOU ASKED FOR:
 *     GET /api/signatures/user/{userId}/active   -> 200 / 204 / 403
 *     GET /api/signatures/{signatureId}/file     -> 200 (bytes) / 403 / 404
 *
 * FOUR HARD RULES OF THE READ-ONLY SURFACE
 *   (1) `StoragePath` NEVER crosses the boundary. `ActiveSignatureResponse.FileUrl` is an
 *       AUTHORISED STREAMING ROUTE, never a bucket key, never a disk path. This mirrors the
 *       rule already enforced by `UserSignature.StoragePath` ([JsonIgnore]) and by
 *       `signature-proxy.ts` (`stripStoragePaths`).
 *   (2) 204 IS NOT AN ERROR. Requirement 13 links the image "after being uploaded by the
 *       admin"; before that upload the form must still print name + role + date. A 404 here
 *       would make `signature-render.ts` log noise and, worse, invite a caller to treat a
 *       missing specimen as a broken approval.
 *   (3) THE SHAPE IS FIXED BY THE CLIENT, NOT BY US. `signature-render.ts` declares
 *       `ActiveSignatureResponse` with EXACTLY these seven members
 *       (userId, signatureId, fileUrl, fileKind, contentType, version, uploadedAt).
 *       Renaming any of them silently re-breaks the specimen cell, because the client reads
 *       `active.signatureId` and `active.fileUrl` by name.
 *   (4) IDS: user ids are `long` (C#) / `number` (TS). Signature ids are `Guid` / `string`.
 *
 * WHY A NEW CONTRACT FILE INSTEAD OF EDITING SignatureApiContracts.cs
 *   You listed `CMT.Application.SelfEvaluation/Contracts/Signature/SignatureApiContracts.cs` among the files
 *   you have already updated yourself. Adding a type to it would force you to merge. This file
 *   is PURELY ADDITIVE in the SAME namespace (`CMT.Application.SelfEvaluation.Contracts.Signature`), so
 *   `UserSignatureResponse`, `SignatureCoverageRow`, `SignatureStampResult` and
 *   `SignatureErrorCodes` stay untouched and every existing `using` keeps working.
 * =====================================================================================
 */

using System;

namespace CMT.Application.SelfEvaluation.Contracts.Signature
{
    /// <summary>
    /// The NON-ADMIN, READ-ONLY view of a user's ACTIVE signature specimen, returned by
    /// <c>GET /api/signatures/user/{userId}/active</c>.
    ///
    /// VERBATIM MIRROR of the TypeScript interface declared in
    /// <c>CMT.Frontend/src/lib/workflow/signature-render.ts</c>. Property names are serialised
    /// camelCase by the default ASP.NET Core JSON options, which is what the client expects
    /// (<c>active.signatureId</c>, <c>active.fileUrl</c>, <c>active.fileKind</c>).
    ///
    /// DELIBERATELY ABSENT MEMBERS (they exist on <see cref="UserSignatureResponse"/> and MUST
    /// NOT be duplicated here, because this payload is readable by every authenticated
    /// approver rather than by an Admin only):
    ///   - StoragePath / any storage locator  -> rule (1);
    ///   - FileSha256 / FileSha256Short       -> the integrity digest is tamper-evidence
    ///     material; publishing it to every approver would let a client precompute a stamp
    ///     hash without ever touching the specimen;
    ///   - UploadedBy / RevokedAt / Remarks   -> admin audit fields, not printing material;
    ///   - FileSizeBytes                      -> not needed to render a cell.
    /// </summary>
    public sealed class ActiveSignatureResponse
    {
        /// <summary>The owner of the specimen. C# long / TS number.</summary>
        public long UserId { get; set; }

        /// <summary>
        /// C# Guid. NULL means "no active specimen on file" — rule (2). The controller answers
        /// 204 in that case, so a serialised null here only occurs if a caller materialises
        /// <see cref="Empty"/> explicitly (the folder PDF exporter does, to keep one uniform
        /// shape in its cache).
        /// </summary>
        public Guid? SignatureId { get; set; }

        /// <summary>
        /// The AUTHORISED streaming endpoint of the bytes, e.g. "/api/signatures/{id}/file".
        /// Rule (1): never a storage path. `signature-render.ts` fetches this URL directly with
        /// `credentials: 'include'` and wraps the response in a short-lived object URL, so the
        /// value MUST be the non-admin route — the admin route would 403 for an approver.
        /// </summary>
        public string FileUrl { get; set; } = string.Empty;

        /// <summary>
        /// "Image" or "Pdf" — the string form of <c>SignatureFileKind</c>. The client uses it
        /// to decide between &lt;img&gt; and &lt;object&gt; (`isPdfLike(active.fileKind)`).
        /// </summary>
        public string FileKind { get; set; } = string.Empty;

        /// <summary>Validated MIME type of the stored specimen.</summary>
        public string ContentType { get; set; } = string.Empty;

        /// <summary>1-based specimen version. Printed next to the stamp trace.</summary>
        public int Version { get; set; }

        /// <summary>Upload instant, always UTC. Null only on <see cref="Empty"/>.</summary>
        public DateTime? UploadedAt { get; set; }

        /// <summary>
        /// The canonical "nothing on file" payload. Prefer answering 204 from the controller;
        /// this factory exists for in-process callers (PDF export) that want a uniform object.
        /// </summary>
        public static ActiveSignatureResponse Empty(long userId) => new()
        {
            UserId = userId,
            SignatureId = null,
            FileUrl = string.Empty,
            FileKind = string.Empty,
            ContentType = string.Empty,
            Version = 0,
            UploadedAt = null
        };
    }

    /// <summary>
    /// The NON-ADMIN streaming route of a specimen. Kept next to the contract so the
    /// controller, the read service and any future exporter build the identical URL.
    ///
    /// NOTE the deliberate difference from <c>SignatureFileRules.FileUrlOf</c> (domain), which
    /// returns the ADMIN route "/api/admin/signatures/{id}/file". Both exist on purpose:
    ///   - the admin table links the admin route (an Admin session is guaranteed there);
    ///   - a printed form MUST link this route, because the reader is an approver.
    /// </summary>
    public static class SignatureReadRoutes
    {
        public static string FileUrlOf(Guid signatureId) => $"/api/signatures/{signatureId}/file";

        public static string ActiveOfUser(long userId) => $"/api/signatures/user/{userId}/active";
    }

    /// <summary>
    /// Error codes specific to the READ-ONLY surface. Additive: the existing
    /// <see cref="SignatureErrorCodes"/> class is not modified, so no merge is needed in the
    /// file you already amended.
    ///
    /// The client renders one sentence per code, therefore the HTTP status MUST be passed
    /// through unchanged by the Next.js proxy (rule 3 of `signature-proxy.ts`).
    /// </summary>
    public static class SignatureReadErrorCodes
    {
        /// <summary>403 — the caller may not view this particular user's specimen.</summary>
        public const string ViewNotPermitted = "SIGNATURE_VIEW_NOT_PERMITTED";

        /// <summary>404 — the signature id does not exist, or its stored file is gone.</summary>
        public const string NotFound = "SIGNATURE_NOT_FOUND";

        /// <summary>401 — no authenticated session.</summary>
        public const string NotAuthenticated = "SIGNATURE_NOT_AUTHENTICATED";
    }
}