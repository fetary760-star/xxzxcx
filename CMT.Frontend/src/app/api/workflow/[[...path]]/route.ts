/**
 * =====================================================================================
 * AMENDED v17 - PHASE 1 (FRONTEND)
 * CMT.Frontend/src/app/api/workflow/[[...path]]/route.ts   (REPLACES the existing file)
 *
 * WHAT CHANGED
 * ------------
 *   (1) THE VERB IS NOW PASSED EXPLICITLY. The previous body called
 *       `proxyWorkflowRequest(req, UPSTREAM_PREFIX, ctx.params?.path ?? [])`, omitting the
 *       4th argument, so the upstream fetch ran with `method: undefined` and every POST /
 *       PUT endpoint (assign, delegate, approve, reject, return, skip, checklist,
 *       joint-approval, amend) failed. The amended `workflow-proxy.ts` also defaults to
 *       `req.method`, so this file is now correct twice over.
 *   (2) `params` IS AWAITED. In Next.js 15 `ctx.params` is a Promise; reading `ctx.params.path`
 *       synchronously logs "params should be awaited" and yields `undefined`, which silently
 *       collapsed `/api/workflow/forms/{id}/approve` down to `/api/workflow`. The signature
 *       below accepts both shapes, so it builds on Next 14 and Next 15.
 *
 * IMPORTANT - ONE CATCH-ALL ONLY
 * ------------------------------
 * Keep EITHER `[[...path]]` (optional, this file) OR `[...path]`, never both: Next.js refuses
 * to build with two catch-alls at the same segment level. The OPTIONAL form is required here
 * because `/api/workflow/inbox` has one segment while the folder route needs zero.
 * =====================================================================================
 */

import { proxyWorkflowRequest } from '@/lib/workflow/workflow-proxy'
import type { NextRequest } from 'next/server'

/** The API prefix these paths map to: /api/workflow/<path>. */
const UPSTREAM_PREFIX = 'workflow'

/** Next 14 gives a plain object, Next 15 gives a Promise. Both are handled. */
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

/** Never cache a workflow state or a capability flag. */
export const dynamic = 'force-dynamic'
export const revalidate = 0