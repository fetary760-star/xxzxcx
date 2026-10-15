import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  CheckCircle, Clock, AlertCircle, FileText,
  Calendar, User, Hash, Building2, ShieldCheck, ShieldX
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'
import { getCapabilityAssessmentsByShop } from '@/lib/self-evaluation/api'
import type { CapabilityAssessmentDto } from '@/lib/self-evaluation/types'
import {
  CapabilityStatus,
  getCapabilityStatusLabel,
  getCapabilityStatusColor,
} from '@/lib/self-evaluation/types'

export default function SummaryTab() {
  const { selectedComponent, selectedShop, refreshKey } = useSelfEvaluation()
  const [assessments, setAssessments] = useState<CapabilityAssessmentDto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!selectedShop) return
    setLoading(true)
    getCapabilityAssessmentsByShop(selectedShop.id)
      .then(data => {
        // Filter to the selected component
        const filtered = selectedComponent
          ? data.filter(a => a.componentId === selectedComponent.id)
          : data
        setAssessments(filtered)
      })
      .catch(err => console.error('Failed to fetch assessments:', err))
      .finally(() => setLoading(false))
  }, [selectedComponent, selectedShop, refreshKey])

  const latestAssessment = assessments.length > 0 ? assessments[0] : null

  const getProgressValue = (status: CapabilityStatus): number => {
    switch (status) {
      case CapabilityStatus.NotAssessed: return 10
      case CapabilityStatus.UnderDevelopment: return 40
      case CapabilityStatus.LimitedCapability: return 60
      case CapabilityStatus.FullCapability: return 100
      case CapabilityStatus.NoCapability: return 0
      default: return 0
    }
  }

  const getStatusIcon = (status: CapabilityStatus) => {
    switch (status) {
      case CapabilityStatus.NotAssessed: return <FileText className="h-5 w-5 text-gray-500" />
      case CapabilityStatus.UnderDevelopment: return <Clock className="h-5 w-5 text-blue-500" />
      case CapabilityStatus.LimitedCapability: return <AlertCircle className="h-5 w-5 text-yellow-500" />
      case CapabilityStatus.FullCapability: return <CheckCircle className="h-5 w-5 text-green-500" />
      case CapabilityStatus.NoCapability: return <ShieldX className="h-5 w-5 text-red-500" />
      default: return <AlertCircle className="h-5 w-5 text-gray-500" />
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!latestAssessment) {
    return (
      <div className="text-center py-12">
        <div className="mx-auto w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <FileText className="h-7 w-7 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-700 mb-2">No Capability Assessment</h3>
        <p className="text-sm text-gray-500 mb-4">
          No capability assessment has been created for this component yet.
        </p>
        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <FileText className="h-4 w-4 mr-2" />
          Create New Assessment
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Capability Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {getStatusIcon(latestAssessment.status)}
            Capability Verification Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge className={getCapabilityStatusColor(latestAssessment.status)}>
                {getCapabilityStatusLabel(latestAssessment.status)}
              </Badge>
              <span className="text-sm text-gray-500">
                {latestAssessment.assessedBy ? `Assessed by: ${latestAssessment.assessedBy}` : 'Not yet assessed'}
              </span>
            </div>

            <Progress value={getProgressValue(latestAssessment.status)} className="h-2" />

            {/* Capability Steps */}
            <div className="flex justify-between text-xs text-gray-500">
              <div className={cn('flex flex-col items-center gap-1', latestAssessment.status >= CapabilityStatus.NoCapability && 'text-red-600 font-medium')}>
                <div className={cn('w-3 h-3 rounded-full', latestAssessment.status === CapabilityStatus.NoCapability ? 'bg-red-600' : 'bg-gray-300')} />
                No Capability
              </div>
              <div className={cn('flex flex-col items-center gap-1', latestAssessment.status === CapabilityStatus.UnderDevelopment && 'text-blue-600 font-medium')}>
                <div className={cn('w-3 h-3 rounded-full', latestAssessment.status === CapabilityStatus.UnderDevelopment ? 'bg-blue-600' : 'bg-gray-300')} />
                Under Dev
              </div>
              <div className={cn('flex flex-col items-center gap-1', latestAssessment.status === CapabilityStatus.LimitedCapability && 'text-yellow-600 font-medium')}>
                <div className={cn('w-3 h-3 rounded-full', latestAssessment.status === CapabilityStatus.LimitedCapability ? 'bg-yellow-500' : 'bg-gray-300')} />
                Limited
              </div>
              <div className={cn('flex flex-col items-center gap-1', latestAssessment.status === CapabilityStatus.FullCapability && 'text-green-600 font-medium')}>
                <div className={cn('w-3 h-3 rounded-full', latestAssessment.status === CapabilityStatus.FullCapability ? 'bg-green-600' : 'bg-gray-300')} />
                Full Capability
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requirements Checklist */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Requirements Assessment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <div className={cn('w-3 h-3 rounded-full', latestAssessment.hasRequiredTooling ? 'bg-green-500' : 'bg-red-500')} />
              <div>
                <p className="text-sm font-medium">Required Tooling</p>
                <p className="text-xs text-gray-500">{latestAssessment.hasRequiredTooling ? 'Available' : 'Not Available'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <div className={cn('w-3 h-3 rounded-full', latestAssessment.hasRequiredTraining ? 'bg-green-500' : 'bg-red-500')} />
              <div>
                <p className="text-sm font-medium">Required Training</p>
                <p className="text-xs text-gray-500">{latestAssessment.hasRequiredTraining ? 'Completed' : 'Not Completed'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <div className={cn('w-3 h-3 rounded-full', latestAssessment.hasTechnicalData ? 'bg-green-500' : 'bg-red-500')} />
              <div>
                <p className="text-sm font-medium">Technical Data</p>
                <p className="text-xs text-gray-500">{latestAssessment.hasTechnicalData ? 'Available' : 'Not Available'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <div className={cn('w-3 h-3 rounded-full', latestAssessment.hasRequiredFacilities ? 'bg-green-500' : 'bg-red-500')} />
              <div>
                <p className="text-sm font-medium">Required Facilities</p>
                <p className="text-xs text-gray-500">{latestAssessment.hasRequiredFacilities ? 'Available' : 'Not Available'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assessment Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Assessment Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <Hash className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500 font-medium">Component</p>
                <p className="text-sm font-semibold">{latestAssessment.componentPartNumber || 'N/A'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500 font-medium">Assessment Date</p>
                <p className="text-sm font-semibold">
                  {latestAssessment.assessmentDate
                    ? new Date(latestAssessment.assessmentDate).toLocaleDateString()
                    : 'N/A'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Building2 className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500 font-medium">Shop</p>
                <p className="text-sm font-semibold">{selectedShop?.name || 'N/A'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <User className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500 font-medium">Assessed By</p>
                <p className="text-sm font-semibold">{latestAssessment.assessedBy || 'Unassigned'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500 font-medium">Next Review Date</p>
                <p className="text-sm font-semibold">
                  {latestAssessment.nextReviewDate
                    ? new Date(latestAssessment.nextReviewDate).toLocaleDateString()
                    : 'N/A'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <User className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500 font-medium">Approved By</p>
                <p className="text-sm font-semibold">{latestAssessment.approvedBy || 'Pending'}</p>
              </div>
            </div>
          </div>

          {latestAssessment.justification && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-gray-500 font-medium mb-1">Justification</p>
              <p className="text-sm text-gray-700">{latestAssessment.justification}</p>
            </div>
          )}

          {latestAssessment.limitations && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-gray-500 font-medium mb-1">Limitations</p>
              <p className="text-sm text-gray-700">{latestAssessment.limitations}</p>
            </div>
          )}

          {latestAssessment.correctiveActions && (
            <div className="mt-4 pt-4 border-t">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="text-xs text-orange-600 font-medium mb-1">Corrective Actions Required</p>
                <p className="text-sm text-orange-800">{latestAssessment.correctiveActions}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assessment History */}
      {assessments.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Assessment History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {assessments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between py-2 px-3 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{a.componentPartNumber}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn('text-xs', getCapabilityStatusColor(a.status))}>
                      {getCapabilityStatusLabel(a.status)}
                    </Badge>
                    <span className="text-xs text-gray-400">
                      {a.assessmentDate ? new Date(a.assessmentDate).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}