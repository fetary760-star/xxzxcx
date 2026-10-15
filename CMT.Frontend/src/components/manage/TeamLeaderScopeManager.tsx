'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import apiClient from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Users,
  Shield,
  Search,
  Check,
  X,
  Trash2,
  Save,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  AlertCircle,
  Info,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserInfo {
  userId: number
  fullName: string
  role: string
  roleDisplayName?: string
  shopName?: string
  isActive?: boolean
}

interface TLScopeData {
  teamLeaderId: number
  allowedUserIds: number[]
  label?: string
  updatedBy?: number
  updatedAt?: string
}

interface TeamLeaderWithScope {
  user: UserInfo
  scope: TLScopeData | null
  isRestricted: boolean
  isExpanded: boolean
  isDirty: boolean
  pendingAllowedUserIds: number[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TeamLeaderScopeManager() {
  const { user: currentUser } = useAuth()
  const [teamLeaders, setTeamLeaders] = useState<TeamLeaderWithScope[]>([])
  const [allUsers, setAllUsers] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [userSearchTerm, setUserSearchTerm] = useState('')

  // ─── Fetch data ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch all users to find Team Leaders and available users
      const usersResponse = await apiClient.get('/users')
      const usersList: any[] = Array.isArray(usersResponse)
        ? usersResponse
        : (usersResponse?.users ?? usersResponse?.data ?? [])

      const normalizedUsers: UserInfo[] = usersList.map((u: any) => ({
        userId: Number(u.userId ?? u.user_id ?? u.id ?? 0),
        fullName: String(u.fullName ?? u.full_name ?? u.name ?? '').trim(),
        role: String(u.role ?? u.role_name ?? u.roleName ?? '').toLowerCase().trim().replace(/[\s\-]+/g, '_'),
        roleDisplayName: u.roleDisplayName ?? u.roleName ?? u.role_name ?? '',
        shopName: u.shopName ?? u.shop_name ?? '',
        isActive: u.isActive !== false,
      })).filter(u => u.userId > 0)

      setAllUsers(normalizedUsers)

      // Find Team Leaders
      const tls = normalizedUsers.filter(u =>
        u.role === 'team_leader' || u.role === 'teamleader' || u.role === '0'
      )

      // Fetch existing scopes
      let existingScopes: TLScopeData[] = []
      try {
        const scopesResponse = await fetch('/api/team-leader-scopes', {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
          },
        })
        if (scopesResponse.ok) {
          const scopesData = await scopesResponse.json()
          existingScopes = scopesData.scopes ?? []
        }
      } catch {
        // No existing scopes
      }

      // Build TL list with scope data
      const scopeMap = new Map<number, TLScopeData>()
      existingScopes.forEach(s => scopeMap.set(s.teamLeaderId, s))

      const tlsWithScopes: TeamLeaderWithScope[] = tls.map(tl => {
        const scope = scopeMap.get(tl.userId) ?? null
        return {
          user: tl,
          scope,
          isRestricted: scope !== null && scope.allowedUserIds.length > 0,
          isExpanded: false,
          isDirty: false,
          pendingAllowedUserIds: scope?.allowedUserIds ?? [],
        }
      })

      setTeamLeaders(tlsWithScopes)
    } catch (err: any) {
      setError(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ─── Actions ─────────────────────────────────────────────────────────────

  const toggleExpand = (tlId: number) => {
    setTeamLeaders(prev =>
      prev.map(tl =>
        tl.user.userId === tlId ? { ...tl, isExpanded: !tl.isExpanded } : tl
      )
    )
  }

  const toggleUserInScope = (tlId: number, userId: number) => {
    setTeamLeaders(prev =>
      prev.map(tl => {
        if (tl.user.userId !== tlId) return tl
        const currentIds = [...tl.pendingAllowedUserIds]
        const idx = currentIds.indexOf(userId)
        if (idx >= 0) {
          currentIds.splice(idx, 1)
        } else {
          currentIds.push(userId)
        }
        return {
          ...tl,
          pendingAllowedUserIds: currentIds,
          isDirty: true,
        }
      })
    )
  }

  const selectAllUsers = (tlId: number) => {
    const nonTLUsers = allUsers.filter(u =>
      u.role !== 'team_leader' && u.role !== 'teamleader' && u.role !== '0' &&
      u.role !== 'admin' && u.role !== 'administrator'
    )
    setTeamLeaders(prev =>
      prev.map(tl => {
        if (tl.user.userId !== tlId) return tl
        return {
          ...tl,
          pendingAllowedUserIds: nonTLUsers.map(u => u.userId),
          isDirty: true,
        }
      })
    )
  }

  const clearAllUsers = (tlId: number) => {
    setTeamLeaders(prev =>
      prev.map(tl => {
        if (tl.user.userId !== tlId) return tl
        return {
          ...tl,
          pendingAllowedUserIds: [],
          isDirty: true,
        }
      })
    )
  }

  const saveScope = async (tlId: number) => {
    const tl = teamLeaders.find(t => t.user.userId === tlId)
    if (!tl) return

    setSaving(tlId)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch(`/api/team-leader-scopes/${tlId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
        },
        body: JSON.stringify({
          allowedUserIds: tl.pendingAllowedUserIds,
          label: `Scope for ${tl.user.fullName}`,
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to save scope')
      }

      const data = await response.json()

      setTeamLeaders(prev =>
        prev.map(t => {
          if (t.user.userId !== tlId) return t
          return {
            ...t,
            scope: data.scope,
            isRestricted: data.isRestricted,
            isDirty: false,
          }
        })
      )

      setSuccessMessage(
        tl.pendingAllowedUserIds.length > 0
          ? `Scope saved for ${tl.user.fullName}: ${tl.pendingAllowedUserIds.length} users in scope`
          : `Scope restriction removed for ${tl.user.fullName} — they can now see all tasks`
      )
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err: any) {
      setError(err.message || 'Failed to save scope')
    } finally {
      setSaving(null)
    }
  }

  const removeRestriction = async (tlId: number) => {
    const tl = teamLeaders.find(t => t.user.userId === tlId)
    if (!tl) return

    setSaving(tlId)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch(`/api/team-leader-scopes/${tlId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
        },
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to remove restriction')
      }

      setTeamLeaders(prev =>
        prev.map(t => {
          if (t.user.userId !== tlId) return t
          return {
            ...t,
            scope: null,
            isRestricted: false,
            isDirty: false,
            pendingAllowedUserIds: [],
          }
        })
      )

      setSuccessMessage(`Scope restriction removed for ${tl.user.fullName}`)
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err: any) {
      setError(err.message || 'Failed to remove restriction')
    } finally {
      setSaving(null)
    }
  }

  // ─── Filtered lists ──────────────────────────────────────────────────────

  const filteredTeamLeaders = useMemo(() => {
    if (!searchTerm.trim()) return teamLeaders
    const term = searchTerm.toLowerCase()
    return teamLeaders.filter(tl =>
      tl.user.fullName.toLowerCase().includes(term) ||
      String(tl.user.userId).includes(term)
    )
  }, [teamLeaders, searchTerm])

  const getFilteredUsers = useCallback(
    (tlId: number) => {
      // Exclude TLs and admins from assignable users
      const assignableUsers = allUsers.filter(u =>
        u.role !== 'team_leader' && u.role !== 'teamleader' && u.role !== '0' &&
        u.role !== 'admin' && u.role !== 'administrator'
      )
      if (!userSearchTerm.trim()) return assignableUsers
      const term = userSearchTerm.toLowerCase()
      return assignableUsers.filter(u =>
        u.fullName.toLowerCase().includes(term) ||
        u.role.includes(term) ||
        (u.shopName ?? '').toLowerCase().includes(term) ||
        String(u.userId).includes(term)
      )
    },
    [allUsers, userSearchTerm]
  )

  const getRoleDisplayName = (role: string): string => {
    const roleMap: Record<string, string> = {
      engineer: 'Engineer',
      director: 'Director',
      customer: 'Customer',
      customer_personnel: 'Customer Personnel',
      shop_tl: 'Shop TL',
      manager: 'Manager',
      shop_manager: 'Shop Manager',
    }
    return roleMap[role] || role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, ' ')
  }

  const getRoleBadgeColor = (role: string): string => {
    const colorMap: Record<string, string> = {
      engineer: 'bg-blue-100 text-blue-800',
      director: 'bg-purple-100 text-purple-800',
      customer: 'bg-orange-100 text-orange-800',
      customer_personnel: 'bg-yellow-100 text-yellow-800',
      shop_tl: 'bg-green-100 text-green-800',
      manager: 'bg-indigo-100 text-indigo-800',
      shop_manager: 'bg-teal-100 text-teal-800',
    }
    return colorMap[role] || 'bg-gray-100 text-gray-800'
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading Team Leader scopes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="h-6 w-6 text-green-600" />
            Team Leader Scope Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Control which users&apos; tasks each Team Leader can see. Unrestricted TLs see all tasks.
          </p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-800">
          <p className="font-medium">How TL Scopes Work</p>
          <ul className="mt-1 list-disc list-inside space-y-1 text-blue-700">
            <li><strong>Unrestricted (default)</strong>: Team Leader sees ALL tasks in the system</li>
            <li><strong>Restricted</strong>: Team Leader only sees tasks created by or assigned to users in their scope</li>
            <li>Directors who created restricted TLs will see the <strong>union</strong> of all their TLs&apos; scopes</li>
            <li>Scope changes take effect immediately on the next page load</li>
          </ul>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-600 hover:text-red-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-2">
          <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-800">{successMessage}</p>
          <button onClick={() => setSuccessMessage(null)} className="ml-auto text-green-600 hover:text-green-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Search Team Leaders */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search Team Leaders..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
        />
      </div>

      {/* Team Leaders list */}
      {filteredTeamLeaders.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No Team Leaders found</p>
          <p className="text-sm mt-1">There are no Team Leaders in the system to configure scopes for.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTeamLeaders.map(tl => (
            <div
              key={tl.user.userId}
              className={`border rounded-lg overflow-hidden transition-all ${
                tl.isRestricted ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200 bg-white'
              }`}
            >
              {/* TL Header Row */}
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                onClick={() => toggleExpand(tl.user.userId)}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${tl.isRestricted ? 'bg-amber-100' : 'bg-green-100'}`}>
                    {tl.isRestricted ? (
                      <EyeOff className="h-4 w-4 text-amber-600" />
                    ) : (
                      <Eye className="h-4 w-4 text-green-600" />
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{tl.user.fullName}</div>
                    <div className="text-xs text-gray-500">ID: {tl.user.userId}</div>
                  </div>
                  <Badge
                    className={`text-xs ${
                      tl.isRestricted
                        ? 'bg-amber-100 text-amber-800 hover:bg-amber-100'
                        : 'bg-green-100 text-green-800 hover:bg-green-100'
                    }`}
                  >
                    {tl.isRestricted
                      ? `Restricted (${tl.pendingAllowedUserIds.length} users)`
                      : 'Unrestricted — sees all'}
                  </Badge>
                  {tl.isDirty && (
                    <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100 text-xs">
                      Unsaved changes
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {tl.isRestricted && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={e => {
                        e.stopPropagation()
                        removeRestriction(tl.user.userId)
                      }}
                      disabled={saving === tl.user.userId}
                      className="text-red-600 hover:text-red-800 hover:bg-red-50 text-xs gap-1"
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove Restriction
                    </Button>
                  )}
                  {tl.isDirty && (
                    <Button
                      size="sm"
                      onClick={e => {
                        e.stopPropagation()
                        saveScope(tl.user.userId)
                      }}
                      disabled={saving === tl.user.userId}
                      className="bg-green-600 hover:bg-green-700 text-white text-xs gap-1"
                    >
                      {saving === tl.user.userId ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <Save className="h-3 w-3" />
                      )}
                      Save Scope
                    </Button>
                  )}
                  {tl.isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Expanded: User Selection */}
              {tl.isExpanded && (
                <div className="border-t border-gray-200 px-4 py-4 bg-white">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-gray-600">
                      Select which users&apos; tasks <strong>{tl.user.fullName}</strong> can see.
                      Leave empty for unrestricted access.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => selectAllUsers(tl.user.userId)}
                        className="text-xs"
                      >
                        Select All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => clearAllUsers(tl.user.userId)}
                        className="text-xs"
                      >
                        Clear All
                      </Button>
                    </div>
                  </div>

                  {/* User search */}
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search users by name, role, or shop..."
                      value={userSearchTerm}
                      onChange={e => setUserSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                    />
                  </div>

                  {/* User grid */}
                  <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-md">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-600 w-10">
                            <span className="sr-only">Select</span>
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Name</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Role</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Shop</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600 w-16">ID</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {getFilteredUsers(tl.user.userId).map(u => {
                          const isSelected = tl.pendingAllowedUserIds.includes(u.userId)
                          return (
                            <tr
                              key={u.userId}
                              className={`cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-green-50 hover:bg-green-100'
                                  : 'hover:bg-gray-50'
                              }`}
                              onClick={() => toggleUserInScope(tl.user.userId, u.userId)}
                            >
                              <td className="px-3 py-2">
                                <div
                                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                    isSelected
                                      ? 'bg-green-600 border-green-600'
                                      : 'border-gray-300 bg-white'
                                  }`}
                                >
                                  {isSelected && <Check className="h-3 w-3 text-white" />}
                                </div>
                              </td>
                              <td className="px-3 py-2 font-medium text-gray-900">{u.fullName}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(u.role)}`}>
                                  {getRoleDisplayName(u.role)}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-gray-600">{u.shopName || '—'}</td>
                              <td className="px-3 py-2 text-gray-400">{u.userId}</td>
                            </tr>
                          )
                        })}
                        {getFilteredUsers(tl.user.userId).length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-8 text-center text-gray-400">
                              No users found matching your search
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary */}
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                      {tl.pendingAllowedUserIds.length > 0
                        ? `${tl.pendingAllowedUserIds.length} user(s) selected — TL will only see their tasks`
                        : 'No users selected — TL will see ALL tasks (unrestricted)'}
                    </p>
                    {tl.isDirty && (
                      <Button
                        size="sm"
                        onClick={() => saveScope(tl.user.userId)}
                        disabled={saving === tl.user.userId}
                        className="bg-green-600 hover:bg-green-700 text-white text-xs gap-1"
                      >
                        {saving === tl.user.userId ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <Save className="h-3 w-3" />
                        )}
                        Save Changes
                      </Button>
                    )}
                  </div>

                  {/* Scope metadata */}
                  {tl.scope?.updatedAt && (
                    <p className="text-xs text-gray-400 mt-2">
                      Last updated: {new Date(tl.scope.updatedAt).toLocaleString()}
                      {tl.scope.updatedBy ? ` by user #${tl.scope.updatedBy}` : ''}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}