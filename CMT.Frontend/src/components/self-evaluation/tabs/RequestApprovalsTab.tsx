import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Send, CheckCircle, XCircle, FileText, AlertCircle, History
} from 'lucide-react'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'
import {
  getCapabilityAssessmentsByShop,
  getAuditLogsByEntity,
  updateCapabilityAssessment,
} from '@/lib/self-evaluation/api'
import type { CapabilityAssessmentDto, WorkflowAuditLogDto } from '@/lib/self-evaluation/types'
import {
  CapabilityStatus,
  getCapabilityStatusLabel,
  getCapabilityStatusColor,
  getWorkflowActionLabel,
} from '@/lib/self-evaluation/types'

export default function RequestApprovalsTab() {
  const { selectedComponent, selectedShop, triggerRefresh, refreshKey } = useSelfEvaluation()
  const [assessment, setAssessment] = useState<CapabilityAssessmentDto | null>(null)
  const [auditLogs, setAuditLogs] = useState<WorkflowAuditLogDto[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [comments, setComments] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedShop || !selectedComponent) return
    setLoading(true)
    setError(null)

    getCapabilityAssessmentsByShop(selectedShop.id)
      .then(async (assessments) => {
        // Filter to selected component
        const componentAssessments = assessments.filter(
          a => a.componentId === selectedComponent.id
        )
        if (componentAssessments.length === 0) {
          setAssessment(null)
          setAuditLogs([])
          return
        }
        const latest = componentAssessments[0]
        setAssessment(latest)

        // Fetch audit logs for this assessment
        try {
          const logs = await getAuditLogsByEntity('CapabilityAssessment', latest.id)
          setAuditLogs(logs)
        } catch {
          setAuditLogs([])
        }
      })
      .catch(err => {
        console.error('Failed to fetch assessment:', err)
        setError('Failed to load assessment data.')
      })
      .finally(() => setLoading(false))
  }, [selectedComponent, selectedShop, refreshKey])

  const handleApprove = async () => {
    if (!assessment) return
    setActionLoading(true)
    setError(null)
    try {
      await updateCapabilityAssessment(assessment.id, {
        status: CapabilityStatus.FullCapability,
        approvedBy: 'Current User', // In production, this comes from auth context
      })
      setComments('')
      triggerRefresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to approve assessment.'
      setError(message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    if (!assessment || !comments.trim()) return
    setActionLoading(true)
    setError(null)
    try {
      await updateCapabilityAssessment(assessment.id, {
        status: CapabilityStatus.NoCapability,
        correctiveActions: comments.trim(),
      })
      setComments('')
      triggerRefresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reject assessment.'
      setError(message)
    } finally {
      setActionLoading(false)
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

  if (!assessment) {
    return (
      <div className="text-center py-12">
        <Send className="h-10 w-10 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">No Assessment</h3>
        <p className="text-sm text-gray-500">
          Create a capability assessment to enable workflow actions.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Error Display */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Current Status & Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4" />
            Workflow Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">Current Status:</span>
            <Badge className={getCapabilityStatusColor(assessment.status)}>
              {getCapabilityStatusLabel(assessment.status)}
            </Badge>
          </div>

          {/* Actions for assessments that need review */}
          {(assessment.status === CapabilityStatus.NotAssessed ||
            assessment.status === CapabilityStatus.UnderDevelopment ||
            assessment.status === CapabilityStatus.LimitedCapability) && (
            <div className="space-y-3 pt-3 border-t">
              <p className="text-sm text-gray-600">
                Review this capability assessment and approve or reject.
              </p>
              <Textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Comments (required for rejection)..."
                className="text-sm"
              />
              <div className="flex gap-3">
                <Button
                  onClick={handleApprove}
                  disabled={actionLoading}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {actionLoading ? 'Processing...' : 'Approve (Full Capability)'}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={actionLoading || !comments.trim()}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
              </div>
            </div>
          )}

          {/* Status messages */}
          {assessment.status === CapabilityStatus.FullCapability && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <p className="text-sm text-green-700 font-medium">
                This capability assessment has been approved and is now part of the active Capability List.
              </p>
            </div>
          )}

          {assessment.status === CapabilityStatus.NoCapability && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="h-5 w-5 text-red-600" />
                <p className="text-sm text-red-700 font-medium">No capability determined for this component.</p>
              </div>
              {assessment.correctiveActions && (
                <p className="text-sm text-red-600 ml-7">{assessment.correctiveActions}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Request Letter Preview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Request Letter (Form Ref: EAL-CMT/048/2019)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-white border rounded-lg p-6 space-y-4 text-sm">
            <div className="text-center border-b pb-4">
              <h4 className="font-bold text-lg">ETHIOPIAN AIRLINES GROUP</h4>
              <p className="text-gray-600">Component Maintenance Technology</p>
              <p className="text-xs text-gray-500 mt-1">
                Capability Amendment Request Letter
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500">Shop:</p>
                <p className="font-medium">{selectedShop?.name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Date:</p>
                <p className="font-medium">
                  {assessment.assessmentDate
                    ? new Date(assessment.assessmentDate).toLocaleDateString()
                    : new Date().toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Part Number:</p>
                <p className="font-medium">{assessment.componentPartNumber}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Certificate Number:</p>
                <p className="font-medium">{selectedShop?.certificateNumber || 'N/A'}</p>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs text-gray-500 mb-1">Component Description:</p>
              <p className="font-medium">{assessment.componentDescription}</p>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs text-gray-500 mb-1">Justification:</p>
              <p>{assessment.justification || 'N/A'}</p>
            </div>

            <div className="border-t pt-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500">Capability Status:</p>
                <Badge className={getCapabilityStatusColor(assessment.status)}>
                  {getCapabilityStatusLabel(assessment.status)}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-gray-500">Assessed By:</p>
                <p className="font-medium">{assessment.assessedBy || 'N/A'}</p>
              </div>
            </div>

            {assessment.limitations && (
              <div className="border-t pt-4">
                <p className="text-xs text-gray-500 mb-1">Limitations:</p>
                <p>{assessment.limitations}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Audit Trail */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            Audit Trail
          </CardTitle>
        </CardHeader>
        <CardContent>
          {auditLogs.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No audit trail entries yet.</p>
          ) : (
            <div className="space-y-3">
              {auditLogs.map(log => (
                <div key={log.id} className="flex items-start gap-3 py-3 px-3 border rounded-lg bg-gray-50">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs font-semibold">
                        {getWorkflowActionLabel(log.workflowAction)}
                      </Badge>
                      <span className="text-xs font-medium text-gray-700">
                        {log.performedBy}
                      </span>
                      {log.userRole && (
                        <Badge variant="secondary" className="text-xs">
                          {log.userRole}
                        </Badge>
                      )}
                    </div>
                    {log.details && (
                      <p className="text-sm text-gray-700 mt-2">{log.details}</p>
                    )}
                    {(log.previousValues || log.newValues) && (
                      <div className="mt-2 p-2 bg-white rounded border border-gray-200 text-xs space-y-1">
                        {log.previousValues && (
                          <div>
                            <span className="font-semibold text-gray-600">Previous:</span>
                            <pre className="text-gray-600 whitespace-pre-wrap break-words">
                              {log.previousValues}
                            </pre>
                          </div>
                        )}
                        {log.newValues && (
                          <div>
                            <span className="font-semibold text-gray-600">New:</span>
                            <pre className="text-gray-600 whitespace-pre-wrap break-words">
                              {log.newValues}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      {new Date(log.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}