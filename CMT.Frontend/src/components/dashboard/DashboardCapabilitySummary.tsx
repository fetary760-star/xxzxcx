'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import {
  CheckCircle2, AlertTriangle, Clock, XCircle, FileText,
  CalendarCheck, CalendarX
} from 'lucide-react'
import {
  getCapabilityAssessmentsByShop,
  getATARecordsByShop,
  getShops,
} from '@/lib/self-evaluation/api'
import type { CapabilityAssessmentDto, ATARecordDto } from '@/lib/self-evaluation/types'
import { CapabilityStatus, ApprovalStatus } from '@/lib/self-evaluation/types'

interface DashboardCapabilitySummaryProps {
  userShopId: string
  userRole: string
}

interface SummaryData {
  activeCount: number
  suspendedCount: number
  underDevCount: number
  deletedCount: number
  totalATARecords: number
  upToDateCount: number
  expiredCount: number
}

/**
 * Calculate remaining days until expiration.
 * Expiration Rule: Approvals expire 2 years (730 days) from approval date.
 * Remaining Days = 730 - (TODAY - ApprovalDate)
 */
function calculateRemainingDays(approvalDate: string | null | undefined): number | null {
  if (!approvalDate) return null
  const approval = new Date(approvalDate)
  if (isNaN(approval.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  approval.setHours(0, 0, 0, 0)
  const daysSinceApproval = Math.floor((today.getTime() - approval.getTime()) / (1000 * 60 * 60 * 24))
  return 730 - daysSinceApproval
}

export default function DashboardCapabilitySummary({ userShopId, userRole }: DashboardCapabilitySummaryProps) {
  const [summary, setSummary] = useState<SummaryData>({
    activeCount: 0,
    suspendedCount: 0,
    underDevCount: 0,
    deletedCount: 0,
    totalATARecords: 0,
    upToDateCount: 0,
    expiredCount: 0,
  })
  const [loading, setLoading] = useState(true)

  const canViewAllShops = useMemo(() => {
    return ['admin', 'director', 'manager', 'qa_staff'].includes(userRole)
  }, [userRole])

  const loadSummary = useCallback(async () => {
    setLoading(true)
    try {
      let assessments: CapabilityAssessmentDto[] = []
      let ataRecords: ATARecordDto[] = []

      if (userShopId && !canViewAllShops) {
        // Load only user's shop data
        assessments = await getCapabilityAssessmentsByShop(userShopId)
        ataRecords = await getATARecordsByShop(userShopId)
      } else if (canViewAllShops) {
        // Load all shops data
        const shops = await getShops()
        for (const shop of shops) {
          try {
            const shopAssessments = await getCapabilityAssessmentsByShop(shop.id)
            assessments.push(...shopAssessments)
            const shopRecords = await getATARecordsByShop(shop.id)
            ataRecords.push(...shopRecords)
          } catch {
            // Skip shops that fail
          }
        }
      } else if (userShopId) {
        assessments = await getCapabilityAssessmentsByShop(userShopId)
        ataRecords = await getATARecordsByShop(userShopId)
      }

      // Calculate capability status counts
      const activeCount = assessments.filter(a => a.status === CapabilityStatus.FullCapability).length
      const suspendedCount = assessments.filter(a => a.status === CapabilityStatus.LimitedCapability).length
      const underDevCount = assessments.filter(a => a.status === CapabilityStatus.UnderDevelopment).length
      const deletedCount = assessments.filter(a => a.status === CapabilityStatus.NoCapability).length

      const totalATARecords = ataRecords.length

      // Calculate Up To Date vs Expired based on approval date
      // Only count approved records for expiration tracking
      const approvedRecords = ataRecords.filter(r => r.approvalStatus === ApprovalStatus.Approved)
      let upToDateCount = 0
      let expiredCount = 0

      for (const record of approvedRecords) {
        // Use the self-evaluation date as the approval/capability date for expiration calc
        const dateToUse = record.selfEvaluationDate
        const remaining = calculateRemainingDays(dateToUse)
        if (remaining === null) {
          // No date available, skip
          continue
        }
        if (remaining > 0) {
          upToDateCount++
        } else {
          expiredCount++
        }
      }

      setSummary({
        activeCount,
        suspendedCount,
        underDevCount,
        deletedCount,
        totalATARecords,
        upToDateCount,
        expiredCount,
      })
    } catch (err) {
      console.error('Failed to load dashboard summary:', err)
    } finally {
      setLoading(false)
    }
  }, [userShopId, canViewAllShops])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-16"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const summaryCards = [
    {
      title: 'ACTIVE',
      value: summary.activeCount,
      icon: CheckCircle2,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      description: 'Full Capability',
    },
    {
      title: 'SUSPENDED',
      value: summary.suspendedCount,
      icon: AlertTriangle,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      description: 'Limited Capability',
    },
    {
      title: "UNDER DEV'T",
      value: summary.underDevCount,
      icon: Clock,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      description: 'Under Development',
    },
    {
      title: 'DELETED',
      value: summary.deletedCount,
      icon: XCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      description: 'No Capability',
    },
    {
      title: 'TOTAL CAPABILITIES',
      value: summary.totalATARecords,
      icon: FileText,
      color: 'text-gray-700',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200',
      description: 'All ATA Records',
    },
    {
      title: 'UP TO DATE',
      value: summary.upToDateCount,
      icon: CalendarCheck,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-200',
      description: 'Valid approvals',
    },
    {
      title: 'EXPIRED',
      value: summary.expiredCount,
      icon: CalendarX,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      description: 'Past 2-year mark',
    },
  ]

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">
        Capability Summary
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.title} className={`border ${card.borderColor} ${card.bgColor} hover:shadow-md transition-shadow`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                  {card.title}
                </span>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <div className={`text-2xl font-bold ${card.color}`}>
                {card.value}
              </div>
              <p className="text-xs text-gray-500 mt-1">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}