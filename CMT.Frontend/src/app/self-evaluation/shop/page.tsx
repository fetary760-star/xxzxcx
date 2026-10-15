'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import {
  Building2,
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  MapPin,
  FileText,
  Users,
  RefreshCw,
  Loader2,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import apiClient from '@/lib/api'
import type { ShopDto } from '@/lib/self-evaluation/types'

// ===== Shop Form Data =====
interface ShopFormData {
  certificateNumber: string
  name: string
  address: string
  city: string
}

const emptyShopForm: ShopFormData = {
  certificateNumber: '',
  name: '',
  address: '',
  city: '',
}

export default function SelfEvaluationShopPage() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

  // State
  const [shops, setShops] = useState<ShopDto[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedShop, setSelectedShop] = useState<ShopDto | null>(null)
  const [expandedShopId, setExpandedShopId] = useState<string | null>(null)

  // Dialog state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [formData, setFormData] = useState<ShopFormData>(emptyShopForm)
  const [submitting, setSubmitting] = useState(false)

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  // Fetch shops
  const fetchShops = useCallback(async () => {
    try {
      setLoading(true)
      const response = await apiClient.get<any>('/self-evaluation/shops?includeHierarchy=true')
      if (!response) {
        setShops([])
        return
      }
      if (Array.isArray(response)) {
        setShops(response)
      } else if (response.data && Array.isArray(response.data)) {
        setShops(response.data)
      } else if (response.payload && Array.isArray(response.payload)) {
        setShops(response.payload)
      } else {
        setShops([])
      }
    } catch (err: any) {
      console.error('Failed to fetch shops:', err)
      toast({
        title: 'Error',
        description: err?.message || 'Failed to load shops. Please ensure the backend is running.',
        variant: 'destructive',
      })
      setShops([])
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (isAuthenticated) {
      fetchShops()
    }
  }, [isAuthenticated, fetchShops])

  // Filter shops by search
  const filteredShops = shops.filter(shop => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      shop.name?.toLowerCase().includes(q) ||
      shop.certificateNumber?.toLowerCase().includes(q) ||
      shop.address?.toLowerCase().includes(q) ||
      shop.city?.toLowerCase().includes(q)
    )
  })

  // Create shop
  const handleCreate = async () => {
    if (!formData.certificateNumber.trim() || !formData.name.trim()) {
      toast({ title: 'Validation Error', description: 'Certificate number and shop name are required.', variant: 'destructive' })
      return
    }

    try {
      setSubmitting(true)
      await apiClient.post('/self-evaluation/shops', {
        name: formData.name.trim(),
        certificateNumber: formData.certificateNumber.trim(),
        address: formData.address.trim(),
        city: formData.city.trim(),
      })
      toast({ title: 'Success', description: `Shop "${formData.name}" created successfully.` })
      setIsCreateDialogOpen(false)
      setFormData(emptyShopForm)
      fetchShops()
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to create shop.', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  // Update shop
  const handleUpdate = async () => {
    if (!selectedShop) return
    if (!formData.certificateNumber.trim() || !formData.name.trim()) {
      toast({ title: 'Validation Error', description: 'Certificate number and shop name are required.', variant: 'destructive' })
      return
    }

    try {
      setSubmitting(true)
      await apiClient.put(`/self-evaluation/shops/${selectedShop.id}`, {
        name: formData.name.trim(),
        certificateNumber: formData.certificateNumber.trim(),
        address: formData.address.trim(),
        city: formData.city.trim(),
        state: selectedShop.state,
        zipCode: selectedShop.zipCode,
        country: selectedShop.country,
        phone: selectedShop.phone,
        email: selectedShop.email,
        accountableManager: selectedShop.accountableManager,
        qualityManager: selectedShop.qualityManager,
      })
      toast({ title: 'Success', description: `Shop "${formData.name}" updated successfully.` })
      setIsEditDialogOpen(false)
      setFormData(emptyShopForm)
      setSelectedShop(null)
      fetchShops()
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to update shop.', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  // Delete shop
  const handleDelete = async () => {
    if (!selectedShop) return

    try {
      setSubmitting(true)
      await apiClient.delete(`/self-evaluation/shops/${selectedShop.id}`)
      toast({ title: 'Success', description: `Shop "${selectedShop.name}" deleted successfully.` })
      setIsDeleteDialogOpen(false)
      setSelectedShop(null)
      fetchShops()
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to delete shop.', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  // Open edit dialog
  const openEditDialog = (shop: ShopDto) => {
    setSelectedShop(shop)
    setFormData({
      certificateNumber: shop.certificateNumber || '',
      name: shop.name || '',
      address: shop.address || '',
      city: shop.city || '',
    })
    setIsEditDialogOpen(true)
  }

  // Open delete dialog
  const openDeleteDialog = (shop: ShopDto) => {
    setSelectedShop(shop)
    setIsDeleteDialogOpen(true)
  }

  // Toggle expanded shop to show ATA chapters
  const toggleExpand = (shopId: string) => {
    setExpandedShopId(prev => (prev === shopId ? null : shopId))
  }

  // Role check for write permissions
  const canManage = user?.role === 'admin' || user?.role === 'administrator' || user?.role === 'director' || user?.role === 'manager' || user?.role === 'team_leader'

  if (authLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="h-full flex flex-col overflow-hidden">
        {/* Page Header */}
        <div className="px-6 py-4 bg-white border-b shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-emerald-600" />
                Shop Management
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage maintenance shops/workshops and their ATA chapter assignments
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchShops}
                disabled={loading}
              >
                <RefreshCw className={cn("h-4 w-4 mr-1.5", loading && "animate-spin")} />
                Refresh
              </Button>
              {canManage && (
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      <Plus className="h-4 w-4 mr-1.5" />
                      Add Shop
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                      <DialogTitle>Create New Shop</DialogTitle>
                      <DialogDescription>
                        Add a new maintenance shop/workshop to the self-evaluation system.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="certificateNumber">Certificate Number *</Label>
                          <Input
                            id="certificateNumber"
                            placeholder="Workshop certificate number"
                            value={formData.certificateNumber}
                            onChange={e => setFormData(prev => ({ ...prev, certificateNumber: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="shopName">Shop Name *</Label>
                          <Input
                            id="shopName"
                            placeholder="e.g., Electric Shop"
                            value={formData.name}
                            onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="city">City</Label>
                        <Input
                          id="city"
                          placeholder="City"
                          value={formData.city}
                          onChange={e => setFormData(prev => ({ ...prev, city: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="address">Address</Label>
                        <Textarea
                          id="address"
                          placeholder="Street address"
                          value={formData.address}
                          onChange={e => setFormData(prev => ({ ...prev, address: e.target.value }))}
                          rows={3}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => { setIsCreateDialogOpen(false); setFormData(emptyShopForm) }}>
                        Cancel
                      </Button>
                      <Button onClick={handleCreate} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                        {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
                        Create Shop
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="mt-4 relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search shops by name, certificate, address, or city..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map(i => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-10 w-10 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredShops.length === 0 ? (
            <div className="text-center py-16">
              <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                {searchQuery ? 'No shops match your search' : 'No Shops Configured'}
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                {searchQuery
                  ? 'Try adjusting your search terms.'
                  : 'Get started by adding your first maintenance shop.'}
              </p>
              {!searchQuery && canManage && (
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => setIsCreateDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add First Shop
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Summary Stats */}
              <div className="grid grid-cols-1 gap-3 mb-6 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{shops.length}</p>
                      <p className="text-xs text-gray-500">Total Shops</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {shops.filter(shop => Boolean(shop.certificateNumber)).length}
                      </p>
                      <p className="text-xs text-gray-500">With Certificates</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                      <MapPin className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {shops.filter(shop => Boolean(shop.city || shop.address)).length}
                      </p>
                      <p className="text-xs text-gray-500">With Location</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Users className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {shops.filter(shop => Boolean(shop.email || shop.phone)).length}
                      </p>
                      <p className="text-xs text-gray-500">With Contact Details</p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Shop List */}
              {filteredShops.map(shop => {
                const isExpanded = expandedShopId === shop.id
                return (
                  <Card key={shop.id} className="overflow-hidden">
                    <div className="flex items-center justify-between p-4 hover:bg-gray-50/50 transition-colors">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <button
                          onClick={() => toggleExpand(shop.id)}
                          className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0 hover:bg-emerald-200 transition-colors"
                        >
                          <ChevronDown className={cn("h-4 w-4 text-emerald-600 transition-transform", isExpanded && "rotate-180")} />
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-gray-900 truncate">{shop.name}</h3>
                            {shop.certificateNumber && <Badge variant="outline" className="text-xs shrink-0">{shop.certificateNumber}</Badge>}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                            {(shop.city || shop.state) && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />{[shop.city, shop.state].filter(Boolean).join(', ')}
                              </span>
                            )}
                            {shop.email && <span className="truncate">{shop.email}</span>}
                          </div>
                        </div>
                      </div>

                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(shop)}>
                              <Pencil className="h-3.5 w-3.5 mr-2" />Edit Shop
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openDeleteDialog(shop)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" />Delete Shop
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>

                    {/* Shop details */}
                    {isExpanded && (
                      <div className="grid gap-2 border-t bg-gray-50/50 px-4 py-3 text-xs text-gray-600 sm:grid-cols-2">
                        <p><span className="font-medium text-gray-800">Address:</span> {[shop.address, shop.city, shop.state, shop.zipCode, shop.country].filter(Boolean).join(', ') || 'Not provided'}</p>
                        <p><span className="font-medium text-gray-800">Phone:</span> {shop.phone || 'Not provided'}</p>
                        <p><span className="font-medium text-gray-800">Accountable manager:</span> {shop.accountableManager || 'Not provided'}</p>
                        <p><span className="font-medium text-gray-800">Quality manager:</span> {shop.qualityManager || 'Not provided'}</p>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Shop</DialogTitle>
            <DialogDescription>
              Update the details for "{selectedShop?.name}".
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editCertificateNumber">Certificate Number *</Label>
                <Input
                  id="editCertificateNumber"
                  value={formData.certificateNumber}
                  onChange={e => setFormData(prev => ({ ...prev, certificateNumber: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editShopName">Shop Name *</Label>
                <Input
                  id="editShopName"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editCity">City</Label>
              <Input
                id="editCity"
                value={formData.city}
                onChange={e => setFormData(prev => ({ ...prev, city: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editAddress">Address</Label>
              <Textarea
                id="editAddress"
                value={formData.address}
                onChange={e => setFormData(prev => ({ ...prev, address: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditDialogOpen(false); setFormData(emptyShopForm); setSelectedShop(null) }}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Pencil className="h-4 w-4 mr-1.5" />}
              Update Shop
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shop</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive "{selectedShop?.name}"? This will mark the shop inactive without deleting its records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setSelectedShop(null) }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={submitting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  )
}
