'use client'

import RequireRole from '@/components/RequireRole'
import { MainLayout } from '@/components/layout/main-layout'
import { useEffect, useState } from 'react'
import { getCsrfToken } from '@/lib/csrf'
import { useAuth } from '@/lib/auth-context'
import { useTLPermissions } from '@/lib/tl-permissions-context'
import { useRouter } from 'next/navigation'

export default function PrioritiesPageWrapper() {
  return (
    <RequireRole allowed={['team_leader','director']}>
      <PrioritiesPageGuard />
    </RequireRole>
  )
}

/** Guard: redirect TLs who lack canManagePriorities */
function PrioritiesPageGuard() {
  const { user } = useAuth()
  const { tlPermissions, isLoadingTLPermissions } = useTLPermissions()
  const router = useRouter()
  const userRole = (user?.role ?? '').toString().toLowerCase().replace(/[\s\-]+/g, '_')
  const isTeamLeader = userRole === 'team_leader' || userRole === 'teamleader'

  useEffect(() => {
    if (isTeamLeader && !isLoadingTLPermissions && tlPermissions && !tlPermissions.canManagePriorities) {
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

  if (isTeamLeader && tlPermissions && !tlPermissions.canManagePriorities) {
    return null
  }

  return <PrioritiesPage />
}

function PrioritiesPage() {
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
      const res = await fetch('/api/management/priorities', {
        credentials: 'include'
      })
      if (!res.ok) {
        let body = ''
        try { body = await res.text() } catch (_) {}
        throw new Error(`${res.status} ${res.statusText}${body ? ' - ' + body : ''}`)
      }
      const json = await res.json()
      const list = Array.isArray(json) ? json : json?.data ?? json ?? []
      setItems(list)
    } catch (err:any) { console.error('Failed to fetch priorities:', err); setError('Failed to load priorities. ' + (err?.message??'')) } finally { setLoading(false) }
  }

async function createPriority() {
  const trimmedName = name.trim();
  if (!trimmedName) return;

  // 1. Client-side duplicate check (Pre-flight)
  const exists = items.some(item => 
    (item.level_name?.toLowerCase() === trimmedName.toLowerCase()) || 
    (item.name?.toLowerCase() === trimmedName.toLowerCase())
  );
  
  if (exists) {
    setError('A priority with this name already exists.');
    return;
  }

  setBusy(true);
  setError(null);

  try {
    const headers = await getHeaders()
    const res = await fetch('/api/management/priorities', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ level_name: trimmedName })
    });

    // 2. Handle specific status codes while 'res' is in scope
    if (res.status === 409) {
      throw new Error('This priority level already exists on the server.');
    }

    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch (_) {}
      throw new Error(`${res.status} ${res.statusText}${body ? ' - ' + body : ''}`);
    }

    // Success path
    setName('');
    await load();
  } catch (err: any) {
    // If we reach here, 'res' is not accessible, so we rely on the Error message
    console.error('Priority creation failed:', err.message);
    setError(err.message || 'Create failed');
  } finally {
    setBusy(false);
  }
}
  function startEdit(p:any) { setEditingId(Number(p.priority_id ?? p.id)); setEditingName(p.level_name ?? p.name ?? '') }

  async function saveEdit() {
  if (editingId === null) return
  
  // ADD THIS: Prevent duplicate names before calling the API
  const isDuplicate = items.some(item => 
    (item.priority_id !== editingId && item.id !== editingId) && 
    (item.level_name?.toLowerCase() === editingName.trim().toLowerCase())
  );

  if (isDuplicate) {
    setError('A priority with this name already exists.');
    return;
  }

  setBusy(true); setError(null)
  try {
    const headers = await getHeaders()
    const res = await fetch('/api/management/priorities', {
      method: 'PUT',
      headers,
      credentials: 'include',
      body: JSON.stringify({ priority_id: editingId, level_name: editingName })
    })
    
    if (!res.ok) {
      let body = ''
      try { body = await res.text() } catch (_) {}
      // If server still returns 409, show a friendly message
      if (res.status === 409) throw new Error('Name already taken on server.');
      throw new Error(`${res.status} ${res.statusText}${body ? ' - ' + body : ''}`)
    }
    setEditingId(null); setEditingName(''); await load()
  } catch (err:any) { 
    console.error(err); 
    setError('Update failed: ' + err.message) 
  } finally { 
    setBusy(false) 
  }
}

  async function deleteItem(p:any) {
    const id = p.priority_id ?? p.id
    if (id == null) return
    if (!confirm(`Delete priority "${p.level_name ?? p.name}"?`)) return
    setBusy(true); setError(null)
    try {
      const headers = await getHeaders()
      const res = await fetch(`/api/management/priorities?id=${encodeURIComponent(id)}`, { 
        method: 'DELETE',
        headers,
        credentials: 'include'
      })
      if (!res.ok) {
        let body = ''
        try { body = await res.text() } catch (_) {}
        throw new Error(`${res.status} ${res.statusText}${body ? ' - ' + body : ''}`)
      }
      await load()
    } catch (err:any) { console.error(err); setError('Delete failed: ' + (err?.message??'')) } finally { setBusy(false) }
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto py-8">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-semibold">Manage Priorities</h1>
          <div className="flex gap-2">
            <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Priority name" className="border rounded px-3 py-2" />
            <button onClick={createPriority} disabled={busy || !name.trim()} className="px-3 py-2 bg-green-600 text-white rounded">{busy ? 'Adding...' : 'Add'}</button>
          </div>
        </div>

        {error && <div className="mb-3 text-red-600">{error}</div>}

        <div className="bg-white rounded shadow p-4">
          {loading ? <div>Loading…</div> : items.length === 0 ? <div>No priorities</div> : (
            <ul className="space-y-2">
              {items.map(p => {
                const id = p.priority_id ?? p.id
                const isEditing = editingId === Number(id)
                return (
                  <li key={String(id)} className="p-2 border rounded flex items-center justify-between">
                    <div className="flex-1">
                      {isEditing ? (
                        <input className="border p-1 rounded w-full" value={editingName} onChange={(e)=>setEditingName(e.target.value)} />
                      ) : (
                        <div className="font-medium">{p.level_name ?? p.name}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <button onClick={saveEdit} disabled={busy} className="px-3 py-1 bg-green-600 text-white rounded">Save</button>
                          <button onClick={()=>{ setEditingId(null); setEditingName('') }} className="px-3 py-1">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={()=>startEdit(p)} className="px-3 py-1">Edit</button>
                          <button onClick={()=>deleteItem(p)} className="px-3 py-1 bg-red-600 text-white rounded">Delete</button>
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