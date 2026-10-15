/*** =====================================================================================
 * PHASE 2 (FRONTEND) - THE APPEND-ONLY SIGNATURE TRAIL OF AN ATA RECORD
 * File: CMT.Frontend/src/components/self-evaluation/ATARecordSignatureTrail.tsx
 * AMENDED v2 (frontend-only) - replaces the whole file.
 *
 * FIXES REPORTED PROBLEM #1 ON THE READ PATH:
 * every recorded stage is rendered - Prepared by, Reviewed by, each Approved by line -
 * including rows whose isCurrent is false (a re-signed block keeps its history).
 * Filtering to isCurrent only is the defect this component exists to eliminate.
 *
 * v2 ADDS (rollout disclosure, no behaviour change to the server path):
 *  - optional trailSource prop ('server' | 'audit' | 'none'). While the append-only
 *    GET /ata-records/{id}/signatures endpoint is not deployed, ata-workflow.ts
 *    reconstructs the trail from WorkflowAuditLog and passes trailSource='audit'.
 *    The component then renders a clearly visible "reconstructed from audit log"
 *    banner and a "reconstructed" badge on provisional rows, so nobody mistakes a
 *    provisional line for a legally binding signature.
 *  - entry.provisional rows are styled distinctly (dashed border, amber badge).
 * =====================================================================================
 */
'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type {
  ATARecordSignatureEntryDto,
  ATARecordTrailSource,
} from '@/lib/self-evaluation/ata-workflow'
import { signatureFileUrl } from '@/lib/signature-api'

function SignatureImageCell({ entry }: { entry: ATARecordSignatureEntryDto }) {
  const [failed, setFailed] = useState(false)

  if (entry.provisional) {
    return (
      <span className="text-[10px] italic text-gray-400">
        not captured in audit log
      </span>
    )
  }

  if (!entry.signatureImageApplied || !entry.userSignatureId || failed) {
    return (
      <span className="text-[10px] italic text-gray-400">
        {entry.signatureImageApplied ? 'image unavailable' : 'no specimen on file'}
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={signatureFileUrl(entry.userSignatureId!)}
      alt={`Signature of ${entry.personName}`}
      className="h-8 max-w-[120px] object-contain"
      onError={() => setFailed(true)}
    />
  )
}

function formatSignedDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface Props {
  entries: ATARecordSignatureEntryDto[]
  loading?: boolean
  /** v2: where the rendered lines came from. Defaults to 'server' for old call sites. */
  trailSource?: ATARecordTrailSource
}

export default function ATARecordSignatureTrail({
  entries,
  loading = false,
  trailSource = 'server',
}: Props) {
  // R3 of ATARecordSignature: return EVERY row, ordered by stageOrder then signedAt.
  // NEVER filter by isCurrent - that filter is the blank-approver defect.
  const ordered = [...entries].sort(
    (a, b) =>
      a.stageOrder - b.stageOrder ||
      new Date(a.signedAt).getTime() - new Date(b.signedAt).getTime(),
  )

  const reconstructed = trailSource === 'audit' || ordered.some(e => e.provisional)

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
          Approval Signature Trail
        </p>
        <p className="text-[10px] text-gray-400">
          Every stage is kept permanently — approvals are never overwritten
        </p>
      </div>

      {reconstructed && ordered.length > 0 && (
        <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-amber-700">
            Reconstructed from the workflow audit log — the append-only signature
            endpoint is not deployed yet. Each line will be replaced by its frozen,
            signed record once the server trail is live. Historical approvals are never
            lost or blanked in either mode.
          </p>
        </div>
      )}

      {loading && ordered.length === 0 ? (
        <div className="px-3 py-4 text-xs text-gray-500">Loading signature trail…</div>
      ) : ordered.length === 0 ? (
        <div className="px-3 py-4 text-xs text-gray-500">
          No signatures have been recorded yet. Each approval stage will appear here
          permanently once signed.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 font-medium">Stage</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Signature</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map(e => (
                <tr
                  key={e.id || `${e.stageOrder}-${e.signedAt}`}
                  className={`border-b border-gray-100 last:border-0 ${
                    e.provisional
                      ? 'bg-amber-50/40'
                      : e.isCurrent
                        ? 'bg-white'
                        : 'bg-gray-50/60'
                  }`}
                >
                  <td className="px-3 py-2">
                    <span className="font-medium text-gray-800">
                      {e.blockCaption || `Stage ${e.stageOrder}`}
                    </span>
                    <span className="ml-1 text-[9px] text-gray-500">
                      Revision v{Math.max(1, e.recordRevisionNumber)}
                    </span>
                    {e.provisional && (
                      <span
                        className="ml-1 rounded border border-dashed border-amber-400 px-1 py-[1px] text-[8px] uppercase text-amber-600"
                        title="Reconstructed from the workflow audit log while the append-only signature endpoint is not deployed."
                      >
                        reconstructed
                      </span>
                    )}
                    {!e.isCurrent && !e.provisional && (
                      <span
                        className="ml-1 rounded border border-gray-300 px-1 py-[1px] text-[8px] uppercase text-gray-500"
                        title="This block was re-signed later. The historical line is kept for the audit trail."
                      >
                        superseded
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-900">
                    {e.personName || '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {e.personRoleLabel || e.personRole || '—'}
                  </td>
                  <td className="px-3 py-2">
                    <SignatureImageCell entry={e} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                    {formatSignedDate(e.signedAt)}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{e.comments || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}