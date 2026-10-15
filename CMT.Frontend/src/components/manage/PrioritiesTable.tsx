'use client';

import React, { useEffect, useState } from 'react';
import apiClient from '@/lib/api';
import { Button } from '@/components/ui/button';

interface Props {
  onEdit?: (priority: any) => void;
}

export default function PrioritiesTable({ onEdit }: Props) {
  const [priorities, setPriorities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadPriorities = async () => {
    setLoading(true);
    setError(null);
    try {
      const anyClient = apiClient as any;
      const res = typeof anyClient.getPriorities === 'function'
        ? await anyClient.getPriorities()
        : await apiClient.get('/reference-data/priorities');

      const list = Array.isArray(res) ? res : (res?.data ?? res?.priorities ?? []);
      setPriorities(list);
    } catch (err: any) {
      console.error('Failed to load priorities', err);
      setError(err?.message || 'Failed to load priorities.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPriorities();
  }, []);

  const filtered = priorities.filter((p) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (p.level_name ?? p.name ?? '').toString().toLowerCase().includes(s) || (String(p.order_rank ?? '')).includes(s);
  });

  const handleDelete = async (priority: any) => {
    if (!confirm(`Delete priority "${priority.level_name ?? priority.name}"?`)) return;
    try {
      await apiClient.delete(`/reference-data/priorities/${priority.priority_id ?? priority.id}`);
      setPriorities((prev) => prev.filter((p) => (p.priority_id ?? p.id) !== (priority.priority_id ?? priority.id)));
    } catch (err: any) {
      alert(err?.message || 'Failed to delete priority');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center gap-3 mb-4">
        <input
          className="border rounded px-3 py-2 w-64"
          placeholder="Search priorities..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search priorities"
        />
        <div className="ml-auto text-sm text-gray-500">{loading ? 'Loading...' : `${filtered.length} priorities`}</div>
      </div>

      {error && <div className="text-red-600 mb-2">{error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full table-auto border-collapse">
          <thead>
            <tr className="text-left text-sm text-gray-600 border-b">
              <th className="py-2 px-3">#</th>
              <th className="py-2 px-3">Priority</th>
              <th className="py-2 px-3">Order</th>
              <th className="py-2 px-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-gray-500">No priorities found.</td>
              </tr>
            )}

            {filtered.map((p, idx) => (
              <tr key={p.priority_id ?? p.id ?? idx} className="border-b hover:bg-gray-50">
                <td className="py-2 px-3 text-sm">{idx + 1}</td>
                <td className="py-2 px-3">{p.level_name ?? p.name ?? '-'}</td>
                <td className="py-2 px-3">{p.order_rank ?? p.order ?? '-'}</td>
                <td className="py-2 px-3 space-x-2">
                  <Button size="sm" variant="ghost" onClick={() => onEdit?.(p)}>Edit</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(p)}>Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}