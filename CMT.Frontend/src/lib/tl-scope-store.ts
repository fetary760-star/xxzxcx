/**
 * Shared TL Scope store reader.
 * 
 * Used by both /api/tasks/route.ts and /lib/rbacFilter.ts to read
 * Team Leader scope restrictions from the JSON config file.
 * 
 * This module is server-side only (uses fs).
 */

import fs from 'fs'
import path from 'path'

const SCOPES_FILE = path.join(process.cwd(), 'tl-scopes.json')

export interface TLScope {
  teamLeaderId: number
  /** User IDs this TL is allowed to see. Empty array = unrestricted. */
  allowedUserIds: number[]
  label?: string
  updatedBy?: number
  updatedAt?: string
}

interface ScopesStore {
  scopes: Record<string, TLScope>
}

/**
 * Read the TL scopes store from disk.
 * Returns the full store object.
 */
export function readTLScopesStore(): ScopesStore {
  try {
    if (fs.existsSync(SCOPES_FILE)) {
      const raw = fs.readFileSync(SCOPES_FILE, 'utf-8')
      return JSON.parse(raw) as ScopesStore
    }
  } catch (err) {
    console.error('[TL Scope Store] Error reading scopes file:', err)
  }
  return { scopes: {} }
}

/**
 * Get the scope for a specific Team Leader.
 * Returns null if no scope restriction exists (TL sees everything).
 */
export function getTLScope(teamLeaderId: number): TLScope | null {
  const store = readTLScopesStore()
  return store.scopes[String(teamLeaderId)] ?? null
}

/**
 * Check if a Team Leader has a restricted scope.
 * Returns true if the TL has specific user IDs assigned (not empty).
 */
export function isTLScopeRestricted(teamLeaderId: number): boolean {
  const scope = getTLScope(teamLeaderId)
  return scope !== null && scope.allowedUserIds.length > 0
}

/**
 * Get the allowed user IDs for a Team Leader.
 * Returns empty array if no restriction (meaning TL sees everything).
 */
export function getTLAllowedUserIds(teamLeaderId: number): number[] {
  const scope = getTLScope(teamLeaderId)
  if (!scope || scope.allowedUserIds.length === 0) return []
  return scope.allowedUserIds
}