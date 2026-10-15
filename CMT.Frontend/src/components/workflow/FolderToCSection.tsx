/**
 * =====================================================================================
 * AMENDMENT v18 - PHASE 1 (FRONTEND), ITEM 2
 * CMT.Frontend/src/components/workflow/FolderToCSection.tsx                    (NEW FILE)
 *
 * WHAT THIS FILE IS
 * -----------------
 * The single mountable unit for requirement #2: folder progress (requirement #11 client)
 * above the live Table of Contents. It exists so DocumentWorkspace.tsx needs ONE line, and
 * so the folder-identity rule of §2 is enforced in exactly one place.
 *
 * REDESIGN v20 - the mounted TableOfContentsPanel below renders SIMPLIFIED rows
 * (title + form number + ONE standardized status badge) that expand into the
 * Mini-Kanban approver tracker with timestamped tooltips. The panel's props contract
 * is UNCHANGED by the redesign, so this wiring needs no code change - only this note.
 *
 * BINDING RULES
 *   (1) The printed tree from lib/self-evaluation/toc-structure.tsx is NEVER reordered and
 *       NEVER filtered by what the API returned. A form with no stored submission renders
 *       as "Not started" because the hard copy still lists it.
 *   (2) No folder Guid => unprovisioned mode: printed tree only, no mutating affordance,
 *       and NO request is issued (the hooks are disabled by a null folderId, so there is no
 *       404 storm and no misleading "service unreachable").
 *   (3) folderId / instanceId are STRINGS (C# Guid). Only user ids are numbers.
 * =====================================================================================
 */

'use client'

import { Info } from 'lucide-react'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'

import FolderCompletionPanel from '@/components/workflow/FolderCompletionPanel'
import TableOfContentsPanel from '@/components/workflow/TableOfContentsPanel'
import {
  useEvaluationFolder,
  type FolderBearingRecord,
} from '@/lib/workflow/useEvaluationFolder'
import { useTableOfContents } from '@/lib/workflow/useWorkflow'

export interface FolderToCSectionProps {
  /** The selected ATA record; ATARecordDto satisfies FolderBearingRecord. */
  record?: FolderBearingRecord | null
  /** The form currently open in the workspace, so its row is highlighted. */
  activeFormType?: string | null
  /** Opens a form. `instanceId` is null when the form has not been started. */
  onOpenForm: (formType: string, instanceId: string | null, readOnly: boolean) => void
  className?: string
}

export default function FolderToCSection({
  record,
  activeFormType = null,
  onOpenForm,
  className = '',
}: FolderToCSectionProps) {
  const { refreshKey } = useSelfEvaluation()
  const { folderId, provisioned, reason } = useEvaluationFolder(record)
  const authority = String(record?.authority ?? '').toUpperCase()
  const hiddenFormTypes = new Set<string>()
  if (!authority.includes('FAA')) hiddenFormTypes.add('918_faa')
  if (!authority.includes('ECAA')) hiddenFormTypes.add('918a_caa')

  // useTableOfContents is disabled while folderId is null/'' - no request is made.
  const toc = useTableOfContents(folderId, refreshKey)

  return (
    <div className={`space-y-3 ${className}`}>
      {provisioned && folderId ? (
        <FolderCompletionPanel folderId={folderId} onChanged={() => void toc.reload()} />
      ) : (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-snug text-amber-900">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{reason}</span>
        </div>
      )}

      <TableOfContentsPanel
        folderId={folderId ?? ''}
        ataRecordId={record?.id}
        provisioned={provisioned}
        toc={toc.data}
        loading={toc.loading}
        error={toc.error}
        reload={toc.reload}
        formSubmissions={record?.formSubmissions}
        activeFormType={activeFormType}
        onOpenForm={onOpenForm}
        hiddenFormTypes={hiddenFormTypes}
      />
    </div>
  )
}