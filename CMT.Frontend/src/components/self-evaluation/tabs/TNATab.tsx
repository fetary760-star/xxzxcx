import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { Wrench, Plus, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'
import { getTNAByShop } from '@/lib/self-evaluation/api'
import type { ToolNeedsAnalysisDto } from '@/lib/self-evaluation/types'
import {
  ToolStatus,
  getToolStatusLabel,
  getToolStatusColor,
} from '@/lib/self-evaluation/types'

export default function TNATab() {
  const { selectedShop, selectedComponent, refreshKey } = useSelfEvaluation()
  const [tnaItems, setTnaItems] = useState<ToolNeedsAnalysisDto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!selectedShop) return
    setLoading(true)
    getTNAByShop(selectedShop.id)
      .then(data => {
        // Filter to selected component if one is selected
        const filtered = selectedComponent
          ? data.filter(t => t.componentId === selectedComponent.id)
          : data
        setTnaItems(filtered)
      })
      .catch(err => console.error('Failed to fetch TNA:', err))
      .finally(() => setLoading(false))
  }, [selectedShop, selectedComponent, refreshKey])

  const getToolStatusBadge = (status: ToolStatus) => {
    const label = getToolStatusLabel(status)
    const color = getToolStatusColor(status)
    return <Badge className={`${color} text-xs`}>{label}</Badge>
  }

  const getMissingToolIndicator = (item: ToolNeedsAnalysisDto) => {
    if (item.quantityAvailable < item.quantityRequired) {
      return (
        <div className="flex items-center gap-1 text-red-600">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">Shortage</span>
        </div>
      )
    }
    return null
  }

  const getRowHighlight = (item: ToolNeedsAnalysisDto): string => {
    if (item.status === ToolStatus.OutOfService) {
      return 'bg-red-50/50'
    }
    if (item.status === ToolStatus.NeedsCalibration) {
      return 'bg-yellow-50/50'
    }
    if (item.quantityAvailable < item.quantityRequired) {
      return 'bg-orange-50/50'
    }
    if (item.status === ToolStatus.OnOrder) {
      return 'bg-blue-50/50'
    }
    return ''
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const totalTools = tnaItems.length
  const missingTools = tnaItems.filter(t => t.quantityAvailable < t.quantityRequired).length
  const outOfService = tnaItems.filter(t => t.status === ToolStatus.OutOfService).length
  const needsCalibration = tnaItems.filter(t => t.status === ToolStatus.NeedsCalibration).length

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="text-xs text-gray-500 font-medium">Total Tools</div>
          <div className="text-2xl font-bold text-gray-900">{totalTools}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-red-600 font-medium">Shortage</div>
          <div className="text-2xl font-bold text-red-700">{missingTools}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-orange-600 font-medium">Out of Service</div>
          <div className="text-2xl font-bold text-orange-700">{outOfService}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-yellow-600 font-medium">Needs Calibration</div>
          <div className="text-2xl font-bold text-yellow-700">{needsCalibration}</div>
        </Card>
      </div>

      {/* TNA Table */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Tool Needs Analysis
          </CardTitle>
          <Button size="sm" variant="outline">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Tool
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {tnaItems.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">
              No Tool Needs Analysis data for this component.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Tool Name</TableHead>
                    <TableHead className="text-xs">Part Number</TableHead>
                    <TableHead className="text-xs">Manufacturer</TableHead>
                    <TableHead className="text-xs text-center">Qty Req</TableHead>
                    <TableHead className="text-xs text-center">Qty Avail</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Calibration Due</TableHead>
                    <TableHead className="text-xs">Storage</TableHead>
                    <TableHead className="text-xs">Alert</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tnaItems.map(item => (
                    <TableRow key={item.id} className={cn(getRowHighlight(item))}>
                      <TableCell className="text-sm font-medium">
                        {item.toolName}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {item.toolPartNumber || '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {item.manufacturer || '—'}
                      </TableCell>
                      <TableCell className="text-sm text-center font-medium">
                        {item.quantityRequired}
                      </TableCell>
                      <TableCell className="text-sm text-center font-medium">
                        {item.quantityAvailable}
                      </TableCell>
                      <TableCell>
                        {getToolStatusBadge(item.status)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {item.calibrationDueDate
                          ? new Date(item.calibrationDueDate).toLocaleDateString()
                          : '—'}
                      </TableCell>
                      <TableCell className="text-xs max-w-[120px] truncate">
                        {item.storageLocation || '—'}
                      </TableCell>
                      <TableCell>
                        {getMissingToolIndicator(item)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}