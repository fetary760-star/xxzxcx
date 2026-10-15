'use client';

import React, { useEffect, useState } from 'react';
import apiClient from '@/lib/api';
import { Button } from '@/components/ui/button';

interface Props {
  onEdit?: (subType: any) => void;
}

export default function SubTypesTable({ onEdit }: Props) {
  const [subTypes, setSubTypes] = useState<any[]>([]);
  const [categoriesMap, setCategoriesMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // sub-types
      const res = await (apiClient as any).get('/reference-data/sub-types').catch(() => null);
      const list = Array.isArray(res) ? res : (res?.data ?? res?.subTypes ?? []);
      setSubTypes(list || []);

      // categories for name lookup
      const catsRes = await (apiClient as any).get('/reference-data/categories').catch(() => null);
      const cats = Array.isArray(catsRes) ? catsRes : (catsRes?.data ?? catsRes?.categories ?? []);
      const map: Record<string, any> = {};
      (cats || []).forEach((c: any) => {
        map[String(c.category_id ?? c.id)] = c;
      });
      setCategoriesMap(map);
    } catch (err: any) {
      console.error('Failed to load sub-types', err);
      setError(err?.message || 'Failed to load sub-types.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = subTypes.filter((s) => {
    if (!search) return true;
    const sterm = search.toLowerCase();
    const catName = categoriesMap[String(s.category_id)]?.name ?? '';
    return (
      (s.name ?? '').toString().toLowerCase().includes(sterm) ||
      String(s.sub_type_id ?? s.id ?? '').toLowerCase().includes(sterm) ||
      catName.toLowerCase().includes(sterm)
    );
  });

  const handleDelete = async (st: any) => {
    if (!confirm(`Delete sub-type "${st.name}"?`)) return;
    try {
      await apiClient.delete(`/reference-data/sub-types/${st.sub_type_id ?? st.id}`);
      setSubTypes((prev) => prev.filter((p) => (p.sub_type_id ?? p.id) !== (st.sub_type_id ?? st.id)));
    } catch (err: any) {
      alert(err?.message || 'Failed to delete sub-type');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center gap-3 mb-4">
        <input
          className="border rounded px-3 py-2 w-64"
          placeholder="Search sub-types..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search sub-types"
        />
        <div className="ml-auto text-sm text-gray-500">{loading ? 'Loading...' : `${filtered.length} sub-types`}</div>
      </div>

      {error && <div className="text-red-600 mb-2">{error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full table-auto border-collapse">
          <thead>
            <tr className="text-left text-sm text-gray-600 border-b">
              <th className="py-2 px-3">#</th>
              <th className="py-2 px-3">Name</th>
              <th className="py-2 px-3">Category</th>
              <th className="py-2 px-3">Part Data</th>
              <th className="py-2 px-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-gray-500">No sub-types found.</td>
              </tr>
            )}

            {filtered.map((s, idx) => (
              <tr key={s.sub_type_id ?? s.id ?? idx} className="border-b hover:bg-gray-50">
                <td className="py-2 px-3 text-sm">{idx + 1}</td>
                <td className="py-2 px-3">{s.name ?? '-'}</td>
                <td className="py-2 px-3">{categoriesMap[String(s.category_id)]?.name ?? '-'}</td>
                <td className="py-2 px-3 text-sm text-gray-600">{s.part_data ?? '-'}</td>
                <td className="py-2 px-3 space-x-2">
                  <Button size="sm" variant="ghost" onClick={() => onEdit?.(s)}>Edit</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(s)}>Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}