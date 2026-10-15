/**
 * =====================================================================================
 * AMENDED v18 - PHASE 1 (FRONTEND), ITEM 2
 * CMT.Frontend/src/components/workflow/FolderCompletionCard.tsx
 *
 * v18: this file WAS a second, independently-fetching reader of
 * GET /api/evaluation-folders/{id}/progress. Two readers of the same endpoint drift on the
 * one rule that matters for requirement #11 - whether a Skipped item still counts as
 * remaining - so "remaining tasks per folder" became untestable.
 *
 * FolderCompletionPanel is now the SINGLE implementation (remaining mandatory items +
 * report availability + sign-off chain + two-year revision cycle). This module is kept
 * ONLY so existing `import FolderCompletionCard from ...` call sites keep compiling.
 *
 * DO NOT ADD LOGIC HERE. Its props are FolderCompletionPanel's props:
 *   { folderId: string; onChanged?: () => void; className?: string }
 * NOTE the prop change: the old card took `progress` / `loading` / `error` / `onReload`.
 * The panel fetches internally via useFolderProgress + useFolderRevisions, so any call
 * site still passing those four props must drop them.
 * =====================================================================================
 */

export { default } from './FolderCompletionPanel'
export * from './FolderCompletionPanel'