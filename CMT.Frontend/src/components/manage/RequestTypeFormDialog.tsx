'use client';

import React, { useEffect, useState } from 'react';
import apiClient from '@/lib/api';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestTypeToEdit?: any | null;
  onSaved?: () => void;
}

export default function RequestTypeFormDialog({ open, onOpenChange, requestTypeToEdit, onSaved }: Props) {
  const [form, setForm] = useState({
    name: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (requestTypeToEdit) {
      setForm({
        name: requestTypeToEdit.name ?? requestTypeToEdit.displayName ?? '',
        description: requestTypeToEdit.description ?? '',
      });
    } else {
      setForm({ name: '', description: '' });
    }
  }, [requestTypeToEdit, open]);

  if (!open) return null;

  const handleChange = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }

    setSaving(true);
    try {
      if (requestTypeToEdit) {
        await apiClient.put(`/reference-data/request-types/${requestTypeToEdit.request_type_id ?? requestTypeToEdit.id}`, {
          name: form.name,
          description: form.description || undefined,
        });
      } else {
        await apiClient.post('/reference-data/request-types', {
          name: form.name,
          description: form.description || undefined,
        });
      }

      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error('save request type failed', err);
      setError(err?.message || 'Failed to save request type');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div className="bg-white rounded shadow-lg w-full max-w-lg relative z-10">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-medium">{requestTypeToEdit ? 'Edit Request Type' : 'Create Request Type'}</h3>
          <button className="text-gray-600" onClick={() => onOpenChange(false)}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && <div className="text-red-600">{error}</div>}

          <label className="block">
            <div className="text-sm text-gray-600">Name *</div>
            <input value={form.name} onChange={(e) => handleChange('name', e.target.value)} className="w-full border rounded px-3 py-2" />
          </label>

          <label className="block">
            <div className="text-sm text-gray-600">Description</div>
            <textarea value={form.description} onChange={(e) => handleChange('description', e.target.value)} className="w-full border rounded px-3 py-2" rows={4} />
          </label>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}