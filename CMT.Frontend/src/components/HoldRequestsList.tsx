'use client';

import React, { useEffect, useState } from 'react';
import { Clock, User, Calendar, AlertCircle, CheckCircle, XCircle, ShieldAlert } from 'lucide-react';
import apiClient from '@/lib/api';
import { useTimezone } from '@/lib/timezone-context';
import HoldRequestReviewModal from './HoldRequestReviewModal';
import { useAuth } from '@/lib/auth-context';

export default function HoldRequestsList() {
  const { user } = useAuth();
  const { formatDate, formatDateTime } = useTimezone();
  const [holdRequests, setHoldRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);

  // Check if user has permission to view hold requests
  const hasPermission = user && ['team_leader', 'teamleader', 'director', 'shop_tl', 'shoptl'].includes(user.role.toLowerCase());

  const loadHoldRequests = async () => {
    // Don't attempt to load if user doesn't have permission
    if (!hasPermission) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const response = await apiClient.get('/task-holds/pending');
      const data = response?.holdRequests || response?.data || response || [];
      setHoldRequests(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Failed to load hold requests:', err);
      setError(err?.message || 'Failed to load hold requests');
      setHoldRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHoldRequests();
  }, [hasPermission]);

  const handleReviewClick = (request: any) => {
    setSelectedRequest(request);
    setReviewModalOpen(true);
  };

  const handleQuickAction = async (request: any, decision: 'approve' | 'reject', action?: string) => {
    setProcessingId(request.holdRequestId);
    setError(null);

    try {
      const payload: any = {
        decision,
        reviewComments: decision === 'approve' ? 'Quick approval' : 'Quick rejection'
      };

      if (decision === 'approve' && action) {
        payload.action = action;
      }

      await apiClient.post(`/task-holds/${request.holdRequestId}/review`, payload);
      
      // Refresh the list
      await loadHoldRequests();
      
      // Dispatch refresh event for other components
      try {
        window.dispatchEvent(new CustomEvent('tasks:refresh'));
        window.dispatchEvent(new CustomEvent('hold-requests:refresh'));
      } catch {}
    } catch (err: any) {
      console.error('Failed to process hold request:', err);
      setError(err?.message || 'Failed to process hold request');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReviewSuccess = () => {
    setReviewModalOpen(false);
    setSelectedRequest(null);
    loadHoldRequests();
    
    // Dispatch refresh event for other components
    try {
      window.dispatchEvent(new CustomEvent('tasks:refresh'));
      window.dispatchEvent(new CustomEvent('hold-requests:refresh'));
    } catch {}
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pendingapproval':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
            <Clock className="h-3 w-3 mr-1" />
            Pending Review
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {status}
          </span>
        );
    }
  };

  // Show permission denied message if user doesn't have access
  if (!hasPermission) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-amber-200 p-6">
        <div className="flex items-start">
          <ShieldAlert className="h-5 w-5 text-amber-600 mr-3 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-amber-800">Access Restricted</h3>
            <p className="text-sm text-amber-700 mt-1">
              Only Team Leaders, Directors, and Shop Team Leaders can view pending hold requests.
            </p>
            <p className="text-xs text-amber-600 mt-2">
              Your current role: <span className="font-semibold">{user?.roleDisplayName || 'Unknown'}</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading hold requests...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6">
        <div className="flex items-start">
          <AlertCircle className="h-5 w-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-red-800">Error Loading Hold Requests</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
            <button
              onClick={loadHoldRequests}
              className="mt-3 text-sm text-red-600 hover:text-red-800 underline"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (holdRequests.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <div className="text-center">
          <Clock className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No Pending Hold Requests</h3>
          <p className="text-sm text-gray-500">
            All hold requests have been reviewed. New requests will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Pending Hold Requests</h2>
            <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
              {holdRequests.length} Pending
            </span>
          </div>
        </div>

        <div className="divide-y divide-gray-200">
          {holdRequests.map((request) => (
            <div
              key={request.holdRequestId}
              className="p-6 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* Task Info */}
                  <div className="flex items-center space-x-3 mb-3">
                    <h3 className="text-base font-semibold text-gray-900">
                      TC-{request.taskId}
                    </h3>
                    {getStatusBadge(request.status)}
                  </div>

                  <p className="text-sm text-gray-700 mb-3 line-clamp-2">
                    {request.taskDescription}
                  </p>

                  {/* Request Details */}
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div className="flex items-center text-sm">
                      <User className="h-4 w-4 text-gray-400 mr-2" />
                      <span className="text-gray-600">Engineer:</span>
                      <span className="ml-2 font-medium text-gray-900">
                        {request.requestedByEngineerName}
                      </span>
                    </div>
                    <div className="flex items-center text-sm">
                      <Calendar className="h-4 w-4 text-gray-400 mr-2" />
                      <span className="text-gray-600">Days Worked:</span>
                      <span className="ml-2 font-bold text-blue-600">
                        {request.daysWorkedByEngineer} days
                      </span>
                    </div>
                  </div>

                  {/* Hold Reason */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
                    <div className="text-xs font-medium text-gray-500 mb-1">Hold Reason:</div>
                    <div className="text-sm text-gray-700">{request.holdReason}</div>
                  </div>

                  {/* Timestamps */}
                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                    <span>
                      Requested: {formatDateTime(request.holdRequestedDate)}
                    </span>
                    {request.assignedDate && (
                      <span>
                        Assigned: {formatDate(request.assignedDate)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="ml-6 flex flex-col gap-2">
                  <button
                    onClick={() => handleQuickAction(request, 'approve', 'transfer_to_tl')}
                    disabled={processingId === request.holdRequestId}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[120px]"
                  >
                    {processingId === request.holdRequestId ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleQuickAction(request, 'reject')}
                    disabled={processingId === request.holdRequestId}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[120px]"
                  >
                    {processingId === request.holdRequestId ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleReviewClick(request)}
                    disabled={processingId === request.holdRequestId}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed min-w-[120px]"
                  >
                    Review Details
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Review Modal */}
      <HoldRequestReviewModal
        isOpen={reviewModalOpen}
        onClose={() => {
          setReviewModalOpen(false);
          setSelectedRequest(null);
        }}
        holdRequest={selectedRequest}
        onSuccess={handleReviewSuccess}
      />
    </>
  );
}