'use client';

import { useState, useCallback } from 'react';
import apiClient, { TaskPauseHistory } from '@/lib/api';

interface UsePauseResumeReturn {
  loading: boolean;
  error: string | null;
  pauseHistory: TaskPauseHistory | null;
  pauseTask: (taskId: number, reason: string) => Promise<boolean>;
  resumeTask: (taskId: number, comment?: string) => Promise<boolean>;
  fetchPauseHistory: (taskId: number) => Promise<void>;
  formatDuration: (totalMinutes: number) => string;
  clearError: () => void;
}

export function usePauseResume(): UsePauseResumeReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pauseHistory, setPauseHistory] = useState<TaskPauseHistory | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const pauseTask = useCallback(async (taskId: number, reason: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.pauseTask(taskId, { pauseReason: reason });
      if (response.success && response.pauseHistory) {
        setPauseHistory(response.pauseHistory);
      }
      window.dispatchEvent(new CustomEvent('tasks:refresh'));
      return true;
    } catch (err: any) {
      setError(err?.message || 'Failed to pause task');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const resumeTask = useCallback(async (taskId: number, comment?: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.resumeTask(taskId, { resumeComment: comment });
      if (response.success && response.pauseHistory) {
        setPauseHistory(response.pauseHistory);
      }
      window.dispatchEvent(new CustomEvent('tasks:refresh'));
      return true;
    } catch (err: any) {
      setError(err?.message || 'Failed to resume task');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPauseHistory = useCallback(async (taskId: number): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.getTaskPauseHistory(taskId);
      if (response.success && response.pauseHistory) {
        setPauseHistory(response.pauseHistory);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch pause history');
    } finally {
      setLoading(false);
    }
  }, []);

  const formatDuration = useCallback((totalMinutes: number): string => {
    if (totalMinutes < 1) return 'Less than a minute';
    if (totalMinutes < 60) return `${totalMinutes}m`;

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours < 24) {
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }

    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;

    if (remainingHours > 0 && minutes > 0) return `${days}d ${remainingHours}h ${minutes}m`;
    if (remainingHours > 0) return `${days}d ${remainingHours}h`;
    return `${days}d`;
  }, []);

  return {
    loading,
    error,
    pauseHistory,
    pauseTask,
    resumeTask,
    fetchPauseHistory,
    formatDuration,
    clearError,
  };
}

export default usePauseResume;