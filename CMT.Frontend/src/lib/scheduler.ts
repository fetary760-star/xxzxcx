// Server-side scheduler & analysis helper used by API routes.
// Enhanced greedy scheduler with EAT timezone support, break management,
// leave deductions, weekend amendments, and fairness metrics.
//
// Usage:
//   import { greedySchedule, analyzeSchedule, EAT_SCHEDULE_CONFIG } from '@/lib/scheduler'
//
// Notes:
// - This module is framework-agnostic. It expects dates as YYYY-MM-DD strings.
// - All times are in hours (decimal). Supports fractional hours.
// - EAT (East Africa Time) = UTC+3
//
// Types:
// - Task: { task_id, estimated_hours, planned_start_date, planned_end_date, assigned_user_id?, priority? }
// - User: { user_id, full_name, work_hours_per_day }
// - TimeOff: { user_id, start_date, end_date, hours_per_day? }

// ═══════════════════════════════════════════════════════════════════════════════
// EAT SCHEDULE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

export interface BreakConfig {
  name: string
  startTime: string   // HH:mm format
  durationMinutes: number
}

export interface ScheduleConfig {
  timezone: string
  timezoneOffset: number // UTC offset in hours
  workStartTime: string  // HH:mm
  workEndTime: string    // HH:mm
  workDays: number[]     // 0=Sun, 1=Mon, ..., 6=Sat
  daysOff: number[]      // 0=Sun, 6=Sat
  breaks: BreakConfig[]
  grossWorkHoursPerDay: number
  totalBreakMinutes: number
  netWorkHoursPerDay: number
}

/**
 * Default EAT Schedule Configuration
 * Monday-Friday: 08:00 AM - 17:00 PM EAT (9 gross hours)
 * Breaks: Morning tea (15min), Lunch (75min), Afternoon tea (15min) = 105min total
 * Net available: 7.25 hours/day (435 min)
 * Saturday & Sunday: Days off
 *
 * FIX (Issues 1 & 10): Aligned with backend ScheduleService.cs constants:
 *   Shift: 08:00–17:00, Breaks: 15+75+15=105min, Net: 7.25h/day
 */
export const EAT_SCHEDULE_CONFIG: ScheduleConfig = {
  timezone: 'Africa/Nairobi',
  timezoneOffset: 3, // UTC+3
  workStartTime: '08:00',
  workEndTime: '17:00',          // FIX: Was '23:00'
  workDays: [1, 2, 3, 4, 5],    // Mon-Fri
  daysOff: [0, 6],               // Sun, Sat
  breaks: [
    { name: 'Morning Tea Break', startTime: '10:00', durationMinutes: 15 },
    { name: 'Lunch Break', startTime: '13:00', durationMinutes: 75 },   // FIX: Was 60
    { name: 'Afternoon Tea Break', startTime: '16:00', durationMinutes: 15 },
  ],
  grossWorkHoursPerDay: 9,       // FIX: Was 15 (08:00 to 17:00 = 9h)
  totalBreakMinutes: 105,         // FIX: Was 90 (15 + 75 + 15 = 105)
  netWorkHoursPerDay: 7.25,       // FIX: Was 13.5 ((540 - 105) / 60 = 7.25)
}

/**
 * Calculate net work hours for a given schedule config
 */
export function calculateNetWorkHours(config: ScheduleConfig): number {
  const [startH, startM] = config.workStartTime.split(':').map(Number)
  const [endH, endM] = config.workEndTime.split(':').map(Number)
  const grossMinutes = (endH * 60 + endM) - (startH * 60 + startM)
  const totalBreakMinutes = config.breaks.reduce((sum, b) => sum + b.durationMinutes, 0)
  return (grossMinutes - totalBreakMinutes) / 60
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEAVE / ABSENCE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type LeaveType = 'vacation' | 'sick_leave' | 'training' | 'personal' | 'other'

export interface LeaveEntry {
  user_id: number | string
  start_date: string
  end_date: string
  leave_type: LeaveType
  hours_per_day?: number | null // null = full day off
  reason?: string
  approved_by?: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEEKEND AMENDMENT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface WeekendAmendment {
  user_id: number | string
  date: string // Must be a Saturday or Sunday
  work_hours: number
  category_id?: number
  task_id?: number | string
  reason?: string
  approved_by?: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// DUPLICATE CATEGORY DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

export interface DuplicateCategoryAlert {
  engineer_name: string
  engineer_id: number | string
  category_name: string
  category_id: number
  existing_task_count: number
  existing_tasks: Array<{ task_id: number | string; description?: string; status?: string }>
  available_hours_for_category: number
  message: string
}

/**
 * Detect duplicate category assignments for an engineer
 */
export function detectDuplicateCategories(
  tasks: TaskInput[],
  engineerId: number | string,
  newCategoryId: number,
  categoryName: string,
  engineerName: string,
  config: ScheduleConfig = EAT_SCHEDULE_CONFIG
): DuplicateCategoryAlert | null {
  const engineerTasks = tasks.filter(
    t => String(t.assigned_user_id) === String(engineerId) && t.category_id === newCategoryId
  )

  if (engineerTasks.length === 0) return null

  return {
    engineer_name: engineerName,
    engineer_id: engineerId,
    category_name: categoryName,
    category_id: newCategoryId,
    existing_task_count: engineerTasks.length,
    existing_tasks: engineerTasks.map(t => ({
      task_id: t.task_id,
      description: t.description,
      status: t.status,
    })),
    available_hours_for_category: config.netWorkHoursPerDay,
    message: `⚠️ Engineer "${engineerName}" already has ${engineerTasks.length} task(s) in category "${categoryName}". Available daily hours: ${config.netWorkHoursPerDay}h.`,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TASK CAPACITY CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════════

export interface TaskCapacity {
  engineer_id: number | string
  engineer_name: string
  date: string
  gross_hours: number
  break_hours: number
  leave_hours: number
  net_available_hours: number
  assigned_hours: number
  remaining_capacity: number
  tasks_that_can_fit: number
  is_weekend: boolean
  weekend_amendment_hours: number
}

/**
 * Calculate task capacity for an engineer on a specific date
 */
export function calculateTaskCapacity(
  engineerId: number | string,
  engineerName: string,
  date: string,
  assignedTasks: TaskInput[],
  leaveEntries: LeaveEntry[],
  weekendAmendments: WeekendAmendment[],
  config: ScheduleConfig = EAT_SCHEDULE_CONFIG,
  targetDaysPerTask: number = 1
): TaskCapacity {
  const d = new Date(date + 'T00:00:00')
  const dayOfWeek = d.getDay() // 0=Sun, 6=Sat
  const isWeekend = config.daysOff.includes(dayOfWeek)

  let grossHours = 0
  let breakHours = 0
  let weekendAmendmentHours = 0

  if (isWeekend) {
    // Check for weekend amendments
    const amendment = weekendAmendments.find(
      wa => String(wa.user_id) === String(engineerId) && wa.date === date
    )
    if (amendment) {
      weekendAmendmentHours = amendment.work_hours
      grossHours = amendment.work_hours
      // Proportional breaks for weekend work
      breakHours = (amendment.work_hours / config.grossWorkHoursPerDay) * (config.totalBreakMinutes / 60)
    }
  } else {
    grossHours = config.grossWorkHoursPerDay
    breakHours = config.totalBreakMinutes / 60
  }

  // Calculate leave deductions
  let leaveHours = 0
  for (const leave of leaveEntries) {
    if (String(leave.user_id) !== String(engineerId)) continue
    if (date >= leave.start_date && date <= leave.end_date) {
      leaveHours += leave.hours_per_day ?? config.netWorkHoursPerDay
    }
  }

  const netAvailableHours = Math.max(0, grossHours - breakHours - leaveHours)

  // Calculate already assigned hours
  const assignedHours = assignedTasks
    .filter(t => String(t.assigned_user_id) === String(engineerId))
    .reduce((sum, t) => sum + (t.estimated_hours ?? 0), 0)

  const remainingCapacity = Math.max(0, netAvailableHours - assignedHours)
  const tasksThatCanFit = targetDaysPerTask > 0
    ? Math.floor(remainingCapacity / (config.netWorkHoursPerDay / targetDaysPerTask))
    : 0

  return {
    engineer_id: engineerId,
    engineer_name: engineerName,
    date,
    gross_hours: Number(grossHours.toFixed(2)),
    break_hours: Number(breakHours.toFixed(2)),
    leave_hours: Number(leaveHours.toFixed(2)),
    net_available_hours: Number(netAvailableHours.toFixed(2)),
    assigned_hours: Number(assignedHours.toFixed(2)),
    remaining_capacity: Number(remainingCapacity.toFixed(2)),
    tasks_that_can_fit: tasksThatCanFit,
    is_weekend: isWeekend,
    weekend_amendment_hours: weekendAmendmentHours,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORIGINAL TYPES (preserved)
// ═══════════════════════════════════════════════════════════════════════════════

export type TaskInput = {
  task_id: number | string
  estimated_hours?: number
  planned_start_date?: string | null
  planned_end_date?: string | null
  assigned_user_id?: number | null
  priority?: number // higher = more priority
  shop_id?: number | null
  category_id?: number
  category_name?: string
  description?: string
  status?: string
  target_days?: number
  target_hours?: number
  target_minutes?: number
}

export type UserInput = {
  user_id: number | string
  full_name?: string
  work_hours_per_day?: number
  role?: string
}

export type TimeOff = {
  user_id: number | string
  start_date: string
  end_date: string
  hours_per_day?: number | null // optional partial-day
}

export type ScheduleEntry = {
  task_id: number | string
  user_id: number | string | null
  date: string | null // YYYY-MM-DD or null if unscheduled
  allocated_hours: number
  source: 'auto' | 'manual' | 'unscheduled'
}

// Helper: iterate date range inclusive
function datesBetween(startIso: string, endIso: string) {
  const res: string[] = []
  const s = new Date(startIso + 'T00:00:00')
  const e = new Date(endIso + 'T00:00:00')
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    res.push(d.toISOString().slice(0, 10))
  }
  return res
}

/**
 * Check if a date is a working day based on schedule config
 */
export function isWorkingDay(date: string, config: ScheduleConfig = EAT_SCHEDULE_CONFIG): boolean {
  const d = new Date(date + 'T00:00:00')
  const dayOfWeek = d.getDay()
  return config.workDays.includes(dayOfWeek)
}

/**
 * Get working days between two dates
 */
export function getWorkingDays(
  startIso: string,
  endIso: string,
  config: ScheduleConfig = EAT_SCHEDULE_CONFIG
): string[] {
  return datesBetween(startIso, endIso).filter(d => isWorkingDay(d, config))
}

// Build timeOffMap: userId -> Set(date) or map to hours off
function buildTimeOffMap(timeOffs: TimeOff[] = [], defaultWorkHours = 7.25) {
  const map: Record<string, Record<string, number>> = {}
  for (const t of timeOffs || []) {
    const dates = datesBetween(t.start_date, t.end_date)
    for (const d of dates) {
      if (!map[String(t.user_id)]) map[String(t.user_id)] = {}
      map[String(t.user_id)][d] = t.hours_per_day == null ? defaultWorkHours : t.hours_per_day
    }
  }
  return map
}

// Build leave map from LeaveEntry[]
function buildLeaveMap(leaves: LeaveEntry[] = [], defaultWorkHours = 7.25) {
  const map: Record<string, Record<string, number>> = {}
  for (const l of leaves) {
    const dates = datesBetween(l.start_date, l.end_date)
    for (const d of dates) {
      if (!map[String(l.user_id)]) map[String(l.user_id)] = {}
      map[String(l.user_id)][d] = (map[String(l.user_id)][d] ?? 0) + (l.hours_per_day ?? defaultWorkHours)
    }
  }
  return map
}

// Build weekend amendment map
function buildWeekendAmendmentMap(amendments: WeekendAmendment[] = []) {
  const map: Record<string, Record<string, number>> = {}
  for (const a of amendments) {
    if (!map[String(a.user_id)]) map[String(a.user_id)] = {}
    map[String(a.user_id)][a.date] = a.work_hours
  }
  return map
}

/**
 * greedySchedule - Enhanced with EAT timezone support
 *
 * Inputs:
 *  - tasks: TaskInput[]
 *  - users: UserInput[]
 *  - timeOffs: TimeOff[]
 *  - period: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }
 *  - options: { respectTimeOff, defaultWorkHours, scheduleConfig, leaves, weekendAmendments }
 *
 * Output:
 *  - scheduleEntries: ScheduleEntry[]
 *  - summary: { unscheduled_tasks: [...], per_user_totals: {...} }
 */
export function greedySchedule(
  tasks: TaskInput[],
  users: UserInput[],
  timeOffs: TimeOff[] = [],
  period: { start: string; end: string },
  options?: {
    respectTimeOff?: boolean
    defaultWorkHours?: number
    scheduleConfig?: ScheduleConfig
    leaves?: LeaveEntry[]
    weekendAmendments?: WeekendAmendment[]
  }
) {
  const config = options?.scheduleConfig ?? EAT_SCHEDULE_CONFIG
  const defaultWorkHours = options?.defaultWorkHours ?? config.netWorkHoursPerDay
  const respectTimeOff = options?.respectTimeOff ?? true

  // Build capacity: capacity[userId][date] = hours available
  const capacity: Record<string, Record<string, number>> = {}
  const weekendAmendmentMap = buildWeekendAmendmentMap(options?.weekendAmendments ?? [])

  for (const u of users) {
    const uid = String(u.user_id)
    capacity[uid] = {}
    const workHours = (u.work_hours_per_day ?? defaultWorkHours)

    for (const d of datesBetween(period.start, period.end)) {
      const dayDate = new Date(d + 'T00:00:00')
      const dayOfWeek = dayDate.getDay()

      if (config.daysOff.includes(dayOfWeek)) {
        // Weekend - check for amendments
        const amendmentHours = weekendAmendmentMap[uid]?.[d] ?? 0
        capacity[uid][d] = amendmentHours
      } else {
        capacity[uid][d] = workHours
      }
    }
  }

  // Apply time offs if requested
  const timeOffMap = buildTimeOffMap(timeOffs, defaultWorkHours)
  if (respectTimeOff) {
    for (const uid of Object.keys(timeOffMap)) {
      if (!capacity[uid]) continue
      for (const d of Object.keys(timeOffMap[uid])) {
        if (capacity[uid][d] != null) {
          capacity[uid][d] = Math.max(0, capacity[uid][d] - (timeOffMap[uid][d] ?? defaultWorkHours))
        }
      }
    }
  }

  // Apply leave deductions
  const leaveMap = buildLeaveMap(options?.leaves ?? [], defaultWorkHours)
  for (const uid of Object.keys(leaveMap)) {
    if (!capacity[uid]) continue
    for (const d of Object.keys(leaveMap[uid])) {
      if (capacity[uid][d] != null) {
        capacity[uid][d] = Math.max(0, capacity[uid][d] - leaveMap[uid][d])
      }
    }
  }

  // Helper: compute assigned totals so far per user
  const assignedTotals: Record<string, number> = {}
  for (const u of users) assignedTotals[String(u.user_id)] = 0

  // Normalize tasks: ensure estimated_hours number and window
  const normalizedTasks = (tasks || []).map((t) => {
    const est = typeof t.estimated_hours === 'number' ? t.estimated_hours : 0
    const windowStart = t.planned_start_date ?? period.start
    const windowEnd = t.planned_end_date ?? period.end
    return { ...t, estimated_hours: est, windowStart, windowEnd }
  })

  // Sort tasks by priority desc, then earliest end date
  normalizedTasks.sort((a, b) => {
    const pa = (a.priority ?? 0)
    const pb = (b.priority ?? 0)
    if (pa !== pb) return pb - pa
    return new Date(a.windowEnd).getTime() - new Date(b.windowEnd).getTime()
  })

  const scheduleEntries: ScheduleEntry[] = []
  const unscheduled: { task_id: any; remaining_hours: number }[] = []

  for (const t of normalizedTasks) {
    let remaining = Math.max(0, Number(t.estimated_hours ?? 0))
    if (remaining <= 0) {
      continue
    }

    // Build candidate user list
    let candidates: UserInput[] = []
    if (t.assigned_user_id != null) {
      const found = users.find(u => String(u.user_id) === String(t.assigned_user_id))
      if (found) candidates = [found]
      else candidates = users.slice()
    } else {
      candidates = users.slice()
    }

    // For each date in window, assign to candidate users ordered by least assignedTotals
    const dates = datesBetween(t.windowStart, t.windowEnd).filter(d => d >= period.start && d <= period.end)
    for (const d of dates) {
      if (remaining <= 0) break

      // sort candidates by current assigned total ascending (to balance)
      candidates.sort((a, b) => (assignedTotals[String(a.user_id)] ?? 0) - (assignedTotals[String(b.user_id)] ?? 0))

      for (const u of candidates) {
        if (remaining <= 0) break
        const uid = String(u.user_id)
        const cap = capacity[uid] && capacity[uid][d] != null ? capacity[uid][d] : 0
        if (cap <= 0) continue
        const assign = Math.min(cap, remaining)
        scheduleEntries.push({
          task_id: t.task_id,
          user_id: u.user_id,
          date: d,
          allocated_hours: Number(Number(assign).toFixed(2)),
          source: 'auto'
        })
        capacity[uid][d] = Math.max(0, capacity[uid][d] - assign)
        assignedTotals[uid] = (assignedTotals[uid] ?? 0) + assign
        remaining = Math.max(0, remaining - assign)
      }
    }

    if (remaining > 0) {
      unscheduled.push({ task_id: t.task_id, remaining_hours: Number(remaining.toFixed(2)) })
      scheduleEntries.push({
        task_id: t.task_id,
        user_id: null,
        date: null,
        allocated_hours: Number(remaining.toFixed(2)),
        source: 'unscheduled'
      })
    }
  }

  // Build per-user totals
  const perUserTotals: Record<string, { user_id: string | number; full_name?: string; assigned_hours: number }> = {}
  for (const u of users) {
    perUserTotals[String(u.user_id)] = { user_id: u.user_id, full_name: u.full_name, assigned_hours: 0 }
  }
  for (const se of scheduleEntries) {
    if (!se.user_id) continue
    const uid = String(se.user_id)
    perUserTotals[uid].assigned_hours = (perUserTotals[uid].assigned_hours ?? 0) + Number(se.allocated_hours ?? 0)
  }

  return { scheduleEntries, unscheduled, perUserTotals }
}

/**
 * analyzeSchedule - Enhanced with EAT support and role-based matrix
 *
 * Given:
 *  - scheduleEntries: ScheduleEntry[]
 *  - users: UserInput[]
 *  - period {start,end}
 *  - options { defaultWorkHours, respectTimeOff, timeOffs, scheduleConfig, leaves, weekendAmendments }
 *
 * Returns:
 *  - per_user: array with assigned_hours, available_hours, utilization, role
 *  - team: aggregate totals
 *  - fairness: stddev, coefVar, gini, max_min_ratio
 */
export function analyzeSchedule(
  scheduleEntries: ScheduleEntry[],
  users: UserInput[],
  period: { start: string; end: string },
  options?: {
    timeOffs?: TimeOff[]
    defaultWorkHours?: number
    respectTimeOff?: boolean
    scheduleConfig?: ScheduleConfig
    leaves?: LeaveEntry[]
    weekendAmendments?: WeekendAmendment[]
  }
) {
  const config = options?.scheduleConfig ?? EAT_SCHEDULE_CONFIG
  const defaultWorkHours = options?.defaultWorkHours ?? config.netWorkHoursPerDay
  const respectTimeOff = options?.respectTimeOff ?? true
  const timeOffMap = buildTimeOffMap(options?.timeOffs ?? [], defaultWorkHours)
  const leaveMap = buildLeaveMap(options?.leaves ?? [], defaultWorkHours)
  const weekendAmendmentMap = buildWeekendAmendmentMap(options?.weekendAmendments ?? [])

  // Calculate available hours per user in period
  const userAvailable: Record<string, number> = {}
  for (const u of users) {
    const uid = String(u.user_id)
    let total = 0
    for (const d of datesBetween(period.start, period.end)) {
      const dayDate = new Date(d + 'T00:00:00')
      const dayOfWeek = dayDate.getDay()

      let base = 0
      if (config.daysOff.includes(dayOfWeek)) {
        // Weekend - check amendments
        base = weekendAmendmentMap[uid]?.[d] ?? 0
      } else {
        base = (u.work_hours_per_day ?? defaultWorkHours)
      }

      let off = 0
      if (respectTimeOff && timeOffMap[uid] && timeOffMap[uid][d]) off += timeOffMap[uid][d]
      if (leaveMap[uid] && leaveMap[uid][d]) off += leaveMap[uid][d]

      total += Math.max(0, base - off)
    }
    userAvailable[uid] = Number(total.toFixed(2))
  }

  // Sum assigned hours
  const userAssigned: Record<string, number> = {}
  for (const u of users) userAssigned[String(u.user_id)] = 0
  for (const se of scheduleEntries) {
    if (!se.user_id) continue
    const uid = String(se.user_id)
    userAssigned[uid] = (userAssigned[uid] ?? 0) + Number(se.allocated_hours ?? 0)
  }

  // Build per_user array with role info
  const per_user = users.map(u => {
    const uid = String(u.user_id)
    const assigned = Number((userAssigned[uid] ?? 0).toFixed(2))
    const available = Number((userAvailable[uid] ?? 0).toFixed(2))
    const utilization = available > 0 ? Number(((assigned / available) * 100).toFixed(2)) : null
    return {
      user_id: u.user_id,
      full_name: u.full_name,
      role: u.role,
      assigned_hours: assigned,
      available_hours: available,
      utilization_percent: utilization
    }
  })

  // Team aggregates
  const totalAssigned = per_user.reduce((s, p) => s + (p.assigned_hours ?? 0), 0)
  const totalAvailable = per_user.reduce((s, p) => s + (p.available_hours ?? 0), 0)
  const teamUtilization = totalAvailable > 0 ? Number(((totalAssigned / totalAvailable) * 100).toFixed(2)) : null

  // Fairness metrics on assigned_hours (array)
  const assignedArray = per_user.map(p => p.assigned_hours)
  const n = assignedArray.length
  const mean = n ? assignedArray.reduce((a, b) => a + b, 0) / n : 0
  const variance = n ? assignedArray.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n : 0
  const stddev = Number(Math.sqrt(variance).toFixed(4))
  const coefVar = mean !== 0 ? Number((stddev / mean).toFixed(4)) : null

  // Gini coefficient
  function gini(arr: number[]) {
    const A = arr.slice().sort((a, b) => a - b)
    const m = A.length
    if (m === 0) return 0
    const cum = A.reduce((s, v, i) => s + (i + 1) * v, 0)
    const sum = A.reduce((s, v) => s + v, 0)
    if (sum === 0) return 0
    return Number(((2 * cum) / (m * sum) - (m + 1) / m).toFixed(4))
  }
  const giniCoeff = gini(assignedArray)
  const maxAssigned = assignedArray.length ? Math.max(...assignedArray) : 0
  const minAssigned = assignedArray.length ? Math.min(...assignedArray) : 0
  const maxMinRatio = minAssigned > 0 ? Number((maxAssigned / minAssigned).toFixed(4)) : null

  return {
    per_user,
    team: {
      total_assigned_hours: Number(totalAssigned.toFixed(2)),
      total_available_hours: Number(totalAvailable.toFixed(2)),
      team_utilization_percent: teamUtilization
    },
    fairness: {
      stddev,
      coefVar,
      gini: giniCoeff,
      maxAssigned,
      minAssigned,
      maxMinRatio
    }
  }
}