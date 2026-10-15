/**
 * API Route: /api/team-leader-scopes/[teamLeaderId]
 * 
 * Manages Team Leader visibility scopes. Directors can assign specific user IDs
 * to each Team Leader's scope, controlling which users' tasks/data the TL can see.
 * 
 * Persistence: Server-side JSON file at /tmp/tl-scopes.json
 * (lightweight frontend-proxy-layer storage since the backend C# API doesn't have this feature yet)
 * 
 * GET  /api/team-leader-scopes/:teamLeaderId  → returns scope config for that TL
 * PUT  /api/team-leader-scopes/:teamLeaderId  → updates scope config for that TL
 * DELETE /api/team-leader-scopes/:teamLeaderId → removes scope restriction (TL sees everything again)
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

const SCOPES_FILE = path.join(process.cwd(), 'tl-scopes.json')

export interface TLScope {
  teamLeaderId: number
  /** User IDs this TL is allowed to see. Empty array = unrestricted (sees everything). */
  allowedUserIds: number[]
  /** Human-readable label set by the Director */
  label?: string
  /** Director who last updated this scope */
  updatedBy?: number
  updatedAt?: string
}

interface ScopesStore {
  scopes: Record<string, TLScope>
}

function readStore(): ScopesStore {
  try {
    if (fs.existsSync(SCOPES_FILE)) {
      const raw = fs.readFileSync(SCOPES_FILE, 'utf-8')
      return JSON.parse(raw) as ScopesStore
    }
  } catch (err) {
    console.error('[TL Scopes] Error reading scopes file:', err)
  }
  return { scopes: {} }
}

function writeStore(store: ScopesStore): void {
  try {
    fs.writeFileSync(SCOPES_FILE, JSON.stringify(store, null, 2), 'utf-8')
  } catch (err) {
    console.error('[TL Scopes] Error writing scopes file:', err)
  }
}

// ---------------------------------------------------------------------------
// Auth helper – extract user from forwarded header or /auth/me
// ---------------------------------------------------------------------------

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

function normalizeRole(raw: any): string {
  if (raw === undefined || raw === null) return ''
  if (typeof raw === 'number') return String(raw)
  return String(raw).toLowerCase().trim().replace(/[\s\-\_]+/g, '_')
}

function getUserFromForwarded(headers: Headers): any | null {
  const j = headers.get('x-user-json')
  if (!j) return null
  try { return JSON.parse(j) } catch { return null }
}

async function fetchUserFromBackend(authHeader?: string | null) {
  if (!authHeader) return null
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: authHeader, Accept: 'application/json' } })
    if (!res.ok) return null
    const body = await res.json().catch(() => null)
    return body?.user ?? body
  } catch {
    return null
  }
}

async function resolveUser(request: Request) {
  const forwardedUser = getUserFromForwarded(new Headers(request.headers))
  if (forwardedUser) return forwardedUser
  const auth = request.headers.get('authorization')
  if (auth) return fetchUserFromBackend(auth)
  return null
}

function isDirectorOrTL(user: any): { isDirector: boolean; isTL: boolean } {
  const role = normalizeRole(user?.role ?? user?.role_name ?? user?.roleName ?? '')
  return {
    isDirector: role === 'director' || role === '1',
    isTL: role === 'team_leader' || role === 'teamleader' || role === '0',
  }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamLeaderId: string }> }
) {
  try {
    const { teamLeaderId } = await params
    const user = await resolveUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { isDirector, isTL } = isDirectorOrTL(user)
    if (!isDirector && !isTL) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const store = readStore()
    const scope = store.scopes[teamLeaderId] || null

    return NextResponse.json({
      teamLeaderId: Number(teamLeaderId),
      scope: scope ?? { teamLeaderId: Number(teamLeaderId), allowedUserIds: [], label: '', updatedBy: null, updatedAt: null },
      isRestricted: scope !== null && scope.allowedUserIds.length > 0,
    })
  } catch (err) {
    console.error('[TL Scopes] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ teamLeaderId: string }> }
) {
  try {
    const { teamLeaderId } = await params
    const user = await resolveUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { isDirector } = isDirectorOrTL(user)
    if (!isDirector) {
      return NextResponse.json({ error: 'Only Directors can manage Team Leader scopes' }, { status: 403 })
    }

    const body = await request.json()
    const allowedUserIds: number[] = Array.isArray(body.allowedUserIds)
      ? body.allowedUserIds.map((id: any) => Number(id)).filter((id: number) => isFinite(id) && id > 0)
      : []

    const directorUserId = Number(user?.user_id ?? user?.id ?? user?.userId ?? 0)

    const store = readStore()
    const scope: TLScope = {
      teamLeaderId: Number(teamLeaderId),
      allowedUserIds,
      label: body.label || '',
      updatedBy: directorUserId,
      updatedAt: new Date().toISOString(),
    }

    store.scopes[teamLeaderId] = scope
    writeStore(store)

    console.log(`✅ [TL Scopes] Director ${directorUserId} updated scope for TL ${teamLeaderId}: ${allowedUserIds.length} users`)

    return NextResponse.json({
      success: true,
      scope,
      isRestricted: allowedUserIds.length > 0,
    })
  } catch (err) {
    console.error('[TL Scopes] PUT error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamLeaderId: string }> }
) {
  try {
    const { teamLeaderId } = await params
    const user = await resolveUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { isDirector } = isDirectorOrTL(user)
    if (!isDirector) {
      return NextResponse.json({ error: 'Only Directors can manage Team Leader scopes' }, { status: 403 })
    }

    const directorUserId = Number(user?.user_id ?? user?.id ?? user?.userId ?? 0)
    const store = readStore()
    delete store.scopes[teamLeaderId]
    writeStore(store)

    console.log(`🗑️ [TL Scopes] Director ${directorUserId} removed scope restriction for TL ${teamLeaderId}`)

    return NextResponse.json({
      success: true,
      message: `Scope restriction removed for Team Leader ${teamLeaderId}. They will now see all tasks.`,
    })
  } catch (err) {
    console.error('[TL Scopes] DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}