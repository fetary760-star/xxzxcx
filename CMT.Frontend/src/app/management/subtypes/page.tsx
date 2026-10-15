'use client'

import RequireRole from '@/components/RequireRole'
import { MainLayout } from '@/components/layout/main-layout'
import { useEffect, useState } from 'react'
import { getCsrfToken } from '@/lib/csrf'
import { useAuth } from '@/lib/auth-context'
import { useTLPermissions } from '@/lib/tl-permissions-context'
import { useRouter } from 'next/navigation'

export default function SubTypesPageWrapper() {
  return (
    <RequireRole allowed={['team_leader','director']}>
      <SubTypesPageGuard />
    </RequireRole>
  )
}

/** Guard: redirect TLs who lack canManageTaskTypes */
function SubTypesPageGuard() {
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

  return <SubTypesPage />
}

function SubTypesPage() {
  const [items, setItems] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [editing, setEditing] = useState<{ id:number, name:string, categoryId:any } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string|null>(null)

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

  // Try a list of candidate endpoints until one succeeds
  async function fetchWithFallback(endpoints: string[]) {
    let lastErr: any = null
    for (const ep of endpoints) {
      try {
        const res = await fetch(ep, { credentials: 'include' })
        if (!res.ok) {
          lastErr = new Error(`${res.status} ${res.statusText}`)
          // if 404/401/403 we continue to next candidate so we get best chance
          continue
        }
        const json = await res.json()
        return Array.isArray(json) ? json : json?.data ?? json ?? []
      } catch (e) {
        lastErr = e
        continue
      }
    }
    throw lastErr ?? new Error('No endpoints available')
  }

  async function load() {
    setLoading(true); setError(null)
    try {
      // load categories (single canonical endpoint - keep original)
      try {
        const catsRes = await fetch('/api/management/categories', { credentials: 'include' })
        if (!catsRes.ok) throw new Error(`${catsRes.status} ${catsRes.statusText}`)
        const catsJson = await catsRes.json()
        setCategories(Array.isArray(catsJson) ? catsJson : catsJson?.data ?? catsJson ?? [])
      } catch (catErr) {
        // non-fatal: categories may exist at /api/reference-data/categories — try fallback
        try {
          const c2 = await fetch('/api/reference-data/categories', { credentials: 'include' })
          if (c2.ok) {
            const cj = await c2.json()
            setCategories(Array.isArray(cj) ? cj : cj?.data ?? cj ?? [])
          } else {
            setCategories([])
          }
        } catch {
          setCategories([])
        }
      }

      // candidate endpoints to try (ordered)
      const candidates = [
        '/api/management/subtypes',
        '/api/management/sub-types',
        '/api/management/reference-data/sub-types',
        '/api/reference-data/sub-types',
        '/api/reference-data/subtypes',
        '/api/subtypes',
        '/api/reference/sub-types'
      ]

      const list = await fetchWithFallback(candidates)
      setItems(list)
    } catch (err:any) {
      console.error('Load failed', err)
      setError('Load failed: ' + (err?.message ?? '404'))
      setItems([])
    } finally {
      setLoading(false)
    }
  }

async function createSubType() {
    const trimmedName = name.trim()
    if (!trimmedName || !categoryId) return

    // 1. Client-side duplicate check
    const exists = items.some(item => 
      item.name?.toLowerCase() === trimmedName.toLowerCase() && 
      Number(item.category_id ?? item.categoryId) === Number(categoryId)
    )
    if (exists) {
      setError('This sub-type already exists under this category.')
      return
    }

    setBusy(true); setError(null)
    try {
      const headers = await getHeaders()
      const payload = { name: trimmedName, categoryId: Number(categoryId) }
      let res = await fetch('/api/management/subtypes', { 
        method: 'POST', 
        headers, 
        credentials: 'include', 
        body: JSON.stringify(payload) 
      })

      // 2. Handle 409 Conflict specifically
      if (res.status === 409) {
        throw new Error('This sub-type name is already taken.')
      }

      if (!res.ok) {
        // Fallback endpoint
        res = await fetch('/api/reference-data/sub-types', { 
          method: 'POST', 
          headers, 
          credentials: 'include', 
          body: JSON.stringify(payload) 
        })
        
        if (res.status === 409) throw new Error('This sub-type name is already taken.')
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      }

      setName(''); setCategoryId(''); await load()
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Create failed')
    } finally { setBusy(false) }
  }
  // edits / delete similar: use /api/management/subtypes and fallback to /api/reference-data/sub-types
  function startEdit(s:any) { setEditing({ id: Number(s.sub_type_id ?? s.id), name: s.name, categoryId: s.category_id ?? s.category?.id }) }

 async function saveEdit() {
  if (!editing) return;
  
  // 1. Client-side Duplicate Check
  // Prevents the "409" or "500" error by checking if the name already exists 
  // in the current list for a DIFFERENT item.
  const isDuplicate = items.some(item => 
    (Number(item.sub_type_id ?? item.id) !== editing.id) && 
    (item.name?.toLowerCase() === editing.name.trim().toLowerCase())
  );

  if (isDuplicate) {
    setError('A sub-type with this name already exists.');
    return;
  }

  setBusy(true); 
  setError(null);

  try {
    const headers = await getHeaders()
    const payload = { 
      sub_type_id: editing.id, 
      name: editing.name.trim(), 
      categoryId: Number(editing.categoryId) 
    };

    // Attempt 1: Management API
    let res = await fetch('/api/management/subtypes', { 
      method: 'PUT', 
      headers, 
      credentials: 'include', 
      body: JSON.stringify(payload) 
    });

    // 2. If the first one fails, try the fallback Reference-Data API
    if (!res.ok) {
      res = await fetch('/api/reference-data/sub-types/' + encodeURIComponent(editing.id), { 
        method: 'PUT', 
        headers, 
        credentials: 'include', 
        body: JSON.stringify({ name: editing.name, categoryId: Number(editing.categoryId) }) 
      });
    }

    // 3. Robust Error Handling
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      
      // Try to extract the specific server error (e.g., "Priority with this name exists")
      try {
        const errJson = await res.json();
        msg = errJson?.error || errJson?.message || msg;
      } catch {}

      if (res.status === 409) msg = "This name is already taken.";
      if (res.status === 500) msg = "Server Error (500): Database update failed.";

      throw new Error(msg);
    }

    // Success Path
    setEditing(null); 
    await load(); 

  } catch (err: any) { 
    console.error('Update failed:', err); 
    setError('Update failed: ' + err.message); 
  } finally { 
    setBusy(false); 
  }
}
  async function deleteItem(s:any) {
    const id = s.sub_type_id ?? s.id
    if (!id) return
    if (!confirm(`Delete sub-type "${s.name}"?`)) return
    setBusy(true); setError(null)
    try {
      const headers = await getHeaders()
      let res = await fetch(`/api/management/subtypes?id=${encodeURIComponent(id)}`, { 
        method:'DELETE', 
        headers,
        credentials:'include' 
      })
      if (!res.ok) {
        res = await fetch(`/api/reference-data/sub-types/${encodeURIComponent(id)}`, { 
          method:'DELETE', 
          headers,
          credentials:'include' 
        })
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      }
      await load()
    } catch (err:any) { console.error(err); setError('Delete failed: ' + (err?.message??'')) } finally { setBusy(false) }
  }

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto py-8">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-semibold">Manage Sub Types</h1>
          <div className="flex gap-2">
            <select value={categoryId} onChange={(e)=>setCategoryId(e.target.value)} className="border rounded px-3 py-2">
              <option value="">Select category</option>
              {categories.map(c => <option key={c.category_id ?? c.id} value={c.category_id ?? c.id}>{c.name}</option>)}
            </select>
            <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Sub type name" className="border rounded px-3 py-2" />
            <button onClick={createSubType} disabled={busy} className="px-3 py-2 bg-green-600 text-white rounded">{busy ? 'Adding...' : 'Add'}</button>
          </div>
        </div>

        {error && <div className="mb-3 text-red-600">{error}</div>}

        <div className="bg-white rounded shadow p-4">
          {loading ? <div>Loading…</div> : items.length === 0 ? <div>No sub types</div> : (
            <ul className="space-y-2">
              {items.map(s => {
                const id = s.sub_type_id ?? s.id
                const isEditing = editing?.id === Number(id)
                return (
                  <li key={String(id)} className="p-2 border rounded flex items-center justify-between">
                    <div className="flex-1">
                      {isEditing ? (
                        <div className="flex gap-2">
                          <input className="border p-1 rounded flex-1" value={editing!.name} onChange={(e)=>setEditing({...editing!, name: e.target.value})} />
                          <select value={editing!.categoryId} onChange={(e)=>setEditing({...editing!, categoryId: e.target.value})} className="border p-1 rounded">
                            <option value="">Select</option>
                            {categories.map(c => <option key={c.category_id ?? c.id} value={c.category_id ?? c.id}>{c.name}</option>)}
                          </select>
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium">{s.name}</div>
                          <div className="text-xs text-gray-500">{s.category_name ?? s.category?.name}</div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <button onClick={saveEdit} disabled={busy} className="px-3 py-1 bg-green-600 text-white rounded">Save</button>
                          <button onClick={()=>setEditing(null)} className="px-3 py-1">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={()=>startEdit(s)} className="px-3 py-1">Edit</button>
                          <button onClick={()=>deleteItem(s)} className="px-3 py-1 bg-red-600 text-white rounded">Delete</button>
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