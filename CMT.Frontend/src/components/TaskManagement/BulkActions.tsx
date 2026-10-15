'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Archive,
  CheckSquare,
  ChevronDown,
  Download,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';

export interface BulkActionsProps {
  /** Ids of the currently selected rows. */
  selectedItems: number[];
  /** Total number of rows currently available (after filters/search). */
  totalItems: number;
  onDeleteSelected?: () => void | Promise<void>;
  /** Export ONLY the selected rows. */
  onExportSelected?: (ids: number[]) => void | Promise<void>;
  /** Export EVERY row currently listed (all filtered rows, not just the page). */
  onExportAll?: () => void | Promise<void>;
  onArchiveSelected?: (ids: number[]) => void | Promise<void>;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  itemType?: string;
  canDelete?: boolean;
}

/**
 * Toolbar shown above the task table.
 *
 * Selection summary + bulk actions. The export control is a dropdown so the user
 * can decide between exporting every listed task or only the selected ones:
 *
 *   [ Export ▾ ]  ->  "Export All (221)"
 *                     "Export Selected (12)"
 */
export default function BulkActions({
  selectedItems,
  totalItems,
  onDeleteSelected,
  onExportSelected,
  onExportAll,
  onArchiveSelected,
  onSelectAll,
  onClearSelection,
  itemType = 'items',
  canDelete = true,
}: BulkActionsProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const selectedCount = selectedItems?.length ?? 0;
  const hasSelection = selectedCount > 0;
  const hasRows = totalItems > 0;

  // Nothing listed and nothing selected -> no toolbar to show.
  if (!hasRows && !hasSelection) return null;

  const runExportAll = async () => {
    if (!onExportAll || isExporting) return;
    setIsExporting(true);
    try {
      await onExportAll();
    } finally {
      setIsExporting(false);
    }
  };

  const runExportSelected = async () => {
    if (!onExportSelected || isExporting || !hasSelection) return;
    setIsExporting(true);
    try {
      await onExportSelected([...selectedItems]);
    } finally {
      setIsExporting(false);
    }
  };

  const runArchive = async () => {
    if (!onArchiveSelected || isArchiving || !hasSelection) return;
    setIsArchiving(true);
    try {
      await onArchiveSelected([...selectedItems]);
    } finally {
      setIsArchiving(false);
    }
  };

  const runDelete = async () => {
    if (!onDeleteSelected || isDeleting || !hasSelection) return;
    setIsDeleting(true);
    try {
      await onDeleteSelected();
    } finally {
      setIsDeleting(false);
    }
  };

  const canExportAll = typeof onExportAll === 'function' && hasRows;
  const canExportSelected = typeof onExportSelected === 'function' && hasSelection;
  const showExport = canExportAll || canExportSelected;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
      <span className="text-sm text-gray-700">
        {hasSelection ? (
          <>
            <span className="font-semibold text-blue-700">{selectedCount}</span> of{' '}
            <span className="font-semibold">{totalItems}</span> {itemType} selected
          </>
        ) : (
          <>
            <span className="font-semibold">{totalItems}</span> {itemType}
          </>
        )}
      </span>

      {!hasSelection && onSelectAll && hasRows && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onSelectAll}
          className="h-8 px-2 text-blue-700 hover:text-blue-800"
        >
          <CheckSquare className="mr-1.5 h-4 w-4" />
          Select Page
        </Button>
      )}

      {hasSelection && onClearSelection && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          className="h-8 px-2 text-gray-600 hover:text-gray-800"
        >
          <X className="mr-1.5 h-4 w-4" />
          Clear Selection
        </Button>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {showExport && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={isExporting}
                className="h-8 border-green-300 bg-white text-green-800 hover:bg-green-50"
                title="Export tasks to Excel"
              >
                {isExporting ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-1.5 h-4 w-4" />
                )}
                {isExporting ? 'Exporting…' : 'Export'}
                <ChevronDown className="ml-1.5 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Export to Excel</DropdownMenuLabel>
              <DropdownMenuSeparator />

              <DropdownMenuItem
                disabled={!canExportAll || isExporting}
                onClick={(event) => {
                  event.preventDefault();
                  void runExportAll();
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                <span className="flex-1">Export All ({totalItems})</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                disabled={!canExportSelected || isExporting}
                onClick={(event) => {
                  event.preventDefault();
                  void runExportSelected();
                }}
              >
                <CheckSquare className="mr-2 h-4 w-4" />
                <span className="flex-1">
                  Export Selected {hasSelection ? `(${selectedCount})` : '(none selected)'}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {hasSelection && canDelete && onDeleteSelected && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void runDelete()}
            disabled={isDeleting}
            className="h-8 border-red-300 bg-white text-red-700 hover:bg-red-50"
          >
            {isDeleting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-1.5 h-4 w-4" />
            )}
            Delete ({selectedCount})
          </Button>
        )}
      </div>
    </div>
  );
}