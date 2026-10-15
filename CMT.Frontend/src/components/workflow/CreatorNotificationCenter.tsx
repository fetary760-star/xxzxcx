/**
 * CreatorNotificationCenter — v21 (NEW FILE)
 *
 * "Once an action is completed, the system should notify the user who originally
 *  created the ATA record accordingly. Notifications should be generated based on
 *  each table of contents item within the ATA record."
 *
 * The backend emits one NotificationResponse per table-of-contents item action
 * (assignment, review, approval, rejection, completion...) addressed to the record
 * creator. This panel lists them newest-first with the category, the message, and a
 * link to the referenced record, plus per-item and bulk mark-read through the 204
 * endpoint of the notification centre.
 */
'use client'

import { useState } from 'react'
import { Bell, BellOff, CheckCheck, ExternalLink, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useCreatorNotifications } from '@/lib/workflow/role-request-api'
import type { NotificationResponse } from '@/lib/workflow/workflow-types'

/** Badge classes per notification category (mirrors the corporate palette). */
function categoryClasses(category: string): string {
  const key = (category || '').toLowerCase()
  if (key.includes('reject') || key.includes('return')) {
    return 'bg-red-100 text-red-900 border-red-300'
  }
  if (key.includes('approval') || key.includes('completion')) {
    return 'bg-emerald-100 text-emerald-900 border-emerald-300'
  }
  if (key.includes('expir')) {
    return 'bg-orange-100 text-orange-900 border-orange-300'
  }
  if (key.includes('amend') || key.includes('revision')) {
    return 'bg-violet-100 text-violet-900 border-violet-300'
  }
  // Assignment and anything unknown — the in-flight amber family.
  return 'bg-amber-100 text-amber-900 border-amber-300'
}

function fmtDate(value: string): string {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString()
}

export default function CreatorNotificationCenter() {
  const {
    notifications, unreadCount, loading, error, refresh, markRead, markAllRead,
  } = useCreatorNotifications()
  const [markingAll, setMarkingAll] = useState(false)

  const handleMarkAll = async () => {
    setMarkingAll(true)
    try {
      await markAllRead()
    } finally {
      setMarkingAll(false)
    }
  }

  return (
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
            <Bell className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900">
              Creator notifications
              {unreadCount > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                  {unreadCount} new
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Per table-of-contents item actions on the ATA records you created
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={refresh} title="Refresh notifications">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAll}
            disabled={markingAll || unreadCount === 0}
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
            Mark all read
          </Button>
        </div>
      </div>

      {error ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-gray-600">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={refresh}>
            Try again
          </Button>
        </div>
      ) : loading && notifications.length === 0 ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <BellOff className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            No notifications yet — you will be notified here as each table-of-contents
            item on your ATA records is processed.
          </p>
        </div>
      ) : (
        <ScrollArea className="max-h-[360px]">
          <ul className="divide-y">
            {notifications.map(n => (
              <NotificationItem key={n.id} notification={n} onMarkRead={markRead} />
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  )
}

function NotificationItem({
  notification: n,
  onMarkRead,
}: {
  notification: NotificationResponse
  onMarkRead: (id: string) => Promise<void>
}) {
  const [marking, setMarking] = useState(false)

  const handleMarkRead = async () => {
    setMarking(true)
    try {
      await onMarkRead(n.id)
    } finally {
      setMarking(false)
    }
  }

  return (
    <li className={cn('px-4 py-3 flex items-start gap-3', !n.isRead && 'bg-emerald-50/40')}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', categoryClasses(n.category))}>
            {n.category}
          </Badge>
          <p className={cn('text-xs truncate', n.isRead ? 'text-gray-500 font-normal' : 'text-gray-900 font-semibold')}>
            {n.title}
          </p>
          {!n.isRead && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />}
        </div>
        <p className="text-xs text-gray-600 mt-1 leading-snug">{n.message}</p>
        <p className="text-[10px] text-gray-400 mt-1">{fmtDate(n.createdAt)}</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {n.actionUrl && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
            <a href={n.actionUrl} title="Open the referenced record">
              <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        )}
        {!n.isRead && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-gray-500 hover:text-emerald-700"
            onClick={handleMarkRead}
            disabled={marking}
          >
            Mark read
          </Button>
        )}
      </div>
    </li>
  )
}