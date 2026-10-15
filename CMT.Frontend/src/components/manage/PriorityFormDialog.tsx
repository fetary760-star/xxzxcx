'use client';

import React, { useEffect, useState } from 'react';
import apiClient from '@/lib/api';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  priorityToEdit?: any | null;
  onSaved?: () => void;
}

export default function PriorityFormDialog({ open, onOpenChange, priorityToEdit, onSaved }: Props) {
  const [form, setForm] = useState({
    level_name: '',
    order_rank: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (priorityToEdit) {
      setForm({
        level_name: priorityToEdit.level_name ?? priorityToEdit.name ?? '',
        order_rank: Number(priorityToEdit.order_rank ?? priorityToEdit.order ?? 0),
      });
    } else {
      setForm({ level_name: '', order_rank: 0 });
    }
  }, [priorityToEdit, open]);

  if (!open) return null;

  const handleChange = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);

    if (!form.level_name.trim()) {
      setError('Priority name is required');
      return;
    }

    setLoading(true);
    try {
      if (priorityToEdit) {
        await apiClient.put(`/reference-data/priorities/${priorityToEdit.priority_id ?? priorityToEdit.id}`, {
          level_name: form.level_name,
          order_rank: Number(form.order_rank),
        });
      } else {
        await apiClient.post('/reference-data/priorities', {
          level_name: form.level_name,
          order_rank: Number(form.order_rank),
        });
      }

      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error('save priority failed', err);
      setError(err?.message || 'Failed to save priority');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div className="bg-white rounded shadow-lg w-full max-w-md relative z-10">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-medium">{priorityToEdit ? 'Edit Priority' : 'Create Priority'}</h3>
          <button className="text-gray-600" onClick={() => onOpenChange(false)}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && <div className="text-red-600">{error}</div>}

          <label className="block">
            <div className="text-sm text-gray-600">Priority Name *</div>
            <input value={form.level_name} onChange={(e) => handleChange('level_name', e.target.value)} className="w-full border rounded px-3 py-2" />
          </label>

          <label className="block">
            <div className="text-sm text-gray-600">Order (lower = higher priority)</div>
            <input type="number" value={form.order_rank} onChange={(e) => handleChange('order_rank', Number(e.target.value))} className="w-full border rounded px-3 py-2" />
          </label>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}