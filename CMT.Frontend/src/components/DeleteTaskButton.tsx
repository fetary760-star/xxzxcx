import React, { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRolePermissions } from '@/hooks/useRolePermissions';

type Props = {
  taskId: number | string;
  onDeleted?: () => void;
};

export default function DeleteTaskButton({ taskId, onDeleted }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const { canDeleteTask } = useRolePermissions();

  // Use the admin-configured role permissions matrix instead of hardcoded role checks.
  // Admin and Director always have full permissions (bypassed in the hook).
  // Other roles are controlled by the RolePermissionsManager matrix.
  if (!canDeleteTask) return null;

  async function confirmAndDelete() {
    if (!confirm(`Are you sure you want to delete task TC-${taskId}? This cannot be undone.`)) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/tasks/${taskId}/delete`, { method: 'DELETE' });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Delete failed');
      onDeleted?.();
      alert('Task deleted successfully');
    } catch (err: any) {
      alert(err?.message || 'Failed to delete task');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button className="btn btn-danger" onClick={confirmAndDelete} disabled={loading}>
      {loading ? 'Deleting...' : <><i className="fas fa-trash-alt me-1" /> Delete Task</>}
    </button>
  );
}