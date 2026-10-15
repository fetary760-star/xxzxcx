// API Configuration
// This file centralizes API endpoint configuration

// Backend API base URL - use environment variable or default to svhqiis03
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api'

// SignalR Hub URL for real-time notifications
export const SIGNALR_HUB_URL = process.env.NEXT_PUBLIC_SIGNALR_HUB_URL || 'http://localhost:5000/notificationHub'

// API endpoints
export const API_ENDPOINTS = {
  // Auth
  LOGIN: '/auth/login',
  LOGOUT: '/auth/logout',
  REFRESH: '/auth/refresh',
  ME: '/auth/me',
  PERMISSIONS: '/auth/permissions',
  
  // Users
  USERS: '/users',
  USER_BY_ID: (id: number) => `/users/${id}`,
  
  // Tasks
  TASKS: '/tasks',
  TASK_BY_ID: (id: number) => `/tasks/${id}`,
  COMPLETED_TASKS: '/tasks/completed',
  
  // Notifications
  NOTIFICATIONS: '/notifications',
  NOTIFICATIONS_USER: (userId: number) => `/notifications/user/${userId}`,
  NOTIFICATIONS_MARK: '/notifications/mark',
  
  // Performance
  PERFORMANCE: '/performance',
  
  // Reference Data
  CATEGORIES: '/reference-data/categories',
  PRIORITIES: '/reference-data/priorities',
  
  // Shops
  SHOPS: '/shops',
  SHOP_BY_ID: (id: number) => `/shops/${id}`,

  // Maintenix Data Integration
  MAINTENIX_FETCH: '/api/maintenix/fetch',

  // Admin - Soft-Delete Management
  ADMIN_SOFT_DELETED_USERS: '/admin/soft-deleted-users',
  ADMIN_PERMANENTLY_DELETE_USER: (id: number) => `/admin/users/${id}/permanent`,
  ADMIN_RESTORE_USER: (id: number) => `/admin/users/${id}/restore`,
  ADMIN_SOFT_DELETED_TASKS: '/admin/soft-deleted-tasks',
  ADMIN_PERMANENTLY_DELETE_TASK: (id: number) => `/admin/tasks/${id}/permanent`,
  ADMIN_RESTORE_TASK: (id: number) => `/admin/tasks/${id}/restore`,
}

export default {
  API_BASE_URL,
  SIGNALR_HUB_URL,
  API_ENDPOINTS,
}