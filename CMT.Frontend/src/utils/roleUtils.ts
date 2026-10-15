// Role mapping utility to convert database role values to display names
export const ROLE_MAPPINGS = {
  'team_leader': 'Team Leader',
  'director': 'Director', 
  'engineer': 'Engineer',
  'customer_personnel': 'Customer Personnel',
  'customer': 'Customer',
  'shop_tl': 'Shop Team Leader',
  'manager': 'Manager',
  'admin': 'Admin',
  'shop_manager': 'Shop Manager'
} as const;

// Personnel type mappings for customer_personnel role
export const PERSONNEL_TYPE_MAPPINGS = {
  'technician': 'Technician',
  'tools_clerk': 'Tools Clerk',
  'warranty_officer': 'Warranty Officer'
} as const;

export type DatabaseRole = keyof typeof ROLE_MAPPINGS;
export type DisplayRole = typeof ROLE_MAPPINGS[DatabaseRole];
export type PersonnelType = keyof typeof PERSONNEL_TYPE_MAPPINGS;

// Convert database role to display name with personnel type support
export const formatRoleForDisplay = (role: string | undefined | null, personnelType?: string | null): string => {
  if (!role) return 'No Role';
  
  // Handle customer_personnel with personnel type variations
  if (role === 'customer_personnel' && personnelType) {
    const normalizedType = personnelType.toLowerCase() as PersonnelType;
    return PERSONNEL_TYPE_MAPPINGS[normalizedType] || 'Customer Personnel';
  }
  
  // Handle both database format and already formatted roles
  const normalizedRole = role.toLowerCase().replace(/\s+/g, '_') as DatabaseRole;
  
  return ROLE_MAPPINGS[normalizedRole] || role;
};

// Convert display name back to database format
export const formatRoleForDatabase = (displayRole: string): string => {
  // Find the database key for the display value
  const entry = Object.entries(ROLE_MAPPINGS).find(([, display]) => display === displayRole);
  return entry ? entry[0] : displayRole.toLowerCase().replace(/\s+/g, '_');
};

// Get all available roles for dropdowns
export const getAllRoles = () => {
  return Object.entries(ROLE_MAPPINGS).map(([value, label]) => ({
    value,
    label,
    id: value
  }));
};

// Get all personnel types for customer_personnel role
export const getAllPersonnelTypes = () => {
  return Object.entries(PERSONNEL_TYPE_MAPPINGS).map(([value, label]) => ({
    value,
    label,
    id: value
  }));
};

// Check if a role has specific permissions
export const hasPermission = (userRole: string, requiredRole: string): boolean => {
  const roleHierarchy = {
    'admin': 8,
    'director': 7,
    'manager': 6,
    'team_leader': 5,
    'shop_manager': 5,
    'shop_tl': 4,
    'engineer': 3,
    'customer_personnel': 2,
    'customer': 1
  };
  
  const userLevel = roleHierarchy[userRole as keyof typeof roleHierarchy] || 0;
  const requiredLevel = roleHierarchy[requiredRole as keyof typeof roleHierarchy] || 0;
  
  return userLevel >= requiredLevel;
};

// UPDATED: Helper functions for manager role functionality
export const canManageRole = (managerRole: string, targetRole: string, managerShopName?: string, targetShopName?: string): boolean => {
  // Admin can create Directors, and also Customer, Manager, Team Leader
  if (managerRole === 'admin') {
    return ['director', 'customer', 'manager', 'team_leader'].includes(targetRole);
  }
  
  // Directors can manage customer, manager, team_leader, and shop_manager (if assigned by admin)
  if (managerRole === 'director') {
    return ['manager', 'customer', 'team_leader', 'shop_manager'].includes(targetRole);
  }
  
  // Managers can manage shop_tl and shop_manager
  if (managerRole === 'manager') {
    return ['shop_tl', 'shop_manager'].includes(targetRole);
  }
  
  // Team leaders can manage customer_personnel and engineer only
  if (managerRole === 'team_leader') {
    return ['customer_personnel', 'engineer'].includes(targetRole);
  }
  
  // Shop TL can only manage customer_personnel (all personnel types)
  if (managerRole === 'shop_tl') {
    return targetRole === 'customer_personnel';
  }

  // Shop Manager can manage shop_tl and customer_personnel within their own shop_name only
  if (managerRole === 'shop_manager') {
    const allowedRoles = ['shop_tl', 'customer_personnel'];
    if (!allowedRoles.includes(targetRole)) return false;
    // Enforce strict shop_name scoping: Shop Manager can ONLY manage users within their own shop_name
    if (managerShopName && targetShopName) {
      return managerShopName.toLowerCase().trim() === targetShopName.toLowerCase().trim();
    }
    // If either shop_name is missing, deny access for safety
    if (!managerShopName || !targetShopName) return false;
    return true;
  }
  
  return false;
};

export const getManageableRoles = (userRole: string, hasTeamLeaderPermission?: boolean): string[] => {
  switch (userRole) {
    case 'admin':
      // Admin can create Directors, Customers, Managers, and Team Leaders
      return ['director', 'customer', 'manager', 'team_leader'];
    case 'director':
      // Director can create Manager, Customer, Shop Manager, and Team Leader (if permission granted by admin)
      if (hasTeamLeaderPermission) {
        return ['manager', 'customer', 'team_leader', 'shop_manager'];
      }
      return ['manager', 'customer', 'shop_manager'];
    case 'manager':
      return ['shop_tl', 'shop_manager'];
    case 'team_leader':
      return ['customer_personnel', 'engineer'];
    case 'shop_tl':
      return ['customer_personnel'];
    case 'shop_manager':
      return ['shop_tl', 'customer_personnel'];
    default:
      return [];
  }
};