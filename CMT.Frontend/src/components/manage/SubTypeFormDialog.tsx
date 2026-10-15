'use client';

import React, { useEffect, useState } from 'react';
import apiClient from '@/lib/api';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subTypeToEdit?: any | null;
  onSaved?: () => void;
}

export default function SubTypeFormDialog({ open, onOpenChange, subTypeToEdit, onSaved }: Props) {
  const [form, setForm] = useState({
    name: '',
    category_id: '',
    part_data: '',
  });
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // load categories when dialog opens
    let mounted = true;
    (async () => {
      try {
        const res = await (apiClient as any).get('/reference-data/categories').catch(() => null);
        const list = Array.isArray(res) ? res : (res?.data ?? res?.categories ?? []);
        if (mounted) setCategories(list || []);
      } catch (err) {
        console.warn('Failed to load categories', err);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (subTypeToEdit) {
      setForm({
        name: subTypeToEdit.name ?? '',
        category_id: String(subTypeToEdit.category_id ?? subTypeToEdit.categoryId ?? ''),
        part_data: subTypeToEdit.part_data ?? subTypeToEdit.partData ?? '',
      });
    } else {
      setForm({ name: '', category_id: '', part_data: '' });
    }
  }, [subTypeToEdit, open]);

  if (!open) return null;

  const handleChange = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);

    if (!form.name.trim() || !form.category_id) {
      setError('Name and Category are required');
      return;
    }

    setLoading(true);
    try {
      if (subTypeToEdit) {
        await apiClient.put(`/reference-data/sub-types/${subTypeToEdit.sub_type_id ?? subTypeToEdit.id}`, {
          name: form.name,
          category_id: Number(form.category_id),
          part_data: form.part_data || undefined,
        });
      } else {
        await apiClient.post('/reference-data/sub-types', {
          name: form.name,
          category_id: Number(form.category_id),
          part_data: form.part_data || undefined,
        });
      }

      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error('save sub-type failed', err);
      setError(err?.message || 'Failed to save sub-type');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div className="bg-white rounded shadow-lg w-full max-w-lg relative z-10">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-medium">{subTypeToEdit ? 'Edit Sub Type' : 'Create Sub Type'}</h3>
          <button className="text-gray-600" onClick={() => onOpenChange(false)}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && <div className="text-red-600">{error}</div>}

          <label className="block">
            <div className="text-sm text-gray-600">Name *</div>
            <input value={form.name} onChange={(e) => handleChange('name', e.target.value)} className="w-full border rounded px-3 py-2" />
          </label>

          <label className="block">
            <div className="text-sm text-gray-600">Category *</div>
            <select value={form.category_id} onChange={(e) => handleChange('category_id', e.target.value)} className="w-full border rounded px-3 py-2">
              <option value="">Select category</option>
              {categories.map((c: any) => (
                <option key={String(c.category_id ?? c.id)} value={String(c.category_id ?? c.id)}>
                  {c.name ?? c.displayName}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="text-sm text-gray-600">Part Data (optional JSON string)</div>
            <textarea value={form.part_data} onChange={(e) => handleChange('part_data', e.target.value)} className="w-full border rounded px-3 py-2" rows={3} />
            <div className="text-xs text-gray-500 mt-1">Optional: store related part_data JSON or notes.</div>
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