'use client';

import React, { useEffect, useState } from 'react';
import { Calendar, TrendingUp, User, ArrowRight } from 'lucide-react';
import apiClient from '@/lib/api';

interface UserDateCountsDisplayProps {
  userId?: number;
  taskId?: number;
  showTitle?: boolean;
}

export default function UserDateCountsDisplay({ 
  userId, 
  taskId,
  showTitle = true 
}: UserDateCountsDisplayProps) {
  const [dateCounts, setDateCounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    const loadDateCounts = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const endpoint = taskId 
          ? `/task-holds/users/${userId}/date-counts?taskId=${taskId}`
          : `/task-holds/users/${userId}/date-counts`;
        
        const response = await apiClient.get(endpoint);
        const data = response?.dateCounts || response?.data || response || [];
        setDateCounts(Array.isArray(data) ? data : []);
      } catch (err: any) {
        console.error('Failed to load date counts:', err);
        setError(err?.message || 'Failed to load date counts');
        setDateCounts([]);
      } finally {
        setLoading(false);
      }
    };

    loadDateCounts();
  }, [userId, taskId]);

  if (!userId) return null;

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          <div className="h-8 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  const totalDays = dateCounts.reduce((sum, dc) => sum + (dc.dateCount || 0), 0);
  const transferredDays = dateCounts
    .filter(dc => dc.countType === 'TransferredFromEngineer')
    .reduce((sum, dc) => sum + (dc.dateCount || 0), 0);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {showTitle && (
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center">
            <Calendar className="h-4 w-4 mr-2 text-blue-600" />
            Date Count Summary
          </h3>
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Total Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-xs font-medium text-blue-600 mb-1">Total Days</div>
            <div className="text-2xl font-bold text-blue-900">{totalDays}</div>
          </div>
          {transferredDays > 0 && (
            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-xs font-medium text-green-600 mb-1">Transferred Days</div>
              <div className="text-2xl font-bold text-green-900">{transferredDays}</div>
            </div>
          )}
        </div>

        {/* Detailed Breakdown */}
        {dateCounts.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Breakdown
            </div>
            {dateCounts.map((dc, index) => (
              <div
                key={dc.dateCountId || index}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
              >
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-sm font-medium text-gray-900">
                      TC-{dc.taskId}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      dc.countType === 'TransferredFromEngineer'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {dc.countType === 'TransferredFromEngineer' ? 'Transferred' : 'Work Days'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 truncate">
                    {dc.taskDescription}
                  </div>
                  {dc.transferredFromUserName && (
                    <div className="flex items-center text-xs text-gray-500 mt-1">
                      <User className="h-3 w-3 mr-1" />
                      From: {dc.transferredFromUserName}
                      {dc.transferReason && (
                        <span className="ml-2 text-gray-400">• {dc.transferReason}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="ml-4 text-right">
                  <div className="text-lg font-bold text-gray-900">{dc.dateCount}</div>
                  <div className="text-xs text-gray-500">days</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {dateCounts.length === 0 && (
          <div className="text-center py-4 text-sm text-gray-500">
            No date count records found
          </div>
        )}
      </div>
    </div>
  );
}