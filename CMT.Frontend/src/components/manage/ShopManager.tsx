'use client';

import React, { useEffect, useState, useRef } from 'react';
import apiClient from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Loader2, Plus, MapPin, Users, CheckCircle, AlertCircle, UserCog, Pencil, Check, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

interface Shop {
  id: number;
  shop_id?: number;
  name: string;
  location?: string;
  description?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  teamLeaderId?: number;
  teamLeaderName?: string;
  managerId?: number;
  managerName?: string;
}

interface ShopFormData {
  name: string;
  location: string;
  description: string;
  isActive: boolean;
}

type Props = {
  // optional callback invoked after a new shop is created (useful when embedded inside UserFormDialog)
  onCreated?: (createdShop?: Shop) => void;
};

export default function ShopManager({ onCreated }: Props) {
  const auth: any = useAuth() || {};
  const currentUser = auth?.user;
  const currentUserRole = currentUser?.role?.toLowerCase() || '';
  const currentUserId = currentUser?.userId || currentUser?.user_id;
  
  // Check if user can manage shops
  const canManageShops = ['team_leader', 'director', 'manager'].includes(currentUserRole);
  const isManager = currentUserRole === 'manager';

  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingShop, setEditingShop] = useState<Shop | null>(null);
  const [formData, setFormData] = useState<ShopFormData>({
    name: '',
    location: '',
    description: '',
    isActive: true,
  });

  // Inline editing state
  const [inlineEditingShopId, setInlineEditingShopId] = useState<number | null>(null);
  const [inlineEditName, setInlineEditName] = useState('');
  const [inlineSaving, setInlineSaving] = useState(false);
  const inlineInputRef = useRef<HTMLInputElement>(null);

  // Load shops from real database
  const loadShops = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.getShops();
      if (Array.isArray(response)) {
        setShops(response);
      } else {
        console.warn('Unexpected shops response format:', response);
        setShops([]);
        setError('Received unexpected data format from server');
      }
    } catch (err: any) {
      console.error('Failed to load shops:', err);
      if (err.status === 502 || err.message?.includes('backend')) {
        setError('Unable to connect to the database. Please ensure the backend service is running and properly configured.');
      } else if (err.status === 401) {
        setError('You do not have permission to view shops.');
      } else {
        setError('Failed to load shops. Please try again.');
      }
      setShops([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canManageShops) {
      loadShops();
    }
  }, [canManageShops]);

  // Focus the inline input when editing starts
  useEffect(() => {
    if (inlineEditingShopId !== null && inlineInputRef.current) {
      inlineInputRef.current.focus();
      inlineInputRef.current.select();
    }
  }, [inlineEditingShopId]);

  const handleCreateShop = () => {
    setEditingShop(null);
    setFormData({
      name: '',
      location: '',
      description: '',
      isActive: true,
    });
    setDialogOpen(true);
  };

  const handleEditShop = (shop: Shop) => {
    setEditingShop(shop);
    setFormData({
      name: shop.name,
      location: shop.location || '',
      description: shop.description || '',
      isActive: shop.isActive,
    });
    setDialogOpen(true);
  };

  // Start inline editing for shop name
  const handleStartInlineEdit = (shop: Shop) => {
    setInlineEditingShopId(shop.shop_id || shop.id);
    setInlineEditName(shop.name);
    setError(null);
  };

  // Cancel inline editing
  const handleCancelInlineEdit = () => {
    setInlineEditingShopId(null);
    setInlineEditName('');
  };

  // Save inline edited shop name
  const handleSaveInlineName = async (shop: Shop) => {
    const trimmedName = inlineEditName.trim();
    if (!trimmedName) {
      setError('Shop name cannot be empty');
      return;
    }

    // If name hasn't changed, just cancel
    if (trimmedName === shop.name) {
      handleCancelInlineEdit();
      return;
    }

    setInlineSaving(true);
    setError(null);
    try {
      const shopId = shop.shop_id || shop.id;
      await apiClient.updateShop(shopId, {
        name: trimmedName,
        location: shop.location || '',
        description: shop.description || '',
        isActive: shop.isActive,
      });
      
      setInlineEditingShopId(null);
      setInlineEditName('');
      await loadShops(); // Reload shops from database
    } catch (err: any) {
      console.error('Failed to update shop name:', err);
      if (err.status === 400) {
        setError(err.message || 'Invalid shop name provided');
      } else if (err.status === 401 || err.status === 403) {
        setError('You do not have permission to edit shops');
      } else if (err.status === 502 || err.message?.includes('backend')) {
        setError('Unable to connect to the database. Please ensure the backend service is running.');
      } else {
        setError(err?.message || 'Failed to update shop name. Please try again.');
      }
    } finally {
      setInlineSaving(false);
    }
  };

  // Handle key press for inline editing
  const handleInlineKeyDown = (e: React.KeyboardEvent, shop: Shop) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveInlineName(shop);
    } else if (e.key === 'Escape') {
      handleCancelInlineEdit();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('Shop name is required');
      return;
    }

    setLoading(true);
    try {
      const shopData: any = {
        name: formData.name.trim(),
        location: formData.location.trim(),
        description: formData.description.trim(),
        isActive: formData.isActive
      };

      // Auto-assign manager if current user is a manager
      if (isManager) {
        shopData.managerId = currentUserId;
      }

      let createdShop: any = null;

      if (editingShop) {
        // Update existing shop
        await apiClient.updateShop(editingShop.shop_id || editingShop.id, shopData);
      } else {
        // Create new shop
        createdShop = await apiClient.createShop(shopData);
      }
      
      setDialogOpen(false);
      await loadShops(); // Reload shops from database

      // Notify parent if provided (useful for the UserFormDialog to refresh/clear fields)
      try {
        onCreated?.(createdShop);
      } catch (cbErr) {
        console.warn('onCreated callback failed:', cbErr);
      }
    } catch (err: any) {
      console.error('Failed to save shop:', err);
      if (err.status === 400) {
        setError(err.message || 'Invalid shop data provided');
      } else if (err.status === 401 || err.status === 403) {
        setError('You do not have permission to manage shops');
      } else if (err.status === 502 || err.message?.includes('backend')) {
        setError('Unable to connect to the database. Please ensure the backend service is running.');
      } else {
        setError(err?.message || 'Failed to save shop. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteShop = async (shop: Shop) => {
    // Row-level delete actions have been removed from the UI per request.
    // Keep function here for potential future use.
    if (!window.confirm(`Are you sure you want to delete "${shop.name}"? This action cannot be undone.`)) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await apiClient.deleteShop(shop.shop_id || shop.id);
      await loadShops(); // Reload shops from database
    } catch (err: any) {
      console.error('Failed to delete shop:', err);
      if (err.status === 400) {
        setError('Cannot delete shop: it may be assigned to users or have associated data');
      } else if (err.status === 401 || err.status === 403) {
        setError('You do not have permission to delete shops');
      } else if (err.status === 502 || err.message?.includes('backend')) {
        setError('Unable to connect to the database. Please ensure the backend service is running.');
      } else {
        setError(err?.message || 'Failed to delete shop. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!canManageShops) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-red-600">Access Denied</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Only Team Leaders, Directors, and Managers can manage shops.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Shop Management</CardTitle>
              <CardDescription>
                Manage shops for the organization. Click the pencil icon next to a shop name to edit it.
                {isManager && ' As a manager, you will be automatically assigned to shops you create.'}
              </CardDescription>
            </div>
            <Button onClick={handleCreateShop} disabled={loading}>
              <Plus className="h-4 w-4 mr-2" />
              Add Shop
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loading && !dialogOpen ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Loading shops from database...</span>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Team Leader</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shops.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                        {error ? 'Failed to load shops from database.' : 'No shops found in database. Create your first shop to get started.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    shops.map((shop, index) => {
                      const shopId = shop.shop_id || shop.id;
                      const isInlineEditing = inlineEditingShopId === shopId;

                      return (
                        <TableRow key={`shop-${shopId}-${index}`}>
                          <TableCell className="font-medium">
                            {isInlineEditing ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  ref={inlineInputRef}
                                  value={inlineEditName}
                                  onChange={(e) => setInlineEditName(e.target.value)}
                                  onKeyDown={(e) => handleInlineKeyDown(e, shop)}
                                  disabled={inlineSaving}
                                  className="h-8 w-48 text-sm"
                                  placeholder="Shop name"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                                  onClick={() => handleSaveInlineName(shop)}
                                  disabled={inlineSaving}
                                  title="Save"
                                >
                                  {inlineSaving ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Check className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={handleCancelInlineEdit}
                                  disabled={inlineSaving}
                                  title="Cancel"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 group">
                                <span>{shop.name}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                                  onClick={() => handleStartInlineEdit(shop)}
                                  title="Edit shop name"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {shop.location ? (
                              <div className="flex items-center">
                                <MapPin className="h-4 w-4 mr-1 text-gray-400" />
                                {shop.location}
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {shop.teamLeaderName ? (
                              <div className="flex items-center">
                                <Users className="h-4 w-4 mr-1 text-blue-500" />
                                {shop.teamLeaderName}
                              </div>
                            ) : (
                              <span className="text-gray-400">Not assigned</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {shop.managerName ? (
                              <div className="flex items-center">
                                <UserCog className="h-4 w-4 mr-1 text-purple-500" />
                                {shop.managerName}
                              </div>
                            ) : (
                              <span className="text-orange-500">No manager</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {shop.isActive ? (
                              <div className="flex items-center text-green-600">
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Active
                              </div>
                            ) : (
                              <div className="flex items-center text-gray-400">
                                <AlertCircle className="h-4 w-4 mr-1" />
                                Inactive
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Shop Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingShop ? 'Edit Shop' : 'Create New Shop'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {isManager && !editingShop && (
              <Alert>
                <AlertDescription>
                  As a manager, you will be automatically assigned to this shop.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Shop Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter shop name"
                  disabled={loading}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="Enter shop location (optional)"
                  disabled={loading}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter shop description (optional)"
                  disabled={loading}
                  rows={3}
                />
              </div>

              {/* Removed: Shop Team Leader & Manager selection inputs per request */}

              <div className="space-y-2">
                <Label htmlFor="isActive">Status</Label>
                <Select
                  value={formData.isActive ? 'active' : 'inactive'}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, isActive: value === 'active' }))}
                  disabled={loading}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? 'Saving...' : editingShop ? 'Update Shop' : 'Create Shop'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}