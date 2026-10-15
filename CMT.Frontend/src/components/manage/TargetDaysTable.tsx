'use client';

import React, { useEffect, useState } from 'react';
import apiClient from '@/lib/api';
import { Button } from '@/components/ui/button';

interface Props {
  onEdit?: (entry: any) => void;
}

/** Format duration as human-readable string */
function formatDuration(entry: any): string {
  const days = Number(entry.target_days ?? entry.targetDays ?? 0);
  const hours = Number(entry.target_hours ?? entry.targetHours ?? 0);
  const minutes = Number(entry.target_minutes ?? entry.targetMinutes ?? 0);

  // If backend provides display_duration, use it
  if (entry.display_duration) return entry.display_duration;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} min${minutes !== 1 ? 's' : ''}`);
  return parts.length > 0 ? parts.join(', ') : '-';
}

export default function TargetDaysTable({ onEdit }: Props) {
  const [entries, setEntries] = useState<any[]>([]);
  const [categoriesMap, setCategoriesMap] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const catsRes = await (apiClient as any).getCategories?.() ?? await apiClient.get('/reference-data/categories');
      const cats = Array.isArray(catsRes) ? catsRes : catsRes?.data ?? catsRes?.categories ?? [];
      const map: Record<number, string> = {};
      cats.forEach((c: any) => {
        const id = Number(c.category_id ?? c.id);
        if (!Number.isNaN(id)) map[id] = c.name ?? c.displayName ?? `Category ${id}`;
      });
      setCategoriesMap(map);

      const res = await (apiClient as any).getCategoryTargetDays?.() ?? await apiClient.get('/reference-data/category-target-days');
      const list = Array.isArray(res) ? res : res?.data ?? res?.items ?? res?.targetDays ?? res?.categoryTargetDays ?? [];
      setEntries(list);
    } catch (err: any) {
      console.error('Failed to load target days', err);
      setError(err?.message || 'Failed to load target days.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = entries.filter((e) => {
    if (!search) return true;
    const s = search.toString().toLowerCase();
    const catName = categoriesMap[Number(e.category_id)] ?? '';
    return (
      (catName && catName.toLowerCase().includes(s)) ||
      formatDuration(e).toLowerCase().includes(s)
    );
  });

  const handleDelete = async (entry: any) => {
    const catName = categoriesMap[Number(entry.category_id)] ?? `#${entry.category_id}`;
    if (!confirm(`Delete target duration for ${catName} (${formatDuration(entry)})?`)) return;
    try {
      const id = entry.id ?? entry.category_target_days_id ?? entry.category_id;
      await apiClient.delete(`/reference-data/category-target-days/${id}`);
      setEntries((prev) => prev.filter((p) => (p.id ?? p.category_target_days_id ?? p.category_id) !== id));
    } catch (err: any) {
      alert(err?.message || 'Failed to delete entry');
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center gap-3 mb-4">
        <input
          className="border rounded px-3 py-2 w-64"
          placeholder="Search by category name or duration..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search target days"
        />
        <div className="ml-auto text-sm text-gray-500">{loading ? 'Loading...' : `${filtered.length} entries`}</div>
      </div>

      {error && <div className="text-red-600 mb-2">{error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full table-auto border-collapse">
          <thead>
            <tr className="text-left text-sm text-gray-600 border-b">
              <th className="py-2 px-3">#</th>
              <th className="py-2 px-3">Category</th>
              <th className="py-2 px-3">Days</th>
              <th className="py-2 px-3">Hours</th>
              <th className="py-2 px-3">Minutes</th>
              <th className="py-2 px-3">Total Duration</th>
              <th className="py-2 px-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-gray-500">No entries found.</td>
              </tr>
            )}

            {filtered.map((e, idx) => {
              const catId = Number(e.category_id ?? e.categoryId ?? e.id);
              const key = String(e.id ?? e.category_target_days_id ?? catId ?? idx);
              const days = Number(e.target_days ?? e.targetDays ?? 0);
              const hours = Number(e.target_hours ?? e.targetHours ?? 0);
              const minutes = Number(e.target_minutes ?? e.targetMinutes ?? 0);

              return (
                <tr key={key} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-3 text-sm">{idx + 1}</td>
                  <td className="py-2 px-3">{categoriesMap[catId] ?? `Category ${catId}`}</td>
                  <td className="py-2 px-3">{days}</td>
                  <td className="py-2 px-3">{hours}</td>
                  <td className="py-2 px-3">{minutes}</td>
                  <td className="py-2 px-3 text-sm text-gray-600">{formatDuration(e)}</td>
                  <td className="py-2 px-3 space-x-2">
                    <Button size="sm" variant="ghost" onClick={() => onEdit?.(e)}>Edit</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(e)}>Delete</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}