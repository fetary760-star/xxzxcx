/**
 * =====================================================================================
 * AMENDED v30 — PHASE 1 / DELIVERABLE 6: THE ROUTE THAT WAS 404-ing
 * Copy to: CMT.Frontend/src/app/api/signatures/[[...path]]/route.ts     (REPLACE / NEW)
 *
 * THIS ROUTE IS THE OTHER HALF OF "THE NAME AND SIGNATURE NEVER APPEAR"
 * -------------------------------------------------------------------
 * `src/lib/workflow/signature-render.ts` — the module EVERY printed signature cell resolves
 * through — issues, as step 1 of its documented fallback chain:
 *
 *     GET /api/signatures/user/{userId}/active
 *     GET /api/signatures/{signatureId}/file
 *
 * `src/app/api/` contained `admin/signatures/[[...path]]/route.ts` and nothing at
 * `signatures/`, so those two requests hit the Next.js catch-all 404 HTML page. `getJson()`
 * swallows it (`if (!response.ok) return null`), the resolver falls to step 2
 * (`/api/admin/signatures/user/{id}`), the ASP.NET admin guard answers
 * 403 SIGNATURE_ADMIN_ONLY for every non-Admin approver, and the resolver lands on step 3 —
 * "typed name only" — for the rest of the session.
 *
 * ENDPOINT CONTRACTS SERVED (the two you asked this phase to create)
 * ----------------------------------------------------------------
 * 1) GET /api/signatures/user/{userId}/active
 *
 *    | Status | Body                        | Meaning                          | Client behaviour                          |
 *    |--------|-----------------------------|----------------------------------|-------------------------------------------|
 *    | 200    | ActiveSignatureResponse     | a specimen is on file            | streams `fileUrl`, renders <img>/<object> |
 *    | 204    | (empty)                     | allowed, NO specimen yet — not an error | prints typed name + role + date    |
 *    | 403    | { errorCode: SIGNATURE_VIEW_NOT_PERMITTED } | may not view this specimen | prints the typed name        |
 *    | 401    | { errorCode: SIGNATURE_NOT_AUTHENTICATED }  | no session               | prints the typed name        |
 *
 *    `ActiveSignatureResponse` — EXACTLY seven members, camelCase on the wire. Renaming any of
 *    them re-breaks the specimen cell, because the client reads `signatureId` / `fileUrl` /
 *    `fileKind` BY NAME:
 *
 *        {
 *          "userId":      102,                          // C# long
 *          "signatureId": "6f1c…-…-…",                  // C# Guid?, null = nothing on file
 *          "fileUrl":     "/api/signatures/6f1c…/file", // AUTHORISED ROUTE, never a storage path
 *          "fileKind":    "Image",                      // "Image" | "Pdf"
 *          "contentType": "image/png",
 *          "version":     2,
 *          "uploadedAt":  "2026-08-27T09:14:22Z"        // always UTC
 *        }
 *
 * 2) GET /api/signatures/{signatureId}/file
 *
 *    | Status | Body                                                     | Notes                                   |
 *    |--------|----------------------------------------------------------|-----------------------------------------|
 *    | 200    | image/png | image/jpeg | image/webp | application/pdf     | streamed byte-for-byte; private, no-store; nosniff |
 *    | 403    | { errorCode: SIGNATURE_VIEW_NOT_PERMITTED }              | caller may not view the ROW OWNER       |
 *    | 404    | { errorCode: SIGNATURE_NOT_FOUND }                       | unknown id, soft-deleted row, or file gone |
 *    | 401    | { errorCode: SIGNATURE_NOT_AUTHENTICATED }               | no session                              |
 *
 *    A REVOKED specimen is still streamed: revoking only rotates the ACTIVE pointer and must
 *    never blank a signature already printed on an executed form. Only a soft-deleted row -> 404.
 *
 * WHY `[[...path]]` (OPTIONAL CATCH-ALL)
 *   The two live paths have DIFFERENT depths (`user/{id}/active` = 3 segments,
 *   `{guid}/file` = 2). A required catch-all `[...path]` would also 404 the bare
 *   `/api/signatures` segment. The optional form serves every depth with one handler, exactly
 *   like the `admin/signatures` route you already have. v30 then validates the shape inside
 *   `resolveSignatureReadPath()`, so an unknown depth is rejected locally with
 *   404 SIGNATURE_ROUTE_NOT_FOUND instead of being forwarded blindly.
 *
 * WHY ONLY GET AND HEAD
 *   `/api/signatures` is a READ surface. Uploading and revoking remain Admin-only at
 *   `/api/admin/signatures`, per requirement 13 ("On the Admin Role Dashboard, provide a
 *   dedicated upload option..."). Not exporting POST / PUT / PATCH / DELETE means Next.js
 *   answers 405 for them, which is the correct, self-documenting behaviour.
 *
 * WHY `runtime = 'nodejs'`
 *   The specimen is forwarded as an `ArrayBuffer` and re-emitted with its original content
 *   type. Pinning the edge runtime would risk transcoding the bytes.
 *
 * WHY `dynamic` / `fetchCache` / `revalidate`
 *   A signature specimen must never be statically optimised, prerendered or cached: an Admin
 *   revoking or re-uploading a specimen has to take effect on the very next request.
 * =====================================================================================
 */

import type { NextRequest } from 'next/server'
import { proxyUserSignatureRequest } from '@/lib/signature/user-signature-proxy'

type RouteContext = { params: Promise<{ path?: string[] }> }

/** Buffer-based byte streaming requires the Node.js runtime. */
export const runtime = 'nodejs'

/** A specimen must never be cached or statically optimised. */
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

/**
 * GET /api/signatures/user/{userId}/active   -> 200 ActiveSignatureResponse | 204 | 403 | 401
 * GET /api/signatures/{signatureId}/file     -> 200 image|pdf | 403 | 404 | 401
 * Anything else                              -> 404 SIGNATURE_ROUTE_NOT_FOUND (local)
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { path } = await params
  return proxyUserSignatureRequest(req, path, 'GET')
}

/** Supported so a caller can probe for a specimen without transferring the bytes. */
export async function HEAD(req: NextRequest, { params }: RouteContext) {
  const { path } = await params
  return proxyUserSignatureRequest(req, path, 'HEAD')
}