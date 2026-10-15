/**
 * =====================================================================================
 * PHASE 1 — AMENDED (NEW FILE)
 * Copy to: CMT.Frontend/src/app/api/admin/signatures/[[...path]]/route.ts
 *
 * THE MISSING LINK OF THE SIGNATURE FEATURE
 * -----------------------------------------
 * `AdminSignatures.tsx` already called `/api/admin/signatures`, but the repository
 * had NO route handler for that path — only `api/self-evaluation`, `api/users`,
 * `api/workflow`, ... So every coverage load, every upload and every thumbnail
 * received the Next.js 404 HTML page, which the client reported as
 * "Failed to load the signature coverage list." This file closes that gap.
 *
 * ONE HANDLER, THE WHOLE CONTROLLER
 *   GET    /api/admin/signatures                      -> coverage table
 *   GET    /api/admin/signatures?approverRolesOnly=true-> approver gaps only
 *   GET    /api/admin/signatures/user/{userId}        -> version history
 *   GET    /api/admin/signatures/{id}/file            -> authorised byte stream
 *   POST   /api/admin/signatures        (multipart)   -> upload / new version
 *   DELETE /api/admin/signatures/{id}?reason=         -> revoke
 *
 * WHY `[[...path]]` (OPTIONAL CATCH-ALL)
 *   A required catch-all (`[...path]`) does not match the bare parent segment, so
 *   `/api/admin/signatures` — the coverage list AND the upload target — would 404.
 *   The optional form matches the bare segment and any depth with one handler.
 *
 * WHY `runtime = 'nodejs'`
 *   The multipart upload is forwarded as a Node `Buffer` (see signature-proxy.ts),
 *   so the handler must not be pinned to the edge runtime.
 * =====================================================================================
 */

import type { NextRequest } from 'next/server'
import { proxySignatureRequest } from '@/lib/signature/signature-proxy'

type RouteContext = { params: Promise<{ path?: string[] }> }

/** Buffer-based multipart forwarding requires the Node.js runtime. */
export const runtime = 'nodejs'

/** A specimen must never be cached or statically optimised. */
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { path } = await params
  return proxySignatureRequest(req, path, 'GET')
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { path } = await params
  return proxySignatureRequest(req, path, 'POST')
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { path } = await params
  return proxySignatureRequest(req, path, 'PUT')
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { path } = await params
  return proxySignatureRequest(req, path, 'PATCH')
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { path } = await params
  return proxySignatureRequest(req, path, 'DELETE')
}