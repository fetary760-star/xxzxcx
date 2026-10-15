'use client'

import React, { useEffect, useState } from 'react'
import RequireRole from '@/components/RequireRole'
import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Shield, ChevronRight, Users, Search } from 'lucide-react'
import apiClient from '@/lib/api'
import TeamLeaderPermissionsManager from '@/components/manage/TeamLeaderPermissionsManager'

interface TeamLeader {
  userId: number
  user_id?: number
  id?: number
  fullName: string
  full_name?: string
  name?: string
  username?: string
  email?: string
  role?: string
  roleName?: string
  role_name?: string
  isActive?: boolean
}

function TLPermissionsContent() {
  const [teamLeaders, setTeamLeaders] = useState<TeamLeader[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTL, setSelectedTL] = useState<TeamLeader | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadTeamLeaders()
  }, [])

  const loadTeamLeaders = async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch all users and filter for team leaders
      const response = await apiClient.get('/users')
      const users = Array.isArray(response) ? response : (response?.data || response?.users || [])

      const tls = users.filter((u: any) => {
        const role = String(u.role ?? u.roleName ?? u.role_name ?? '').toLowerCase().trim()
        return role === 'team_leader' || role === 'teamleader' || role === '0'
      }).map((u: any) => ({
        userId: u.userId ?? u.user_id ?? u.id ?? 0,
        fullName: u.fullName ?? u.full_name ?? u.name ?? 'Unknown',
        username: u.username ?? '',
        email: u.email ?? '',
        role: u.role ?? u.roleName ?? u.role_name ?? 'team_leader',
        isActive: u.isActive !== false,
      }))

      setTeamLeaders(tls)
    } catch (err: any) {
      console.error('Failed to load team leaders:', err)
      setError('Failed to load team leaders. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const filteredTLs = teamLeaders.filter(tl => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      tl.fullName.toLowerCase().includes(q) ||
      (tl.username ?? '').toLowerCase().includes(q) ||
      (tl.email ?? '').toLowerCase().includes(q)
    )
  })

  if (selectedTL) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => setSelectedTL(null)}
        >
          ← Back to Team Leaders List
        </Button>
        <TeamLeaderPermissionsManager
          teamLeaderUserId={selectedTL.userId}
          teamLeaderName={selectedTL.fullName}
          onClose={() => setSelectedTL(null)}
        />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-green-600" />
            Team Leader Permissions
          </CardTitle>
          <CardDescription>
            Manage individual permissions for Team Leaders. Select a Team Leader to configure their access restrictions.
            By default, all permissions are enabled (unrestricted). You can selectively restrict access to specific features.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search team leaders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
              <span className="ml-3 text-gray-600">Loading team leaders...</span>
            </div>
          ) : filteredTLs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="text-lg font-medium">No Team Leaders Found</p>
              <p className="text-sm mt-1">
                {searchQuery ? 'No team leaders match your search.' : 'There are no team leaders in the system.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTLs.map((tl) => (
                <button
                  key={tl.userId}
                  onClick={() => setSelectedTL(tl)}
                  className="w-full flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-green-100 p-2 rounded-full">
                      <Shield className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{tl.fullName}</div>
                      <div className="text-sm text-gray-500">
                        {tl.username && <span>{tl.username}</span>}
                        {tl.email && <span className="ml-2">• {tl.email}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={tl.isActive ? 'default' : 'secondary'}
                      className={tl.isActive ? 'bg-green-100 text-green-800 hover:bg-green-100' : ''}
                    >
                      {tl.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function TLPermissionsPage() {
  return (
    <RequireRole allowed={['admin', 'director', 'team_leader']}>
      <MainLayout>
        <TLPermissionsContent />
      </MainLayout>
    </RequireRole>
  )
}