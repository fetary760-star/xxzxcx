import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { AlertTriangle, FileText, Plus, Edit2 } from 'lucide-react'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'
import { getADsByComponent, getSBsByComponent } from '@/lib/self-evaluation/api'
import type { AirworthinessDirectiveDto, ServiceBulletinDto } from '@/lib/self-evaluation/types'
import {
  DirectiveApplicability,
  ComplianceStatus,
  BulletinCategory,
  getDirectiveApplicabilityLabel,
  getDirectiveApplicabilityColor,
  getComplianceStatusLabel,
  getComplianceStatusColor,
  getBulletinCategoryLabel,
  getBulletinCategoryColor,
} from '@/lib/self-evaluation/types'

export default function TechnicalDataTab() {
  const { selectedComponent, refreshKey } = useSelfEvaluation()
  const [ads, setAds] = useState<AirworthinessDirectiveDto[]>([])
  const [sbs, setSbs] = useState<ServiceBulletinDto[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<'ad' | 'sb'>('ad')

  useEffect(() => {
    if (!selectedComponent) return
    setLoading(true)
    Promise.all([
      getADsByComponent(selectedComponent.id),
      getSBsByComponent(selectedComponent.id),
    ])
      .then(([adData, sbData]) => {
        setAds(adData)
        setSbs(sbData)
      })
      .catch(err => console.error('Failed to fetch technical data:', err))
      .finally(() => setLoading(false))
  }, [selectedComponent, refreshKey])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Section Toggle */}
      <div className="flex items-center gap-2">
        <Button
          variant={activeSection === 'ad' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveSection('ad')}
          className={activeSection === 'ad' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
        >
          <AlertTriangle className="h-4 w-4 mr-1.5" />
          Airworthiness Directives ({ads.length})
        </Button>
        <Button
          variant={activeSection === 'sb' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveSection('sb')}
          className={activeSection === 'sb' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
        >
          <FileText className="h-4 w-4 mr-1.5" />
          Service Bulletins ({sbs.length})
        </Button>
      </div>

      {/* AD Table */}
      {activeSection === 'ad' && (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Airworthiness Directives</CardTitle>
            <Button size="sm" variant="outline">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add AD
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {ads.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">
                No Airworthiness Directives recorded for this component.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">AD Number</TableHead>
                      <TableHead className="text-xs">Title</TableHead>
                      <TableHead className="text-xs">Effective Date</TableHead>
                      <TableHead className="text-xs">Applicability</TableHead>
                      <TableHead className="text-xs">Compliance</TableHead>
                      <TableHead className="text-xs">Method</TableHead>
                      <TableHead className="text-xs w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ads.map(ad => (
                      <TableRow key={ad.id} className="hover:bg-gray-50">
                        <TableCell className="text-sm font-mono font-medium">{ad.adNumber}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{ad.title}</TableCell>
                        <TableCell className="text-sm">
                          {ad.effectiveDate
                            ? new Date(ad.effectiveDate).toLocaleDateString()
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${getDirectiveApplicabilityColor(ad.applicability)} text-xs`}>
                            {getDirectiveApplicabilityLabel(ad.applicability)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${getComplianceStatusColor(ad.complianceStatus)} text-xs`}>
                            {getComplianceStatusLabel(ad.complianceStatus)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">{ad.complianceMethod || '—'}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* SB Table */}
      {activeSection === 'sb' && (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Service Bulletins</CardTitle>
            <Button size="sm" variant="outline">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add SB
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {sbs.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">
                No Service Bulletins recorded for this component.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">SB Number</TableHead>
                      <TableHead className="text-xs">Title</TableHead>
                      <TableHead className="text-xs">Revision</TableHead>
                      <TableHead className="text-xs">Issue Date</TableHead>
                      <TableHead className="text-xs">Category</TableHead>
                      <TableHead className="text-xs">Compliance</TableHead>
                      <TableHead className="text-xs w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sbs.map(sb => (
                      <TableRow key={sb.id} className="hover:bg-gray-50">
                        <TableCell className="text-sm font-mono font-medium">{sb.sbNumber}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{sb.title}</TableCell>
                        <TableCell className="text-sm">{sb.revision || '—'}</TableCell>
                        <TableCell className="text-sm">
                          {sb.issueDate
                            ? new Date(sb.issueDate).toLocaleDateString()
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${getBulletinCategoryColor(sb.category)} text-xs`}>
                            {getBulletinCategoryLabel(sb.category)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${getComplianceStatusColor(sb.complianceStatus)} text-xs`}>
                            {getComplianceStatusLabel(sb.complianceStatus)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}