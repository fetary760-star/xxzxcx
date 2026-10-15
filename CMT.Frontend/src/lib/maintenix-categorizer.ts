/**
 * Maintenix Task Auto-Categorization Engine
 * Classifies tasks into categories based on keywords from Location, Task Detail, and Part Description.
 * Replaces manual Excel categorization.
 */

export interface MaintenixTask {
  user_id: string
  name: string
  part_no: string
  serial_number: string
  assigned_date: string
  completed_date: string
  elapsed_days: number
  status: string
  location: string
  barcode: string
  task_detail: string
  part_description: string
  category?: string
  shop?: string
}

export interface CategoryRule {
  category: string
  keywords: string[]
  locationPatterns?: string[]
  color: string
  icon: string
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: 'Electrical/Avionics',
    keywords: ['elecd', 'eled', 'battery', 'motor', 'light', 'detector', 'igniter', 'ignition', 'cable', 'control assy', 'cargo'],
    locationPatterns: ['574'],
    color: '#3B82F6',
    icon: '⚡'
  },
  {
    category: 'Instruments/Sensors',
    keywords: ['insd', 'instd', 'sensor', 'transducer', 'switch', 'indicator', 'beacon', 'speed sensor', 'oxygen'],
    locationPatterns: ['575'],
    color: '#8B5CF6',
    icon: '📡'
  },
  {
    category: 'Radio/Navigation',
    keywords: ['radd', 'radds', 'antenna', 'pcu-s', 'pcu'],
    locationPatterns: ['573'],
    color: '#EC4899',
    icon: '📻'
  },
  {
    category: 'Harness/Wiring',
    keywords: ['hard', 'harness', 'loom', 'lead', 'egt', 'wiring'],
    locationPatterns: ['576'],
    color: '#F59E0B',
    icon: '🔌'
  },
  {
    category: 'Hydraulic Systems',
    keywords: ['hydd', 'hydraulic', 'high pressure', 'compressor'],
    color: '#EF4444',
    icon: '💧'
  },
  {
    category: 'Emergency Equipment',
    keywords: ['emed', 'life raft', 'vest', 'emergency', 'oxygen cylinder'],
    locationPatterns: ['566'],
    color: '#F97316',
    icon: '🆘'
  },
  {
    category: 'Galley/Cabin',
    keywords: ['gald', 'coffee', 'galley', 'cabin', 'iacobucci'],
    locationPatterns: ['577'],
    color: '#14B8A6',
    icon: '☕'
  },
  {
    category: 'Fuel Systems',
    keywords: ['fuld', 'fuel', 'high pressure'],
    locationPatterns: ['562'],
    color: '#6366F1',
    icon: '⛽'
  },
  {
    category: 'General Overhaul',
    keywords: ["o'haul", 'overhaul', 'ohaul'],
    color: '#10B981',
    icon: '🔧'
  },
  {
    category: 'Shop Work',
    keywords: ['shop'],
    locationPatterns: ['shop'],
    color: '#64748B',
    icon: '🏭'
  }
]

/**
 * Extract the shop/section from the location string
 * e.g., "ADD/CMT/575/O'HAUL" -> "575 - O'HAUL"
 */
export function extractShop(location: string): string {
  if (!location) return 'Unknown'
  const parts = location.split('/')
  if (parts.length >= 4) {
    return `${parts[2]} - ${parts.slice(3).join('/')}`
  }
  if (parts.length >= 3) {
    return parts[2]
  }
  return location
}

/**
 * Categorize a single task based on its fields
 */
export function categorizeTask(task: MaintenixTask): string {
  const searchText = [
    task.task_detail,
    task.part_description,
    task.location
  ].join(' ').toLowerCase()

  // Check each rule in priority order
  for (const rule of CATEGORY_RULES) {
    // Check keywords
    const keywordMatch = rule.keywords.some(kw => searchText.includes(kw.toLowerCase()))
    if (keywordMatch) return rule.category

    // Check location patterns
    if (rule.locationPatterns) {
      const locationMatch = rule.locationPatterns.some(lp =>
        task.location.toLowerCase().includes(lp.toLowerCase())
      )
      if (locationMatch) return rule.category
    }
  }

  return 'Uncategorized'
}

/**
 * Get the color for a category
 */
export function getCategoryColor(category: string): string {
  const rule = CATEGORY_RULES.find(r => r.category === category)
  return rule?.color || '#94A3B8'
}

/**
 * Get the icon for a category
 */
export function getCategoryIcon(category: string): string {
  const rule = CATEGORY_RULES.find(r => r.category === category)
  return rule?.icon || '📋'
}

/**
 * Get all category rules (for legend/filters)
 */
export function getAllCategories(): CategoryRule[] {
  return CATEGORY_RULES
}

/**
 * Process and categorize all tasks
 */
export function processMaintenixTasks(tasks: MaintenixTask[]): MaintenixTask[] {
  return tasks.map(task => ({
    ...task,
    name: task.name.replace(/\u00a0/g, ' ').trim(),
    category: categorizeTask(task),
    shop: extractShop(task.location)
  }))
}

/**
 * Generate summary statistics from categorized tasks
 */
export interface TaskSummary {
  totalTasks: number
  completedTasks: number
  byCategory: Record<string, number>
  byEngineer: Record<string, { total: number; avgElapsed: number; completed: number }>
  byShop: Record<string, number>
  byStatus: Record<string, number>
  avgElapsedDays: number
  totalElapsedDays: number
  sameDayCompletions: number
  multiDayTasks: number
}

export function generateSummary(tasks: MaintenixTask[]): TaskSummary {
  const summary: TaskSummary = {
    totalTasks: tasks.length,
    completedTasks: 0,
    byCategory: {},
    byEngineer: {},
    byShop: {},
    byStatus: {},
    avgElapsedDays: 0,
    totalElapsedDays: 0,
    sameDayCompletions: 0,
    multiDayTasks: 0
  }

  let totalElapsed = 0
  let elapsedCount = 0

  tasks.forEach(task => {
    // Status
    const status = (task.status || 'UNKNOWN').toUpperCase()
    summary.byStatus[status] = (summary.byStatus[status] || 0) + 1
    if (status === 'COMPLETE') summary.completedTasks++

    // Category
    const cat = task.category || 'Uncategorized'
    summary.byCategory[cat] = (summary.byCategory[cat] || 0) + 1

    // Engineer
    const eng = task.name || 'Unknown'
    if (!summary.byEngineer[eng]) {
      summary.byEngineer[eng] = { total: 0, avgElapsed: 0, completed: 0 }
    }
    summary.byEngineer[eng].total++
    if (status === 'COMPLETE') summary.byEngineer[eng].completed++

    // Shop
    const shop = task.shop || extractShop(task.location)
    summary.byShop[shop] = (summary.byShop[shop] || 0) + 1

    // Elapsed time
    const elapsed = task.elapsed_days || 0
    totalElapsed += elapsed
    elapsedCount++
    if (elapsed === 0) summary.sameDayCompletions++
    else summary.multiDayTasks++
  })

  summary.totalElapsedDays = totalElapsed
  summary.avgElapsedDays = elapsedCount > 0 ? totalElapsed / elapsedCount : 0

  // Calculate avg elapsed per engineer
  Object.keys(summary.byEngineer).forEach(eng => {
    const engTasks = tasks.filter(t => t.name === eng)
    const engElapsed = engTasks.reduce((sum, t) => sum + (t.elapsed_days || 0), 0)
    summary.byEngineer[eng].avgElapsed = engTasks.length > 0 ? engElapsed / engTasks.length : 0
  })

  return summary
}