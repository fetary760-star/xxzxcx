/**
 * =====================================================================================
 * AMENDED v22 — ITEM 1: THE PRINTED SIGNATURE / ROLE MATRIX
 * Copy to: CMT.Frontend/src/lib/workflow/signature-matrix.ts     (REPLACES the v21 file)
 *
 * WHAT THIS FILE IS
 * -----------------
 * The single declarative source of every PRINTED signature line of every controlled
 * document listed under the Table of Contents. For each form type it declares, IN PRINTED
 * ORDER, one slot per signature line:
 *
 *     block            -> which SignatureBlockType the line is (Prepared / Approved / ...)
 *     caption          -> the caption EXACTLY as the hard copy prints it ("prepared  By:")
 *     roleCaption      -> the FIXED role title printed UNDER the name rule
 *     expectedRoles    -> the canonical roles that may legitimately sign this line
 *     signatureCaption -> "Signature:"  (inline style only)
 *     dateCaption      -> "Date:"       (inline style only)
 *     geometry         -> the printed widths of the four cells of that line
 *
 * WHAT v22 AMENDS AGAINST v21
 * ---------------------------
 * DEFECT E — THE MATRIX WAS NOT REACHABLE AS ONE OBJECT.
 *   A component had to call `signatureSlotsFor`, then `printStyleFor`, then `geometryFor`,
 *   then `signatureCaptionOfSlot`, then `dateCaptionOfSlot` — five lookups, easy to forget,
 *   and `FormDocumentChrome` forgot four of them, which is why the printed geometry still
 *   came out as the web dashboard band.
 *   FIX: `formSignatureConfig(formType)` returns `{ style, geometry, slots, lines }` where
 *   every line already carries its resolved caption / role / captions / geometry.
 *
 * DEFECT F — THE TNA ROLE TITLE WAS SILENTLY "CORRECTED".
 *   v21 printed "Mgr. Component Shop". The attached MNT-1229B scan prints
 *   "Mgr. Componenet Shop" (the typo is ON THE CONTROLLED FORM) and
 *   "TL. Component Engineering Support". A controlled document must be reproduced verbatim.
 *   FIX: verbatim below. If your shop prints the corrected spelling, edit ONE LINE here —
 *   `PRINTED_ROLE_CAPTIONS.tnaApprovedByManager` — and every form follows.
 *
 * DEFECT G — CAPTIONS THAT ARE JOB TITLES RESOLVED TO NO BLOCK.
 *   MNT-918 prints "RESPONSIBLE DIRECTOR:" and "Manager Quality Assurance:" as the LEFT
 *   CAPTION. `blockFromCaption()` could not map them, so those two lines never auto-filled.
 *   FIX: `SLOT_CAPTION_ALIASES` is exported from here and consumed by `signature-blocks.ts`,
 *   plus every legacy row may now declare its `block` explicitly.
 *
 * DEFECT H — NO WAY TO MATCH AN UNSIGNED STEP TO ITS PRINTED LINE SAFELY.
 *   `slotAcceptsAnyRole` existed but nothing fed it the step's eligible roles.
 *   FIX: kept and documented; `signature-blocks.ts` v22 now carries `eligibleRoles` on every
 *   printed row and feeds it here.
 *
 * FOUR HARD RULES
 *   (1) NO LAYOUT LOGIC LIVES HERE. This module is DATA only: strings plus geometry hints.
 *   (2) THE CAPTIONS ARE VERBATIM, TYPOS INCLUDED ("prepared  By:", "Componenet",
 *       "Acqusition"). They are reproduced from the signed hard copies. Do not "fix" them.
 *   (3) NO REACT, NO CONTEXT, NO CYCLE. The role titles are DECLARED here instead of imported
 *       from `useATAAutoFill.ts`, because that module is `'use client'` and pulls in the
 *       SelfEvaluation context — importing it from the pure layer would rebuild exactly the
 *       circular-import defect documented in `workflow-types.ts` (AMENDMENT 1).
 *   (4) THE SERVER STILL WINS ON FACTS. Names, dates, hashes and step states come from the
 *       API. This matrix supplies only what is PRE-PRINTED on the paper.
 * =====================================================================================
 */

import { ORG_ROLES, normalizeRole, roleLabel, type OrgRole } from '@/lib/role-hierarchy'
import { SignatureBlockType } from '@/lib/workflow/workflow-types'

// =====================================================================================
// 1. PRINTED ROLE TITLES
//    The FIXED text printed under each name rule, verbatim from the scanned hard copies.
// =====================================================================================

export const PRINTED_ROLE_CAPTIONS = {
  // ---- MNT-1229B — TOOL NEED ANALYSIS REPORT (TNA) — verbatim from TNA.png -----------
  tnaPreparedBy: 'Shop Team Leader / Engineer',
  /** VERBATIM from the scan, including the "Componenet" typo of the controlled form. */
  tnaApprovedByManager: 'Mgr. Componenet Shop',
  tnaApprovedByEngineering: 'TL. Component Engineering Support',

  // ---- MNT-1325 — PERIODIC CAPABILITY SELF-AUDIT ----
  auditSelfAuditedBy: 'Team Leader',
  auditApprovedBy: 'Manager',

  // ---- LETTER OF CONFIRMATION / AMENDMENT REQUEST LETTER ----
  letterPreparedBy: 'Shop Team Leader',
  letterReviewedBy: 'Manager',
  letterFrom: 'Dir. CMT',

  // ---- MNT-918 (FAA) / MNT-918A (CAA) — regulatory compliance ----
  form918PreparedBy: 'Shop Team Leader',
  form918Director: 'RESPONSIBLE DIRECTOR',
  form918QAManager: 'Manager Quality Assurance',
  form918ACAAEndorsement: 'ECAA Team',

  // ---- MNT-1420A (SB / SL / SIL) and MNT-1420B (AD) ----
  sbPreparedBy: 'Team Leader ET-MRO Documentation',
  sbProcessedBy: 'Documentation Clerk',
  sbSignedOffBy: 'Team Leader ET-MRO Documentation',
  sbIssuedBy: 'SHOP TEAM LEADER',
  adPreparedBy: 'SHOP TEAM LEADER',
  adApprovedBy: 'Mgr. Componenet Shop',

  // ---- CMM / technical data documentation (MNT-1420) ----
  docPreparedBy: 'Shop Team Leader / Engineer',
  docVerifiedBy: 'Documentation Clerk',
  docApprovedBy: 'Team Leader ET-MRO Documentation',

  // ---- Training documents (MNT-1378 / MNT-922C / verification records) ----
  trainingPreparedBy: 'Shop Team Leader',
  trainingReviewedBy: 'Shop Team Leader',
  trainingVerifiedBy: 'HR Specialist',
  trainingApprovedBy: 'Manager',
  inspectorReviewedBy: 'Inspector',
  inspectorApprovedBy: 'Inspector',
  technicianSignedOffBy: 'Technician',

  // ---- Tools & equipment ----
  toolsPreparedBy: 'Shop Team Leader / Engineer',
  toolsApprovedByManager: 'Mgr. Componenet Shop',
  toolsApprovedBySpecialTL: 'TL. Component Engineering Support',

  // ---- MNT-1563 — IN HOUSE MANUFACTURED TOOL COVER PAGE AND SUMMERY SHEET ----
  // Verbatim column captions printed under the three signature rules of the cover page.
  coverEngineer: 'Engineer',
  coverEngineeringTL: 'Engineering T/L',
  coverUserSectionTL: 'User section T/L',

  // ---- MNT-1269 — ETHIOPIAN TOOL MANUFACTURING TASK CARD (sheet 2) ----
  // Verbatim role lines printed under "Verified By / Validated By / Approved By".
  taskCardVerifiedBy: 'Foreman/supervisor (Manufacturer)',
  taskCardValidatedBy: 'Foreman/Supervisor (User Section)',
  taskCardApprovedBy: 'Engineer',

  // ---- Facility & consumables ----
  facilityPreparedBy: 'Shop Team Leader / Engineer',
  facilityApprovedBy: 'Mgr. Componenet Shop',
  consumablesPreparedBy: 'Shop Team Leader / Engineer',
  consumablesApprovedBy: 'Mgr. Componenet Shop',

  // ---- Folder-level final sign-off ----
  folderSignedOffBy: 'Responsible Director',
} as const

// =====================================================================================
// 2. PRINT STYLE AND LINE GEOMETRY
// =====================================================================================

/**
 * How a signature block is PRINTED on the paper original.
 *
 *   Inline  — MNT-1229B, MNT-1325, the letters, MNT-1420A/B, the training, tools, facility
 *             and consumables forms. One row per signatory:
 *
 *                 prepared  By: ______________________  Signature: ______  Date: ______
 *                               Shop Team Leader / Engineer
 *
 *             The name sits ON a rule, the FIXED role title is printed UNDER that rule, and
 *             "Signature:" / "Date:" are inline captions with their own short rules.
 *             NO column headers exist on the paper.
 *
 *   Columns — MNT-918 / MNT-918A only. The paper prints an explicit
 *             NAME / SIGNATURE / DATE band under "RESPONSIBLE DIRECTOR" and under
 *             "Manager Quality Assurance", so the labelled columns ARE the original.
 */
export enum SignaturePrintStyle {
  Inline = 'inline',
  Columns = 'columns',
}

/**
 * Widths of the four printed cells of ONE inline line, expressed as Tailwind classes.
 * Measured on the MNT-1229B scan as a fraction of the page width:
 *
 *      caption   ~ 4% .. 10%     -> label cell
 *      name rule  10% .. 26%     -> the long rule the name is written on
 *      "Signature:" ~ 32%, rule 38% .. 43%
 *      "Date:"      ~ 51%, rule 53% .. 57%
 */
export interface SignatureLineGeometry {
  /** Width of the left caption cell. */
  captionWidth: string
  /** Width of the name rule. */
  nameWidth: string
  /** Width of the specimen rule. */
  signatureWidth: string
  /** Width of the date rule. */
  dateWidth: string
}

/** The MNT-1229B / MNT-1325 geometry — the default of every inline hard copy. */
export const STANDARD_LINE_GEOMETRY: SignatureLineGeometry = {
  captionWidth: 'w-[7.5rem]',
  nameWidth: 'w-[15rem]',
  signatureWidth: 'w-[9rem]',
  dateWidth: 'w-[7.5rem]',
}

/** Wider caption cell, for forms whose printed caption is a full job title. */
export const WIDE_CAPTION_LINE_GEOMETRY: SignatureLineGeometry = {
  captionWidth: 'w-[13rem]',
  nameWidth: 'w-[14rem]',
  signatureWidth: 'w-[9rem]',
  dateWidth: 'w-[7.5rem]',
}

/** The inline captions of the two right-hand cells, verbatim from the hard copies. */
export const PRINTED_SIGNATURE_CAPTION = 'Signature:'
export const PRINTED_DATE_CAPTION = 'Date:'

/** Height of one printed rule, in px. Shared by the line and the specimen cell. */
export const PRINTED_RULE_HEIGHT = 18

// =====================================================================================
// 3. THE SLOT
// =====================================================================================

/** ONE printed signature line of ONE controlled document. */
export interface SignatureSlotDefinition {
  block: SignatureBlockType
  /** Printed caption, VERBATIM from the hard copy, e.g. "prepared  By:". */
  caption: string
  /** FIXED role title printed UNDER the name rule. Never replaced by the signer's role. */
  roleCaption: string
  /**
   * Canonical roles that may legitimately sign this line. Used to disambiguate a form that
   * prints the SAME caption more than once (MNT-1229B prints "Approved by:" twice).
   * An empty array means "any eligible role", and the layer falls back to printed order.
   */
  expectedRoles: OrgRole[]
  /** Inline caption of the specimen cell. Defaults to "Signature:". */
  signatureCaption?: string
  /** Inline caption of the date cell. Defaults to "Date:". */
  dateCaption?: string
  /** Per-line geometry override. Defaults to the geometry of the form. */
  geometry?: SignatureLineGeometry
}

const slot = (
  block: SignatureBlockType,
  caption: string,
  roleCaption: string,
  expectedRoles: OrgRole[] = [],
  extra: Partial<
    Pick<SignatureSlotDefinition, 'signatureCaption' | 'dateCaption' | 'geometry'>
  > = {},
): SignatureSlotDefinition => ({ block, caption, roleCaption, expectedRoles, ...extra })

// =====================================================================================
// 4. THE MATRIX  (keys are the persisted FormSubmission.FormType values — never rename)
// =====================================================================================

/** MNT-1229B — the reference hard copy of this amendment (TNA.png). */
const TNA_SLOTS: SignatureSlotDefinition[] = [
  slot(SignatureBlockType.PreparedBy, 'prepared  By:', PRINTED_ROLE_CAPTIONS.tnaPreparedBy, [
    ORG_ROLES.TeamLeader,
    ORG_ROLES.Engineer,
  ]),
  slot(SignatureBlockType.ApprovedBy, 'Approved by:', PRINTED_ROLE_CAPTIONS.tnaApprovedByManager, [
    ORG_ROLES.Manager,
    ORG_ROLES.ShopManager,
  ]),
  slot(
    SignatureBlockType.ApprovedBy,
    'Approved by:',
    PRINTED_ROLE_CAPTIONS.tnaApprovedByEngineering,
    [ORG_ROLES.SpecialTeamLeader],
  ),
]

/**
 * FORM ENG 751 — ALTERNATIVE TOOLING EQUIVALENCE STATEMENT.
 * The hard copies ("alernartool1" / "alettoll2" / "altertool3") print EXACTLY two
 * signature lines on every sheet: "ENGINEER:" and "TEAM LEADER:". Captions verbatim;
 * the role line under the rule falls back to the canonical role labels.
 */
const ENG751_SLOTS: SignatureSlotDefinition[] = [
  slot(SignatureBlockType.PreparedBy, 'ENGINEER:', 'Engineer', [
    ORG_ROLES.Engineer,
    ORG_ROLES.TeamLeader,
  ]),
  slot(SignatureBlockType.ApprovedBy, 'TEAM LEADER:', 'Team Leader', [
    ORG_ROLES.SpecialTeamLeader,
    ORG_ROLES.TeamLeader,
  ]),
]

/**
 * LETTER OF CONFIRMATION (interoffice correspondence "leeter ofconferm.pdf").
 * The paper prints TWO signature positions:
 *   "Mgr ACS: <name>"      — stamp/title under the rule: "Manager Avionics Component Shops"
 *   "Approved By: <name>"  — sub-title under the rule: "Director Component Maintenance";
 *                            the printed name itself carries the "DIR CMT:" prefix
 *                            ("Approved By:  DIR CMT: Ayele Getu").
 * Captions verbatim from the letter.
 */
const CONFIRMATION_LETTER_SLOTS: SignatureSlotDefinition[] = [
  slot(SignatureBlockType.PreparedBy, 'Mgr ACS:', 'Manager Avionics Component Shops', [
    ORG_ROLES.Manager,
    ORG_ROLES.ShopManager,
  ]),
  slot(SignatureBlockType.ApprovedBy, 'Approved By:', 'Director Component Maintenance', [
    ORG_ROLES.Director,
  ]),
]

const SELF_AUDIT_SLOTS: SignatureSlotDefinition[] = [
  slot(SignatureBlockType.PreparedBy, 'Self-audited By:', PRINTED_ROLE_CAPTIONS.auditSelfAuditedBy, [
    ORG_ROLES.TeamLeader,
  ]),
  slot(SignatureBlockType.ApprovedBy, 'Approved By:', PRINTED_ROLE_CAPTIONS.auditApprovedBy, [
    ORG_ROLES.Manager,
    ORG_ROLES.ShopManager,
  ]),
]

const LETTER_SLOTS: SignatureSlotDefinition[] = [
  slot(SignatureBlockType.PreparedBy, 'Prepared By:', PRINTED_ROLE_CAPTIONS.letterPreparedBy, [
    ORG_ROLES.TeamLeader,
    ORG_ROLES.Engineer,
  ]),
  slot(SignatureBlockType.ReviewedBy, 'Reviewed By:', PRINTED_ROLE_CAPTIONS.letterReviewedBy, [
    ORG_ROLES.Manager,
    ORG_ROLES.ShopManager,
  ]),
  slot(SignatureBlockType.ApprovedBy, 'Approved By:', PRINTED_ROLE_CAPTIONS.letterFrom, [
    ORG_ROLES.Director,
  ]),
]

/** MNT-918 prints an explicit NAME / SIGNATURE / DATE band — Columns style. */
const FORM_918_FAA_SLOTS: SignatureSlotDefinition[] = [
  slot(
    SignatureBlockType.ApprovedBy,
    'RESPONSIBLE DIRECTOR:',
    PRINTED_ROLE_CAPTIONS.form918Director,
    [ORG_ROLES.Director],
    { geometry: WIDE_CAPTION_LINE_GEOMETRY },
  ),
  slot(
    SignatureBlockType.SignedOffBy,
    'Manager Quality Assurance:',
    PRINTED_ROLE_CAPTIONS.form918QAManager,
    [ORG_ROLES.QAPersonnel],
    { geometry: WIDE_CAPTION_LINE_GEOMETRY },
  ),
]

const FORM_918A_CAA_SLOTS: SignatureSlotDefinition[] = [
  slot(
    SignatureBlockType.ApprovedBy,
    'RESPONSIBLE DIRECTOR:',
    PRINTED_ROLE_CAPTIONS.form918Director,
    [ORG_ROLES.Director],
    { geometry: WIDE_CAPTION_LINE_GEOMETRY },
  ),
  slot(
    SignatureBlockType.EndorsedBy,
    'Endorsed By:',
    PRINTED_ROLE_CAPTIONS.form918ACAAEndorsement,
    [ORG_ROLES.ECAAPersonnel],
    { geometry: WIDE_CAPTION_LINE_GEOMETRY },
  ),
]

const SB_SLOTS: SignatureSlotDefinition[] = [
  slot(SignatureBlockType.PreparedBy, 'Prepared By:', PRINTED_ROLE_CAPTIONS.sbPreparedBy, [
    ORG_ROLES.DocumentationTeamLeader,
  ]),
  slot(SignatureBlockType.ProcessedBy, 'Processed By:', PRINTED_ROLE_CAPTIONS.sbProcessedBy, [
    ORG_ROLES.DocumentationClerk,
  ]),
  slot(SignatureBlockType.SignedOffBy, 'Signed Off By:', PRINTED_ROLE_CAPTIONS.sbSignedOffBy, [
    ORG_ROLES.DocumentationTeamLeader,
  ]),
  slot(SignatureBlockType.IssuedBy, 'Issued By:', PRINTED_ROLE_CAPTIONS.sbIssuedBy, [
    ORG_ROLES.TeamLeader,
  ]),
]

const AD_SLOTS: SignatureSlotDefinition[] = [
  slot(SignatureBlockType.PreparedBy, 'Prepared By:', PRINTED_ROLE_CAPTIONS.adPreparedBy, [
    ORG_ROLES.TeamLeader,
  ]),
  slot(SignatureBlockType.ApprovedBy, 'Approved By:', PRINTED_ROLE_CAPTIONS.adApprovedBy, [
    ORG_ROLES.Manager,
    ORG_ROLES.ShopManager,
  ]),
]

const DOCUMENTATION_SLOTS: SignatureSlotDefinition[] = [
  slot(SignatureBlockType.PreparedBy, 'Prepared By:', PRINTED_ROLE_CAPTIONS.docPreparedBy, [
    ORG_ROLES.TeamLeader,
    ORG_ROLES.Engineer,
  ]),
  slot(SignatureBlockType.VerifiedBy, 'Verified By:', PRINTED_ROLE_CAPTIONS.docVerifiedBy, [
    ORG_ROLES.DocumentationClerk,
  ]),
  slot(SignatureBlockType.ApprovedBy, 'Approved By:', PRINTED_ROLE_CAPTIONS.docApprovedBy, [
    ORG_ROLES.DocumentationTeamLeader,
  ]),
]

const TRAINING_SLOTS: SignatureSlotDefinition[] = [
  slot(SignatureBlockType.PreparedBy, 'Prepared By:', PRINTED_ROLE_CAPTIONS.trainingPreparedBy, [
    ORG_ROLES.TeamLeader,
  ]),
  slot(SignatureBlockType.VerifiedBy, 'Verified By:', PRINTED_ROLE_CAPTIONS.trainingVerifiedBy, [
    ORG_ROLES.HRSpecialist,
  ]),
  slot(SignatureBlockType.ApprovedBy, 'Approved By:', PRINTED_ROLE_CAPTIONS.trainingApprovedBy, [
    ORG_ROLES.HRManager,
  ]),
]

const INSPECTOR_SLOTS: SignatureSlotDefinition[] = [
  slot(SignatureBlockType.PreparedBy, 'Prepared By:', PRINTED_ROLE_CAPTIONS.trainingPreparedBy, [
    ORG_ROLES.TeamLeader,
  ]),
  slot(SignatureBlockType.ReviewedBy, 'Reviewed By:', PRINTED_ROLE_CAPTIONS.inspectorReviewedBy, [
    ORG_ROLES.Inspector,
  ]),
  slot(SignatureBlockType.ApprovedBy, 'Approved By:', PRINTED_ROLE_CAPTIONS.inspectorApprovedBy, [
    ORG_ROLES.Inspector,
  ]),
]

const COMPETENCY_SLOTS: SignatureSlotDefinition[] = [
  slot(SignatureBlockType.PreparedBy, 'Prepared By:', PRINTED_ROLE_CAPTIONS.trainingPreparedBy, [
    ORG_ROLES.TeamLeader,
  ]),
  slot(
    SignatureBlockType.SignedOffBy,
    'Signed Off By:',
    PRINTED_ROLE_CAPTIONS.technicianSignedOffBy,
    [ORG_ROLES.Technician],
  ),
  slot(SignatureBlockType.ApprovedBy, 'Approved By:', PRINTED_ROLE_CAPTIONS.trainingApprovedBy, [
    ORG_ROLES.HRManager,
    ORG_ROLES.Manager,
  ]),
]

const TOOLS_SLOTS: SignatureSlotDefinition[] = [
  slot(SignatureBlockType.PreparedBy, 'Prepared By:', PRINTED_ROLE_CAPTIONS.toolsPreparedBy, [
    ORG_ROLES.TeamLeader,
    ORG_ROLES.Engineer,
  ]),
  slot(SignatureBlockType.ApprovedBy, 'Approved By:', PRINTED_ROLE_CAPTIONS.toolsApprovedByManager, [
    ORG_ROLES.Manager,
    ORG_ROLES.ShopManager,
  ]),
  slot(
    SignatureBlockType.ApprovedBy,
    'Approved By:',
    PRINTED_ROLE_CAPTIONS.toolsApprovedBySpecialTL,
    [ORG_ROLES.SpecialTeamLeader],
  ),
]

/**
 * MNT-1563 — IN HOUSE MANUFACTURED TOOL COVER PAGE AND SUMMERY SHEET.
 * The paper prints THREE side-by-side confirmation columns, each a Name rule + fixed role
 * caption + Signature + Date, under the statement "The above filled data correctness is
 * confirmed by engineering and user section as signed below". Captions verbatim (no colon is
 * printed on the paper, but the inline renderer appends its own spacing, so we keep them bare).
 */
const COVER_SLOTS: SignatureSlotDefinition[] = [
  slot(SignatureBlockType.PreparedBy, 'Engineer', PRINTED_ROLE_CAPTIONS.coverEngineer, [
    ORG_ROLES.Engineer,
    ORG_ROLES.TeamLeader,
  ]),
  slot(SignatureBlockType.ReviewedBy, 'Engineering T/L', PRINTED_ROLE_CAPTIONS.coverEngineeringTL, [
    ORG_ROLES.TeamLeader,
    ORG_ROLES.SpecialTeamLeader,
  ]),
  slot(
    SignatureBlockType.ApprovedBy,
    'User section T/L',
    PRINTED_ROLE_CAPTIONS.coverUserSectionTL,
    [ORG_ROLES.Manager, ORG_ROLES.ShopManager],
  ),
]

/**
 * MNT-1269 — ETHIOPIAN TOOL MANUFACTURING TASK CARD (sheet 2 signature area).
 * Below the Skill/Hours performed-by log the card prints THREE stacked blocks:
 *   Verified By  -> Foreman/supervisor (Manufacturer)
 *   Validated By -> Foreman/Supervisor (User Section)
 *   Approved By  -> Engineer
 * Captions and role lines verbatim from the hard copy.
 */
const TASKCARD_SLOTS: SignatureSlotDefinition[] = [
  slot(
    SignatureBlockType.VerifiedBy,
    'Verified By:',
    PRINTED_ROLE_CAPTIONS.taskCardVerifiedBy,
    [ORG_ROLES.TeamLeader, ORG_ROLES.Technician],
  ),
  slot(
    SignatureBlockType.ReviewedBy,
    'Validated By:',
    PRINTED_ROLE_CAPTIONS.taskCardValidatedBy,
    [ORG_ROLES.TeamLeader, ORG_ROLES.Manager],
  ),
  slot(
    SignatureBlockType.ApprovedBy,
    'Approved By:',
    PRINTED_ROLE_CAPTIONS.taskCardApprovedBy,
    [ORG_ROLES.Engineer, ORG_ROLES.SpecialTeamLeader],
  ),
]

const FACILITY_SLOTS: SignatureSlotDefinition[] = [
  slot(SignatureBlockType.PreparedBy, 'Prepared By:', PRINTED_ROLE_CAPTIONS.facilityPreparedBy, [
    ORG_ROLES.TeamLeader,
    ORG_ROLES.Engineer,
  ]),
  slot(SignatureBlockType.ApprovedBy, 'Approved By:', PRINTED_ROLE_CAPTIONS.facilityApprovedBy, [
    ORG_ROLES.Manager,
    ORG_ROLES.ShopManager,
  ]),
]

const CONSUMABLES_SLOTS: SignatureSlotDefinition[] = [
  slot(SignatureBlockType.PreparedBy, 'Prepared By:', PRINTED_ROLE_CAPTIONS.consumablesPreparedBy, [
    ORG_ROLES.TeamLeader,
    ORG_ROLES.Engineer,
  ]),
  slot(SignatureBlockType.ApprovedBy, 'Approved By:', PRINTED_ROLE_CAPTIONS.consumablesApprovedBy, [
    ORG_ROLES.Manager,
    ORG_ROLES.ShopManager,
  ]),
]

const FOLDER_SIGNOFF_SLOTS: SignatureSlotDefinition[] = [
  slot(SignatureBlockType.PreparedBy, 'Prepared By:', PRINTED_ROLE_CAPTIONS.letterPreparedBy, [
    ORG_ROLES.TeamLeader,
  ]),
  slot(SignatureBlockType.ReviewedBy, 'Reviewed By:', PRINTED_ROLE_CAPTIONS.letterReviewedBy, [
    ORG_ROLES.Manager,
  ]),
  slot(SignatureBlockType.SignedOffBy, 'Signed Off By:', PRINTED_ROLE_CAPTIONS.folderSignedOffBy, [
    ORG_ROLES.Director,
  ]),
]

/**
 * The matrix. Keys are the PERSISTED FormSubmission.FormType strings declared in
 * FORM_TYPES (workflow-types.ts) — never rename them.
 */
export const FORM_SIGNATURE_MATRIX: Record<string, SignatureSlotDefinition[]> = {
  // ---- TOOLS AND EQUIPMENT (7 forms) ----
  tna: TNA_SLOTS,
  tool_need_analysis_report: TNA_SLOTS,
  alternate_tools_equivalency: ENG751_SLOTS,
  // MNT-1563 cover page + MNT-1269 task card: the in-house package.
  inhouse_manufactured_tools: COVER_SLOTS,
  tool_mfg_jic: COVER_SLOTS,
  tool_risk_assessment: TASKCARD_SLOTS,
  tool_mfg_form_1554: TOOLS_SLOTS,

  // ---- PERIODIC CAPABILITY SELF-AUDIT / MNT-1325 ----
  periodic_self_audit: SELF_AUDIT_SLOTS,
  capability_self_evaluation: SELF_AUDIT_SLOTS,

  // ---- LETTER OF CONFIRMATION + AMENDMENT REQUEST LETTER ----
  confirmation_letter: CONFIRMATION_LETTER_SLOTS,
  request_letter: LETTER_SLOTS,
  expiry_amendment: LETTER_SLOTS,

  // ---- 918 FAA / 918 A CAA ----
  '918_faa': FORM_918_FAA_SLOTS,
  '918a_caa': FORM_918A_CAA_SLOTS,

  // ---- DOCUMENTATION (4 forms) ----
  cmm_documentation: DOCUMENTATION_SLOTS,
  sb: SB_SLOTS,
  ad: AD_SLOTS,
  task_card: DOCUMENTATION_SLOTS,

  // ---- TRAINING DOCUMENT (8 forms) ----
  component_maintenance_training: TRAINING_SLOTS,
  inspector_proficiency: INSPECTOR_SLOTS,
  competency_assessment: COMPETENCY_SLOTS,
  similar_technology: TRAINING_SLOTS,
  training_verification_inspection: INSPECTOR_SLOTS,
  training_verification_technician: COMPETENCY_SLOTS,
  similar_task: TRAINING_SLOTS,
  simple_task: TRAINING_SLOTS,

  // ---- FACILITY REQUIREMENT EVALUATION (3 forms) ----
  repair_facility_evaluation: FACILITY_SLOTS,
  cleaning_facility_evaluation: FACILITY_SLOTS,
  environmental_facility_evaluation: FACILITY_SLOTS,

  // ---- CONSUMABLES ----
  list_of_consumables: CONSUMABLES_SLOTS,
  alternate_consumable_declaration: CONSUMABLES_SLOTS,

  // ---- FOLDER LEVEL ----
  evaluation_folder_signoff: FOLDER_SIGNOFF_SLOTS,
  table_of_content: FOLDER_SIGNOFF_SLOTS,
}

/**
 * The DEFAULT chain used when a form type has no explicit row. It is deliberately the
 * "Prepared / Approved" pair every controlled document of this system prints, so a NEW form
 * still auto-populates before its matrix row is written.
 */
export const DEFAULT_SIGNATURE_SLOTS: SignatureSlotDefinition[] = [
  slot(SignatureBlockType.PreparedBy, 'Prepared By:', PRINTED_ROLE_CAPTIONS.docPreparedBy, [
    ORG_ROLES.TeamLeader,
    ORG_ROLES.Engineer,
  ]),
  slot(SignatureBlockType.ApprovedBy, 'Approved By:', PRINTED_ROLE_CAPTIONS.facilityApprovedBy, [
    ORG_ROLES.Manager,
    ORG_ROLES.ShopManager,
  ]),
]

/**
 * The PRINT STYLE per form type. Only the MNT-918 family prints an explicit
 * NAME / SIGNATURE / DATE band; every other hard copy prints the inline geometry.
 */
export const FORM_SIGNATURE_PRINT_STYLE: Record<string, SignaturePrintStyle> = {
  '918_faa': SignaturePrintStyle.Columns,
  '918a_caa': SignaturePrintStyle.Columns,
}

/** The default line geometry per form type. */
export const FORM_SIGNATURE_GEOMETRY: Record<string, SignatureLineGeometry> = {
  '918_faa': WIDE_CAPTION_LINE_GEOMETRY,
  '918a_caa': WIDE_CAPTION_LINE_GEOMETRY,
}

/**
 * AMENDED v22 (DEFECT G) — printed captions that are JOB TITLES rather than the usual
 * "<verb> by" phrasing, and therefore cannot be resolved by `blockFromCaption()` alone.
 * `signature-blocks.ts` consults this table before falling back to the positional matrix.
 * Keys are normalised (lower case, punctuation collapsed to single spaces).
 */
export const SLOT_CAPTION_ALIASES: Record<string, SignatureBlockType> = {
  'responsible director': SignatureBlockType.ApprovedBy,
  'manager quality assurance': SignatureBlockType.SignedOffBy,
  'mgr quality assurance': SignatureBlockType.SignedOffBy,
  'ecaa team': SignatureBlockType.EndorsedBy,
  'shop team leader': SignatureBlockType.PreparedBy,
  'shop team leader engineer': SignatureBlockType.PreparedBy,
  from: SignatureBlockType.ApprovedBy,
}

// =====================================================================================
// 5. LOOKUPS
// =====================================================================================

function normalizeFormType(formType?: string | null): string {
  return (formType ?? '').trim().toLowerCase()
}

/** Printed signature slots of one form type, in printed order. Never empty. */
export function signatureSlotsFor(formType?: string | null): SignatureSlotDefinition[] {
  const key = normalizeFormType(formType)
  if (!key) return DEFAULT_SIGNATURE_SLOTS
  return FORM_SIGNATURE_MATRIX[key] ?? DEFAULT_SIGNATURE_SLOTS
}

/** True when the matrix has an explicit row for this form type. */
export function hasSignatureMatrixRow(formType?: string | null): boolean {
  const key = normalizeFormType(formType)
  return !!key && FORM_SIGNATURE_MATRIX[key] !== undefined
}

/** How the signature block of this form must be PRINTED. */
export function printStyleFor(formType?: string | null): SignaturePrintStyle {
  const key = normalizeFormType(formType)
  return FORM_SIGNATURE_PRINT_STYLE[key] ?? SignaturePrintStyle.Inline
}

/** The printed geometry of one line: slot override, then form, then default. */
export function geometryFor(
  formType?: string | null,
  entry?: SignatureSlotDefinition | null,
): SignatureLineGeometry {
  if (entry?.geometry) return entry.geometry
  const key = normalizeFormType(formType)
  return FORM_SIGNATURE_GEOMETRY[key] ?? STANDARD_LINE_GEOMETRY
}

/** The slot of the Nth occurrence of a block on one form. */
export function slotFor(
  formType: string | null | undefined,
  block: SignatureBlockType,
  occurrence = 0,
): SignatureSlotDefinition | null {
  const matches = signatureSlotsFor(formType).filter(entry => entry.block === block)
  return matches[occurrence] ?? null
}

/**
 * The role title the matrix prints for one line, with the CANONICAL role labels as the
 * fallback when the matrix carries no verbatim title.
 *
 * This is printed for SIGNED lines too: the line under the name rule is the POSITION the
 * form is signed in, pre-printed on the paper. The signer's own role is exposed separately
 * by `signature-blocks.ts` as `personRoleLabel`, for tooltips and the audit trail only.
 */
export function roleCaptionOfSlot(entry?: SignatureSlotDefinition | null): string {
  if (!entry) return ''
  if (entry.roleCaption.trim()) return entry.roleCaption
  return entry.expectedRoles.map(roleLabel).filter(Boolean).join(' / ')
}

/**
 * True when `signerRole` is one of the roles the printed line expects. An empty
 * `expectedRoles` accepts anybody, which is what the DEFAULT chain relies on.
 */
export function slotAcceptsRole(
  entry: SignatureSlotDefinition | null | undefined,
  signerRole?: string | null,
): boolean {
  if (!entry) return false
  if (entry.expectedRoles.length === 0) return true
  const canonical = normalizeRole(signerRole)
  if (!canonical) return false
  return entry.expectedRoles.includes(canonical)
}

/**
 * True when ANY of the roles a pending step is open to belongs to this line. Used to place
 * an UNSIGNED row on the right printed line WITHOUT the fragile substring comparison of the
 * v20 layer.
 */
export function slotAcceptsAnyRole(
  entry: SignatureSlotDefinition | null | undefined,
  signerRoles?: Array<string | null | undefined> | null,
): boolean {
  if (!entry) return false
  if (entry.expectedRoles.length === 0) return true
  if (!Array.isArray(signerRoles) || signerRoles.length === 0) return false
  return signerRoles.some(role => {
    const canonical = normalizeRole(role)
    return !!canonical && entry.expectedRoles.includes(canonical)
  })
}

/** Inline caption of the specimen cell of one line. */
export function signatureCaptionOfSlot(entry?: SignatureSlotDefinition | null): string {
  return entry?.signatureCaption?.trim() || PRINTED_SIGNATURE_CAPTION
}

/** Inline caption of the date cell of one line. */
export function dateCaptionOfSlot(entry?: SignatureSlotDefinition | null): string {
  return entry?.dateCaption?.trim() || PRINTED_DATE_CAPTION
}

// =====================================================================================
// 6. AMENDED v22 — THE WHOLE PRINTED CONFIGURATION OF ONE FORM IN ONE CALL (DEFECT E)
// =====================================================================================

/** One fully resolved printed line: nothing left to look up. */
export interface ResolvedSignatureLineConfig {
  slot: SignatureSlotDefinition
  block: SignatureBlockType
  caption: string
  roleCaption: string
  signatureCaption: string
  dateCaption: string
  geometry: SignatureLineGeometry
}

export interface FormSignatureConfig {
  formType: string
  style: SignaturePrintStyle
  geometry: SignatureLineGeometry
  slots: SignatureSlotDefinition[]
  lines: ResolvedSignatureLineConfig[]
  /** False when the form type fell back to DEFAULT_SIGNATURE_SLOTS. */
  fromMatrix: boolean
}

/**
 * THE ENTRY POINT for any component that has to PRINT a signature block. One call returns
 * the print style, the default geometry and every printed line with its verbatim caption,
 * its fixed role title, its inline captions and its own geometry already resolved.
 */
export function formSignatureConfig(formType?: string | null): FormSignatureConfig {
  const key = normalizeFormType(formType)
  const slots = signatureSlotsFor(key)
  const style = printStyleFor(key)
  const geometry = geometryFor(key)

  return {
    formType: key,
    style,
    geometry,
    slots,
    fromMatrix: hasSignatureMatrixRow(key),
    lines: slots.map(entry => ({
      slot: entry,
      block: entry.block,
      caption: entry.caption,
      roleCaption: roleCaptionOfSlot(entry),
      signatureCaption: signatureCaptionOfSlot(entry),
      dateCaption: dateCaptionOfSlot(entry),
      geometry: geometryFor(key, entry),
    })),
  }
}