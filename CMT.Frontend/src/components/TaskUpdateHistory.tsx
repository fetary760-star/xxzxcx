'use client';

import React, { useEffect, useState } from 'react';
import apiClient, { type TaskUpdateHistory as TaskUpdateHistoryType } from '@/lib/api';
import { Clock, User, AlertCircle, RefreshCw } from 'lucide-react';
import { useTimezone } from '@/lib/timezone-context';

type Props = {
  taskId: number;
};

/**
 * TaskUpdateHistory Component
 * 
 * Displays a timeline of all updates made to a task, showing:
 * - Who made the update (user name and role)
 * - When the update was made (date and time)
 * - What was changed (field name, old value, new value)
 * - Any comments associated with the update
 */
export default function TaskUpdateHistory({ taskId }: Props) {
  const { formatDateTime } = useTimezone();
  const [history, setHistory] = useState<TaskUpdateHistoryType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  /**
   * CRITICAL FIX: Convert any hardcoded UTC timestamps embedded in text
   * to the user's preferred timezone. Handles legacy data with patterns like
   * "at 2026-03-15 14:30:00 UTC" or "on 2026-03-15 14:30:00 UTC".
   */
  const convertEmbeddedUtcTimestamps = (text: string): string => {
    if (!text) return text;
    const utcPattern = /\b(at|on)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+UTC\b/gi;
    return text.replace(utcPattern, (_match, preposition, datePart, timePart) => {
      try {
        const isoString = `${datePart}T${timePart}Z`;
        const formatted = formatDateTime(isoString);
        if (formatted && formatted !== '—') {
          return `${preposition} ${formatted}`;
        }
      } catch {
        // If parsing fails, return original text
      }
      return _match;
    });
  };

  useEffect(() => {
    loadUpdateHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const loadUpdateHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getTaskUpdateHistory(taskId);
      setHistory(data || []);
    } catch (err: any) {
      console.error('Failed to load update history:', err);
      setError(err?.message || 'Failed to load update history');
    } finally {
      setLoading(false);
    }
  };

  // FIXED: Use reactive useTimezone() hook instead of static localStorage read
  const formatDate = (dateString: string) => {
    return formatDateTime(dateString);
  };

  const getUpdateTypeIcon = (updateType: string) => {
    const type = updateType.toLowerCase();
    if (type.includes('status')) return '🔄';
    if (type.includes('assignment')) return '👤';
    if (type.includes('priority')) return '⚠️';
    if (type.includes('deadline') || type.includes('completion')) return '📅';
    if (type.includes('description')) return '📝';
    if (type.includes('comment')) return '💬';
    if (type.includes('revision') || type.includes('alert')) return '🚨';
    return '✏️';
  };

  const getUpdateTypeLabel = (updateType: string) => {
    return updateType
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const formatFieldName = (fieldName?: string) => {
    if (!fieldName) return '';
    return fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const renderValueChange = (update: TaskUpdateHistoryType) => {
    if (!update.fieldName) return null;

    const fieldLabel = formatFieldName(update.fieldName);
    const hasChange = update.oldValue || update.newValue;

    if (!hasChange) return null;

    return (
      <div className="mt-2 text-sm">
        <div className="font-medium text-gray-700">{fieldLabel}:</div>
        <div className="flex items-center gap-2 mt-1">
          {update.oldValue && (
            <>
              <span className="px-2 py-1 bg-red-50 text-red-700 rounded border border-red-200 line-through">
                {convertEmbeddedUtcTimestamps(update.oldValue)}
              </span>
              <span className="text-gray-400">→</span>
            </>
          )}
          {update.newValue && (
            <span className="px-2 py-1 bg-green-50 text-green-700 rounded border border-green-200">
              {convertEmbeddedUtcTimestamps(update.newValue)}
            </span>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Clock className="h-5 w-5 mr-2" />
            Update History
          </h3>
        </div>
        <div className="p-6 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-500">Loading update history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Clock className="h-5 w-5 mr-2" />
            Update History
          </h3>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm">{error}</span>
          </div>
          <button
            onClick={loadUpdateHistory}
            className="mt-3 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Clock className="h-5 w-5 mr-2" />
            Update History
            <span className="ml-2 bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs">
              {history.length}
            </span>
          </h3>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-6">
          {history.length === 0 ? (
            <p className="text-gray-500 text-center py-4 text-sm">
              No update history available yet.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Timeline */}
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>

                {/* Timeline items */}
                <div className="space-y-6">
                  {history.map((update, index) => (
                    <div key={update.updateHistoryId || index} className="relative pl-10">
                      {/* Timeline dot */}
                      <div className="absolute left-0 top-1 w-8 h-8 bg-white border-2 border-blue-500 rounded-full flex items-center justify-center text-sm">
                        {getUpdateTypeIcon(update.updateType)}
                      </div>

                      {/* Update card */}
                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        {/* Header */}
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                              <User className="h-3 w-3 text-blue-600" />
                            </div>
                            <div>
                              <div className="font-medium text-gray-900 text-sm">
                                {update.updatedByUserName}
                              </div>
                              {update.updatedByUserRole && (
                                <div className="text-xs text-gray-500">
                                  {update.updatedByUserRole}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatDate(update.updatedAt)}
                          </div>
                        </div>

                        {/* Update type badge */}
                        <div className="mb-2">
                          <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                            {getUpdateTypeLabel(update.updateType)}
                          </span>
                        </div>

                        {/* Value change */}
                        {renderValueChange(update)}

                        {/* Update comment */}
                        {update.updateComment && (
                          <div className="mt-3 p-3 bg-white rounded border border-gray-200">
                            <div className="text-xs font-medium text-gray-500 mb-1">Comment:</div>
                            <div className="text-sm text-gray-700">
                              {convertEmbeddedUtcTimestamps(update.updateComment)}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}