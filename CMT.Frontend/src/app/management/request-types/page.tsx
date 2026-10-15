'use client'

import RequireRole from '@/components/RequireRole'
import { MainLayout } from '@/components/layout/main-layout'
import { useEffect, useState } from 'react'
import { getCsrfToken } from '@/lib/csrf'
import { useAuth } from '@/lib/auth-context'
import { useTLPermissions } from '@/lib/tl-permissions-context'
import { useRouter } from 'next/navigation'

export default function RequestTypesPageWrapper() {
  return (
    <RequireRole allowed={['team_leader','director']}>
      <RequestTypesPageGuard />
    </RequireRole>
  )
}

/** Guard: redirect TLs who lack canManageTaskTypes */
function RequestTypesPageGuard() {
  const { user } = useAuth()
  const { tlPermissions, isLoadingTLPermissions } = useTLPermissions()
  const router = useRouter()
  const userRole = (user?.role ?? '').toString().toLowerCase().replace(/[\s\-]+/g, '_')
  const isTeamLeader = userRole === 'team_leader' || userRole === 'teamleader'

  useEffect(() => {
    if (isTeamLeader && !isLoadingTLPermissions && tlPermissions && !tlPermissions.canManageTaskTypes) {
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

  if (isTeamLeader && tlPermissions && !tlPermissions.canManageTaskTypes) {
    return null
  }

  return <RequestTypesPage />
}

function RequestTypesPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(()=>{ load() }, [])

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
      const res = await fetch('/api/management/request-types', {
        credentials: 'include'
      })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const json = await res.json()
      const list = Array.isArray(json) ? json : json?.data ?? json ?? []
      setItems(list)
    } catch (err:any) { console.error('Failed to fetch request types:', err); setError('Failed to load request types. ' + (err?.message??'')) } finally { setLoading(false) }
  }

 async function createRequestType() {
    const trimmedName = name.trim()
    if (!trimmedName) return

    // 1. Client-side duplicate check
    const exists = items.some(item => item.name?.toLowerCase() === trimmedName.toLowerCase())
    if (exists) {
      setError('A request type with this name already exists.')
      return
    }

    setBusy(true); setError(null)
    try {
      const headers = await getHeaders()
      const res = await fetch('/api/management/request-types', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ name: trimmedName })
      })

      // 2. Handle specific 409 Conflict
      if (res.status === 409) {
        throw new Error('This request type already exists on the server.')
      }

      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      
      setName(''); await load()
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Create failed')
    } finally { setBusy(false) }
  }
  
  function startEdit(r:any) { setEditingId(Number(r.request_type_id ?? r.id)); setEditingName(r.name) }

  async function saveEdit() {
  // Use a strict null check since 0 could be a valid ID in some databases
  if (editingId === null) return;

  // 1. Client-side duplicate check: Prevent sending a request if the name already exists
  const isDuplicate = items.some(item => 
    (item.request_type_id !== editingId && item.id !== editingId) && 
    (item.name?.toLowerCase() === editingName.trim().toLowerCase())
  );

  if (isDuplicate) {
    setError('A request type with this name already exists.');
    return;
  }

  setBusy(true); 
  setError(null);

  try {
    const headers = await getHeaders()
    const res = await fetch('/api/management/request-types', { 
      method: 'PUT', 
      headers, 
      credentials: 'include',
      body: JSON.stringify({ 
        request_type_id: editingId, 
        name: editingName.trim() 
      }) 
    });

    // 2. Handle specific status codes to avoid generic "Update failed" messages
    if (!res.ok) {
      let errorMessage = `${res.status} ${res.statusText}`;
      
      // Try to get a specific error message from the server body
      try {
        const errorData = await res.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch (e) {
        // Fallback if response is not JSON
      }

      if (res.status === 409) {
        throw new Error('This name is already taken.');
      }
      
      if (res.status === 500) {
        throw new Error('Server error: Please check your database connection.');
      }

      throw new Error(errorMessage);
    }

    // 3. Success Path
    setEditingId(null); 
    setEditingName(''); 
    await load(); 

  } catch (err: any) { 
    console.error('Update failed:', err); 
    setError('Update failed: ' + err.message); 
  } finally { 
    setBusy(false); 
  }
}

  async function deleteItem(r:any) {
    const id = r.request_type_id ?? r.id
    if (!id) return
    if (!confirm(`Delete request type "${r.name}"?`)) return
    setBusy(true); setError(null)
    try {
      const headers = await getHeaders()
      const res = await fetch(`/api/management/request-types?id=${encodeURIComponent(id)}`, { 
        method:'DELETE',
        headers,
        credentials: 'include'
      })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      await load()
    } catch (err:any) { console.error(err); setError('Delete failed: '+(err?.message??'')) } finally { setBusy(false) }
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto py-8">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-semibold">Manage Request Types</h1>
          <div className="flex gap-2">
            <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Request type" className="border rounded px-3 py-2" />
            <button onClick={createRequestType} disabled={busy} className="px-3 py-2 bg-green-600 text-white rounded">{busy ? 'Adding...' : 'Add'}</button>
          </div>
        </div>

        {error && <div className="mb-3 text-red-600">{error}</div>}

        <div className="bg-white rounded shadow p-4">
          {loading ? <div>Loading…</div> : items.length === 0 ? <div>No request types</div> : (
            <ul className="space-y-2">
              {items.map(r => {
                const id = r.request_type_id ?? r.id
                const editing = editingId === Number(id)
                return (
                  <li key={String(id)} className="p-2 border rounded flex items-center justify-between">
                    <div className="flex-1">
                      {editing ? <input className="border p-1 rounded w-full" value={editingName} onChange={(e)=>setEditingName(e.target.value)} /> : <div>{r.name}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      {editing ? (
                        <>
                          <button onClick={saveEdit} disabled={busy} className="px-3 py-1 bg-green-600 text-white rounded">Save</button>
                          <button onClick={()=>{ setEditingId(null); setEditingName('') }} className="px-3 py-1">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={()=>startEdit(r)} className="px-3 py-1">Edit</button>
                          <button onClick={()=>deleteItem(r)} className="px-3 py-1 bg-red-600 text-white rounded">Delete</button>
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