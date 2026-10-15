'use client';

import React, { useState } from 'react';
import { X, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import apiClient from '@/lib/api';
import { useTimezone } from '@/lib/timezone-context';

interface HoldRequestReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  holdRequest: any;
  onSuccess?: () => void;
}

export default function HoldRequestReviewModal({
  isOpen,
  onClose,
  holdRequest,
  onSuccess
}: HoldRequestReviewModalProps) {
  const [decision, setDecision] = useState<'approve' | 'reject' | ''>('');
  const [action, setAction] = useState<'transfer_to_tl' | 'return_to_initiator' | 'maintain_status' | ''>('');
  const [reviewComments, setReviewComments] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { formatDate, formatDateTime } = useTimezone();

  if (!isOpen || !holdRequest) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!decision) {
      setError('Please select a decision (Approve or Reject)');
      return;
    }

    if (decision === 'approve' && !action) {
      setError('Please select an action when approving');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload: any = {
        decision,
        reviewComments: reviewComments || undefined
      };

      if (decision === 'approve') {
        payload.action = action;
      }

      await apiClient.post(`/task-holds/${holdRequest.holdRequestId}/review`, payload);

      if (onSuccess) {
        onSuccess();
      }
      
      onClose();
    } catch (err: any) {
      console.error('Failed to review hold request:', err);
      setError(err?.message || 'Failed to submit review');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Review Hold Request</h2>
            <p className="text-sm text-gray-500 mt-1">
              Task TC-{holdRequest.taskId} • Requested by {holdRequest.requestedByEngineerName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Hold Request Details */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">Hold Request Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-blue-700">Task:</span>
                <span className="font-medium text-blue-900">{holdRequest.taskDescription}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700">Serial Number:</span>
                <span className="font-medium text-blue-900">{holdRequest.serialNumber || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700">Days Worked by Engineer:</span>
                <span className="font-bold text-blue-900">{holdRequest.daysWorkedByEngineer} days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700">Assigned Date:</span>
                <span className="font-medium text-blue-900">
                  {holdRequest.assignedDate ? formatDate(holdRequest.assignedDate) : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700">Hold Requested:</span>
                <span className="font-medium text-blue-900">
                  {formatDateTime(holdRequest.holdRequestedDate)}
                </span>
              </div>
            </div>
          </div>

          {/* Hold Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Hold Reason
            </label>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700">
              {holdRequest.holdReason}
            </div>
          </div>

          {/* Decision */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Decision <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setDecision('approve');
                  setError(null);
                }}
                className={`p-4 border-2 rounded-lg transition-all ${
                  decision === 'approve'
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 hover:border-green-300'
                }`}
              >
                <CheckCircle className={`h-6 w-6 mx-auto mb-2 ${
                  decision === 'approve' ? 'text-green-600' : 'text-gray-400'
                }`} />
                <div className="font-semibold text-center">Approve</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDecision('reject');
                  setAction('');
                  setError(null);
                }}
                className={`p-4 border-2 rounded-lg transition-all ${
                  decision === 'reject'
                    ? 'border-red-500 bg-red-50'
                    : 'border-gray-200 hover:border-red-300'
                }`}
              >
                <XCircle className={`h-6 w-6 mx-auto mb-2 ${
                  decision === 'reject' ? 'text-red-600' : 'text-gray-400'
                }`} />
                <div className="font-semibold text-center">Reject</div>
              </button>
            </div>
          </div>

          {/* Action (only shown when approved) */}
          {decision === 'approve' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Action <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                <label className="flex items-start p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="action"
                    value="transfer_to_tl"
                    checked={action === 'transfer_to_tl'}
                    onChange={(e) => {
                      setAction(e.target.value as any);
                      setError(null);
                    }}
                    className="mt-1 mr-3"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">Transfer to Team Lead</div>
                    <div className="text-sm text-gray-600 mt-1">
                      Transfer {holdRequest.daysWorkedByEngineer} days to your account. Task will be assigned to you.
                    </div>
                  </div>
                </label>

                <label className="flex items-start p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="action"
                    value="return_to_initiator"
                    checked={action === 'return_to_initiator'}
                    onChange={(e) => {
                      setAction(e.target.value as any);
                      setError(null);
                    }}
                    className="mt-1 mr-3"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">Return to Initiator</div>
                    <div className="text-sm text-gray-600 mt-1">
                      Return task to initiator for reprocessing. Status will change to Pending.
                    </div>
                  </div>
                </label>

                <label className="flex items-start p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="action"
                    value="maintain_status"
                    checked={action === 'maintain_status'}
                    onChange={(e) => {
                      setAction(e.target.value as any);
                      setError(null);
                    }}
                    className="mt-1 mr-3"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">Maintain Status</div>
                    <div className="text-sm text-gray-600 mt-1">
                      Keep task on hold with current assignment. No date transfer.
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Review Comments */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Review Comments {decision === 'reject' && <span className="text-gray-500">(Optional)</span>}
            </label>
            <textarea
              value={reviewComments}
              onChange={(e) => setReviewComments(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={4}
              placeholder="Add any comments about your decision..."
            />
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start">
              <AlertTriangle className="h-5 w-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !decision || (decision === 'approve' && !action)}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Submitting...
                </>
              ) : (
                'Submit Review'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}