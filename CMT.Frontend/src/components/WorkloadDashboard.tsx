'use client'
import React, { useState } from 'react'

type PerUser = {
  user_id: string | number
  full_name?: string
  role?: string
  assigned_hours: number
  available_hours: number
  utilization_percent: number | null
}

type FairnessMetrics = {
  stddev?: number
  coefVar?: number | null
  gini?: number
  maxAssigned?: number
  minAssigned?: number
  maxMinRatio?: number | null
}

type TeamMetrics = {
  total_assigned_hours?: number
  total_available_hours?: number
  team_utilization_percent?: number | null
}

interface WorkloadDashboardProps {
  per_user: PerUser[]
  team: TeamMetrics
  fairness: FairnessMetrics
}

/**
 * Get utilization color based on percentage
 */
function getUtilizationColor(percent: number | null): string {
  if (percent === null || percent === undefined) return 'text-gray-500'
  if (percent >= 90) return 'text-red-600 font-bold'
  if (percent >= 75) return 'text-orange-500 font-semibold'
  if (percent >= 50) return 'text-blue-600'
  if (percent >= 25) return 'text-green-600'
  return 'text-gray-500'
}

/**
 * Get utilization bar color
 */
function getUtilizationBarColor(percent: number | null): string {
  if (percent === null || percent === undefined) return 'bg-gray-300'
  if (percent >= 90) return 'bg-red-500'
  if (percent >= 75) return 'bg-orange-400'
  if (percent >= 50) return 'bg-blue-500'
  if (percent >= 25) return 'bg-green-500'
  return 'bg-gray-400'
}

/**
 * Get fairness rating label
 */
function getFairnessRating(gini: number | undefined): { label: string; color: string } {
  if (gini === undefined || gini === null) return { label: 'N/A', color: 'text-gray-500' }
  if (gini <= 0.1) return { label: 'Excellent', color: 'text-green-600' }
  if (gini <= 0.2) return { label: 'Good', color: 'text-blue-600' }
  if (gini <= 0.3) return { label: 'Fair', color: 'text-yellow-600' }
  if (gini <= 0.4) return { label: 'Poor', color: 'text-orange-600' }
  return { label: 'Very Poor', color: 'text-red-600' }
}

export default function WorkloadDashboard({ per_user, team, fairness }: WorkloadDashboardProps) {
  const [sortBy, setSortBy] = useState<'name' | 'utilization' | 'assigned' | 'available'>('utilization')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filterRole, setFilterRole] = useState<string>('all')

  if (!per_user) return null

  // Get unique roles
  const roles = Array.from(new Set(per_user.map(p => p.role || 'Unknown').filter(Boolean)))

  // Filter by role
  const filtered = filterRole === 'all'
    ? per_user
    : per_user.filter(p => (p.role || 'Unknown') === filterRole)

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    switch (sortBy) {
      case 'name':
        cmp = (a.full_name ?? '').localeCompare(b.full_name ?? '')
        break
      case 'utilization':
        cmp = (a.utilization_percent ?? 0) - (b.utilization_percent ?? 0)
        break
      case 'assigned':
        cmp = a.assigned_hours - b.assigned_hours
        break
      case 'available':
        cmp = a.available_hours - b.available_hours
        break
    }
    return sortDir === 'desc' ? -cmp : cmp
  })

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
  }

  const fairnessRating = getFairnessRating(fairness?.gini)

  return (
    <div className="space-y-4">
      {/* Top Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded shadow border-l-4 border-blue-500">
          <div className="text-sm text-gray-500">Team Assigned Hours</div>
          <div className="text-2xl font-semibold">{team?.total_assigned_hours?.toFixed(1) ?? '—'}</div>
          <div className="text-xs text-gray-400">of {team?.total_available_hours?.toFixed(1) ?? '—'} available</div>
        </div>
        <div className="p-4 bg-white rounded shadow border-l-4 border-green-500">
          <div className="text-sm text-gray-500">Team Utilization</div>
          <div className="text-2xl font-semibold">{team?.team_utilization_percent ? `${team.team_utilization_percent}%` : '—'}</div>
          <div className="text-xs text-gray-400">Average across team</div>
        </div>
        <div className="p-4 bg-white rounded shadow border-l-4 border-purple-500">
          <div className="text-sm text-gray-500">Fairness (Gini)</div>
          <div className="text-2xl font-semibold">{(fairness?.gini != null) ? fairness.gini.toFixed(4) : '—'}</div>
          <div className={`text-xs ${fairnessRating.color}`}>{fairnessRating.label} — Lower is fairer (0 = perfect)</div>
        </div>
        <div className="p-4 bg-white rounded shadow border-l-4 border-orange-500">
          <div className="text-sm text-gray-500">Equity Metrics</div>
          <div className="text-sm mt-1">
            <div>Std Dev: <span className="font-semibold">{fairness?.stddev?.toFixed(2) ?? '—'}</span></div>
            <div>CoV: <span className="font-semibold">{fairness?.coefVar != null ? fairness.coefVar.toFixed(4) : '—'}</span></div>
            <div>Max/Min: <span className="font-semibold">{fairness?.maxMinRatio != null ? fairness.maxMinRatio.toFixed(2) : '—'}</span></div>
          </div>
        </div>
      </div>

      {/* Role-Based Workload Matrix */}
      {roles.length > 1 && (
        <div className="bg-white rounded shadow p-4">
          <h3 className="font-semibold mb-3">Role-Based Workload Matrix</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {roles.map(role => {
              const roleUsers = per_user.filter(p => (p.role || 'Unknown') === role)
              const totalAssigned = roleUsers.reduce((s, p) => s + p.assigned_hours, 0)
              const totalAvailable = roleUsers.reduce((s, p) => s + p.available_hours, 0)
              const avgUtil = totalAvailable > 0 ? (totalAssigned / totalAvailable) * 100 : 0

              return (
                <div key={role} className="border rounded p-3 hover:shadow-md transition-shadow">
                  <div className="text-sm font-medium capitalize">{role.replace(/_/g, ' ')}</div>
                  <div className="text-xs text-gray-500 mb-2">{roleUsers.length} engineer{roleUsers.length !== 1 ? 's' : ''}</div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Assigned</span>
                      <span className="font-medium">{totalAssigned.toFixed(1)}h</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>Available</span>
                      <span className="font-medium">{totalAvailable.toFixed(1)}h</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                      <div
                        className={`h-2 rounded-full ${getUtilizationBarColor(avgUtil)}`}
                        style={{ width: `${Math.min(100, avgUtil)}%` }}
                      />
                    </div>
                    <div className={`text-xs text-right ${getUtilizationColor(avgUtil)}`}>
                      {avgUtil.toFixed(1)}%
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Per-Engineer Workload Table */}
      <div className="bg-white rounded shadow p-4">
        <div className="flex flex-wrap items-center justify-between mb-3 gap-2">
          <h3 className="font-semibold">Per-Engineer Workload</h3>
          <div className="flex items-center gap-2">
            {roles.length > 1 && (
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="text-sm border rounded px-2 py-1"
              >
                <option value="all">All Roles</option>
                {roles.map(r => (
                  <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th
                  className="p-2 cursor-pointer hover:text-gray-800"
                  onClick={() => handleSort('name')}
                >
                  Engineer {sortBy === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                {roles.length > 1 && <th className="p-2">Role</th>}
                <th
                  className="p-2 cursor-pointer hover:text-gray-800"
                  onClick={() => handleSort('assigned')}
                >
                  Assigned Hours {sortBy === 'assigned' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th
                  className="p-2 cursor-pointer hover:text-gray-800"
                  onClick={() => handleSort('available')}
                >
                  Available Hours {sortBy === 'available' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th
                  className="p-2 cursor-pointer hover:text-gray-800"
                  onClick={() => handleSort('utilization')}
                >
                  Utilization {sortBy === 'utilization' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="p-2">Capacity Bar</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p: PerUser) => (
                <tr key={String(p.user_id)} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{p.full_name ?? p.user_id}</td>
                  {roles.length > 1 && (
                    <td className="p-2 text-sm capitalize">{(p.role || 'Unknown').replace(/_/g, ' ')}</td>
                  )}
                  <td className="p-2">{p.assigned_hours.toFixed(1)}</td>
                  <td className="p-2">{p.available_hours.toFixed(1)}</td>
                  <td className={`p-2 ${getUtilizationColor(p.utilization_percent)}`}>
                    {p.utilization_percent != null ? `${p.utilization_percent}%` : 'N/A'}
                  </td>
                  <td className="p-2 w-40">
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full transition-all ${getUtilizationBarColor(p.utilization_percent)}`}
                        style={{ width: `${Math.min(100, p.utilization_percent ?? 0)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}