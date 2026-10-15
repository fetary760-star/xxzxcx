/**
 * API Route: /api/team-leader-scopes
 * 
 * GET /api/team-leader-scopes → returns all TL scope configurations
 * Only accessible by Directors.
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const SCOPES_FILE = path.join(process.cwd(), 'tl-scopes.json')

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

interface TLScope {
  teamLeaderId: number
  allowedUserIds: number[]
  label?: string
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

export async function GET(request: NextRequest) {
  try {
    const user = await resolveUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const role = normalizeRole(user?.role ?? user?.role_name ?? user?.roleName ?? '')
    const isDirector = role === 'director' || role === '1'
    if (!isDirector) {
      return NextResponse.json({ error: 'Only Directors can view Team Leader scopes' }, { status: 403 })
    }

    const store = readStore()
    const scopesList = Object.values(store.scopes)

    return NextResponse.json({
      scopes: scopesList,
      total: scopesList.length,
    })
  } catch (err) {
    console.error('[TL Scopes] GET all error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}