'use client';

import React, { useEffect, useState } from 'react';
import apiClient from '@/lib/api';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetDayToEdit?: any | null;
  onSaved?: () => void;
}

export default function TargetDayFormDialog({ open, onOpenChange, targetDayToEdit, onSaved }: Props) {
  const [form, setForm] = useState({
    category_id: '',
    target_days: 0,
    target_hours: 0,
    target_minutes: 0,
  });
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const catsRes = await (apiClient as any).getCategories?.() ?? await apiClient.get('/reference-data/categories');
        const cats = Array.isArray(catsRes) ? catsRes : catsRes?.data ?? catsRes?.categories ?? [];
        if (!mounted) return;
        setCategories(cats);
      } catch (err) {
        console.warn('Failed to load categories for target-day form', err);
        setCategories([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (targetDayToEdit) {
      setForm({
        category_id: String(targetDayToEdit.category_id ?? targetDayToEdit.categoryId ?? targetDayToEdit.id ?? ''),
        target_days: Number(targetDayToEdit.target_days ?? targetDayToEdit.targetDays ?? 0),
        target_hours: Number(targetDayToEdit.target_hours ?? targetDayToEdit.targetHours ?? 0),
        target_minutes: Number(targetDayToEdit.target_minutes ?? targetDayToEdit.targetMinutes ?? 0),
      });
    } else {
      setForm({ category_id: '', target_days: 0, target_hours: 0, target_minutes: 0 });
    }
  }, [targetDayToEdit, open]);

  if (!open) return null;

  const handleChange = (key: string, value: any) => {
    setForm((s) => ({ ...s, [key]: value }));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);

    if (!form.category_id) {
      setError('Please select a category.');
      return;
    }

    const days = Number(form.target_days);
    const hours = Number(form.target_hours);
    const minutes = Number(form.target_minutes);

    if (days < 0 || hours < 0 || minutes < 0) {
      setError('Values cannot be negative.');
      return;
    }
    if (hours > 23) {
      setError('Hours must be between 0 and 23.');
      return;
    }
    if (minutes > 59) {
      setError('Minutes must be between 0 and 59.');
      return;
    }
    if (days === 0 && hours === 0 && minutes === 0) {
      setError('At least one of Days, Hours, or Minutes must be greater than 0.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        category_id: Number(form.category_id),
        target_days: days,
        target_hours: hours,
        target_minutes: minutes,
        // PascalCase variants for backend compatibility
        CategoryId: Number(form.category_id),
        TargetDays: days,
        TargetHours: hours,
        TargetMinutes: minutes,
      };

      if (targetDayToEdit) {
        const id = targetDayToEdit.id ?? targetDayToEdit.category_target_days_id ?? targetDayToEdit.category_id;
        await apiClient.put(`/reference-data/category-target-days/${id}`, payload);
      } else {
        await apiClient.post('/reference-data/category-target-days', payload);
      }

      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error('save target day failed', err);
      setError(err?.message || 'Failed to save target days');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div className="bg-white rounded shadow-lg w-full max-w-lg relative z-10">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-medium">{targetDayToEdit ? 'Edit Target Duration' : 'Create Target Duration'}</h3>
          <button className="text-gray-600" onClick={() => onOpenChange(false)}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && <div className="text-red-600">{error}</div>}

          <label className="block">
            <div className="text-sm text-gray-600">Category *</div>
            <select value={form.category_id} onChange={(e) => handleChange('category_id', e.target.value)} className="w-full border rounded px-3 py-2">
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={String(c.category_id ?? c.id)} value={String(c.category_id ?? c.id)}>
                  {c.name ?? c.displayName ?? `Category ${c.category_id ?? c.id}`}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <div className="text-sm text-gray-600">Days</div>
              <input
                type="number"
                min={0}
                value={String(form.target_days)}
                onChange={(e) => handleChange('target_days', Number(e.target.value))}
                className="w-full border rounded px-3 py-2"
                placeholder="0"
              />
            </label>

            <label className="block">
              <div className="text-sm text-gray-600">Hours (0-23)</div>
              <input
                type="number"
                min={0}
                max={23}
                value={String(form.target_hours)}
                onChange={(e) => handleChange('target_hours', Number(e.target.value))}
                className="w-full border rounded px-3 py-2"
                placeholder="0"
              />
            </label>

            <label className="block">
              <div className="text-sm text-gray-600">Minutes (0-59)</div>
              <input
                type="number"
                min={0}
                max={59}
                value={String(form.target_minutes)}
                onChange={(e) => handleChange('target_minutes', Number(e.target.value))}
                className="w-full border rounded px-3 py-2"
                placeholder="0"
              />
            </label>
          </div>

          <div className="text-xs text-gray-500">
            At least one of Days, Hours, or Minutes must be greater than 0. 
            Example: "0 days, 4 hours, 30 minutes" means engineers must be assigned within 4.5 hours.
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
