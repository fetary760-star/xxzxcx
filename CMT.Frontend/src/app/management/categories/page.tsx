'use client'

import RequireRole from '@/components/RequireRole'
import { MainLayout } from '@/components/layout/main-layout'
import { useEffect, useState } from 'react'
import { getCsrfToken } from '@/lib/csrf'
import { useAuth } from '@/lib/auth-context'
import { useTLPermissions } from '@/lib/tl-permissions-context'
import { useRouter } from 'next/navigation'

export default function CategoriesPageWrapper() {
  return (
    <RequireRole allowed={['team_leader','director','manager','admin']}>
      <CategoriesPageGuard />
    </RequireRole>
  )
}

/** Guard: redirect TLs who lack canManageCategories */
function CategoriesPageGuard() {
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

  return <CategoriesPage />
}

function CategoriesPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
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
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/management/categories', {
        credentials: 'include'
      })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const json = await res.json()
      const list = Array.isArray(json) ? json : json?.data ?? json ?? []
      setItems(list)
    } catch (err:any) {
      console.error('Failed to fetch categories:', err)
      setError('Failed to load categories. ' + (err?.message ?? ''))
    } finally { setLoading(false) }
  }

  async function createCategory() {
    const trimmedName = name.trim()
    if (!trimmedName) return

    // Client-side duplicate check
    const exists = items.some(item => 
      (item.name?.toLowerCase() === trimmedName.toLowerCase()) || 
      (item.title?.toLowerCase() === trimmedName.toLowerCase())
    )
    
    if (exists) {
      setError('A category with this name already exists in the list.')
      return
    }

    setBusy(true)
    setError(null)

    try {
      const headers = await getHeaders()
      const res = await fetch('/api/management/categories', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ name: trimmedName })
      })

      if (!res.ok) {
        let errorMessage = "Server rejected this name"
        try {
          const errorData = await res.json()
          errorMessage = errorData.error || errorData.message || errorMessage
        } catch (e) { /* ignore JSON parse error */ }
        
        setError(errorMessage)
        return
      }
      
      // Success path
      setName('')
      await load()
    } catch (err: any) {
      console.error('Create failed', err)
      setError('Network error. Check your connection.')
    } finally { 
      setBusy(false) 
    }
  }
  
  function startEdit(c:any) {
    setEditingId(Number(c.category_id ?? c.id))
    setEditingName(c.name ?? c.title ?? '')
  }

  async function saveEdit() {
    // Guard against empty ID
    if (!editingId) return

    // Client-side duplicate check
    const isDuplicate = items.some(item => 
      (Number(item.category_id ?? item.id) !== editingId) && 
      ((item.name || item.title)?.toLowerCase() === editingName.trim().toLowerCase())
    )

    if (isDuplicate) {
      setError('A category with this name already exists.')
      return
    }

    setBusy(true)
    setError(null)

    try {
      const headers = await getHeaders()
      const res = await fetch('/api/management/categories', {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify({ 
          category_id: editingId, 
          name: editingName.trim() 
        })
      })

      // Handle specific server responses
      if (!res.ok) {
        let errorMessage = `Update failed (${res.status})`
        
        try {
          const data = await res.json()
          errorMessage = data.error || data.message || errorMessage
        } catch (e) { /* ignore if not JSON */ }

        if (res.status === 409) {
          setError('This name is already in use on the server.')
        } else if (res.status === 403) {
          setError('Access denied. You do not have permission to update categories.')
        } else if (res.status === 500) {
          setError('Server Error (500): Could not update database.')
        } else {
          setError(errorMessage)
        }
        
        return
      }
      
      // Success path
      setEditingId(null)
      setEditingName('')
      await load()
      
    } catch (err: any) {
      console.error('Update failed', err)
      setError('Network error: ' + (err.message || 'Check your connection'))
    } finally {
      setBusy(false)
    }
  }

  async function deleteItem(c: any) {
    const id = c.category_id ?? c.id
    if (id == null) return
    if (!confirm(`Delete category "${c.name}"?`)) return
    
    setBusy(true)
    setError(null)
    
    try {
      const headers = await getHeaders()
      const res = await fetch(`/api/management/categories?id=${encodeURIComponent(id)}`, { 
        method: 'DELETE',
        headers,
        credentials: 'include'
      })
      
      if (!res.ok) {
        let errorMessage = 'Server refused to delete category'
        try {
          const data = await res.json()
          errorMessage = data.error || data.message || errorMessage
        } catch (e) { /* ignore */ }
        throw new Error(errorMessage)
      }
      
      await load()
    } catch (err: any) { 
      setError('Delete failed: ' + err.message)
    } finally { 
      setBusy(false)
    }
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto py-8">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-semibold">Manage Categories</h1>
          <div className="flex gap-2">
            <input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder="New category name" 
              className="border rounded px-3 py-2" 
            />
            <button 
              onClick={createCategory} 
              disabled={busy} 
              className="px-3 py-2 bg-green-600 text-white rounded disabled:opacity-50"
            >
              {busy ? 'Adding...' : 'Add'}
            </button>
          </div>
        </div>

        {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-600 rounded">{error}</div>}

        <div className="bg-white rounded shadow p-4">
          {loading ? (
            <div className="text-center py-4">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-center py-4 text-gray-500">No categories</div>
          ) : (
            <ul className="space-y-2">
              {items.map((c:any) => {
                const id = c.category_id ?? c.id
                const isEditing = editingId === Number(id)
                return (
                  <li key={String(id)} className="p-2 border rounded flex items-center justify-between">
                    <div className="flex-1">
                      {isEditing ? (
                        <input 
                          className="border p-1 rounded w-full" 
                          value={editingName} 
                          onChange={(e) => setEditingName(e.target.value)} 
                        />
                      ) : (
                        <div className="font-medium">{c.name ?? c.title}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <button 
                            onClick={saveEdit} 
                            disabled={busy} 
                            className="px-3 py-1 bg-green-600 text-white rounded disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button 
                            onClick={() => { setEditingId(null); setEditingName('') }} 
                            className="px-3 py-1 border rounded"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button 
                            onClick={() => startEdit(c)} 
                            className="px-3 py-1 border rounded hover:bg-gray-50"
                          >
                            Edit
                          </button>
                          <button 
                            onClick={() => deleteItem(c)} 
                            className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </MainLayout>
  )
}