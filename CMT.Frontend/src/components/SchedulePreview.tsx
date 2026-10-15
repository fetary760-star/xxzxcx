'use client'
import React, { useState } from 'react'
import { ScheduleEntry, EAT_SCHEDULE_CONFIG } from '@/lib/scheduler'

interface SchedulePreviewProps {
  entries: ScheduleEntry[]
}

export default function SchedulePreview({ entries }: SchedulePreviewProps) {
  const [viewMode, setViewMode] = useState<'date' | 'user'>('date')
  const [expandedDate, setExpandedDate] = useState<string | null>(null)

  if (!entries || entries.length === 0) {
    return (
      <div className="bg-white rounded shadow p-4">
        <h4 className="font-semibold mb-2">Schedule Preview</h4>
        <div className="text-sm text-gray-500 text-center py-4">No schedule entries generated yet.</div>
      </div>
    )
  }

  // Separate scheduled and unscheduled
  const scheduled = entries.filter(e => e.date && e.user_id)
  const unscheduled = entries.filter(e => !e.date || !e.user_id)

  // Group by date
  const byDate: Record<string, ScheduleEntry[]> = {}
  scheduled.forEach(e => {
    const d = e.date ?? 'UNSCHEDULED'
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(e)
  })
  const dates = Object.keys(byDate).sort()

  // Group by user
  const byUser: Record<string, ScheduleEntry[]> = {}
  scheduled.forEach(e => {
    const u = String(e.user_id ?? 'Unassigned')
    if (!byUser[u]) byUser[u] = []
    byUser[u].push(e)
  })

  // Check if date is weekend
  const isWeekend = (dateStr: string): boolean => {
    const d = new Date(dateStr + 'T00:00:00')
    return EAT_SCHEDULE_CONFIG.daysOff.includes(d.getDay())
  }

  // Get day name
  const getDayName = (dateStr: string): string => {
    const d = new Date(dateStr + 'T00:00:00')
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
  }

  // Calculate totals
  const totalHours = scheduled.reduce((sum, e) => sum + (e.allocated_hours ?? 0), 0)
  const unscheduledHours = unscheduled.reduce((sum, e) => sum + (e.allocated_hours ?? 0), 0)

  return (
    <div className="bg-white rounded shadow p-4">
      <div className="flex flex-wrap items-center justify-between mb-3 gap-2">
        <div>
          <h4 className="font-semibold">Schedule Preview</h4>
          <div className="text-xs text-gray-500">
            EAT (UTC+3) • {scheduled.length} entries • {totalHours.toFixed(1)}h scheduled
            {unscheduledHours > 0 && (
              <span className="text-red-500 ml-2">• {unscheduledHours.toFixed(1)}h unscheduled</span>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode('date')}
            className={`px-3 py-1 text-xs rounded ${viewMode === 'date' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            By Date
          </button>
          <button
            onClick={() => setViewMode('user')}
            className={`px-3 py-1 text-xs rounded ${viewMode === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            By User
          </button>
        </div>
      </div>

      {viewMode === 'date' ? (
        <div className="space-y-3">
          {dates.map(d => {
            const dayEntries = byDate[d]
            const dayHours = dayEntries.reduce((sum, e) => sum + (e.allocated_hours ?? 0), 0)
            const weekend = isWeekend(d)
            const isExpanded = expandedDate === d

            return (
              <div key={d} className={`border rounded ${weekend ? 'border-orange-200 bg-orange-50' : ''}`}>
                <div
                  className="flex items-center justify-between p-2 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedDate(isExpanded ? null : d)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{d}</span>
                    <span className="text-xs text-gray-500">({getDayName(d)})</span>
                    {weekend && (
                      <span className="px-1.5 py-0.5 bg-orange-200 text-orange-700 rounded text-xs">Weekend Amendment</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>{dayEntries.length} entries</span>
                    <span className="font-medium">{dayHours.toFixed(1)}h</span>
                    <span>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t p-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {dayEntries.map((e, i) => (
                        <div key={i} className="p-2 border rounded bg-white text-sm">
                          <div className="flex justify-between">
                            <span className="font-medium">Task: TC-{String(e.task_id)}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              e.source === 'auto' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                            }`}>{e.source}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">User: {String(e.user_id ?? 'Unassigned')}</div>
                          <div className="text-xs text-gray-500">Hours: {e.allocated_hours}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(byUser).map(([userId, userEntries]) => {
            const userHours = userEntries.reduce((sum, e) => sum + (e.allocated_hours ?? 0), 0)
            return (
              <div key={userId} className="border rounded">
                <div className="flex items-center justify-between p-2 bg-gray-50">
                  <span className="text-sm font-medium">User: {userId}</span>
                  <div className="text-xs text-gray-500">
                    {userEntries.length} entries • {userHours.toFixed(1)}h total
                  </div>
                </div>
                <div className="p-2">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    {userEntries.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')).map((e, i) => (
                      <div key={i} className="p-2 border rounded text-sm">
                        <div className="text-xs text-gray-500">{e.date} ({getDayName(e.date ?? '')})</div>
                        <div className="font-medium">TC-{String(e.task_id)}</div>
                        <div className="text-xs text-gray-500">{e.allocated_hours}h</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Unscheduled Tasks */}
      {unscheduled.length > 0 && (
        <div className="mt-4 border border-red-200 rounded bg-red-50 p-3">
          <h5 className="text-sm font-medium text-red-700 mb-2">
            ⚠️ Unscheduled Tasks ({unscheduled.length})
          </h5>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            {unscheduled.map((e, i) => (
              <div key={i} className="p-2 border border-red-200 rounded bg-white text-sm">
                <div className="font-medium text-red-700">TC-{String(e.task_id)}</div>
                <div className="text-xs text-red-500">{e.allocated_hours}h remaining</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}