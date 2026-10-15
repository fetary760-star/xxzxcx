'use client';

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Pause, Play, Clock, User, MessageSquare } from 'lucide-react';
import { usePauseResume } from '@/hooks/usePauseResume';

interface PauseResumeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: number | null;
  taskDescription?: string;
  isPaused?: boolean;
  onActionComplete?: () => void;
}

export default function PauseResumeModal({
  open,
  onOpenChange,
  taskId,
  taskDescription,
  isPaused = false,
  onActionComplete,
}: PauseResumeModalProps) {
  const {
    loading,
    error,
    pauseHistory,
    pauseTask,
    resumeTask,
    fetchPauseHistory,
    formatDuration,
    clearError,
  } = usePauseResume();

  const [pauseReason, setPauseReason] = useState('');
  const [resumeComment, setResumeComment] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'action' | 'history'>('action');

  useEffect(() => {
    if (open && taskId) {
      fetchPauseHistory(taskId);
      setPauseReason('');
      setResumeComment('');
      setSuccess(null);
      clearError();
    }
  }, [open, taskId, fetchPauseHistory, clearError]);

  const handlePause = async () => {
    if (!taskId || !pauseReason.trim()) return;
    const ok = await pauseTask(taskId, pauseReason.trim());
    if (ok) {
      setSuccess('Task paused successfully. Time tracking has started.');
      setPauseReason('');
      onActionComplete?.();
      setTimeout(() => onOpenChange(false), 1500);
    }
  };

  const handleResume = async () => {
    if (!taskId) return;
    const ok = await resumeTask(taskId, resumeComment.trim() || undefined);
    if (ok) {
      setSuccess('Task resumed successfully.');
      setResumeComment('');
      onActionComplete?.();
      setTimeout(() => onOpenChange(false), 1500);
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isPaused ? (
              <>
                <Play className="h-5 w-5 text-green-600" />
                Resume Task {taskId ? `TC-${taskId}` : ''}
              </>
            ) : (
              <>
                <Pause className="h-5 w-5 text-amber-600" />
                Pause Task {taskId ? `TC-${taskId}` : ''}
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 mb-4">
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'action'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('action')}
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('history')}
          >
            History ({pauseHistory?.events?.length ?? 0})
          </button>
        </div>

        {/* Action Tab */}
        {activeTab === 'action' && (
          <div className="space-y-4">
            {taskDescription && (
              <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md">
                <strong>Task:</strong> {taskDescription}
              </div>
            )}

            {/* Current Pause Status */}
            {pauseHistory && pauseHistory.totalPausedDurationMinutes > 0 && (
              <div className="flex flex-col gap-1 text-sm bg-amber-50 border border-amber-200 rounded-md p-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <span>
                    Total paused time: <strong>{pauseHistory.totalPausedDurationFormatted || formatDuration(pauseHistory.totalPausedDurationMinutes)}</strong>
                  </span>
                </div>
                {pauseHistory.statusChangedAt && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 ml-6">
                    <span>Status last changed: <strong>{new Date(pauseHistory.statusChangedAt).toLocaleString()}</strong></span>
                  </div>
                )}
              </div>
            )}

            {isPaused ? (
              /* Resume Form */
              <div className="space-y-3">
                <div className="rounded-md bg-green-50 border border-green-200 p-4">
                  <div className="font-semibold text-sm text-green-900 mb-2">▶️ Resume this task</div>
                  <div className="text-sm text-green-800">
                    The task will be set back to &quot;In Progress&quot; and the paused duration will be recorded.
                  </div>
                </div>

                {pauseHistory?.pausedReason && (
                  <div className="text-sm bg-amber-50 border border-amber-200 rounded-md p-3">
                    <strong>Pause reason:</strong> {pauseHistory.pausedReason}
                    {pauseHistory.pausedByUserName && (
                      <span className="text-gray-500 ml-2">— by {pauseHistory.pausedByUserName}</span>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    Resume Comment (optional)
                  </label>
                  <textarea
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-200"
                    rows={3}
                    value={resumeComment}
                    onChange={(e) => setResumeComment(e.target.value)}
                    placeholder="Add an optional comment about resuming this task..."
                  />
                </div>

                <Button
                  onClick={handleResume}
                  disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                >
                  {loading ? 'Resuming…' : '▶️ Resume Task'}
                </Button>
              </div>
            ) : (
              /* Pause Form */
              <div className="space-y-3">
                <div className="rounded-md bg-amber-50 border border-amber-200 p-4">
                  <div className="font-semibold text-sm text-amber-900 mb-2">⏸️ Pause this task</div>
                  <div className="text-sm text-amber-800">
                    The task status will change to &quot;Paused&quot; and the paused duration will be tracked automatically.
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-amber-900 mb-1 block">
                    Pause Reason <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    className="w-full rounded-md border-2 border-amber-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                    rows={4}
                    value={pauseReason}
                    onChange={(e) => setPauseReason(e.target.value)}
                    placeholder="Explain why this task needs to be paused (e.g., waiting for information, temporary resource reallocation, dependency on another task, etc.)"
                    required
                  />
                </div>

                <Button
                  onClick={handlePause}
                  disabled={loading || !pauseReason.trim()}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {loading ? 'Pausing…' : '⏸️ Pause Task'}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            {!pauseHistory?.events?.length ? (
              <div className="text-center text-gray-500 py-8">
                No pause/resume history for this task.
              </div>
            ) : (
              <div className="space-y-3">
                {pauseHistory.events.map((event) => (
                  <div
                    key={event.eventId}
                    className={`flex items-start gap-3 p-3 rounded-md border ${
                      event.eventType === 'Paused'
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-green-50 border-green-200'
                    }`}
                  >
                    <div className="mt-0.5">
                      {event.eventType === 'Paused' ? (
                        <Pause className="h-4 w-4 text-amber-600" />
                      ) : (
                        <Play className="h-4 w-4 text-green-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span className={event.eventType === 'Paused' ? 'text-amber-900' : 'text-green-900'}>
                          {event.eventType === 'Paused' ? '⏸️ Paused' : '▶️ Resumed'}
                        </span>
                        {event.durationFormatted && (
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            {event.durationFormatted}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                        <User className="h-3 w-3" />
                        <span>{event.userName}</span>
                        <span>•</span>
                        <Clock className="h-3 w-3" />
                        <span>{new Date(event.eventDate).toLocaleString()}</span>
                      </div>
                      {event.reason && (
                        <div className="flex items-start gap-1 text-sm text-gray-700 mt-2">
                          <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          <span>{event.reason}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Error / Success Messages */}
        {error && (
          <div className="text-sm text-red-700 bg-red-50 p-3 rounded border border-red-200 mt-3">
            {error}
          </div>
        )}
        {success && (
          <div className="text-sm text-green-700 bg-green-50 p-3 rounded border border-green-200 mt-3">
            {success}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}