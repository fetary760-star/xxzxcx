'use client'

import { useEffect, useState } from 'react'
import { Loader2, Users, CopyCheck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/lib/auth-context'
import {
  getApprovedTrainingForms,
  getUsers,
  includeApprovedTrainingForm,
  type UserDto,
} from '@/lib/self-evaluation/api'
import { normalizeRole } from '@/lib/role-utils'

export type TrainingEmployeeRole = 'Inspector' | 'Technician'

interface Props {
  shopId?: string | null
  ataRecordId?: string | null
  formType: string
  role: TrainingEmployeeRole
  compact?: boolean
  employeeId: string
  employeeName: string
  employeeRole: string
  canEdit: boolean
  onChange: (employee: { id: string; name: string; role: string }) => void
  onIncluded?: () => void
}

export default function TrainingEmployeeAssignment({
  shopId,
  ataRecordId,
  formType,
  role,
  compact = false,
  employeeId,
  employeeName,
  employeeRole,
  canEdit,
  onChange,
  onIncluded,
}: Props) {
  const { user } = useAuth()
  const [candidates, setCandidates] = useState<UserDto[]>([])
  const [loading, setLoading] = useState(false)
  const [including, setIncluding] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const actorRole = normalizeRole(user?.role)
  const isLeader = actorRole === 'team_leader'

  const includeApproved = async () => {
    if (!ataRecordId || !employeeId) return
    setIncluding(true)
    try {
      const approved = await getApprovedTrainingForms({ ataRecordId, formType, employeeId })
      const master = approved[0]
      if (master) {
        await includeApprovedTrainingForm({
          sourceFormSubmissionId: master.id,
          targetAtaRecordId: ataRecordId,
        })
        onIncluded?.()
      }
    } finally {
      setIncluding(false)
    }
  }

  useEffect(() => {
    if (!shopId) return
    let cancelled = false
    setLoadError(null)
    setLoading(true)
    void getUsers({ role, shopId, isActive: true, pageSize: 200 })
      .then(users => {
        if (!cancelled) {
          const expectedRole = role.toLowerCase()
          setCandidates(users.filter(candidate => normalizeRole(candidate.role) === expectedRole))
        }
      })
      .catch(error => {
        if (!cancelled) {
          setCandidates([])
          setLoadError(error instanceof Error ? error.message : `Unable to load active ${role.toLowerCase()}s.`)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [role, shopId])

  return (
    <div className="mb-3 rounded-md border border-purple-200 bg-purple-50/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Users className="h-4 w-4 text-purple-700" aria-hidden="true" />
        <Label className="text-xs font-semibold text-purple-900">
          {compact ? `Select ${role} ID` : `Assigned ${role}`}
        </Label>
        {!compact && employeeName && <Badge variant="outline" className="text-[10px]">{employeeName}</Badge>}
      </div>
      {isLeader && canEdit ? (
        <Select
          value={employeeId || undefined}
          onValueChange={id => {
            const candidate = candidates.find(item => item.id === id)
            if (candidate) onChange({ id: candidate.id, name: candidate.fullName, role: candidate.role })
          }}
          disabled={loading}
        >
          <SelectTrigger className="mt-2 h-8 bg-white text-xs">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SelectValue placeholder={`Select a qualified ${role.toLowerCase()}`} />}
          </SelectTrigger>
          <SelectContent>
            {candidates.map(candidate => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {compact
                  ? `ID ${candidate.id} · ${candidate.fullName}`
                  : `${candidate.fullName}${candidate.jobTitle ? ` · ${candidate.jobTitle}` : ''}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="mt-1 text-[11px] text-purple-800">
          {employeeName || 'No employee assigned'}{employeeRole ? ` · ${employeeRole}` : ''}
        </p>
      )}
      {loadError && (
        <p role="alert" className="mt-1 text-[11px] text-red-800">{loadError}</p>
      )}
      {isLeader && !loading && !loadError && candidates.length === 0 && (
        <p className="mt-1 text-[11px] text-amber-800">No active qualified {role.toLowerCase()} was found in this shop.</p>
      )}
      {!compact && isLeader && canEdit && employeeId && ataRecordId && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2 border-emerald-300 text-emerald-800 hover:bg-emerald-50"
          onClick={() => void includeApproved()}
          disabled={including}
        >
          {including ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CopyCheck className="mr-1 h-3.5 w-3.5" />}
          Include previously approved
        </Button>
      )}
    </div>
  )
}