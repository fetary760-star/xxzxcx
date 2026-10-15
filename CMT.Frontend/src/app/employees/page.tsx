'use client'

import React, { useEffect, useState } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { useAuth } from '@/lib/auth-context'
import { useTLPermissions } from '@/lib/tl-permissions-context'
import { useRouter } from 'next/navigation'
import apiClient from '@/lib/api'

interface User {
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
}

/**
 * Employees Management Page
 *
 * - Lists users
 * - Allows creation of users (Team Leader, Director, Shop TL, Manager depending on role)
 * - Allows editing/deleting via per-user actions (client-side best effort; server enforces RBAC)
 *
 * This component uses apiClient (lib/api.ts) for backend calls when available.
 * It also uses the internal API route for fetching individual user details when needed.
 */

export default function EmployeesPage() {
  const { user } = useAuth()
  const { tlPermissions, isLoadingTLPermissions } = useTLPermissions()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [shops, setShops] = useState<{ shop_id: number; name: string }[]>([])
  const [managers, setManagers] = useState<{ user_id: number; full_name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Create user form state
  const [showCreate, setShowCreate] = useState(false)
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('engineer')
  const [shopId, setShopId] = useState<number | ''>('')
  const [managerId, setManagerId] = useState<number | ''>('')

  // Simple loading for actions
  const [actionLoading, setActionLoading] = useState(false)

  // TL permission guard: redirect if canManageUsers is denied
  const userRoleNorm = (user?.role ?? '').toString().toLowerCase().replace(/[\s\-]+/g, '_')
  const isTL = userRoleNorm === 'team_leader' || userRoleNorm === 'teamleader'

  useEffect(() => {
    if (isTL && !isLoadingTLPermissions && tlPermissions && !tlPermissions.canManageUsers) {
      router.replace('/dashboard')
    }
  }, [isTL, isLoadingTLPermissions, tlPermissions, router])

  useEffect(() => {
    loadData()
  }, [])

  // Show loading while checking TL permissions
  if (isTL && isLoadingTLPermissions) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          <span className="ml-3 text-gray-600">Checking permissions...</span>
        </div>
      </MainLayout>
    )
  }

  // Block render if TL lacks permission (redirect will happen via useEffect)
  if (isTL && tlPermissions && !tlPermissions.canManageUsers) {
    return null
  }

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      // Try to use apiClient if available (it proxies auth token)
      let usersRes: any = []
      try {
        usersRes = await (apiClient.getUsers ? apiClient.getUsers() : apiClient.get('/users'))
      } catch (err) {
        // fallback to direct fetch
        const r = await fetch('/api/users', { credentials: 'same-origin' })
        usersRes = r.ok ? await r.json() : []
      }

      const shopsRes = await (apiClient.getShops ? apiClient.getShops() : Promise.resolve([]))
      
      // Fetch managers for assignment
      let managersRes: any = []
      try {
        const r = await fetch('/api/users', { credentials: 'same-origin' })
        if (r.ok) {
          const allUsers = await r.json()
          managersRes = allUsers.filter((u: any) => 
            (u.role === 'manager' || u.role === 'director') && u.isActive !== false
          )
        }
      } catch (err) {
        console.error('Failed to load managers', err)
      }

      const list = Array.isArray(usersRes) ? usersRes : usersRes?.data ?? usersRes?.users ?? []
      const shopsList = Array.isArray(shopsRes) ? shopsRes : (shopsRes as any)?.data ?? []
      const managersList = Array.isArray(managersRes) ? managersRes : []

      setUsers(list)
      setShops(shopsList)
      setManagers(managersList)
    } catch (err: any) {
      console.error('Load employees error', err)
      setError(err?.message ?? 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  async function submitCreate(e?: React.FormEvent) {
    e?.preventDefault()
    setActionLoading(true)
    setError(null)
    setSuccess(null)
    
    try {
      if (!fullName || !username || !email || !password || !role) {
        setError('Please fill required fields')
        return
      }

      // FIXED: Validate shop assignment for shop_tl role - compare number to empty string properly
      if (role === 'shop_tl' && shopId === '') {
        setError('Shop assignment is required for Shop Team Leader role')
        return
      }

      // FIXED: Validate manager assignment for roles that require it - compare number to empty string properly
      if (['team_leader', 'shop_tl'].includes(role) && managerId === '') {
        setError(`Manager assignment is required for ${role === 'team_leader' ? 'Team Leader' : 'Shop Team Leader'} role`)
        return
      }

      // FIXED: Use camelCase field names that match the API expectations
      const payload: any = {
        fullName: fullName.trim(),
        username: username.trim(),
        email: email.trim(),
        password: password.trim(),
        role: role.trim()
      }
      
      // Only include shopId if it has a valid value
      if (shopId !== '') {
        payload.shopId = Number(shopId)
      }
      
      // Only include managerId if it has a valid value
      if (managerId !== '') {
        payload.managerId = Number(managerId)
      }

      //('Creating user with payload:', { ...payload, password: '[REDACTED]' })

      // Use apiClient if available so token is attached from client
      let resBody: any = null
      try {
        resBody = await apiClient.post('/users', payload)
      } catch (err) {
        // fallback to internal API
        const r = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'same-origin'
        })
        resBody = await r.json()
        if (!r.ok) {
          const errorMsg = resBody?.message || resBody?.errors?.join(', ') || 'Create user failed'
          throw new Error(errorMsg)
        }
      }

      setSuccess('User created successfully')
      setShowCreate(false)
      // reset form
      setFullName('')
      setUsername('')
      setEmail('')
      setPassword('')
      setRole('engineer')
      setShopId('')
      setManagerId('')
      await loadData()
    } catch (err: any) {
      console.error('Create user error', err)
      setError(err?.message ?? 'Failed to create user')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDelete(userId?: number) {
    if (!userId) return
    if (!confirm('Delete this user? This action cannot be undone.')) return
    setActionLoading(true)
    setError(null)
    try {
      // call internal API route for delete (server will enforce RBAC)
      const r = await fetch(`/api/users/${userId}`, { method: 'DELETE', credentials: 'same-origin' })
      const body = await r.json().catch(() => null)
      if (!r.ok) throw new Error(body?.message || `Delete failed (${r.status})`)
      setSuccess('User deleted')
      await loadData()
    } catch (err: any) {
      console.error(err)
      setError(err?.message ?? 'Delete failed')
    } finally {
      setActionLoading(false)
    }
  }

  // Determine which roles the current user can create
  const userRoleNormalized = (user?.role ?? '').toString().toLowerCase().replace(/[\s\-_]+/g, '')
  const canCreateAnyRole = ['team_leader', 'director', 'manager'].includes(userRoleNormalized)
  const canCreateShopUsers = userRoleNormalized === 'shop_tl' || userRoleNormalized === 'shoptl'
  const isDirector = userRoleNormalized === 'director'
  const isManager = userRoleNormalized === 'manager'

  // Determine which roles can be created based on current user role
  const getAvailableRoles = () => {
    if (isDirector) {
      return ['engineer', 'team_leader', 'shop_tl', 'customer_personnel', 'customer', 'manager']
    } else if (isManager) {
      return ['engineer', 'team_leader', 'shop_tl']
    } else if (canCreateAnyRole) {
      return ['engineer', 'team_leader', 'shop_tl', 'customer_personnel', 'customer']
    } else if (canCreateShopUsers) {
      return ['customer_personnel']
    }
    return ['engineer']
  }

  const availableRoles = getAvailableRoles()

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Employee Management</h2>
          <div>
            {(canCreateAnyRole || canCreateShopUsers) && (
              <button onClick={() => setShowCreate(true)} className="px-3 py-1 bg-primary text-white rounded">Add User</button>
            )}
          </div>
        </div>

        {error && <div className="rounded bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
        {success && <div className="rounded bg-green-50 border border-green-200 p-3 text-sm text-green-700">{success}</div>}

        <div className="bg-white rounded shadow p-4">
          <h3 className="font-medium mb-3">Existing Users</h3>
          {loading ? (
            <div className="text-sm text-gray-500">Loading...</div>
          ) : users.length === 0 ? (
            <div className="text-sm text-gray-500">No users found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left">Full Name</th>
                    <th className="p-2 text-left">Username</th>
                    <th className="p-2 text-left">Email</th>
                    <th className="p-2 text-left">Role</th>
                    <th className="p-2 text-left">Shop</th>
                    <th className="p-2 text-left">Manager</th>
                    <th className="p-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.user_id ?? u.id} className="border-t">
                      <td className="p-2">{u.full_name}</td>
                      <td className="p-2">{u.username}</td>
                      <td className="p-2">{u.email}</td>
                      <td className="p-2">{u.role}</td>
                      <td className="p-2">{u.shop_name ?? (u.shop_id ? shops.find(s => s.shop_id === u.shop_id)?.name : 'N/A')}</td>
                      <td className="p-2">{u.manager_id ? managers.find(m => m.user_id === u.manager_id)?.full_name ?? `ID: ${u.manager_id}` : 'N/A'}</td>
                      <td className="p-2">
                        <div className="flex gap-2">
                          <a className="px-2 py-1 text-sm border rounded hover:bg-gray-50" href={`/employee_management?active_tab=profile&user_id=${u.user_id ?? u.id}`}>Profile</a>
                          {(canCreateAnyRole || userRoleNormalized === 'team_leader') && (
                            <button onClick={() => window.open(`/employee_management?edit_user=${u.user_id ?? u.id}`, '_self')} className="px-2 py-1 text-sm border rounded hover:bg-gray-50">Edit</button>
                          )}
                          {(canCreateAnyRole || userRoleNormalized === 'team_leader') && (
                            <button onClick={() => handleDelete(u.user_id ?? u.id)} className="px-2 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700" disabled={actionLoading}>Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Create user modal */}
        {showCreate && (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="absolute inset-0 bg-black opacity-40" onClick={() => setShowCreate(false)} />
            <form onSubmit={submitCreate} className="bg-white rounded-md p-6 z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-3">Add New User</h3>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-sm font-medium">Full Name <span className="text-red-500">*</span></label>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full border rounded px-3 py-2" required />
                </div>

                <div>
                  <label className="block text-sm font-medium">Username <span className="text-red-500">*</span></label>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} className="w-full border rounded px-3 py-2" required />
                </div>

                <div>
                  <label className="block text-sm font-medium">Email <span className="text-red-500">*</span></label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border rounded px-3 py-2" required />
                </div>

                <div>
                  <label className="block text-sm font-medium">Password <span className="text-red-500">*</span></label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border rounded px-3 py-2" required minLength={6} />
                  <p className="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
                </div>

                <div>
                  <label className="block text-sm font-medium">Role <span className="text-red-500">*</span></label>
                  <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full border rounded px-3 py-2" required>
                    {availableRoles.includes('engineer') && <option value="engineer">Engineer</option>}
                    {availableRoles.includes('team_leader') && <option value="team_leader">Team Leader</option>}
                    {availableRoles.includes('shop_tl') && <option value="shop_tl">Shop Team Leader</option>}
                    {availableRoles.includes('customer_personnel') && <option value="customer_personnel">Customer Personnel</option>}
                    {availableRoles.includes('customer') && <option value="customer">Customer</option>}
                    {availableRoles.includes('manager') && <option value="manager">Manager</option>}
                  </select>
                </div>

                {/* Show shop selector for shop_tl role or when user can assign shops */}
                {(role === 'shop_tl' || canCreateAnyRole || canCreateShopUsers) && (
                  <div>
                    <label className="block text-sm font-medium">
                      Shop {role === 'shop_tl' && <span className="text-red-500">*</span>}
                    </label>
                    <select 
                      value={shopId} 
                      onChange={(e) => setShopId(e.target.value ? Number(e.target.value) : '')} 
                      className="w-full border rounded px-3 py-2"
                      required={role === 'shop_tl'}
                    >
                      <option value="">Select Shop</option>
                      {shops.map(s => <option key={s.shop_id} value={s.shop_id}>{s.name}</option>)}
                    </select>
                    {role === 'shop_tl' && <p className="text-xs text-red-500 mt-1">Required for Shop Team Leader role</p>}
                  </div>
                )}

                {/* Show manager selector for roles that require it */}
                {['team_leader', 'shop_tl'].includes(role) && managers.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium">
                      Manager <span className="text-red-500">*</span>
                    </label>
                    <select 
                      value={managerId} 
                      onChange={(e) => setManagerId(e.target.value ? Number(e.target.value) : '')} 
                      className="w-full border rounded px-3 py-2"
                      required
                    >
                      <option value="">Select Manager</option>
                      {managers.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
                    </select>
                    <p className="text-xs text-red-500 mt-1">Required for {role === 'team_leader' ? 'Team Leader' : 'Shop Team Leader'} role</p>
                  </div>
                )}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-1 border rounded hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={actionLoading} className="px-3 py-1 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50">
                  {actionLoading ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </MainLayout>
  )
}