/**
 * /api/users/**  (catch-all)
 *
 * NEW FILE. Without it the browser got a Next.js 404 for every user
 * sub-endpoint the amended backend exposes:
 *   GET  /api/users/creation-rules          <- drives the Create User dropdowns
 *   GET  /api/users/supervisor-candidates   <- valid parents for a target role
 *   GET  /api/users/role-reference          <- role/permission matrix
 *   GET  /api/users/me | /org-tree | /{id}
 *   POST /api/users/assign-role
 *   PUT  /api/users/{id} | /{id}/activate | /{id}/deactivate
 *        /{id}/permissions | /{id}/change-password
 *   DELETE /api/users/{id}
 *
 * Because the UI could not read the server rules, it guessed the creation
 * matrix and posted role/parent combinations the rules engine rejects with 422.
 *
 * NOTE: the older static file src/app/api/users/assign-role/route.ts still wins
 * over this catch-all (static routes take priority in the App Router). Delete
 * that file so assign-role also benefits from the problem+json fix here.
 */

import type { NextRequest } from 'next/server'
import { proxyUsersRequest, resolvePathSegments } from '@/lib/server/users-proxy'

export async function GET(req: NextRequest, context: unknown) {
  return proxyUsersRequest(req, 'GET', await resolvePathSegments(context))
}

export async function POST(req: NextRequest, context: unknown) {
  return proxyUsersRequest(req, 'POST', await resolvePathSegments(context))
}

export async function PUT(req: NextRequest, context: unknown) {
  return proxyUsersRequest(req, 'PUT', await resolvePathSegments(context))
}

export async function PATCH(req: NextRequest, context: unknown) {
  return proxyUsersRequest(req, 'PATCH', await resolvePathSegments(context))
}

export async function DELETE(req: NextRequest, context: unknown) {
  return proxyUsersRequest(req, 'DELETE', await resolvePathSegments(context))
}