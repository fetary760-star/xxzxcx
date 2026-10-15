import { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { ClipboardCheck, Save, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'
import { getSelfAuditChecklistByShop, updateAuditChecklistItem } from '@/lib/self-evaluation/api'
import type { SelfAuditChecklistDto } from '@/lib/self-evaluation/types'
import {
  ComplianceStatus,
  AuditStatus,
  getComplianceStatusLabel,
  getComplianceStatusColor,
  getAuditStatusLabel,
  getAuditStatusColor,
} from '@/lib/self-evaluation/types'

interface ChecklistItemState extends SelfAuditChecklistDto {
  isDirty: boolean
}

export default function AuditChecklistTab() {
  const { selectedShop, refreshKey } = useSelfEvaluation()
  const [items, setItems] = useState<ChecklistItemState[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!selectedShop) return
    setLoading(true)

    getSelfAuditChecklistByShop(selectedShop.id)
      .then(checklist => {
        setItems(checklist.map(item => ({ ...item, isDirty: false })))
        const sections = new Set(checklist.map(item => item.section))
        setExpandedSections(sections)
      })
      .catch(err => console.error('Failed to fetch audit checklist:', err))
      .finally(() => setLoading(false))
  }, [selectedShop, refreshKey])

  const groupedItems = useMemo(() => {
    const groups: Record<string, ChecklistItemState[]> = {}
    items.forEach(item => {
      if (!groups[item.section]) {
        groups[item.section] = []
      }
      groups[item.section].push(item)
    })
    // Sort by item number within each section
    Object.values(groups).forEach(group =>
      group.sort((a, b) => a.itemNumber.localeCompare(b.itemNumber))
    )
    return groups
  }, [items])

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  const handleComplianceChange = (itemId: string, status: ComplianceStatus) => {
    setItems(prev =>
      prev.map(item =>
        item.id === itemId ? { ...item, complianceStatus: status, isDirty: true } : item
      )
    )
  }

  const handleFindingsChange = (itemId: string, findings: string) => {
    setItems(prev =>
      prev.map(item =>
        item.id === itemId ? { ...item, findings, isDirty: true } : item
      )
    )
  }

  const handleCorrectiveActionChange = (itemId: string, correctiveAction: string) => {
    setItems(prev =>
      prev.map(item =>
        item.id === itemId ? { ...item, correctiveAction, isDirty: true } : item
      )
    )
  }

  const handleSave = async () => {
    const dirtyItems = items.filter(item => item.isDirty)
    if (dirtyItems.length === 0) return

    setSaving(true)
    try {
      await Promise.all(
        dirtyItems.map(item =>
          updateAuditChecklistItem(item.id, {
            complianceStatus: item.complianceStatus,
            findings: item.findings || undefined,
            correctiveAction: item.correctiveAction || undefined,
            dueDate: item.dueDate || undefined,
            assignedTo: item.assignedTo || undefined,
            auditStatus: item.auditStatus,
          })
        )
      )
      setItems(prev => prev.map(item => ({ ...item, isDirty: false })))
    } catch (err) {
      console.error('Failed to save checklist:', err)
    } finally {
      setSaving(false)
    }
  }

  const dirtyCount = items.filter(i => i.isDirty).length
  const compliantCount = items.filter(i => i.complianceStatus === ComplianceStatus.Compliant).length
  const nonCompliantCount = items.filter(i => i.complianceStatus === ComplianceStatus.NonCompliant).length
  const notReviewedCount = items.filter(i => i.complianceStatus === ComplianceStatus.NotReviewed).length

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!selectedShop) {
    return (
      <div className="text-center py-12">
        <ClipboardCheck className="h-10 w-10 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Select a Shop</h3>
        <p className="text-sm text-gray-500">
          Select a shop from the hierarchy to view its self-audit checklist.
        </p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <ClipboardCheck className="h-10 w-10 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">No Checklist Items</h3>
        <p className="text-sm text-gray-500">
          No audit checklist questions have been configured for this shop.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary & Save Bar */}
      <div className="flex items-center justify-between bg-white rounded-lg border p-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500">
            Total: <strong>{items.length}</strong>
          </span>
          <span className="text-green-600">
            Compliant: <strong>{compliantCount}</strong>
          </span>
          <span className="text-red-600">
            Non-Compliant: <strong>{nonCompliantCount}</strong>
          </span>
          <span className="text-gray-400">
            Not Reviewed: <strong>{notReviewedCount}</strong>
          </span>
        </div>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={dirtyCount === 0 || saving}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Save className="h-3.5 w-3.5 mr-1.5" />
          {saving ? 'Saving...' : `Save Changes${dirtyCount > 0 ? ` (${dirtyCount})` : ''}`}
        </Button>
      </div>

      {/* Grouped Checklist */}
      {Object.entries(groupedItems).map(([section, sectionItems]) => (
        <Card key={section}>
          <CardHeader
            className="pb-2 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => toggleSection(section)}
          >
            <CardTitle className="text-sm flex items-center gap-2">
              {expandedSections.has(section) ? (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400" />
              )}
              <ClipboardCheck className="h-4 w-4 text-emerald-600" />
              {section}
              <Badge variant="outline" className="ml-auto text-xs">
                {sectionItems.filter(i => i.complianceStatus === ComplianceStatus.Compliant).length}/{sectionItems.length}
              </Badge>
            </CardTitle>
          </CardHeader>

          {expandedSections.has(section) && (
            <CardContent className="pt-0">
              <div className="space-y-4">
                {sectionItems.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3 rounded-lg border ${
                      item.complianceStatus === ComplianceStatus.NonCompliant
                        ? 'border-red-200 bg-red-50/30'
                        : item.isDirty
                        ? 'border-blue-200 bg-blue-50/30'
                        : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-gray-400">{item.itemNumber}</span>
                          {item.regulatoryReference && (
                            <span className="text-xs text-blue-600">Ref: {item.regulatoryReference}</span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-gray-800">
                          {item.question}
                        </p>
                      </div>

                      {/* Compliance Status Radio Group */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {[
                          { value: ComplianceStatus.Compliant, label: 'YES', color: 'text-green-700 bg-green-50 border-green-300' },
                          { value: ComplianceStatus.NonCompliant, label: 'NO', color: 'text-red-700 bg-red-50 border-red-300' },
                          { value: ComplianceStatus.NotApplicable, label: 'N/A', color: 'text-gray-600 bg-gray-50 border-gray-300' },
                        ].map(option => (
                          <button
                            key={option.value}
                            onClick={() => handleComplianceChange(item.id, option.value)}
                            className={`px-3 py-1 rounded-md text-xs font-semibold border transition-all ${
                              item.complianceStatus === option.value
                                ? option.color + ' ring-1 ring-offset-1'
                                : 'text-gray-400 bg-white border-gray-200 hover:border-gray-400'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Audit Status Badge */}
                    <div className="mt-2 flex items-center gap-2">
                      <Badge className={`${getAuditStatusColor(item.auditStatus)} text-xs`}>
                        {getAuditStatusLabel(item.auditStatus)}
                      </Badge>
                      {item.assignedTo && (
                        <span className="text-xs text-gray-500">Assigned to: {item.assignedTo}</span>
                      )}
                      {item.dueDate && (
                        <span className="text-xs text-gray-500">Due: {new Date(item.dueDate).toLocaleDateString()}</span>
                      )}
                    </div>

                    {/* Findings & Corrective Action (shown when Non-Compliant) */}
                    {item.complianceStatus === ComplianceStatus.NonCompliant && (
                      <div className="mt-3 pl-4 border-l-2 border-red-300 space-y-3">
                        <div>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                            <span className="text-xs font-medium text-red-700">
                              Findings
                            </span>
                          </div>
                          <Textarea
                            value={item.findings}
                            onChange={(e) => handleFindingsChange(item.id, e.target.value)}
                            placeholder="Describe the findings..."
                            className="text-sm min-h-[50px] resize-y"
                          />
                        </div>
                        <div>
                          <span className="text-xs font-medium text-orange-700 mb-1.5 block">
                            Corrective Action
                          </span>
                          <Textarea
                            value={item.correctiveAction}
                            onChange={(e) => handleCorrectiveActionChange(item.id, e.target.value)}
                            placeholder="Describe the corrective action plan..."
                            className="text-sm min-h-[50px] resize-y"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  )
}