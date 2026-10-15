

/**
 * =====================================================================================
 * AMENDMENT v18 - PHASE 1 (FRONTEND), ITEM 1
 * CMT.Frontend/src/lib/workflow/workflow-caption-plan.ts                       (NEW FILE)
 *
 * WHAT THIS FILE IS
 * -----------------
 * The PRINTED CAPTION PLAN: for every catalogued form, the captions that appear on the
 * hard copy, in order, and the SignatureBlockType each executed step fills.
 *
 * WHY IT IS NEEDED
 * ----------------
 * Requirement #13 says the engine must fill "each existed location accordingly on each
 * form ... without modifying their layouts". That is only auditable if the expected
 * caption sequence is declared somewhere the client can compare against. Without this
 * table, a chain that produces ApprovedBy twice where the sheet prints
 * "Approved By / Endorsed By" renders one blank line and nothing detects it.
 *
 * BINDING RULES
 *   (1) THIS FILE IS A MIRROR, NOT A SOURCE. The server's FormWorkflowCatalog decides the
 *       real chain. Use this only to (a) label a not-yet-executed block on screen and
 *       (b) assert in review that a chain matches the printed sheet.
 *   (2) ORDER IS THE PRINTED ORDER, top to bottom on the sheet. Never re-sort it.
 *   (3) A form may legitimately print the SAME caption twice (TNA, Letter of
 *       Confirmation). Duplicates are intentional - do not de-duplicate.
 * =====================================================================================
 */

import { SignatureBlockType } from '@/lib/workflow/workflow-types'

/** One printed signature line on the hard copy. */
export interface PrintedCaption {
  /** The caption exactly as printed on the sheet. */
  readonly caption: string
  /** Which signature block the engine fills into this line. */
  readonly block: SignatureBlockType
  /** The role(s) expected to own this line, for the "waiting on ..." hint. */
  readonly ownerRoles: readonly string[]
}

/** formType -> the printed caption sequence. Keys are FormNodeTypes values. */
export const FORM_PRINTED_CAPTIONS: Record<string, readonly PrintedCaption[]> = {
  ata_record: [
    { caption: 'Prepared By', block: SignatureBlockType.PreparedBy, ownerRoles: ['ShopTeamLeader', 'Engineer'] },
    { caption: 'Issued By', block: SignatureBlockType.IssuedBy, ownerRoles: ['ShopTeamLeader'] },
  ],
  sb: [
    { caption: 'Prepared By', block: SignatureBlockType.PreparedBy, ownerRoles: ['DocumentationClerk'] },
    { caption: 'Processed By', block: SignatureBlockType.ProcessedBy, ownerRoles: ['DocumentationClerk'] },
    { caption: 'Approved By', block: SignatureBlockType.SignedOffBy, ownerRoles: ['DocumentationTeamLeader'] },
  ],
  ad: [
    { caption: 'Prepared By', block: SignatureBlockType.PreparedBy, ownerRoles: ['ShopTeamLeader'] },
    { caption: 'Issued By', block: SignatureBlockType.IssuedBy, ownerRoles: ['ShopTeamLeader'] },
  ],
  tna: [
    { caption: 'Prepared By', block: SignatureBlockType.PreparedBy, ownerRoles: ['ShopTeamLeader', 'Engineer'] },
    { caption: 'Approved By', block: SignatureBlockType.ApprovedBy, ownerRoles: ['Manager'] },
    { caption: 'Approved By', block: SignatureBlockType.ApprovedBy, ownerRoles: ['SpecialTeamLeader'] },
  ],
  component_maintenance_training: [
    { caption: 'Prepared By', block: SignatureBlockType.PreparedBy, ownerRoles: ['ShopTeamLeader'] },
    { caption: 'Verified By', block: SignatureBlockType.VerifiedBy, ownerRoles: ['HRSpecialist'] },
    { caption: 'Approved By', block: SignatureBlockType.ApprovedBy, ownerRoles: ['HRManager'] },
    { caption: 'Verified By', block: SignatureBlockType.VerifiedBy, ownerRoles: ['ShopTeamLeader'] },
  ],
  inspector_proficiency: [
    { caption: 'Reviewed By', block: SignatureBlockType.ReviewedBy, ownerRoles: ['Inspector'] },
    { caption: 'Approved By', block: SignatureBlockType.ApprovedBy, ownerRoles: ['Inspector'] },
  ],
  competency_assessment: [
    { caption: 'Reviewed By', block: SignatureBlockType.ReviewedBy, ownerRoles: ['Technician'] },
    { caption: 'Signed Off By', block: SignatureBlockType.SignedOffBy, ownerRoles: ['Technician'] },
  ],
  request_letter: [
    { caption: 'Prepared By', block: SignatureBlockType.PreparedBy, ownerRoles: ['ShopTeamLeader', 'Engineer', 'Manager'] },
    { caption: 'Approved By', block: SignatureBlockType.ApprovedBy, ownerRoles: ['Director'] },
  ],
  confirmation_letter: [
    { caption: 'Prepared By', block: SignatureBlockType.PreparedBy, ownerRoles: ['Manager'] },
    { caption: 'Approved By', block: SignatureBlockType.ApprovedBy, ownerRoles: ['Manager'] },
    { caption: 'Approved By', block: SignatureBlockType.ApprovedBy, ownerRoles: ['Director'] },
  ],
  '918_faa': [
    { caption: 'Approved By', block: SignatureBlockType.ApprovedBy, ownerRoles: ['Director'] },
    { caption: 'Approved By', block: SignatureBlockType.ApprovedBy, ownerRoles: ['QAPersonnel'] },
  ],
  '918a_caa': [
    { caption: 'Endorsed By', block: SignatureBlockType.EndorsedBy, ownerRoles: ['ECAAPersonnel'] },
  ],
  periodic_self_audit: [
    // MNT-1325 slot fix: the hard copy prints ONLY two signature lines -
    // "Self-audited By:" (Team Leader) and "Approved By:" (Manager) - exactly as
    // declared by SELF_AUDIT_SLOTS in signature-matrix.ts. The old four-row mirror
    // invented a "Verified By" line that exists on no sheet and mislabelled the
    // draft stamp; this file is a MIRROR of the printed sheet, not a second source.
    // The Director's SignedOffBy stamp is kept in the approval history / signature
    // ledger but is intentionally NOT printed, because the paper carries no line.
    { caption: 'Self-audited By', block: SignatureBlockType.PreparedBy, ownerRoles: ['ShopTeamLeader'] },
    { caption: 'Approved By', block: SignatureBlockType.ApprovedBy, ownerRoles: ['Manager'] },
  ],
  evaluation_folder_signoff: [
    { caption: 'Signed Off By', block: SignatureBlockType.SignedOffBy, ownerRoles: ['ShopTeamLeader'] },
    { caption: 'Signed Off By', block: SignatureBlockType.SignedOffBy, ownerRoles: ['ShopManager'] },
    { caption: 'Signed Off By', block: SignatureBlockType.SignedOffBy, ownerRoles: ['Manager'] },
    { caption: 'Signed Off By', block: SignatureBlockType.SignedOffBy, ownerRoles: ['Director'] },
  ],
}

/** The printed caption sequence for a form, or [] when the form prints no signature block. */
export function printedCaptionsFor(formType?: string | null): readonly PrintedCaption[] {
  if (!formType) return []
  return FORM_PRINTED_CAPTIONS[formType] ?? []
}

/**
 * How many printed lines a form has. Used by the ToC row to render "2 of 3 signed"
 * BEFORE any workflow instance exists, straight off the printed sheet.
 */
export function printedCaptionCount(formType?: string | null): number {
  return printedCaptionsFor(formType).length
}