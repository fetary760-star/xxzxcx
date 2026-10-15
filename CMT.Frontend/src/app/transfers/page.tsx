'use client'

import React, { useEffect, useState } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getCsrfToken } from '@/lib/csrf'
import { useRolePermissions } from '@/hooks/useRolePermissions'

type Transfer = {
  transfer_id?: number
  id?: number
  from_shop?: string
  to_shop?: string
  from_shop_id?: number
  to_shop_id?: number
  part_number?: string
  serial_number?: string
  status?: string
  created_at?: string
  created_by?: number
  [k: string]: any
}

type Shop = {
  shop_id?: number
  shopId?: number
  id?: number
  name?: string
  shop_name?: string
  shopName?: string
  location?: string
  [k: string]: any
}

/** normalize role string/number */
function canonicalizeRole(raw: any): string {
  if (raw === undefined || raw === null) return ''
  if (typeof raw === 'number') return String(raw)
  return String(raw).toLowerCase().trim().replace(/[\s\-_]+/g, '_')
}

/** Get shop ID from shop object */
function getShopId(shop: Shop): number {
  return shop.shop_id ?? shop.shopId ?? shop.id ?? 0
}

/** Get shop name from shop object */
function getShopName(shop: Shop): string {
  return shop.name ?? shop.shop_name ?? shop.shopName ?? 'Unknown Shop'
}

export default function TransfersPage(): JSX.Element {
  const { user, token } = useAuth()
  // SECURITY FIX: Use in-memory permissions matrix from hook instead of reading localStorage.
  // The hook fetches the matrix from the backend and keeps it in memory only (never persisted).
  const { matrix: rolePermissionsMatrix, loading: permissionsLoading } = useRolePermissions()

  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [loading, setLoading] = useState(false)
  const [shopsLoading, setShopsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // create dialog state + form
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [fromShopId, setFromShopId] = useState<string>('')
  const [toShopId, setToShopId] = useState<string>('')
  const [serialNumber, setSerialNumber] = useState('')
  const [partNumber, setPartNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const role = canonicalizeRole(user?.role ?? user?.role_name ?? user?.roleName ?? '')
  // Admin and Director always have full access; other roles check the matrix `transfers` permission
  const isPrivileged = ['admin', 'director'].includes(role)
  const roleAllowedToView = ['engineer','team_leader','director','customer_personnel','shop_tl','manager','shop_manager'].includes(role)
  const roleAllowedToCreate = ['team_leader','director','customer_personnel','shop_tl','manager','shop_manager'].includes(role)

  // SECURITY FIX: Evaluate the matrix from the in-memory hook instead of localStorage.
  // If the matrix is still loading, allow by default (UI will still be gated by backend).
  const matrixTransfersGranted = isPrivileged || (() => {
    try {
      if (!rolePermissionsMatrix) return true // matrix not yet loaded -> allow; backend remains the source of truth
      const rolePerms = (rolePermissionsMatrix as Record<string, Record<string, boolean>>)[role]
      if (!rolePerms) return true // unknown role, allow by default
      return rolePerms['transfers'] !== false
    } catch {
      return true
    }
  })()

  const canView = roleAllowedToView && matrixTransfersGranted
  const canCreate = roleAllowedToCreate && matrixTransfersGranted

  // Load shops for dropdown
  useEffect(() => {
    let mounted = true
    const loadShops = async () => {
      setShopsLoading(true)
      try {
        const headers: HeadersInit = {
          'Content-Type': 'application/json'
        }
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        const res = await fetch('/api/shops', {
          method: 'GET',
          headers,
          credentials: 'include'
        })

        if (!mounted) return
        if (res.ok) {
          const data = await res.json().catch(() => null)
          let shopList: Shop[] = []
          if (Array.isArray(data)) shopList = data
          else if (Array.isArray(data?.shops)) shopList = data.shops
          else if (Array.isArray(data?.data)) shopList = data.data
          setShops(shopList)
        }
      } catch (err) {
        // Silently handle shop loading errors
      } finally {
        if (mounted) setShopsLoading(false)
      }
    }

    if (canView) {
      void loadShops()
    }
    return () => { mounted = false }
  }, [token, canView])

  // Load transfers
  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const headers: HeadersInit = {
          'Content-Type': 'application/json'
        }

        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        const res = await fetch('/api/transfers', {
          method: 'GET',
          headers,
          credentials: 'include'
        })

        if (!mounted) return
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          let msg = text || `Failed to load transfers (${res.status})`

          try {
            const errorData = JSON.parse(text)
            msg = errorData.error || errorData.message || msg
          } catch {
            // text is not JSON, use as-is
          }

          setError(msg)
          return
        }
        const data = await res.json().catch(() => null)
        let list: any[] = []
        if (Array.isArray(data)) list = data
        else if (Array.isArray(data?.transfers)) list = data.transfers
        else if (Array.isArray(data?.data)) list = data.data
        else list = []
        setTransfers(list)
      } catch (err: any) {
        setError(err?.message ?? 'Failed to load transfers')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    // Wait until permissions matrix has finished loading before deciding access
    if (permissionsLoading) return

    if (!canView) {
      setError('You are not authorized to view transfers.')
      setTransfers([])
      setLoading(false)
      return
    }

    void load()
    return () => { mounted = false }
  }, [user, role, token, canView, permissionsLoading])

  const handleCreate = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      if (!fromShopId || !toShopId || (!serialNumber && !partNumber)) {
        setError('Please select from/to shops and provide either serial or part number.')
        return
      }

      if (fromShopId === toShopId) {
        setError('From shop and To shop cannot be the same.')
        return
      }

      const payload = {
        from_shop_id: parseInt(fromShopId, 10),
        to_shop_id: parseInt(toShopId, 10),
        serial_number: serialNumber || undefined,
        part_number: partNumber || undefined,
        notes: notes || undefined,
        created_by: (user?.userId ?? user?.id ?? user?.user_id) ?? undefined
      }

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const csrfToken = await getCsrfToken()
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken
      }

      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const t = await res.text().catch(() => '')
        let errorMsg = t || `Create failed: ${res.status}`

        try {
          const errorData = JSON.parse(t)
          errorMsg = errorData.error || errorData.message || errorMsg
        } catch {
          // text is not JSON, use as-is
        }

        setError(errorMsg)
        return
      }
      const created = await res.json().catch(() => null)
      const newT = created?.transfer ?? created?.data ?? created
      setTransfers((prev) => [newT, ...prev])
      setIsCreateOpen(false)
      setFromShopId(''); setToShopId(''); setSerialNumber(''); setPartNumber(''); setNotes('')
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create transfer')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Transfers</h2>
          <div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button disabled={!canCreate}>Create Transfer</Button>
              </DialogTrigger>

              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Create Transfer</DialogTitle></DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">From Shop</label>
                    <Select value={fromShopId} onValueChange={setFromShopId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={shopsLoading ? "Loading shops..." : "Select source shop"} />
                      </SelectTrigger>
                      <SelectContent>
                        {shops.map((shop) => {
                          const id = getShopId(shop)
                          const name = getShopName(shop)
                          return (
                            <SelectItem key={id} value={String(id)}>
                              {name}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">To Shop</label>
                    <Select value={toShopId} onValueChange={setToShopId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={shopsLoading ? "Loading shops..." : "Select destination shop"} />
                      </SelectTrigger>
                      <SelectContent>
                        {shops.map((shop) => {
                          const id = getShopId(shop)
                          const name = getShopName(shop)
                          return (
                            <SelectItem key={id} value={String(id)}>
                              {name}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Serial Number</label>
                      <Input
                        value={serialNumber}
                        onChange={(e) => setSerialNumber((e.target as HTMLInputElement).value)}
                        placeholder="Enter serial number"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Part Number</label>
                      <Input
                        value={partNumber}
                        onChange={(e) => setPartNumber((e.target as HTMLInputElement).value)}
                        placeholder="Enter part number"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Notes</label>
                    <textarea
                      className="w-full p-2 border rounded-md"
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes((e.target as HTMLTextAreaElement).value)}
                      placeholder="Optional notes about this transfer"
                    />
                  </div>

                  {error && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                      {error}
                    </div>
                  )}

                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={() => setIsCreateOpen(false)} type="button">Cancel</Button>
                    <Button type="submit" disabled={submitting || shopsLoading}>
                      {submitting ? 'Creating...' : 'Create'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="bg-white rounded shadow p-4">
          {(loading || permissionsLoading) && <div className="text-sm text-gray-600">Loading transfers...</div>}
          {error && !isCreateOpen && <div className="text-sm text-red-600">{error}</div>}

          {!loading && !permissionsLoading && !error && (
            <div className="overflow-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-sm text-gray-600">
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">From</th>
                    <th className="px-3 py-2">To</th>
                    <th className="px-3 py-2">Serial</th>
                    <th className="px-3 py-2">Part</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-500">No transfers found</td></tr>}
                  {transfers.map((t, i) => (
                    <tr key={t.transfer_id ?? t.id ?? i} className="border-t">
                      <td className="px-3 py-2">{t.transfer_id ?? t.id ?? '-'}</td>
                      <td className="px-3 py-2">{t.from_shop ?? t.from_shop_name ?? '-'}</td>
                      <td className="px-3 py-2">{t.to_shop ?? t.to_shop_name ?? '-'}</td>
                      <td className="px-3 py-2">{t.serial_number ?? '-'}</td>
                      <td className="px-3 py-2">{t.part_number ?? '-'}</td>
                      <td className="px-3 py-2">{t.status ?? '-'}</td>
                      <td className="px-3 py-2">{t.created_at ? new Date(t.created_at).toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  )
}