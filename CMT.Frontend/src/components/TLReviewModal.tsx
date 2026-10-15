import React, { useState } from 'react';
import { useSession } from 'next-auth/react';

type Props = {
  taskId: number | string;
  onSuccess?: () => void;
  onClose?: () => void;
};

export default function TLReviewModal({ taskId, onSuccess, onClose }: Props) {
  const { data: session } = useSession();
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Client-level guard; server enforces rules strictly.
  if (session?.user?.role !== 'team_leader') return null;

  async function doAction(action: 'forward' | 'reject') {
    setError(null);
    setLoading(true);
    try {
      const resp = await fetch(`/api/tasks/${taskId}/tl-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_type: action, tl_comment: comment }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Action failed');
      onSuccess?.();
      onClose?.();
    } catch (err: any) {
      setError(err?.message || 'Failed to perform action');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header bg-success text-white">
            <h5 className="modal-title">Review Amendment Request - TC-{taskId}</h5>
            <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            <label className="form-label">Your Comments (optional)</label>
            <textarea className="form-control" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} />
            {error && <div className="text-danger mt-2">{error}</div>}
            <p className="text-muted mt-2">Forwarding sends this request to the Director. Rejecting closes the amendment request.</p>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-danger" onClick={() => doAction('reject')} disabled={loading}>Reject</button>
            <button type="button" className="btn btn-primary" onClick={() => doAction('forward')} disabled={loading}>Forward to Director</button>
          </div>
        </div>
      </div>
    </div>
  );
}