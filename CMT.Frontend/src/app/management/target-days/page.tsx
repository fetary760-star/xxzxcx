'use client'

import RequireRole from '@/components/RequireRole'
import { MainLayout } from '@/components/layout/main-layout'
import { useEffect, useState } from 'react'
import { getCsrfToken } from '@/lib/csrf'
import { useAuth } from '@/lib/auth-context'
import { useTLPermissions } from '@/lib/tl-permissions-context'
import { useRouter } from 'next/navigation'

export default function TargetDaysPageWrapper() {
  return (
    <RequireRole allowed={['team_leader','director']}>
      <TargetDaysPageGuard />
    </RequireRole>
  )
}

/** Guard: redirect TLs who lack canManageCategories (target days are category-related) */
function TargetDaysPageGuard() {
  const { user } = useAuth()
  const { tlPermissions, isLoadingTLPermissions } = useTLPermissions()
  const router = useRouter()
  const userRole = (user?.role ?? '').toString().toLowerCase().replace(/[\s\-]+/g, '_')
  const isTeamLeader = userRole === 'team_leader' || userRole === 'teamleader'

  useEffect(() => {
    if (isTeamLeader && !isLoadingTLPermissions && tlPermissions && !tlPermissions.canManageCategories) {
      router.replace('/dashboard')
    }
  }, [isTeamLeader, isLoadingTLPermissions, tlPermissions, router])

  if (isTeamLeader && isLoadingTLPermissions) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          <span className="ml-3 text-gray-600">Checking permissions...</span>
        </div>
      </MainLayout>
    )
  }

  if (isTeamLeader && tlPermissions && !tlPermissions.canManageCategories) {
    return null
  }

  return <TargetDaysPage />
}

/** Format duration as human-readable string */
function formatDuration(entry: any): string {
  const days = Number(entry.target_days ?? entry.targetDays ?? 0)
  const hours = Number(entry.target_hours ?? entry.targetHours ?? 0)
  const minutes = Number(entry.target_minutes ?? entry.targetMinutes ?? 0)

  if (entry.display_duration) return entry.display_duration

  const parts: string[] = []
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`)
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`)
  if (minutes > 0) parts.push(`${minutes} min${minutes !== 1 ? 's' : ''}`)
  return parts.length > 0 ? parts.join(', ') : '-'
}

function TargetDaysPage() {
  const [items, setItems] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryId, setCategoryId] = useState('')
  const [targetDays, setTargetDays] = useState<number>(0)
  const [targetHours, setTargetHours] = useState<number>(0)
  const [targetMinutes, setTargetMinutes] = useState<number>(0)
  const [editing, setEditing] = useState<{
    category_id: any
    target_days: number
    target_hours: number
    target_minutes: number
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  /**
   * Helper function to get headers with CSRF token
   */
  async function getHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    try {
      const csrfToken = await getCsrfToken()
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken
        headers['X-Requested-With'] = 'XMLHttpRequest'
      }
    } catch (err) {
      console.warn('Failed to get CSRF token:', err)
    }

    return headers
  }

  async function load() {
    setLoading(true); setError(null)
    try {
      const catsRes = await fetch('/api/management/categories', { credentials: 'include' })
      if (!catsRes.ok) throw new Error(`${catsRes.status} ${catsRes.statusText}`)
      const catsJson = await catsRes.json()
      setCategories(Array.isArray(catsJson) ? catsJson : catsJson?.data ?? catsJson ?? [])

      const res = await fetch('/api/management/target-days', { credentials: 'include' })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const json = await res.json()
      setItems(Array.isArray(json) ? json : json?.data ?? json ?? [])
    } catch (err: any) {
      console.error('Load failed', err)
      setError('Load failed: ' + (err?.message ?? ''))
    } finally {
      setLoading(false)
    }
  }

  async function saveTarget() {
    if (!categoryId) return

    const numDays = Number(targetDays)
    const numHours = Number(targetHours)
    const numMinutes = Number(targetMinutes)

    // Validate: at least one value must be > 0
    if (numDays <= 0 && numHours <= 0 && numMinutes <= 0) {
      setError('At least one of Days, Hours, or Minutes must be greater than 0')
      return
    }

    if (numDays < 0 || numHours < 0 || numMinutes < 0) {
      setError('Values cannot be negative')
      return
    }

    if (numHours > 23) {
      setError('Hours must be between 0 and 23')
      return
    }

    if (numMinutes > 59) {
      setError('Minutes must be between 0 and 59')
      return
    }

    setBusy(true); setError(null)
    try {
      const headers = await getHeaders()
      // Backend expects PascalCase keys
      const payload = {
        CategoryId: Number(categoryId),
        TargetDays: numDays,
        TargetHours: numHours,
        TargetMinutes: numMinutes,
        // Also send snake_case for compatibility
        category_id: Number(categoryId),
        target_days: numDays,
        target_hours: numHours,
        target_minutes: numMinutes,
      }
      const res = await fetch('/api/management/target-days', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        let errMsg = `${res.status} ${res.statusText}`
        try {
          const errData = JSON.parse(errText)
          errMsg = errData?.error || errData?.message || errMsg
        } catch {
          if (errText) errMsg = errText
        }
        throw new Error(errMsg)
      }
      setCategoryId('')
      setTargetDays(0)
      setTargetHours(0)
      setTargetMinutes(0)
      await load()
    } catch (err: any) {
      console.error(err)
      setError('Save failed: ' + (err?.message ?? ''))
    } finally {
      setBusy(false)
    }
  }

  function startEdit(t: any) {
    setEditing({
      category_id: t.category_id ?? t.category?.id,
      target_days: Number(t.target_days ?? t.targetDays ?? 0),
      target_hours: Number(t.target_hours ?? t.targetHours ?? 0),
      target_minutes: Number(t.target_minutes ?? t.targetMinutes ?? 0),
    })
  }

  async function saveEdit() {
    if (!editing) return

    // Validate: at least one value must be > 0
    if (editing.target_days <= 0 && editing.target_hours <= 0 && editing.target_minutes <= 0) {
      setError('At least one of Days, Hours, or Minutes must be greater than 0')
      return
    }

    if (editing.target_days < 0 || editing.target_hours < 0 || editing.target_minutes < 0) {
      setError('Values cannot be negative')
      return
    }

    if (editing.target_hours > 23) {
      setError('Hours must be between 0 and 23')
      return
    }

    if (editing.target_minutes > 59) {
      setError('Minutes must be between 0 and 59')
      return
    }

    setBusy(true); setError(null)
    try {
      const headers = await getHeaders()
      // Send PascalCase keys expected by backend; proxy will route correctly.
      const payload = {
        CategoryId: editing.category_id,
        TargetDays: Number(editing.target_days),
        TargetHours: Number(editing.target_hours),
        TargetMinutes: Number(editing.target_minutes),
        // Also send snake_case for compatibility
        category_id: editing.category_id,
        target_days: Number(editing.target_days),
        target_hours: Number(editing.target_hours),
        target_minutes: Number(editing.target_minutes),
      }
      const res = await fetch('/api/management/target-days', {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        let errMsg = `${res.status} ${res.statusText}`
        try {
          const errData = JSON.parse(errText)
          errMsg = errData?.error || errData?.message || errMsg
        } catch {
          if (errText) errMsg = errText
        }
        throw new Error(errMsg)
      }
      setEditing(null); await load()
    } catch (err: any) {
      console.error(err)
      setError('Update failed: ' + (err?.message ?? ''))
    } finally {
      setBusy(false)
    }
  }

  async function deleteItem(t: any) {
    const cid = t.category_id ?? t.category?.id
    if (!cid) return
    if (!confirm(`Remove target duration for category "${t.category_name ?? t.category?.name}"?`)) return
    setBusy(true); setError(null)
    try {
      const headers = await getHeaders()
      const res = await fetch(`/api/management/target-days?id=${encodeURIComponent(cid)}`, {
        method: 'DELETE',
        headers,
        credentials: 'include'
      })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      await load()
    } catch (err: any) {
      console.error(err)
      setError('Delete failed: ' + (err?.message ?? ''))
    } finally {
      setBusy(false)
    }
  }

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto py-8">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-semibold">Category Target Days</h1>
            <p className="text-sm text-gray-500 mt-1">
              Set target duration (days, hours, minutes) for each category to define engineer assignment deadlines.
            </p>
          </div>
        </div>

        {/* Create new target duration */}
        <div className="bg-white rounded shadow p-4 mb-4">
          <h2 className="text-sm font-medium text-gray-700 mb-3">Add New Target Duration</h2>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="border rounded px-3 py-2 min-w-[200px]"
              >
                <option value="">Select category</option>
                {categories.map(c => {
                  const vid = String(c.category_id ?? c.id)
                  return <option key={vid} value={vid}>{c.name}</option>
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Days</label>
              <input
                value={targetDays}
                onChange={(e) => setTargetDays(Number(e.target.value) || 0)}
                placeholder="0"
                type="number"
                min="0"
                step="1"
                className="border rounded px-3 py-2 w-24"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Hours (0-23)</label>
              <input
                value={targetHours}
                onChange={(e) => setTargetHours(Number(e.target.value) || 0)}
                placeholder="0"
                type="number"
                min="0"
                max="23"
                step="1"
                className="border rounded px-3 py-2 w-24"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Minutes (0-59)</label>
              <input
                value={targetMinutes}
                onChange={(e) => setTargetMinutes(Number(e.target.value) || 0)}
                placeholder="0"
                type="number"
                min="0"
                max="59"
                step="1"
                className="border rounded px-3 py-2 w-24"
              />
            </div>
            <button
              onClick={saveTarget}
              disabled={busy}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              {busy ? 'Saving...' : 'Save'}
            </button>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            At least one of Days, Hours, or Minutes must be greater than 0.
            Example: &quot;0 days, 4 hours, 30 minutes&quot; means engineers must be assigned within 4.5 hours.
          </div>
        </div>

        {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">{error}</div>}

        {/* Target days list */}
        <div className="bg-white rounded shadow p-4">
          <h2 className="text-sm font-medium text-gray-700 mb-3">Existing Target Durations</h2>
          {loading ? <div>Loading…</div> : items.length === 0 ? <div className="text-gray-500">No data</div> : (
            <div className="overflow-x-auto">
              <table className="w-full table-auto border-collapse">
                <thead>
                  <tr className="text-left text-sm text-gray-600 border-b">
                    <th className="py-2 px-3">#</th>
                    <th className="py-2 px-3">Category</th>
                    <th className="py-2 px-3">Days</th>
                    <th className="py-2 px-3">Hours</th>
                    <th className="py-2 px-3">Minutes</th>
                    <th className="py-2 px-3">Total Duration</th>
                    <th className="py-2 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t, idx) => {
                    const cid = t.category_id ?? t.category?.id
                    const editingThis = editing && editing.category_id === cid
                    const days = Number(t.target_days ?? t.targetDays ?? 0)
                    const hours = Number(t.target_hours ?? t.targetHours ?? 0)
                    const minutes = Number(t.target_minutes ?? t.targetMinutes ?? 0)

                    return (
                      <tr key={String(cid)} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3 text-sm">{idx + 1}</td>
                        <td className="py-2 px-3">
                          {editingThis ? (
                            <select
                              value={String(editing!.category_id)}
                              onChange={(e) => setEditing({ ...editing!, category_id: Number(e.target.value) })}
                              className="border p-1 rounded"
                            >
                              {categories.map(c => {
                                const vid = c.category_id ?? c.id
                                return <option key={vid} value={vid}>{c.name}</option>
                              })}
                            </select>
                          ) : (
                            <span>{t.category_name ?? t.category?.name}</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {editingThis ? (
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={editing!.target_days}
                              onChange={(e) => setEditing({ ...editing!, target_days: Number(e.target.value) || 0 })}
                              className="border p-1 rounded w-20"
                            />
                          ) : (
                            <span>{days}</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {editingThis ? (
                            <input
                              type="number"
                              min="0"
                              max="23"
                              step="1"
                              value={editing!.target_hours}
                              onChange={(e) => setEditing({ ...editing!, target_hours: Number(e.target.value) || 0 })}
                              className="border p-1 rounded w-20"
                            />
                          ) : (
                            <span>{hours}</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {editingThis ? (
                            <input
                              type="number"
                              min="0"
                              max="59"
                              step="1"
                              value={editing!.target_minutes}
                              onChange={(e) => setEditing({ ...editing!, target_minutes: Number(e.target.value) || 0 })}
                              className="border p-1 rounded w-20"
                            />
                          ) : (
                            <span>{minutes}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-sm text-gray-600">
                          {formatDuration(t)}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            {editingThis ? (
                              <>
                                <button onClick={saveEdit} disabled={busy} className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700">Save</button>
                                <button onClick={() => setEditing(null)} className="px-3 py-1 text-sm hover:bg-gray-100 rounded">Cancel</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => startEdit(t)} className="px-3 py-1 text-sm hover:bg-gray-100 rounded">Edit</button>
                                <button onClick={() => deleteItem(t)} className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700">Delete</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  )
}