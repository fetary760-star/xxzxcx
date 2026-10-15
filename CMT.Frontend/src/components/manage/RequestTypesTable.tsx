'use client';

import React, { useEffect, useState } from 'react';
import apiClient from '@/lib/api';
import { Button } from '@/components/ui/button';

interface Props {
  onEdit?: (requestType: any) => void;
}

export default function RequestTypesTable({ onEdit }: Props) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadRequestTypes = async () => {
    setLoading(true);
    setError(null);
    try {
      const anyClient = apiClient as any;
      const res = typeof anyClient.getRequestTypes === 'function'
        ? await anyClient.getRequestTypes()
        : await apiClient.get('/reference-data/request-types');

      const list = Array.isArray(res) ? res : (res?.data ?? res?.requestTypes ?? res?.items ?? []);
      setItems(list);
    } catch (err: any) {
      console.error('Failed to load request types', err);
      setError(err?.message || 'Failed to load request types.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequestTypes();
  }, []);

  const filtered = items.filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (r.name ?? r.displayName ?? '').toString().toLowerCase().includes(s) ||
           (r.request_type_id ?? r.id ?? '').toString().toLowerCase().includes(s);
  });

  const handleDelete = async (rt: any) => {
    if (!confirm(`Delete request type "${rt.name ?? rt.displayName}"? This action cannot be undone.`)) return;
    try {
      await apiClient.delete(`/reference-data/request-types/${rt.request_type_id ?? rt.id}`);
      setItems((prev) => prev.filter((p) => (p.request_type_id ?? p.id) !== (rt.request_type_id ?? rt.id)));
    } catch (err: any) {
      alert(err?.message || 'Failed to delete request type');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center gap-3 mb-4">
        <input
          className="border rounded px-3 py-2 w-64"
          placeholder="Search request types..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search request types"
        />
        <div className="ml-auto text-sm text-gray-500">{loading ? 'Loading...' : `${filtered.length} items`}</div>
      </div>

      {error && <div className="text-red-600 mb-2">{error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full table-auto border-collapse">
          <thead>
            <tr className="text-left text-sm text-gray-600 border-b">
              <th className="py-2 px-3">#</th>
              <th className="py-2 px-3">Name</th>
              <th className="py-2 px-3">Description</th>
              <th className="py-2 px-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-gray-500">No request types found.</td>
              </tr>
            )}

            {filtered.map((r, idx) => (
              <tr key={r.request_type_id ?? r.id ?? idx} className="border-b hover:bg-gray-50">
                <td className="py-2 px-3 text-sm">{idx + 1}</td>
                <td className="py-2 px-3">{r.name ?? r.displayName ?? '-'}</td>
                <td className="py-2 px-3">{r.description ?? '-'}</td>
                <td className="py-2 px-3 space-x-2">
                  <Button size="sm" variant="ghost" onClick={() => onEdit?.(r)}>Edit</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(r)}>Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}