'use client'

import React, { useEffect, useState } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { useAuth } from '@/lib/auth-context'
import apiClient from '@/lib/api'
import { useRolePermissions } from '@/hooks/useRolePermissions'

type ApiUser = {
  user_id?: number
  id?: number
  full_name?: string
  username?: string
  email?: string
  role?: string
  shop_id?: number
  shop_name?: string
  supervisor_id?: number
  manager_id?: number
  isActive?: boolean
  [k: string]: any
}

/**
 * Employee Management page (profile / edit)
 *
 * - Supports query param user_id to view/edit arbitrary user (TL/Director/Manager).
 * - If no user_id provided, shows current user's profile.
 * - Edit actions call /api/users/[id] PATCH (server enforces RBAC).
 * - Preserve original app behavior and use existing internal API helpers where possible.
 */

function useQueryParam(name: string) {
  // simple client-side extractor (app router client component)
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  return params.get(name)
}

export default function EmployeeManagementPage(): JSX.Element {
  const { user: currentUser } = useAuth()
  const { canEditUser, canDeleteUser, isPrivilegedRole } = useRolePermissions()
  const [targetUser, setTargetUser] = useState<ApiUser | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<any>({})

  // Move hook calls to top level - no conditional calls
  const queryUserIdParam = useQueryParam('user_id')
  const editUserParam = useQueryParam('edit_user')
  const queryUserId = queryUserIdParam || editUserParam
  const viewingUserId = queryUserId ? Number(queryUserId) : (currentUser?.userId ?? currentUser?.id ?? null)

  useEffect(() => {
    loadUser()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingUserId])

  async function loadUser() {
    if (!viewingUserId) return
    setLoading(true)
    setError(null)
    try {
      // Prefer apiClient.getUser, fallback to internal proxy
      let data: any = null
      try {
        data = await apiClient.getUser(viewingUserId)
      } catch (err) {
        // fallback to internal API
        const res = await fetch(`/api/users/${viewingUserId}`, { credentials: 'same-origin' })
        if (!res.ok) {
          const b = await res.json().catch(() => null)
          throw new Error(b?.message || `Failed to fetch user (${res.status})`)
        }
        data = await res.json()
      }

      const normalized = {
        user_id: data.user_id ?? data.id ?? data.userId,
        full_name: data.full_name ?? data.fullName ?? data.name,
        username: data.username ?? data.user_name,
        email: data.email,
        role: data.role ?? data.role_name,
        shop_id: data.shop_id ?? data.shopId,
        shop_name: data.shop_name ?? data.shopName,
        supervisor_id: data.supervisor_id ?? data.supervisorId,
        manager_id: data.manager_id ?? data.managerId,
        isActive: data.isActive ?? true,
        ...data
      }
      setTargetUser(normalized)
      setForm({
        full_name: normalized.full_name ?? '',
        username: normalized.username ?? '',
        email: normalized.email ?? '',
        role: normalized.role ?? 'engineer',
        shop_id: normalized.shop_id ?? '',
        supervisor_id: normalized.supervisor_id ?? '',
        manager_id: normalized.manager_id ?? ''
      })
      setEditing(false)
    } catch (err: any) {
      console.error('Failed loading user:', err)
      setError(err?.message ?? 'Failed to load user')
      setTargetUser(null)
    } finally {
      setLoading(false)
    }
  }

  function canEdit(): boolean {
    if (!currentUser) return false
    const currentUserAny = currentUser as any;
    const meRole = (currentUser.role ?? '').toString().toLowerCase().replace(/[\s\-_]+/g, '')
    const currentUserId = Number(currentUserAny.userId ?? currentUserAny.id)
    
    // RBAC: Check permission matrix first — if canEditUser is false and not privileged, deny
    // (Self-edit is always allowed regardless of matrix)
    if (Number(viewingUserId) === currentUserId) return true

    // Privileged roles (admin/director) always have full permissions
    if (isPrivilegedRole) return true

    // RBAC matrix check: if the matrix says this role cannot edit users, deny
    if (!canEditUser) return false
    
    // Directors can edit anyone
    if (meRole === 'director') return true
    
    // Team leaders can edit anyone
    if (meRole === 'team_leader') return true
    
    // Managers can edit users they manage
    if (meRole === 'manager') {
      const targetManagerId = targetUser?.manager_id
      return targetManagerId === currentUserId
    }
    
    // Shop TL can edit users in their shop (customer_personnel they created)
    if (meRole === 'shop_tl' || meRole === 'shoptl') {
      const currentUserShopId = Number(currentUserAny.shopId ?? currentUserAny.shop_id)
      const targetUserShopId = Number(targetUser?.shop_id)
      const targetUserRole = (targetUser?.role || '').toLowerCase()
      return currentUserShopId === targetUserShopId && targetUserRole === 'customer_personnel'
    }
    
    return false
  }

  async function submitPatch(e?: React.FormEvent) {
    e?.preventDefault()
    if (!targetUser) return
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const payload: any = {
        full_name: form.full_name,
        username: form.username,
        email: form.email,
        role: form.role,
      }
      if (form.shop_id !== undefined) payload.shop_id = form.shop_id || null
      if (form.supervisor_id !== undefined) payload.supervisor_id = form.supervisor_id || null
      if (form.manager_id !== undefined) payload.manager_id = form.manager_id || null

      // Use internal API which enforces RBAC
      const res = await fetch(`/api/users/${targetUser.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin'
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.message || `Update failed (${res.status})`)

      setSuccess('User updated successfully')
      await loadUser()
    } catch (err: any) {
      console.error('Update failed', err)
      setError(err?.message ?? 'Update failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleDeactivate() {
    if (!targetUser) return
    if (!confirm('Deactivate this user account?')) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/users/${targetUser.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
        credentials: 'same-origin'
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.message || `Deactivate failed (${res.status})`)
      setSuccess('User deactivated')
      await loadUser()
    } catch (err: any) {
      console.error(err)
      setError(err?.message ?? 'Deactivate failed')
    } finally {
      setLoading(false)
    }
  }

  if (!viewingUserId) {
    return (
      <MainLayout>
        <div className="py-20 text-center">No user selected.</div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Employee Profile</h2>
          <div className="flex gap-2">
            {canEdit() && !editing && <button onClick={() => setEditing(true)} className="px-3 py-1 border rounded bg-white">Edit</button>}
            {canEdit() && targetUser?.isActive && <button onClick={handleDeactivate} className="px-3 py-1 bg-red-600 text-white rounded">Deactivate</button>}
            <button onClick={() => window.location.href = '/employees'} className="px-3 py-1 border rounded">Back to List</button>
          </div>
        </div>

        {error && <div className="rounded bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
        {success && <div className="rounded bg-green-50 border border-green-200 p-3 text-sm text-green-700">{success}</div>}

        <div className="bg-white rounded shadow p-4">
          {loading && <div className="text-sm text-gray-500">Loading...</div>}
          {!loading && !targetUser && <div className="text-sm text-gray-500">User not found.</div>}
          {!loading && targetUser && (
            <>
              {!editing && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-medium">Basic Info</h3>
                    <p><strong>Full name:</strong> {targetUser.full_name}</p>
                    <p><strong>Username:</strong> {targetUser.username}</p>
                    <p><strong>Email:</strong> {targetUser.email}</p>
                    <p><strong>Role:</strong> {targetUser.role}</p>
                    <p><strong>Shop:</strong> {targetUser.shop_name ?? targetUser.shop_id ?? 'N/A'}</p>
                    <p><strong>Supervisor:</strong> {targetUser.supervisor_id ?? 'N/A'}</p>
                    <p><strong>Manager:</strong> {targetUser.manager_id ?? 'N/A'}</p>
                    <p><strong>Active:</strong> {targetUser.isActive ? 'Yes' : 'No'}</p>
                  </div>

                  <div>
                    <h3 className="font-medium">Metadata</h3>
                    <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto">{JSON.stringify(targetUser, null, 2)}</pre>
                  </div>
                </div>
              )}

              {editing && (
                <form onSubmit={submitPatch} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium">Full Name</label>
                      <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full border rounded px-3 py-2" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium">Username</label>
                      <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="w-full border rounded px-3 py-2" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium">Email</label>
                      <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full border rounded px-3 py-2" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium">Role</label>
                      <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full border rounded px-3 py-2">
                        <option value="engineer">Engineer</option>
                        <option value="team_leader">Team Leader</option>
                        <option value="director">Director</option>
                        <option value="shop_tl">Shop TL</option>
                        <option value="manager">Manager</option>
                        <option value="customer_personnel">Customer Personnel</option>
                        <option value="customer">Customer</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium">Shop ID</label>
                      <input value={form.shop_id ?? ''} onChange={(e) => setForm({ ...form, shop_id: e.target.value ? Number(e.target.value) : '' })} className="w-full border rounded px-3 py-2" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium">Supervisor ID</label>
                      <input value={form.supervisor_id ?? ''} onChange={(e) => setForm({ ...form, supervisor_id: e.target.value ? Number(e.target.value) : '' })} className="w-full border rounded px-3 py-2" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium">Manager ID</label>
                      <input value={form.manager_id ?? ''} onChange={(e) => setForm({ ...form, manager_id: e.target.value ? Number(e.target.value) : '' })} className="w-full border rounded px-3 py-2" />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => { setEditing(false); setForm({}) }} className="px-3 py-1 border rounded">Cancel</button>
                    <button type="submit" className="px-3 py-1 bg-primary text-white rounded">Save</button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </MainLayout>
  )
}