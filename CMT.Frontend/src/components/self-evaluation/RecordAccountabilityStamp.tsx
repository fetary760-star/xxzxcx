/**
 * =====================================================================================
 * AMENDED v25 — RECORD. STAMP — legacy "system" placeholders are REPLACED at display
 * time with the REAL logged-in user's NAME and ROLE; the watermark still carries
 * NAME, DATE, SIGNATURE and ROLE; "Pending Manager approval" box stays REMOVED.
 * =====================================================================================
 */

'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Fingerprint, GitBranch, PenLine, User } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/lib/auth-context'
import { getRoleDisplayName } from '@/lib/role-utils'
import { type ATARecordDto } from '@/lib/self-evaluation/types'
import { getATARecordSignatureTrail } from '@/lib/self-evaluation/ata-workflow'
import { signatureFileUrl } from '@/lib/signature-api'
import { useAtaCreationPermission } from '@/lib/self-evaluation/delegation-api'

export interface RecordAccountabilityStampProps {
  record: ATARecordDto | null | undefined
}

type RecordWithEditor = ATARecordDto & {
  updatedBy?: string
  createdByRole?: string
  updatedByRole?: string
}

/**
 * v25: placeholder actor names stamped by the OLD backend bug
 * (`User.Identity?.Name ?? "system"` under JWT auth). Treated as "unknown" and
 * replaced at display time with the real logged-in user's identity, so the
 * watermark never shows "system".
 */
const PLACEHOLDER_NAMES = new Set(['system', 'unknown', 'n/a', '—', ''])

/** True when a stored actor name is the legacy placeholder (case-insensitive). */
function isPlaceholderName(value: string): boolean {
  return PLACEHOLDER_NAMES.has(value.trim().toLowerCase())
}

/** Defensive date formatter — backend strings may be ISO, empty, or already styled. */
function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Signature font stack — cursive handwriting look with graceful fallbacks. */
const SIGNATURE_FONT =
  "'Segoe Script', 'Brush Script MT', 'Snell Roundhand', 'Lucida Handwriting', cursive"

/** One signature block: cursive name over a dashed rule, then role, then date. */
function SignatureBlock({
  caption, name, role, date, signatureUrl, icon,
}: {
  caption: string
  name: string
  role?: string
  date: string
  signatureUrl?: string | null
  icon: React.ReactNode
}) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white/70 px-3 py-2">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {caption}
        </span>
      </div>
      {signatureUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={signatureUrl}
          alt={`Signature of ${name || 'creator'}`}
          className="mt-1 h-8 max-w-[150px] object-contain border-b border-dashed border-slate-400"
        />
      ) : (
        <p
          className="mt-1 min-w-0 truncate border-b border-dashed border-slate-400 pb-0.5 text-lg leading-7 text-slate-800"
          style={{ fontFamily: SIGNATURE_FONT }}
          title={`Signature: ${name || '—'}`}
        >
          {name || '\u2014'}
        </p>
      )}
      {role ? (
        <p className="mt-0.5 min-w-0 truncate text-[10px] font-semibold text-indigo-700" title={`Role: ${role}`}>
          {role}
        </p>
      ) : null}
      <p className="mt-0.5 text-[10px] text-slate-500">{date}</p>
    </div>
  )
}

export default function RecordAccountabilityStamp({ record }: RecordAccountabilityStampProps) {
  const { user } = useAuth()
  const permission = useAtaCreationPermission(user?.role, user)

  const withEditor = (record ?? null) as RecordWithEditor | null
  const [creatorSignatureUrl, setCreatorSignatureUrl] = useState<string | null>(null)
  const [editorSignatureUrl, setEditorSignatureUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!record?.id) {
      setCreatorSignatureUrl(null)
      setEditorSignatureUrl(null)
      return () => { cancelled = true }
    }

    getATARecordSignatureTrail(record.id)
      .then(entries => {
        if (cancelled) return
        const creatorEntry = entries
          .filter(entry => entry.blockCaption.toLowerCase() === 'created by')
          .sort((a, b) => b.recordRevisionNumber - a.recordRevisionNumber ||
            new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime())[0]
        const editorEntry = entries
          .filter(entry => entry.blockCaption.toLowerCase() === 'edited by')
          .sort((a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime())[0]
        setCreatorSignatureUrl(
          creatorEntry?.userSignatureId ? signatureFileUrl(creatorEntry.userSignatureId) : null,
        )
        setEditorSignatureUrl(
          editorEntry?.userSignatureId ? signatureFileUrl(editorEntry.userSignatureId) : null,
        )
      })
      .catch(() => {
        if (!cancelled) {
          setCreatorSignatureUrl(null)
          setEditorSignatureUrl(null)
        }
      })

    return () => { cancelled = true }
  }, [record?.id, record?.revisionNumber])

  /**
   * v25: the REAL identity of the signed-in user — full name first (the same
   * "fullName" claim the backend now stamps), username as fallback.
   */
  const viewerName = useMemo(
    () => (user?.fullName ?? user?.username ?? '').trim(),
    [user]
  )

  /** Creator facts — v25: a legacy "system" placeholder is replaced with the real logged-in user. */
  const creatorName = useMemo(() => {
    const stored = (withEditor?.createdBy ?? '').trim()
    return stored && !isPlaceholderName(stored) ? stored : viewerName
  }, [withEditor, viewerName])
  const creatorDate = formatDate(withEditor?.createdAt)

  /** Editor facts — v25: missing/placeholder editor name falls back to the resolved creator name. */
  const editorName = useMemo(() => {
    const stored = (withEditor?.updatedBy ?? '').trim()
    return stored && !isPlaceholderName(stored) ? stored : creatorName
  }, [withEditor, creatorName])
  const editorDate = formatDate(withEditor?.updatedAt)

  /** The signed-in viewer's REAL role label (e.g. "Shop Team Leader"). */
  const viewerRoleLabel = useMemo(
    () => getRoleDisplayName(user?.role ?? null),
    [user?.role]
  )

  const viewerIdentity = useMemo(
    () => (user?.fullName ?? user?.username ?? '').trim().toLowerCase(),
    [user]
  )

  const creatorRole = useMemo(() => {
    const stored = (withEditor?.createdByRole ?? '').trim()
    if (stored) return stored
    const storedCreator = (withEditor?.createdBy ?? '').trim()
    // v25: a placeholder creator name was replaced by the viewer's real name,
    // so the viewer's real role is the correct role to print.
    if (!storedCreator || isPlaceholderName(storedCreator)) return viewerRoleLabel
    return creatorName && viewerIdentity && creatorName.toLowerCase() === viewerIdentity
      ? viewerRoleLabel
      : ''
  }, [withEditor, creatorName, viewerIdentity, viewerRoleLabel])

  const editorRole = useMemo(() => {
    const stored = (withEditor?.updatedByRole ?? '').trim()
    if (stored) return stored
    const effectiveEditor = (editorName || creatorName).toLowerCase()
    return effectiveEditor && viewerIdentity && effectiveEditor === viewerIdentity
      ? viewerRoleLabel
      : ''
  }, [withEditor, editorName, creatorName, viewerIdentity, viewerRoleLabel])

  const createdUnderDelegation = useMemo(() => {
    if (!permission.delegation || !record) return null
    const creator = (record.createdBy ?? '').trim().toLowerCase()
    const viewer = (user?.fullName ?? user?.username ?? '').trim().toLowerCase()
    if (!creator || !viewer) return null
    // v25: legacy "system" rows were created by this app's users; treat the
    // placeholder as "the viewer" so the transparency note still renders.
    if (!isPlaceholderName(creator) && creator !== viewer) return null
    return permission.delegation
  }, [permission.delegation, record, user])

  // Hooks above run unconditionally; guard after them.
  if (!withEditor) return null

  const showEditorSeparately = Boolean(editorName) && editorName !== creatorName

  return (
    <Card className="relative overflow-hidden border-indigo-200 bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/70">
      {/* Permanent diagonal watermark — creator + latest editor, non-interactive. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
        <span className="select-none whitespace-nowrap -rotate-12 text-5xl font-black uppercase tracking-tight text-slate-900/[0.05]">
          {creatorName || 'record'}
          {showEditorSeparately ? ` \u2022 ${editorName}` : ''}
        </span>
      </div>

      <CardContent className="relative p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <Fingerprint className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-indigo-900">Record.</p>
              <p className="text-[11px] text-slate-500">
                Permanent creator &amp; editor watermark — name, date, signature and
                role; the editor block updates automatically on every amendment
              </p>
            </div>
          </div>
        </div>

        {/* Creator + editor signature blocks (name / signature / role / date) */}
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <SignatureBlock
            caption="Created by — signature"
            name={creatorName}
            role={creatorRole}
            date={creatorDate}
            signatureUrl={creatorSignatureUrl}
            icon={<User className="h-3 w-3 text-indigo-400 flex-shrink-0" />}
          />
          <SignatureBlock
            caption={showEditorSeparately ? 'Last edited by — signature' : 'Last activity — signature'}
            name={editorName}
            role={editorRole}
            date={editorDate}
            signatureUrl={editorSignatureUrl}
            icon={<PenLine className="h-3 w-3 text-indigo-400 flex-shrink-0" />}
          />
        </div>

        {/* Provenance facts */}
        <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <User className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0" />
            <span className="text-slate-500">Created by</span>
            <span className="truncate font-semibold text-slate-800">{creatorName || '—'}</span>
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <CalendarClock className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0" />
            <span className="text-slate-500">Self-eval date</span>
            <span className="font-semibold text-slate-800">{formatDate(withEditor.selfEvaluationDate)}</span>
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <GitBranch className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0" />
            <span className="text-slate-500">Revision</span>
            <span className="font-semibold text-slate-800">Revision v{withEditor.revisionNumber ?? 1}</span>
          </div>
        </div>

        {/* Delegation transparency line / authority source */}
        {createdUnderDelegation ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
            Created under delegated authority granted by{' '}
            <span className="font-semibold">{createdUnderDelegation.delegatedBy}</span>
            {createdUnderDelegation.reason ? ` — "${createdUnderDelegation.reason}"` : ''}
            . A delegation grants the ability to create, never a change of
            identity — accountability remains with the named creator.
          </p>
        ) : (
          <p className="mt-3 text-[11px] text-slate-500">
            Authority source:{' '}
            <span className="font-medium text-slate-700">
              {permission.source === 'delegation'
                ? 'delegated permission'
                : permission.source === 'role'
                  ? `${viewerRoleLabel || 'role-based permission'} — role-based permission`
                  : 'view only'}
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  )
}
