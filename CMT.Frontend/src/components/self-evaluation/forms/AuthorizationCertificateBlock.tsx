/**
 * AuthorizationCertificateBlock — ETHIOPIAN MRO "Authorization Certificate"
 * (AMENDED — integration + display fixes)
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Two of the supplied hard copies are Authorization Certificates that are
 * ATTACHED to the training documents, not standalone Table of Contents nodes:
 *
 *   - FORM MNT – 922B, Rev No. 01, Rev Date: 15 January 2020
 *     Component Certifying Staff / Component Inspector (Electric shop).
 *     Printed with a 6-cell identification row
 *     (NAME | REG NO | ECAA LICENSE NO | Authorization Number |
 *      1st ISSUE DATE | EXPIRY DATE), a 3-column "Scope of Authorization"
 *     grid (ECAA AWS007 | FAA 8130-3 | EASA Form 1), the employee
 *     acknowledgment row, the STAMP NO. ISSUED / SAMPLE STAMP / INITIAL row and
 *     the "MANAGER MRO QA & SAFETY" signature line.
 *
 *   - FORM MNT – 922C
 *     Component Qualified Technician (CQT). Printed with a single
 *     "Area of Authorization" line and a numbered "Scope of Authorization"
 *     list, approved by the Manager Avionics Component Shops.
 *
 * WHAT WAS WRONG BEFORE (reported: "not integrated and not properly display")
 * ---------------------------------------------------------------------------
 * 1. The block ended with an INVENTED footer row that printed a tick box and
 *    the sentence "Certificate attached to this training record." That row does
 *    not exist on either hard copy. It only existed to keep the unused
 *    `CheckCell` import "meaningful", so the rendered attachment no longer
 *    matched the original. REMOVED, together with the `CheckCell` import.
 * 2. `CERT_922B` / `CERT_922C` were declared `as const`, so `CERT_922B.duties`
 *    was a readonly TUPLE while `CERT_922C.duties` was `readonly string[]`.
 *    Selecting the document with a ternary produced a union whose `.map()` /
 *    `.length` access is fragile and broke type-checking in the parent forms.
 *    Both constants are now typed through one explicit `CertificateDoc`
 *    interface, so the ternary yields a single, stable type.
 * 3. The identification row forced 6 columns from the `lg` breakpoint. Inside
 *    the form pane (which already sits next to the 340px Table of Contents
 *    panel) the six cells collapsed to unreadable slivers. It now steps
 *    2 → 3 → 6 columns and every cell wraps instead of overflowing.
 * 4. Column captions were paraphrased. They now print verbatim:
 *    "Authorization to Issue ECAA (AWS007)", "Authorization to issue FAA
 *    (8130-3)", "Authorization to issue EASA Form 1".
 *
 * The block stays PRESENTATIONAL: the parent form owns the state and passes the
 * value plus a change handler, exactly like the primitives in
 * FormDocumentChrome.
 */
'use client'

import { Input } from '@/components/ui/input'
import { DocumentHeader, type DocumentMetaLine } from './FormDocumentChrome'

// ===========================================================================
// Controlled document constants — verbatim from the hard copies
// ===========================================================================

/**
 * Static, printed text of one certificate flavour.
 *
 * Declared through an explicit interface (NOT `as const`) so that
 * `variant === '922B' ? CERT_922B : CERT_922C` produces one stable type.
 */
interface CertificateDoc {
  formNo: string
  revNo: string
  revDate: string
  organisation: string
  title: string
  /** Printed grant sentence. */
  grant: string
  /** Numbered duty lines printed under the grant sentence. */
  duties: readonly string[]
  validity: string
  note: string
  acknowledgment: string
  /** Caption of the approval block. */
  approverRole: string
  /** Caption of the first date cell of the identification row. */
  issueDateLabel: string
}

export const CERT_922B: CertificateDoc = {
  formNo: 'FORM MNT – 922B',
  revNo: '01',
  revDate: '15 January 2020',
  organisation: 'ETHIOPIAN AIRLINES ENTERPRISE / ETHIOPIAN MRO',
  title: 'Authorization Certificate',
  grant:
    'Limited to the scope of authorizations stated below, Ethiopian MRO hereby grants you an authorization to perform the duties of component certifying staff per the current Ethiopian MRO capability lists.',
  duties: ['Component Certifying Staff &', 'Component Inspector for Electric shop.'],
  validity:
    'This authorization certificate will remain valid until the expiry date shown above unless revoked or employment is terminated and subject to your license remaining valid throughout the validity period of your authorization (only for A/C support/certifying and A/C inspectors).',
  note:
    'Note: The holder of this authorization, when requested by an authorized person, shall produce his Certification Authorization within 24 hours.',
  acknowledgment:
    'I acknowledge that I have read the above and have understood my responsibilities & limitations on the above listed airplane-engine combinations/components shown in the approved scope of Authorization and I will notify Manager Quality Assurance when any change of employment status or job duties occurs.',
  approverRole: 'MANAGER MRO QA & SAFETY',
  issueDateLabel: '1st ISSUE DATE',
}

export const CERT_922C: CertificateDoc = {
  formNo: 'FORM MNT – 922C',
  revNo: '',
  revDate: '',
  organisation: 'ETHIOPIAN MRO',
  title: 'Authorization Certificate',
  grant:
    'Limited to the scope of authorizations stated below, Ethiopian MRO hereby grants you an authorization to perform the duties of component Qualified Technician (CQT) III of (list as applicable);',
  duties: [],
  validity:
    'This authorization certificate will remain valid until the expiry date shown above unless revoked or employment is terminated throughout the validity period of your authorization.',
  note:
    'Note: The holder of this authorization, when requested by an authorized person, shall produce his certification authorization within 24 hours.',
  acknowledgment:
    'I acknowledge that I have read the above and have understood my responsibilities & limitations on the listed component/aircraft-engine combination in the attachment.',
  approverRole: 'Approved by',
  issueDateLabel: 'ISSUE DATE',
}

/** Scope column of MNT-922B — three authorities printed side by side. */
export interface CertificateScopeColumn {
  /** Column caption, verbatim, e.g. "Authorization to issue FAA (8130-3)". */
  heading: string
  /** Numbered lines printed inside the column. */
  lines: string[]
}

export interface AuthorizationCertificateValue {
  /** Certificate flavour: 922B (certifying staff) or 922C (technician). */
  variant: '922B' | '922C'

  employeeName: string
  regNo: string
  licenseNo: string
  authorizationNumber: string
  issueDate: string
  expiryDate: string

  /** MNT-922C only: the single "Area of Authorization" line. */
  areaOfAuthorization: string
  /** MNT-922C only: numbered scope lines. */
  scopeLines: string[]
  /** MNT-922B only: the three authority scope columns. */
  scopeColumns: CertificateScopeColumn[]

  /** Employee acknowledgment row. */
  employeeSignatureDate: string
  /** MNT-922B only. */
  stampNoIssued: string

  approverName: string
  approverPosition: string
  approverDate: string
}

/** Default MNT-922B, copied verbatim from the HANNA MITIKU hard copy. */
export const DEFAULT_CERT_922B: AuthorizationCertificateValue = {
  variant: '922B',
  employeeName: 'HANNA MITIKU',
  regNo: '19893',
  licenseNo: 'MM-5022',
  authorizationNumber: 'QA/CCS/19893',
  issueDate: '25 Jun 2019',
  expiryDate: '16 Apr 2027',
  areaOfAuthorization: '',
  scopeLines: [],
  scopeColumns: [
    {
      heading: 'Authorization to Issue ECAA (AWS007)',
      lines: [
        '1. All simple components in the ECAA A/C Electric shop capability scope',
        '2. Components listed in the attached individual ECAA authorization scope',
      ],
    },
    {
      heading: 'Authorization to issue FAA (8130-3)',
      lines: [
        '1. All simple components in the FAA A/C Electric shop capability scope',
        '2. Components listed in the attached individual FAA authorization scope',
      ],
    },
    {
      heading: 'Authorization to issue EASA Form 1',
      lines: ['NO AUTHORIZATION'],
    },
  ],
  employeeSignatureDate: '15 Apr 25',
  stampNoIssued: 'C414',
  approverName: 'Dechassa Tadesse',
  approverPosition: 'Mgr MRO QA and Safety, Ethiopian MRO',
  approverDate: '17 Apr 25',
}

/** Default MNT-922C, copied verbatim from the FANTAHUN DAMESSA hard copy. */
export const DEFAULT_CERT_922C: AuthorizationCertificateValue = {
  variant: '922C',
  employeeName: 'FANTAHUN DAMESSA',
  regNo: '27070',
  licenseNo: 'MM-6964',
  authorizationNumber: 'CMT/CQT/27070',
  issueDate: '28-NOV-18',
  expiryDate: '15-JAN-27',
  areaOfAuthorization: 'ELECTRIC SHOP',
  scopeLines: [
    '1. All simple components in the ECAA, FAA and EASA electric shop capabillity scope',
    '2. Components listed in the attached individual authorization scope',
  ],
  scopeColumns: [],
  employeeSignatureDate: '17-JAN-25',
  stampNoIssued: '',
  approverName: 'WAKUMA N.',
  approverPosition: 'Manager Avionics Component Shops',
  approverDate: '17-JAN-25',
}

interface Props {
  value: AuthorizationCertificateValue
  editable: boolean
  onChange: (patch: Partial<AuthorizationCertificateValue>) => void
}

/** Printed cell of the identification row — same behaviour in view / edit mode. */
function Cell({
  label,
  value,
  editable,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  editable: boolean
  onChange: (next: string) => void
  placeholder?: string
}) {
  return (
    <div className="min-w-0 px-2 py-1 border-b border-r border-gray-300">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 [overflow-wrap:anywhere]">
        {label}
      </p>
      {editable ? (
        <Input
          value={value}
          placeholder={placeholder}
          onChange={event => onChange(event.target.value)}
          className="h-7 text-[11px]"
        />
      ) : (
        <p className="min-h-[18px] break-words text-[11px] font-semibold text-gray-900 [overflow-wrap:anywhere]">
          {value || '—'}
        </p>
      )}
    </div>
  )
}

/** Dotted signature rule of the printed forms. */
function SignatureRule() {
  return <p className="min-h-[18px] border-b border-dotted border-gray-400 text-[11px]" />
}

export default function AuthorizationCertificateBlock({ value, editable, onChange }: Props) {
  const doc = value.variant === '922B' ? CERT_922B : CERT_922C

  const meta: DocumentMetaLine[] = [{ label: 'Form', value: doc.formNo.replace('FORM ', '') }]
  if (doc.revNo) meta.push({ label: 'Rev No.', value: doc.revNo })
  if (doc.revDate) meta.push({ label: 'Rev Date:', value: doc.revDate })

  const updateScopeLine = (index: number, next: string) => {
    onChange({
      scopeLines: value.scopeLines.map((line, i) => (i === index ? next : line)),
    })
  }

  const updateScopeColumnLine = (columnIndex: number, lineIndex: number, next: string) => {
    onChange({
      scopeColumns: value.scopeColumns.map((column, cIdx) =>
        cIdx !== columnIndex
          ? column
          : {
              ...column,
              lines: column.lines.map((line, lIdx) => (lIdx === lineIndex ? next : line)),
            },
      ),
    })
  }

  return (
    <div className="mt-4">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
        Attachment — Authorization Certificate ({doc.formNo.replace('FORM ', '')})
      </p>

      <DocumentHeader organisation={doc.organisation} title={doc.title} meta={meta} />

      {/* ---- Identification row ------------------------------------------- */}
      <div className="border border-gray-400 border-t-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          <Cell
            label="Name"
            value={value.employeeName}
            editable={editable}
            onChange={next => onChange({ employeeName: next })}
          />
          <Cell
            label="Reg No"
            value={value.regNo}
            editable={editable}
            onChange={next => onChange({ regNo: next })}
          />
          <Cell
            label="ECAA License No"
            value={value.licenseNo}
            editable={editable}
            onChange={next => onChange({ licenseNo: next })}
          />
          <Cell
            label="Authorization Number"
            value={value.authorizationNumber}
            editable={editable}
            onChange={next => onChange({ authorizationNumber: next })}
          />
          <Cell
            label={doc.issueDateLabel}
            value={value.issueDate}
            editable={editable}
            onChange={next => onChange({ issueDate: next })}
          />
          <Cell
            label="Expiry Date"
            value={value.expiryDate}
            editable={editable}
            onChange={next => onChange({ expiryDate: next })}
          />
        </div>
      </div>

      {/* ---- Grant sentence + duties -------------------------------------- */}
      <div className="border border-gray-400 border-t-0 px-2 py-2">
        <p className="text-[11px] leading-relaxed text-gray-800">{doc.grant}</p>
        {doc.duties.length > 0 && (
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[11px] font-semibold text-gray-900">
            {doc.duties.map(duty => (
              <li key={duty}>{duty}</li>
            ))}
          </ol>
        )}
      </div>

      {/* ---- Scope of Authorization --------------------------------------- */}
      {value.variant === '922C' ? (
        <>
          <div className="border border-gray-400 border-t-0 px-2 py-1.5">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-500">
              Area of Authorization
            </p>
            {editable ? (
              <Input
                value={value.areaOfAuthorization}
                onChange={event => onChange({ areaOfAuthorization: event.target.value })}
                className="h-7 w-full max-w-xs text-[11px]"
                placeholder="e.g. ELECTRIC SHOP"
              />
            ) : (
              <p className="text-[11px] font-bold uppercase text-gray-900">
                {value.areaOfAuthorization || '—'}
              </p>
            )}
          </div>

          <div className="border border-gray-400 border-t-0 px-2 py-1.5">
            <p className="text-[11px] font-bold underline text-gray-900">Scope of Authorization</p>
            <div className="mt-1 space-y-1">
              {value.scopeLines.map((line, index) =>
                editable ? (
                  <Input
                    key={`scope-line-${index}`}
                    value={line}
                    onChange={event => updateScopeLine(index, event.target.value)}
                    className="h-7 text-[11px]"
                  />
                ) : (
                  <p
                    key={`scope-line-${index}`}
                    className="break-words text-[11px] leading-snug text-gray-800 [overflow-wrap:anywhere]"
                  >
                    {line}
                  </p>
                ),
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="border border-gray-400 border-t-0">
          <p className="px-2 py-1 text-[11px] font-bold underline text-gray-900">
            Scope of Authorization
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 border-t border-gray-300">
            {value.scopeColumns.map((column, columnIndex) => (
              <div
                key={column.heading}
                className="min-w-0 border-b md:border-b-0 border-r border-gray-300 last:border-r-0"
              >
                <p className="border-b border-gray-300 bg-gray-50 px-2 py-1 text-[10px] font-semibold leading-snug text-gray-800">
                  {column.heading}
                </p>
                <div className="space-y-1 px-2 py-1">
                  {column.lines.map((line, lineIndex) =>
                    editable ? (
                      <Input
                        key={`${column.heading}-${lineIndex}`}
                        value={line}
                        onChange={event =>
                          updateScopeColumnLine(columnIndex, lineIndex, event.target.value)
                        }
                        className="h-7 text-[11px]"
                      />
                    ) : (
                      <p
                        key={`${column.heading}-${lineIndex}`}
                        className="break-words text-[11px] leading-snug text-gray-800 [overflow-wrap:anywhere]"
                      >
                        {line}
                      </p>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- Validity + note ---------------------------------------------- */}
      <div className="border border-gray-400 border-t-0 px-2 py-2 space-y-1">
        <p className="text-[11px] leading-relaxed text-gray-800">{doc.validity}</p>
        <p className="text-[11px] font-semibold leading-relaxed text-gray-900">{doc.note}</p>
      </div>

      {/* ---- Employee acknowledgment -------------------------------------- */}
      <div className="border border-gray-400 border-t-0 px-2 py-2">
        <p className="text-[11px] font-bold text-gray-900">Employee&apos;s Acknowledgment:</p>
        <p className="text-[11px] leading-relaxed text-gray-800">{doc.acknowledgment}</p>

        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="min-w-0">
            <p className="text-[9px] uppercase text-gray-500">Employee Name</p>
            <p className="min-h-[18px] break-words border-b border-dotted border-gray-400 text-[11px] font-semibold text-gray-900 [overflow-wrap:anywhere]">
              {value.employeeName || ''}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[9px] uppercase text-gray-500">Signature</p>
            <SignatureRule />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] uppercase text-gray-500">Reg No</p>
            <p className="min-h-[18px] border-b border-dotted border-gray-400 text-[11px] font-semibold text-gray-900">
              {value.regNo || ''}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[9px] uppercase text-gray-500">Date</p>
            {editable ? (
              <Input
                value={value.employeeSignatureDate}
                onChange={event => onChange({ employeeSignatureDate: event.target.value })}
                className="h-7 text-[11px]"
                placeholder="e.g. 15 Apr 25"
              />
            ) : (
              <p className="min-h-[18px] border-b border-dotted border-gray-400 text-[11px] font-semibold text-gray-900">
                {value.employeeSignatureDate || ''}
              </p>
            )}
          </div>
        </div>

        {/* STAMP NO. ISSUED / SAMPLE STAMP / INITIAL — MNT-922B only. */}
        {value.variant === '922B' && (
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="min-w-0">
              <p className="text-[9px] uppercase text-gray-500">Stamp No. Issued</p>
              {editable ? (
                <Input
                  value={value.stampNoIssued}
                  onChange={event => onChange({ stampNoIssued: event.target.value })}
                  className="h-7 text-[11px]"
                  placeholder="e.g. C414"
                />
              ) : (
                <p className="min-h-[18px] border-b border-dotted border-gray-400 text-[11px] font-semibold text-gray-900">
                  {value.stampNoIssued || ''}
                </p>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[9px] uppercase text-gray-500">Sample Stamp</p>
              <div className="mt-0.5 flex h-12 w-12 flex-col items-center justify-center rounded-full border border-gray-500 text-center text-[7px] font-bold leading-tight text-gray-600">
                <span>ETHIOPIAN</span>
                <span>{value.stampNoIssued || '—'}</span>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-[9px] uppercase text-gray-500">Initial</p>
              <SignatureRule />
            </div>
          </div>
        )}
      </div>

      {/* ---- Approval ------------------------------------------------------ */}
      <div className="border border-gray-400 border-t-0 px-2 py-2">
        <p className="text-[11px] font-bold uppercase text-gray-900">{doc.approverRole}</p>
        <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="min-w-0">
            <p className="text-[9px] uppercase text-gray-500">Name</p>
            {editable ? (
              <Input
                value={value.approverName}
                onChange={event => onChange({ approverName: event.target.value })}
                className="h-7 text-[11px]"
              />
            ) : (
              <p className="min-h-[18px] break-words border-b border-dotted border-gray-400 text-[11px] font-semibold text-gray-900 [overflow-wrap:anywhere]">
                {value.approverName || ''}
              </p>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[9px] uppercase text-gray-500">Position</p>
            {editable ? (
              <Input
                value={value.approverPosition}
                onChange={event => onChange({ approverPosition: event.target.value })}
                className="h-7 text-[11px]"
              />
            ) : (
              <p className="min-h-[18px] break-words border-b border-dotted border-gray-400 text-[11px] font-semibold text-gray-900 [overflow-wrap:anywhere]">
                {value.approverPosition || ''}
              </p>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[9px] uppercase text-gray-500">Signature</p>
            <SignatureRule />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] uppercase text-gray-500">Date</p>
            {editable ? (
              <Input
                value={value.approverDate}
                onChange={event => onChange({ approverDate: event.target.value })}
                className="h-7 text-[11px]"
              />
            ) : (
              <p className="min-h-[18px] border-b border-dotted border-gray-400 text-[11px] font-semibold text-gray-900">
                {value.approverDate || ''}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}