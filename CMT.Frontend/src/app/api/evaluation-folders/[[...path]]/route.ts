/**
 * =====================================================================================
 * AMENDED v17 - PHASE 1 (FRONTEND)
 * CMT.Frontend/src/app/api/evaluation-folders/[[...path]]/route.ts
 *                                                        (REPLACES the existing file)
 *
 * WHAT CHANGED - SAME TWO FIXES AS THE WORKFLOW ROUTE
 * --------------------------------------------------
 *   (1) the verb is passed explicitly (the omitted 4th argument previously made every
 *       POST - create folder, sign-off, report, revisions - go upstream as
 *       `method: undefined`);
 *   (2) `ctx.params` is awaited, so Next.js 15 does not collapse
 *       `/api/evaluation-folders/{id}/table-of-contents` down to `/api/evaluation-folders`.
 *
 * ENDPOINTS CARRIED BY THIS ROUTE
 * -------------------------------
 *   GET    /api/evaluation-folders                                  list
 *   POST   /api/evaluation-folders                                  create per ATA / Component
 *   GET    /api/evaluation-folders/{id}                             detail
 *   GET    /api/evaluation-folders/{id}/table-of-contents            requirement #2
 *   GET    /api/evaluation-folders/{id}/progress                     requirement #11
 *   POST   /api/evaluation-folders/{id}/sign-off                     requirement #14
 *   POST   /api/evaluation-folders/{id}/report                       requirement #11 (generate)
 *   GET    /api/evaluation-folders/{id}/report                       requirement #11 (PDF)
 *   GET    /POST /api/evaluation-folders/{id}/revisions              requirement #12
 *   GET    /PUT  /api/evaluation-folders/{id}/competency-matrix      requirement #12
 *   GET    /PUT  /api/evaluation-folders/{id}/tool-equivalency       requirement #12
 *
 * WHY THE PDF MUST PASS THROUGH UNTOUCHED
 * ---------------------------------------
 * The consolidated report arrives as `application/pdf` (or `application/octet-stream`) and it
 * MUST be streamed back together with its `Content-Disposition` header, otherwise the browser
 * download has no file name. `proxyWorkflowRequest` implements that pass-through, so this
 * route must NOT read or re-serialise the body.
 * =====================================================================================
 */

import { proxyWorkflowRequest } from '@/lib/workflow/workflow-proxy'
import type { NextRequest } from 'next/server'

/** The API prefix these paths map to: /api/evaluation-folders/<path>. */
const UPSTREAM_PREFIX = 'evaluation-folders'

type RouteContext = { params: { path?: string[] } | Promise<{ path?: string[] }> }

async function segmentsOf(ctx: RouteContext): Promise<string[]> {
  const params = await Promise.resolve(ctx.params)
  return params?.path ?? []
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  return proxyWorkflowRequest(req, UPSTREAM_PREFIX, await segmentsOf(ctx), 'GET')
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return proxyWorkflowRequest(req, UPSTREAM_PREFIX, await segmentsOf(ctx), 'POST')
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  return proxyWorkflowRequest(req, UPSTREAM_PREFIX, await segmentsOf(ctx), 'PUT')
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return proxyWorkflowRequest(req, UPSTREAM_PREFIX, await segmentsOf(ctx), 'PATCH')
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  return proxyWorkflowRequest(req, UPSTREAM_PREFIX, await segmentsOf(ctx), 'DELETE')
}

export const dynamic = 'force-dynamic'
export const revalidate = 0