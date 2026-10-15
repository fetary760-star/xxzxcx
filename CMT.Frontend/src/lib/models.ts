// Lightweight domain models / interfaces used by the frontend.
// Keep these in sync with your backend JSON shapes.

export interface User {
  user_id: number | string
  full_name?: string
  username?: string
  email?: string
  role?: string
  roleDisplayName?: string
  roleDisplay?: string
  shop_id?: number
  shop_name?: string
  supervisor_id?: number | null
  supervisor_name?: string | null
  manager_id?: number | null
  manager_name?: string | null
  isActive?: boolean
  profilePicturePath?: string
  createdAt?: string
  lastLoginAt?: string | null
  permissions?: string[]
  [k: string]: any
}

export interface Attachment {
  attachment_id?: number | string
  file_path?: string
  file_name?: string
  file_type?: string
  uploaded_by?: number | string
  uploaded_at?: string
  uploader_name?: string
  [k: string]: any
}

export interface AuditTrailItem {
  id?: number | string
  user_id?: number | string
  action_type?: string
  entity_type?: string
  entity_id?: number | string
  change_details?: string
  created_at?: string
  [k: string]: any
}

export interface Task {
  task_id: number
  serial_number?: string
  part_number?: string
  po_number?: string
  description?: string
  category_name?: string
  category_id?: number
  status?: string
  assigned_engineer?: string | null
  assigned_engineers?: Array<string> | null
  priority_level_name?: string
  priority_name?: string
  priority_id?: number
  creator_name?: string
  created_by?: number
  target_completion_date?: string | null
  estimated_completion_date?: string | null
  actual_completion_date?: string | null
  created_at?: string | null
  attachment_path?: string | null
  attachments_count?: number
  show_revision_alert?: boolean
  is_duplicate?: boolean
  revision_notes?: string | null
  audit_trail?: AuditTrailItem[]
  // Reopened task fields
  is_reopened?: boolean
  reopen_count?: number
  reopen_reason?: string
  reopened_at?: string | null
  reopened_by?: number
  // Amendment fields
  amendment_request?: boolean
  amendment_status?: number | null
  amendment_reviewed_by_tl_id?: number | null
  amendment_reviewed_by_director_id?: number | null
  final_status?: string
  // Comments field for debugging
  comments?: string
  // Unique React key for rendering
  _reactKey?: string
  _uniqueId?: string
  [k: string]: any
}

export interface Category {
  category_id: number
  category_name: string
  description?: string
  is_active?: boolean
  created_at?: string
  [k: string]: any
}

export interface Priority {
  priority_id: number
  priority_name: string
  priority_level?: number
  description?: string
  is_active?: boolean
  created_at?: string
  [k: string]: any
}

export interface Shop {
  shop_id: number
  shop_name: string
  location?: string
  description?: string
  manager_id?: number | null
  manager_name?: string | null
  is_active?: boolean
  created_at?: string
  [k: string]: any
}

export interface RequestType {
  request_type_id: number
  request_type_name: string
  description?: string
  is_active?: boolean
  created_at?: string
  [k: string]: any
}

export interface SubType {
  sub_type_id: number
  sub_type_name: string
  request_type_id?: number
  description?: string
  is_active?: boolean
  created_at?: string
  [k: string]: any
}

export interface TargetDay {
  target_day_id: number
  target_day_name: string
  days_count: number
  target_hours?: number
  target_minutes?: number
  description?: string
  is_active?: boolean
  created_at?: string
  [k: string]: any
}

export interface CategoryTargetDay {
  target_id?: number
  id?: number
  category_id: number
  category_name?: string
  target_days: number
  targetDays?: number
  target_hours: number
  targetHours?: number
  target_minutes: number
  targetMinutes?: number
  category?: {
    id: number
    name: string
  }
  [k: string]: any
}

// NEW: Manager Dashboard interface
export interface ManagerDashboard {
  manager_user_id: number
  manager_name: string
  managed_users: User[]
  total_managed_users: number
  managed_shops: Shop[]
  total_managed_shops: number
  total_active_tasks: number
  total_completed_tasks: number
  recent_tasks: TaskSummary[]
  task_status_breakdown: Record<string, number>
  role_distribution: Record<string, number>
}

export interface TaskSummary {
  task_id: number
  description: string
  status: string
  created_by_name: string
  created_at: string
  completed_at?: string | null
  category_name?: string
  priority_name?: string
}