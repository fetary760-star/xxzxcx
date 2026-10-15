// API route: POST /api/schedule/analysis
// Enhanced with EAT timezone support and role-based analysis
// - Accepts body { scheduleEntries, users, start, end, time_offs?, options? }
// - Returns per-user aggregates and fairness metrics

import { NextRequest } from 'next/server'
import { analyzeSchedule, EAT_SCHEDULE_CONFIG, type LeaveEntry, type WeekendAmendment } from '../../../../lib/scheduler'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const scheduleEntries = body.scheduleEntries || []
    const users = body.users || []
    const start = body.start
    const end = body.end

    if (!start || !end) {
      return Response.json({ error: 'start and end dates are required' }, { status: 400 })
    }

    // Parse optional leave and weekend amendment data
    const leaves: LeaveEntry[] = body.leaves ?? []
    const weekendAmendments: WeekendAmendment[] = body.weekendAmendments ?? []

    const analysis = analyzeSchedule(
      scheduleEntries,
      users,
      { start, end },
      {
        timeOffs: body.time_offs || [],
        defaultWorkHours: body.defaultWorkHours || EAT_SCHEDULE_CONFIG.netWorkHoursPerDay,
        respectTimeOff: body.respectTimeOff !== false,
        scheduleConfig: EAT_SCHEDULE_CONFIG,
        leaves,
        weekendAmendments,
      }
    )

    return Response.json({
      ok: true,
      ...analysis,
      timezone: EAT_SCHEDULE_CONFIG.timezone,
      netWorkHoursPerDay: EAT_SCHEDULE_CONFIG.netWorkHoursPerDay,
    })

  } catch (error: any) {
    console.error('Schedule analysis error:', error)
    return Response.json({
      error: 'Schedule analysis failed',
      message: error?.message || String(error)
    }, { status: 500 })
  }
}