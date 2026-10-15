'use client';

import React, { useEffect, useState } from 'react';
import apiClient from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  DraggableDialog,
  DraggableDialogContent,
  DraggableDialogHeader,
  DraggableDialogTitle,
  DraggableDialogFooter,
} from '@/components/ui/draggable-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Info, Plus, Lock, Eye, EyeOff, UserPlus } from 'lucide-react';
import { getAllRoles, formatRoleForDisplay, getManageableRoles, getAllPersonnelTypes } from '@/utils/roleUtils';
import { useAuth } from '@/lib/auth-context';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import ShopManager from './ShopManager';
import { Checkbox } from '@/components/ui/checkbox';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userToEdit?: any | null;
  onSaved?: () => void;
  shops?: any[];
  supervisors?: any[];
  managers?: any[];
  parentLoadingData?: boolean;
}

export default function UserFormDialog({
  open,
  onOpenChange,
  userToEdit,
  onSaved,
  shops: propsShops,
  supervisors: propsSupervisors,
  managers: propsManagers,
  parentLoadingData = false,
}: Props) {
  const auth: any = useAuth() || {};
  const { canEditUser: matrixCanEditUser, isPrivilegedRole } = useRolePermissions();
  const currentUser = auth?.user;
  const currentUserRole = (currentUser?.role || '').toLowerCase();
  const isShopTL = currentUserRole === 'shop_tl' || currentUserRole === 'shoptl';
  const isManager = currentUserRole === 'manager';
  const isDirector = currentUserRole === 'director';
  const isTeamLeader = currentUserRole === 'team_leader';
  const isAdmin = currentUserRole === 'admin';
  const isShopManager = currentUserRole === 'shop_manager' || currentUserRole === 'minimanager';
  const canManageShops = ['team_leader', 'director', 'manager'].includes(currentUserRole);
  const currentUserShopId = currentUser?.shopId || currentUser?.shop_id;
  const currentUserId = currentUser?.userId || currentUser?.user_id;
  
  // NEW: Get Director's Team Leader permission
  const currentUserCanCreateTeamLeader = currentUser?.canCreateTeamLeader || currentUser?.can_create_team_leader || false;

    const [form, setForm] = useState({
    username: '',
    email: '',
    fullName: '',
    password: '',
    role: '',
    shopId: '',
    supervisorId: '',
    managerId: '',
    personnelType: 'technician',
    isActive: true,
    departmentId: '',
    newDepartmentName: '',
    newDepartmentDescription: '',
    createNewDepartment: false,
    canCreateTeamLeader: false,
    phoneNumber: '',
  });


  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shops, setShops] = useState<any[]>(propsShops ?? []);
  const [supervisors, setSupervisors] = useState<any[]>(propsSupervisors ?? []);
  const [managers, setManagers] = useState<any[]>(propsManagers ?? []);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [showShopManager, setShowShopManager] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  
  const [showPassword, setShowPassword] = useState(false);

  const getAvailableRoles = () => {
    // UPDATED: Admin can now select Director role from dropdown instead of automatic assignment
    if (isAdmin) {
      return [{ value: 'director', label: 'Director' }];
    }
    if (isShopTL) {
      return [
        { value: 'customer_personnel', label: 'Customer Personnel' }
      ];
    }
    if (isShopManager) {
      return [
        //{ value: 'shop_tl', label: 'Shop Team Leader' },
        { value: 'customer_personnel', label: 'Customer Personnel' }
      ];
    }
    // FIXED: Pass the Director's canCreateTeamLeader permission to getManageableRoles
    const manageableRoles = getManageableRoles(currentUserRole, currentUserCanCreateTeamLeader);
    return getAllRoles().filter(role => manageableRoles.includes(role.value));
  };

  const availableRoles = getAvailableRoles();
  const personnelTypes = getAllPersonnelTypes().filter(pt => pt.value !== 'customer_personnel');

  const canEditUser = () => {
    if (!userToEdit) return true;

    // Admin and Director always have full permissions (bypass matrix)
    if (isPrivilegedRole) return true;

    // If the matrix does NOT grant edit_user for this role, deny editing
    if (!matrixCanEditUser) return false;

    if (isShopTL) {
      const userShopId = userToEdit.shop_id ?? userToEdit.shopId;
      const userRole = (userToEdit.role || '').toLowerCase();
      return userShopId === currentUserShopId && userRole === 'customer_personnel';
    }

    if (isShopManager) {
      const userRole = (userToEdit.role || '').toLowerCase();
      const allowedRoles = ['shop_tl', 'customer_personnel'];
      if (!allowedRoles.includes(userRole)) return false;
      // Shop Manager can only edit users within their own shop
      if (!currentUserShopId) return false;
      const userShopId = userToEdit.shop_id ?? userToEdit.shopId;
      return userShopId === currentUserShopId;
    }

    if (isManager) {
      const userManagerId = userToEdit.manager_id ?? userToEdit.managerId;
      return userManagerId === currentUserId;
    }

    return true;
  };

  const getEditableFields = () => {
    if (!userToEdit) return { all: true };

    if (isAdmin || isDirector) {
      return { all: true };
    }

    if (isTeamLeader) {
      return {
        fullName: true,
        username: true,
        password: true,
        email: true,
        shopId: true,
        supervisorId: true,
        managerId: true,
        personnelType: false,
        isActive: true,
        role: false,
        phoneNumber: true
      };
    }

    if (isShopTL) {
      return {
        fullName: true,
        username: true,
        password: true,
        email: true,
        shopId: false,
        supervisorId: true,
        managerId: false,
        personnelType: false,
        isActive: false,
        role: false,
        phoneNumber: true
      };
    }

    if (isManager) {
      return {
        fullName: true,
        username: true,
        password: true,
        email: true,
        shopId: true,
        supervisorId: true,
        managerId: false,
        personnelType: false,
        isActive: true,
        role: false,
        phoneNumber: true
      };
    }

    if (isShopManager) {
      return {
        fullName: true,
        username: true,
        password: true,
        email: true,
        shopId: false, // Shop is auto-assigned from Shop Manager's shop
        supervisorId: true,
        managerId: false,
        personnelType: false,
        isActive: true,
        role: false,
        phoneNumber: true
      };
    }

    return { all: false };
  };

  const editableFields = getEditableFields();

  const loadShops = async () => {
    try {
      ('[DEBUG] Loading shops from API...');
      const shopsResponse = await apiClient.get('/shops');
      const shopsData = Array.isArray(shopsResponse) ? shopsResponse : (shopsResponse.data || []);
      const normalizedShops = shopsData.map((shop: any) => {
        const shopId = shop.shop_id || shop.id || shop.shopId;
        return {
          ...shop,
          id: shopId,
          shop_id: shopId,
          name: shop.name || `Shop ${shopId}`
        };
      }).filter((shop: any) => shop.shop_id != null);

      ('[DEBUG] Normalized shops:', normalizedShops);
      setShops(normalizedShops);
      return normalizedShops;
    } catch (err) {
      console.warn('Failed to load shops:', err);
      setShops([]);
      return [];
    }
  };

  const loadDepartments = async () => {
    if (!isAdmin) return;
    
    try {
      ('[DEBUG] Loading departments from API...');
      const response = await apiClient.get('/admin/departments');
      const departmentsData = Array.isArray(response) ? response : (response.data || []);
      ('[DEBUG] Loaded departments:', departmentsData);
      setDepartments(departmentsData);
    } catch (err) {
      console.warn('Failed to load departments:', err);
      setDepartments([]);
    }
  };

  const loadData = async () => {
    if (propsShops && propsSupervisors && propsManagers) {
      setShops(propsShops);
      setSupervisors(propsSupervisors);
      setManagers(propsManagers);
      if (isAdmin) await loadDepartments();
      setDataLoaded(true);
      return;
    }

    if (!open) return;

    setLoadingData(true);
    setDataLoaded(false);
    try {
      if (!propsShops) {
        await loadShops();
      }

      if (isAdmin) {
        await loadDepartments();
      }

      if (!propsSupervisors || !propsManagers) {
        try {
          const usersResponse = await apiClient.get('/users');
          const allUsers = usersResponse.data || usersResponse || [];

          const supervisorRoles = ['team_leader', 'director', 'shop_tl'];
          const potentialSupervisors = allUsers.filter((u: any) => supervisorRoles.includes(u.role));
          setSupervisors(potentialSupervisors);

          const managerRoles = ['manager', 'director'];
          const potentialManagers = allUsers.filter((u: any) => managerRoles.includes(u.role));
          setManagers(potentialManagers);
        } catch (err) {
          console.warn('Failed to load supervisors/managers:', err);
          setSupervisors([]);
          setManagers([]);
        }
      }
      setDataLoaded(true);
    } catch (err) {
      console.error('Failed to load form data:', err);
      setDataLoaded(true);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (propsShops) setShops(propsShops);
  }, [propsShops]);

  useEffect(() => {
    if (propsSupervisors) setSupervisors(propsSupervisors);
  }, [propsSupervisors]);

  useEffect(() => {
    if (propsManagers) setManagers(propsManagers);
  }, [propsManagers]);

  useEffect(() => {
    if (parentLoadingData) {
      setLoadingData(true);
      setDataLoaded(false);
    } else {
      loadData();
    }
  }, [open, parentLoadingData]);

  useEffect(() => {
    if (userToEdit) {
      const shopId = userToEdit.shop_id ?? userToEdit.shopId;
            setForm({
        username: userToEdit.username ?? '',
        email: userToEdit.email ?? '',
        fullName: userToEdit.full_name ?? userToEdit.fullName ?? '',
        password: '',
        role: userToEdit.role ?? userToEdit.roleId ?? '',
        shopId: shopId != null ? String(shopId) : '',
        supervisorId: userToEdit.supervisor_id ?? userToEdit.supervisorId ?? '',
        managerId: userToEdit.manager_id ?? userToEdit.managerId ?? '',
        personnelType: userToEdit.personnel_type ?? userToEdit.personnelType ?? 'technician',
        isActive: userToEdit.is_active ?? userToEdit.isActive ?? true,
        departmentId: userToEdit.department_id ?? userToEdit.departmentId ?? '',
        newDepartmentName: '',
        newDepartmentDescription: '',
        createNewDepartment: false,
        canCreateTeamLeader: userToEdit.can_create_team_leader ?? userToEdit.canCreateTeamLeader ?? false,
        phoneNumber: userToEdit.phone_number ?? userToEdit.phoneNumber ?? '',
      });

    } else {
      const initialShopId = (isShopTL || isShopManager) && currentUserShopId ? String(currentUserShopId) : '';
      const initialManagerId = isManager ? String(currentUserId) : '';
      // UPDATED: Remove automatic role assignment for admin - let them select from dropdown
      const initialRole = isShopTL ? 'customer_personnel' : '';

            setForm({
        username: '',
        email: '',
        fullName: '',
        password: '',
        role: initialRole,
        shopId: initialShopId,
        supervisorId: '',
        managerId: initialManagerId,
        personnelType: 'technician',
        isActive: true,
        departmentId: '',
        newDepartmentName: '',
        newDepartmentDescription: '',
        createNewDepartment: false,
        canCreateTeamLeader: false,
        phoneNumber: '',
      });

    }
    setError(null);
    setShowPassword(false);
  }, [userToEdit, open, isShopTL, isManager, isShopManager, isAdmin, currentUserShopId, currentUserId]);

  const handleChange = (field: string, value: any) => {
    if (userToEdit && editableFields.all !== true) {
      if (!editableFields[field as keyof typeof editableFields]) {
        return;
      }
    }

    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError(null);
  };

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = (): string[] => {
    const errors: string[] = [];

    if (loadingData || !dataLoaded) {
      ('[DEBUG] Skipping validation - data still loading');
      return [];
    }

    if (isShopTL && userToEdit && !canEditUser()) {
      errors.push('You can only edit Technician,Tools Clerk/Warranty Officer from your assigned shop');
      return errors;
    }

    if (isManager && userToEdit && !canEditUser()) {
      errors.push('You can only edit users you manage');
      return errors;
    }

    if (!form.email || !form.email.trim()) {
      errors.push('Email is required');
    } else if (!isValidEmail(form.email.trim())) {
      errors.push('Please enter a valid email address');
    }

       if (!form.fullName || !form.fullName.trim()) {
      errors.push('Full Name is required');
    }

    if (!form.phoneNumber || !form.phoneNumber.trim()) {
      errors.push('Phone Contact Number is required');
    }


    if (!form.username || !form.username.trim()) {
      errors.push('Username is required');
    }

    if (!userToEdit) {
      if (!form.password || form.password.length < 6) {
        errors.push('Password is required and must be at least 6 characters');
      }
    } else if (form.password && form.password.length < 6) {
      errors.push('Password must be at least 6 characters if provided');
    }

    if (!form.role) {
      errors.push('Please select a role');
    }

    // UPDATED: Validate department assignment for directors
    if (isAdmin && form.role === 'director' && !userToEdit) {
      if (form.createNewDepartment) {
        if (!form.newDepartmentName || !form.newDepartmentName.trim()) {
          errors.push('Department name is required when creating a new department');
        }
      } else {
        if (!form.departmentId || form.departmentId === '' || form.departmentId === 'no-department') {
          errors.push('Please select a department or create a new one for the Director. Directors must be assigned to a department.');
        }
      }
    }

    if (form.role === 'customer_personnel' && !userToEdit) {
      if (!form.personnelType || !['technician', 'tools_clerk', 'warranty_officer'].includes(form.personnelType)) {
        errors.push('Please select a valid Personnel Type (Technician,Tools Clerk/Warranty Officer)');
      }
    }

    if (form.role === 'shop_tl') {
      // FIXED: Skip shop validation when Shop Manager creates Shop TL (shop is auto-assigned from Shop Manager's shop)
      if (!isShopManager) {
        if (!form.shopId || form.shopId === '' || form.shopId === 'no-shop') {
          if (shops.length === 0) {
            errors.push('No shops available. Please create a shop first using the "Manage Shops" button');
          } else {
            errors.push('Shop assignment is required for Shop Team Leader role');
          }
        } else {
          const selectedShop = shops.find(shop => {
            const shopId = shop.shop_id || shop.id;
            return String(shopId) === String(form.shopId);
          });

          if (!selectedShop) {
            errors.push('Please select a valid shop from the list for Shop Team Leader role');
          }
        }
      } else if (isShopManager && !currentUserShopId) {
        errors.push('You must be assigned to a shop before creating Shop Team Leaders');
      }

      // FIXED: Skip manager validation when Shop Manager creates Shop TL (manager is inherited on backend)
      if (!isManager && !isShopManager && !userToEdit) {
        if (!form.managerId || form.managerId === '' || form.managerId === 'no-manager') {
          if (managers.length === 0) {
            errors.push(`No managers available. Please ensure managers exist before creating ${formatRoleForDisplay(form.role)}`);
          } else {
            errors.push(`Manager assignment is required for ${formatRoleForDisplay(form.role)} role`);
          }
        } else {
          const selectedManager = managers.find(manager => {
            const managerId = manager.user_id || manager.id;
            return String(managerId) === String(form.managerId);
          });

          if (!selectedManager) {
            errors.push(`Please select a valid manager from the list for ${formatRoleForDisplay(form.role)} role`);
          }
        }
      }
    }

    // Validate shop assignment for Shop Manager role (mandatory, similar to Shop TL)
    if (form.role === 'shop_manager' && !userToEdit) {
      if (!form.shopId || form.shopId === '' || form.shopId === 'no-shop') {
        if (shops.length === 0) {
          errors.push('No shops available. Please create a shop first using the "Manage Shops" button');
        } else {
          errors.push('Shop assignment is required for Shop Manager role');
        }
      } else {
        const selectedShop = shops.find(shop => {
          const shopId = shop.shop_id || shop.id;
          return String(shopId) === String(form.shopId);
        });

        if (!selectedShop) {
          errors.push('Please select a valid shop from the list for Shop Manager role');
        }
      }
    }

    if (isShopTL) {
      if (form.role !== 'customer_personnel') {
        errors.push('Shop TL can only create Technician,Tools Clerk or Warranty Officer roles');
      }
      if (!currentUserShopId) {
        errors.push('Shop TL must be assigned to a shop');
      }
    }

    if (isShopManager) {
      if (!['shop_tl', 'customer_personnel'].includes(form.role)) {
        errors.push('Shop Manager can only create Shop Team Leaders and Customer Personnel within their shop');
      }
      if (!currentUserShopId) {
        errors.push('Shop Manager must be assigned to a shop before creating users');
      }
    }

    return errors;
  };

 const handleSubmit = async (e?: React.FormEvent) => {
  e?.preventDefault();
  setError(null);

  if (loadingData || !dataLoaded) {
    setError('Please wait while data is loading...');
    return;
  }

  // 1. Initial Validation
  const validationErrors = validateForm();
  if (validationErrors.length > 0) {
    setError(validationErrors.join(', '));
    return;
  }

  setLoading(true);

  try {
    // 2. Build Payload
    const payload: any = { isActive: form.isActive };

    if (!userToEdit || editableFields.all === true || editableFields.fullName) payload.fullName = form.fullName.trim();
    if (!userToEdit || editableFields.all === true || editableFields.username) payload.username = form.username.trim();
       if (!userToEdit || editableFields.all === true || editableFields.email) payload.email = form.email.trim();
    payload.phoneNumber = form.phoneNumber.trim();

    if (!userToEdit || editableFields.all === true || editableFields.role) payload.role = form.role;

    if (form.role === 'customer_personnel' && (!userToEdit || editableFields.all === true || editableFields.personnelType)) {
      payload.personnelType = form.personnelType;
    }

    if (form.password?.trim()) {
      userToEdit ? (payload.newPassword = form.password.trim()) : (payload.password = form.password.trim());
    } else if (!userToEdit) {
      payload.password = 'TempPass123!';
    }

    // Handle Shop/Manager/Department IDs
    if (!userToEdit || editableFields.all === true || editableFields.shopId) {
      if (isShopTL) payload.shopId = currentUserShopId;
      else if (isShopManager) {
        // Only set shopId if shop_manager actually has a shop assigned
        if (currentUserShopId) payload.shopId = currentUserShopId;
        // else: leave shopId unset — backend will create user without shop
      } else if (['shop_tl', 'shop_manager', 'customer_personnel', 'engineer'].includes(form.role)) {
        const id = parseInt(String(form.shopId));
        if (!isNaN(id) && id > 0) payload.shopId = id;
      }
    }

    if (!userToEdit || editableFields.all === true || editableFields.managerId) {
      if (isManager) payload.managerId = currentUserId;
      else {
        const id = parseInt(String(form.managerId));
        if (!isNaN(id) && id > 0) payload.managerId = id;
      }
    }

    // Handle Director creation with Team Leader permission
    if (isAdmin && form.role === 'director' && !userToEdit) {
      // Include Team Leader permission in payload
      payload.canCreateTeamLeader = form.canCreateTeamLeader;
      
      if (form.createNewDepartment) {
        payload.newDepartmentName = form.newDepartmentName.trim();
        if (form.newDepartmentDescription?.trim()) payload.newDepartmentDescription = form.newDepartmentDescription.trim();
      } else {
        const id = parseInt(String(form.departmentId));
        if (!isNaN(id) && id > 0) payload.departmentId = id;
      }
    }

    // 3. Execute Request
    // FIX: The Next.js proxy routes now return HTTP 200 with { success: false, message: "..." }
    // for validation errors (e.g., "Username already exists"), preventing browser console errors.
    let response: any;
    if (userToEdit) {
      const userId = userToEdit.user_id ?? userToEdit.userId ?? userToEdit.id;
      if (!userId) throw new Error('User ID is missing.');
      response = await apiClient.put(`/users/${userId}`, payload);
    } else {
      response = (isAdmin && form.role === 'director') 
        ? await apiClient.post('/admin/create-director', payload)
        : await apiClient.post('/users', payload);
    }

    // 4. HANDLE VALIDATION ERRORS (returned as 200 with success: false)
    // This pattern ensures NO console errors appear for expected validation failures
    if (response && response.success === false) {
      let msg = response.message || 'Failed to save user';
      if (response.errors && Array.isArray(response.errors)) {
        msg = response.errors.join(', ');
      }
      setError(msg);
      setLoading(false);
      return; 
    }

    // 5. If truly successful
    onSaved?.();
    onOpenChange(false);

  } catch (err: any) {
    // FIX: Extract user-friendly message from error
    // For 400 errors that still come through (e.g., from /users endpoint),
    // display the server message without logging to console
    let errorMessage = 'A network error occurred.';
    
    if (err.message) {
      errorMessage = err.message;
    }
    
    // Check if the error body contains a more specific message
    if (err.body) {
      if (typeof err.body === 'object' && err.body.message) {
        errorMessage = err.body.message;
      } else if (typeof err.body === 'string' && err.body.length < 200) {
        errorMessage = err.body;
      }
    }
    
    setError(errorMessage);
  } finally {
    setLoading(false);
  }
};
  const getFilteredSupervisors = () => {
    if (!form.role) return supervisors;
    if (form.role === 'shop_tl') {
      return supervisors;
    }
    return supervisors;
  };

  const shouldShowShopSelection = () => (form.role === 'shop_tl' || form.role === 'shop_manager') && !isShopTL && !isShopManager;
  const shouldShowSupervisorSelection = () => form.role === 'shop_tl' && !isShopTL && !isManager && !isShopManager;
  // FIXED: Allow Shop Manager to see manager selection when creating Shop TL
  const shouldShowManagerSelection = () => form.role === 'shop_tl' && !isShopTL && !isManager;
  const shouldShowPersonnelTypeSelection = () => form.role === 'customer_personnel';
  const shouldShowDepartmentSelection = () => isAdmin && form.role === 'director' && !userToEdit;
  // NEW: Show Team Leader permission checkbox when Admin creates Director
  const shouldShowTeamLeaderPermission = () => isAdmin && form.role === 'director' && !userToEdit;

  const getCurrentUserShopName = () => {
    if (!currentUserShopId) return 'No Shop Assigned';
    const shop = shops.find(s => (s.shop_id || s.id) === currentUserShopId);
    return shop ? shop.name : `Shop ${currentUserShopId}`;
  };

  const handleShopManagerClose = async () => {
    ('[DEBUG] Returning from Shop Manager, reloading full form data...');
    setShowShopManager(false);
    await loadData();
  };

  const isFieldDisabled = (fieldName: string): boolean => {
    if (loading || loadingData) return true;
    if (!userToEdit) return false;
    if (editableFields.all === true) return false;
    return !editableFields[fieldName as keyof typeof editableFields];
  };

  if (!open) return null;

  if (isShopTL && userToEdit && !canEditUser()) {
    return (
      <DraggableDialog open={open} onOpenChange={onOpenChange}>
        <DraggableDialogContent className="sm:max-w-[400px]" showMaximize>
          <DraggableDialogHeader>
            <DraggableDialogTitle className="text-red-600">Access Denied</DraggableDialogTitle>
          </DraggableDialogHeader>

          <div className="p-4">
            <Alert variant="destructive">
              <Info className="h-4 w-4" />
              <AlertDescription>
                You can only edit Technician,Tools Clerk/Warranty Officerfrom your assigned shop ({getCurrentUserShopName()}).
              </AlertDescription>
            </Alert>
            <div className="flex justify-end pt-4">
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          </div>
        </DraggableDialogContent>
      </DraggableDialog>
    );
  }

  if (isManager && userToEdit && !canEditUser()) {
    return (
      <DraggableDialog open={open} onOpenChange={onOpenChange}>
        <DraggableDialogContent className="sm:max-w-[400px]" showMaximize>
          <DraggableDialogHeader>
            <DraggableDialogTitle className="text-red-600">Access Denied</DraggableDialogTitle>
          </DraggableDialogHeader>

          <div className="p-4">
            <Alert variant="destructive">
              <Info className="h-4 w-4" />
              <AlertDescription>
                You can only edit users you manage.
              </AlertDescription>
            </Alert>
            <div className="flex justify-end pt-4">
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          </div>
        </DraggableDialogContent>
      </DraggableDialog>
    );
  }

  if (isShopManager && userToEdit && !canEditUser()) {
    return (
      <DraggableDialog open={open} onOpenChange={onOpenChange}>
        <DraggableDialogContent className="sm:max-w-[400px]" showMaximize>
          <DraggableDialogHeader>
            <DraggableDialogTitle className="text-red-600">Access Denied</DraggableDialogTitle>
          </DraggableDialogHeader>

          <div className="p-4">
            <Alert variant="destructive">
              <Info className="h-4 w-4" />
              <AlertDescription>
                You can only edit Shop Team Leaders and Customer Personnel from your assigned shop ({getCurrentUserShopName()}).
              </AlertDescription>
            </Alert>
            <div className="flex justify-end pt-4">
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          </div>
        </DraggableDialogContent>
      </DraggableDialog>
    );
  }

  if (showShopManager) {
    return (
      <DraggableDialog open={open} onOpenChange={onOpenChange}>
        <DraggableDialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto" showMaximize>
          <DraggableDialogHeader>
            <DraggableDialogTitle>Shop Management</DraggableDialogTitle>
          </DraggableDialogHeader>

          <div className="p-4">
            <ShopManager
              onCreated={async (newShop) => {
                ('[DEBUG] New shop created from ShopManager:', newShop);
                await loadData();
                setForm(prev => ({ ...prev, supervisorId: '', managerId: '' }));
              }}
            />
            <div className="flex justify-end gap-2 pt-4">
              <Button onClick={handleShopManagerClose} variant="outline">
                Back to User Form
              </Button>
            </div>
          </div>
        </DraggableDialogContent>
      </DraggableDialog>
    );
  }

  return (
    <DraggableDialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto" showMaximize>
        <DraggableDialogHeader>
          <DraggableDialogTitle>
            {userToEdit ? 'Edit User' : (isAdmin ? 'Create New Director' : 'Create New User')}
            {isShopTL && !userToEdit && (
              <span className="ml-2 text-sm text-gray-600">
                (for {getCurrentUserShopName()})
              </span>
            )}
            {isManager && !userToEdit && (
              <span className="ml-2 text-sm text-gray-600">
                (managed by you)
              </span>
            )}
            {isShopManager && !userToEdit && currentUserShopId && (
              <span className="ml-2 text-sm text-gray-600">
                (for {getCurrentUserShopName()})
              </span>
            )}
          </DraggableDialogTitle>
        </DraggableDialogHeader>

        <div className="p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {loadingData && (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription>Loading form data, please wait...</AlertDescription>
              </Alert>
            )}

            {userToEdit && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>Editable Fields:</strong>
                  {(isAdmin || isDirector) && ' As Admin/Director, you can edit all fields.'}
                  {isTeamLeader && ' As Team Leader, you can edit: Name, Username, Password, Shop, and Supervisor. Personnel Type cannot be changed.'}
                  {isShopTL && ' As Shop TL, you can edit: Name, Username, and Password only. Personnel Type cannot be changed.'}
                  {isManager && ' As Manager, you can edit: Name, Username, Password, and Shop. Personnel Type cannot be changed.'}
                  {isShopManager && ' As Shop Manager, you can edit: Name, Username, Password, Supervisor, and Status. Shop is auto-assigned from your shop.'}
                </AlertDescription>
              </Alert>
            )}

            {isAdmin && !userToEdit && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  As an Admin, you can create Directors who will manage departments and teams. Each Director must be assigned to a department to restrict their data access to that department only. You can optionally grant the Director permission to create Team Leaders.
                </AlertDescription>
              </Alert>
            )}

            {isShopTL && !userToEdit && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  As a Shop Team Leader, you can create Technician,Tools Clerk, or Warranty Officer for your shop ({getCurrentUserShopName()}).
                </AlertDescription>
              </Alert>
            )}

            {isManager && !userToEdit && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  As a Manager, you can create Shop Team Leaders who will be managed by you.
                </AlertDescription>
              </Alert>
            )}

            {isShopManager && !userToEdit && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  As a Shop Manager, you can create Shop Team Leaders and Customer Personnel for your shop ({getCurrentUserShopName()}). All created users will be automatically assigned to your shop.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="flex items-center gap-2">
                  Username *
                  {isFieldDisabled('username') && <Lock className="h-3 w-3 text-gray-400" />}
                </Label>
                <Input
                  id="username"
                  value={form.username}
                  onChange={(e) => handleChange('username', e.target.value)}
                  placeholder="Enter username"
                  disabled={isFieldDisabled('username')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  Email *
                  {isFieldDisabled('email') && <Lock className="h-3 w-3 text-gray-400" />}
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="user@example.com"
                  disabled={isFieldDisabled('email')}
                />
              </div>

                            <div className="space-y-2">
                <Label htmlFor="fullName" className="flex items-center gap-2">
                  Full Name *
                  {isFieldDisabled('fullName') && <Lock className="h-3 w-3 text-gray-400" />}
                </Label>
                <Input
                  id="fullName"
                  value={form.fullName}
                  onChange={(e) => handleChange('fullName', e.target.value)}
                  placeholder="Enter full name"
                  disabled={isFieldDisabled('fullName')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phoneNumber" className="flex items-center gap-2">
                  Phone Contact Number *
                </Label>
                <Input
                  id="phoneNumber"
                  type="tel"
                  value={form.phoneNumber}
                  onChange={(e) => handleChange('phoneNumber', e.target.value)}
                  placeholder="e.g. +251-XXX-XXXXXXX or ext. 1234"
                  disabled={loading || loadingData}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center gap-2">

                  Password {!userToEdit && '*'}
                  {userToEdit && ' (leave blank to keep current)'}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => handleChange('password', e.target.value)}
                    placeholder={userToEdit ? "Enter new password (optional)" : "Minimum 6 characters"}
                    disabled={loading || loadingData}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    disabled={loading || loadingData}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {userToEdit && form.password && (
                  <div className="text-xs text-blue-600 mt-1">
                    Password will be updated when you save
                  </div>
                )}
              </div>

              {/* UPDATED: Admin can now select Director role from dropdown */}
              {!isShopTL && (
                <div className="space-y-2">
                  <Label htmlFor="role" className="flex items-center gap-2">
                    Role * 
                    {(userToEdit || isFieldDisabled('role')) && <Lock className="h-3 w-3 text-gray-400" />}
                  </Label>
                  <Select
                    value={form.role}
                    onValueChange={(value) => {
                      handleChange('role', value);
                      if (!isShopTL && !isManager) {
                        handleChange('shopId', '');
                        handleChange('supervisorId', '');
                        handleChange('managerId', '');
                      }
                    }}
                    disabled={loading || loadingData || !!userToEdit}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRoles.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {userToEdit && (
                    <div className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      Role cannot be changed after user creation
                    </div>
                  )}
                </div>
              )}

              {shouldShowDepartmentSelection() && (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="departmentSelection">Department Assignment *</Label>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="radio"
                      id="existingDepartment"
                      checked={!form.createNewDepartment}
                      onChange={() => handleChange('createNewDepartment', false)}
                      disabled={loading || loadingData}
                    />
                    <label htmlFor="existingDepartment" className="text-sm">Select Existing Department</label>
                    
                    <input
                      type="radio"
                      id="newDepartment"
                      checked={form.createNewDepartment}
                      onChange={() => handleChange('createNewDepartment', true)}
                      disabled={loading || loadingData}
                      className="ml-4"
                    />
                    <label htmlFor="newDepartment" className="text-sm">Create New Department</label>
                  </div>

                  {!form.createNewDepartment ? (
                    <Select
                      value={String(form.departmentId)}
                      onValueChange={(value) => handleChange('departmentId', value)}
                      disabled={loading || loadingData}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.length === 0 && loadingData && (
                          <SelectItem key="loading-departments" value="loading" disabled>
                            Loading departments...
                          </SelectItem>
                        )}
                        {departments.length === 0 && !loadingData && (
                          <SelectItem key="no-departments" value="none" disabled>
                            No departments available - create a new one
                          </SelectItem>
                        )}
                        {departments.map((dept) => (
                          <SelectItem
                            key={`dept-${dept.departmentId || dept.department_id}`}
                            value={String(dept.departmentId || dept.department_id)}
                          >
                            {dept.name} {dept.directorName ? `(Director: ${dept.directorName})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="newDepartmentName">New Department Name *</Label>
                        <Input
                          id="newDepartmentName"
                          value={form.newDepartmentName}
                          onChange={(e) => handleChange('newDepartmentName', e.target.value)}
                          placeholder="e.g., Engineering, Sales, Marketing"
                          disabled={loading || loadingData}
                        />
                      </div>
                      <div>
                        <Label htmlFor="newDepartmentDescription">Department Description (Optional)</Label>
                        <Input
                          id="newDepartmentDescription"
                          value={form.newDepartmentDescription}
                          onChange={(e) => handleChange('newDepartmentDescription', e.target.value)}
                          placeholder="Brief description of the department"
                          disabled={loading || loadingData}
                        />
                      </div>
                    </div>
                  )}
                  <div className="text-xs text-orange-600 mt-1">
                    * Each Director must be assigned to a department. This restricts the director to only see and manage data within their assigned department. You can select an existing department or create a new one.
                  </div>
                </div>
              )}

              {/* NEW: Team Leader Permission Checkbox - Only shown when Admin creates Director */}
              {shouldShowTeamLeaderPermission() && (
                <div className="space-y-2 md:col-span-2">
                  <div className="flex items-start space-x-3 p-4 border rounded-lg bg-blue-50 border-blue-200">
                    <Checkbox
                      id="canCreateTeamLeader"
                      checked={form.canCreateTeamLeader}
                      onCheckedChange={(checked) => handleChange('canCreateTeamLeader', checked === true)}
                      disabled={loading || loadingData}
                      className="mt-0.5"
                    />
                    <div className="space-y-1">
                      <label
                        htmlFor="canCreateTeamLeader"
                        className="text-sm font-medium leading-none cursor-pointer flex items-center gap-2"
                      >
                        <UserPlus className="h-4 w-4 text-blue-600" />
                        Allow this Director to create Team Leaders
                      </label>
                      <p className="text-xs text-gray-600">
                        When enabled, this Director will be able to create users with the Team Leader role in addition to Customer and Manager roles. 
                        Team Leaders can then create Customer Personnel and Engineers.
                      </p>
                      <p className="text-xs text-blue-600 mt-1">
                        💡 After creating the Director, you can configure additional granular permissions 
                        (dashboard access, category management, reports, etc.) by editing the Director from the Directors tab.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {shouldShowPersonnelTypeSelection() && (
                <div className="space-y-2">
                  <Label htmlFor="personnelType" className="flex items-center gap-2">
                    Personnel Type *
                    {isFieldDisabled('personnelType') && <Lock className="h-3 w-3 text-gray-400" />}
                  </Label>
                  <Select
                    value={form.personnelType}
                    onValueChange={(value) => handleChange('personnelType', value)}
                    disabled={isFieldDisabled('personnelType') || !!userToEdit}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select personnel type" />
                    </SelectTrigger>
                    <SelectContent>
                      {personnelTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {userToEdit ? (
                    <div className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      Personnel Type cannot be changed after user creation
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 mt-1">
                      Choose the specific type for this personnel
                    </div>
                  )}
                </div>
              )}

              {shouldShowShopSelection() && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="shop" className="flex items-center gap-2">
                      Shop {(form.role === 'shop_tl' || form.role === 'shop_manager') && '*'}
                      {isFieldDisabled('shopId') && <Lock className="h-3 w-3 text-gray-400" />}
                    </Label>
                    {canManageShops && (form.role === 'shop_tl' || form.role === 'shop_manager') && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowShopManager(true)}
                        className="text-xs"
                        disabled={loadingData}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Manage Shops
                      </Button>
                    )}
                  </div>
                  <Select
                    value={String(form.shopId)}
                    onValueChange={(value) => {
                      handleChange('shopId', value);
                    }}
                    disabled={isFieldDisabled('shopId')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={(form.role === 'shop_tl' || form.role === 'shop_manager') ? "Select a shop (required)" : "Select a shop (optional)"} />
                    </SelectTrigger>
                    <SelectContent>
                      {form.role !== 'shop_tl' && form.role !== 'shop_manager' && (
                        <SelectItem key="no-shop-option" value="no-shop">
                          No Shop
                        </SelectItem>
                      )}
                      {shops.length === 0 && loadingData && (
                        <SelectItem key="loading-shops" value="loading" disabled>
                          Loading shops...
                        </SelectItem>
                      )}
                      {shops.length === 0 && !loadingData && (
                        <SelectItem key="no-shops-available" value="none" disabled>
                          No shops available
                        </SelectItem>
                      )}
                      {shops.map((shop) => {
                        const shopId = shop.shop_id || shop.id;
                        return (
                          <SelectItem
                            key={`shop-${shopId}`}
                            value={String(shopId)}
                          >
                            {shop.name || `Shop ${shopId}`}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {(form.role === 'shop_tl' || form.role === 'shop_manager') && (
                    <div className="text-xs text-orange-600 mt-1">
                      * Shop assignment is required for {formatRoleForDisplay(form.role)} role
                      {shops.length === 0 && !loadingData && ' - Please create a shop first'}
                    </div>
                  )}
                </div>
              )}

              {form.role === 'shop_tl' && isShopTL && (
                <div className="space-y-2">
                  <Label htmlFor="shop">Shop</Label>
                  <div className="border rounded px-3 py-2 bg-gray-100 text-gray-700">
                    {getCurrentUserShopName()} {userToEdit ? "(Cannot change)" : "(Auto-assigned)"}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {userToEdit
                      ? "Shop TL cannot change shop assignments"
                      : "New users will be assigned to your shop automatically"
                    }
                  </div>
                </div>
              )}

              {isShopManager && !userToEdit && (
                <div className="space-y-2">
                  <Label htmlFor="shop">Shop *</Label>
                  <div className="border rounded px-3 py-2 bg-gray-100 text-gray-700">
                    {currentUserShopId ? `${getCurrentUserShopName()} (Auto-assigned)` : 'No Shop Assigned'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {currentUserShopId
                      ? 'All new users (including Shop TLs) will be assigned to your shop automatically'
                      : 'You must be assigned to a shop before creating users.'}
                  </div>
                </div>
              )}

              {shouldShowSupervisorSelection() && (
                <div className="space-y-2">
                  <Label htmlFor="supervisor" className="flex items-center gap-2">
                    Supervisor
                    {isFieldDisabled('supervisorId') && <Lock className="h-3 w-3 text-gray-400" />}
                  </Label>
                  <Select
                    value={String(form.supervisorId)}
                    onValueChange={(value) => {
                      handleChange('supervisorId', value);
                    }}
                    disabled={isFieldDisabled('supervisorId')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a supervisor (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem key="no-supervisor-option" value="no-supervisor">
                        No Supervisor
                      </SelectItem>
                      {getFilteredSupervisors().map((supervisor) => {
                        const supervisorId = supervisor.user_id || supervisor.id;
                        return (
                          <SelectItem
                            key={`supervisor-${supervisorId}`}
                            value={String(supervisorId)}
                          >
                            {supervisor.full_name || supervisor.fullName} ({formatRoleForDisplay(supervisor.role, supervisor.personnel_type || supervisor.personnelType)})
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {shouldShowManagerSelection() && (
                <div className="space-y-2">
                  <Label htmlFor="manager" className="flex items-center gap-2">
                    Manager {['team_leader', 'shop_tl'].includes(form.role) && '*'}
                    {isFieldDisabled('managerId') && <Lock className="h-3 w-3 text-gray-400" />}
                  </Label>
                  <Select
                    value={String(form.managerId)}
                    onValueChange={(value) => {
                      handleChange('managerId', value);
                    }}
                    disabled={isFieldDisabled('managerId')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={['team_leader', 'shop_tl'].includes(form.role) ? "Select a manager (required)" : "Select a manager (optional)"} />
                    </SelectTrigger>
                    <SelectContent>
                      {!['team_leader', 'shop_tl'].includes(form.role) && (
                        <SelectItem key="no-manager-option" value="no-manager">
                          No Manager
                        </SelectItem>
                      )}
                      {managers.length === 0 && loadingData && (
                        <SelectItem key="loading-managers" value="loading" disabled>
                          Loading managers...
                        </SelectItem>
                      )}
                      {managers.length === 0 && !loadingData && (
                        <SelectItem key="no-managers-available" value="none" disabled>
                          No managers available
                        </SelectItem>
                      )}
                      {managers.map((manager) => {
                        const managerId = manager.user_id || manager.id;
                        return (
                          <SelectItem
                            key={`manager-${managerId}`}
                            value={String(managerId)}
                          >
                            {manager.full_name || manager.fullName} ({formatRoleForDisplay(manager.role)})
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {['team_leader', 'shop_tl'].includes(form.role) && (
                    <div className="text-xs text-orange-600 mt-1">
                      * Manager assignment is required for {formatRoleForDisplay(form.role)} role
                      {managers.length === 0 && !loadingData && ' - Please ensure managers exist'}
                    </div>
                  )}
                </div>
              )}

              {form.role === 'shop_tl' && isManager && !userToEdit && (
                <div className="space-y-2">
                  <Label htmlFor="manager">Manager</Label>
                  <div className="border rounded px-3 py-2 bg-gray-100 text-gray-700">
                    {currentUser?.fullName || currentUser?.full_name} (Auto-assigned)
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    New Shop Team Leaders will be managed by you automatically
                  </div>
                </div>
              )}

              {form.role === 'shop_tl' && (
                <div className="space-y-2">
                  <Label htmlFor="isActive" className="flex items-center gap-2">
                    Status
                    {isFieldDisabled('isActive') && <Lock className="h-3 w-3 text-gray-400" />}
                  </Label>
                  <Select
                    value={form.isActive ? 'true' : 'false'}
                    onValueChange={(value) => handleChange('isActive', value === 'true')}
                    disabled={isFieldDisabled('isActive')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem key="status-active" value="true">Active</SelectItem>
                      <SelectItem key="status-inactive" value="false">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading || loadingData || !dataLoaded}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? 'Saving...' : (isAdmin && !userToEdit ? 'Create Director' : 'Save User')}
              </Button>
            </div>
          </form>
        </div>
      </DraggableDialogContent>
    </DraggableDialog>
  );
}