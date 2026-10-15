/**
 * ============================================================================
 * types.ts - ATARecordDto AMENDMENT
 * ============================================================================
 * 
 * INSTRUCTION: In your existing types.ts file, find the ATARecordDto interface
 * and ADD the `cmmPdfUrl` field after the existing `revNo` field.
 * 
 * FIND THIS EXISTING BLOCK (around line 254-255):
 * -----------------------------------------------
 * 
 *   cmmRevDate: string
 *   revNo: string
 *   aircraft: string
 * 
 * 
 * REPLACE WITH:
 * -----------------------------------------------
 * 
 *   cmmRevDate: string
 *   revNo: string
 *   // CMM PDF URL stored from external system. Persists per part number.
 *   cmmPdfUrl: string
 *   aircraft: string
 * 
 * 
 * That's the ONLY change needed in types.ts.
 * ============================================================================
 */

// For reference, here is the full amended ATARecordDto interface:

export interface ATARecordDto {
  id: string
  description: string
  partNumber: string
  selfEvaluationDate: string
  manufacturer: string
  /** ATA chapter code string (e.g., "34") - used as display value */
  ataChapter: string
  /** Same as ataChapter - backend field name */
  ataChapterCode?: string
  cmmRevDate: string
  revNo: string
  /** CMM PDF URL stored from external system. Persists per part number until refreshed. */
  cmmPdfUrl: string
  aircraft: string

  /**
   * Shop Capability / Authority - comma-separated values.
   * Possible values: "ECAA", "FAA", "EASA" or combinations like "ECAA,FAA,EASA"
   */
  authority: string

  /**
   * Responsible Workshop - comma-separated values.
   * Possible values: "Galley", "Electric" or combinations like "Galley,Electric"
   */
  responsibleWorkshop: string

  // Legacy fields (backward compatibility - do NOT use for display)
  ecaaShop: string
  faaShop: string

  letterRefNo: string
  shop: string
  shopId: string
  componentId: string

  // ATA Chapter relationship
  ataChapterId: string
  ataChapterNumber: string
  ataChapterTitle: string

  // Approval workflow
  approvalStatus: number
  assignedToUserId?: string
  rejectionReason?: string
  revisionNumber: number
  createdBy: string
  createdAt: string
  updatedAt: string
}