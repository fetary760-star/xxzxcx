'use client';

import React, { useEffect, useState } from 'react';
import apiClient from '@/lib/api';
import { Button } from '@/components/ui/button';

interface Props {
  onEdit?: (category: any) => void;
}

export default function CategoriesTable({ onEdit }: Props) {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getCategories();
      // Normalize response: accept array or { data: [] }
      const list = Array.isArray(res) ? res : (res?.data ?? res?.categories ?? []);
      setCategories(list);
    } catch (err: any) {
      console.error('Failed to load categories', err);
      setError(err?.message || 'Failed to load categories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const filtered = categories.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.name ?? '').toString().toLowerCase().includes(s) || (c.description ?? '').toString().toLowerCase().includes(s);
  });

  const handleDelete = async (category: any) => {
    if (!confirm(`Delete category "${category.name}"? This will remove related sub-types if your backend enforces cascade.`)) return;
    try {
      await apiClient.delete(`/reference-data/categories/${category.category_id ?? category.id}`);
      setCategories((prev) => prev.filter((p) => (p.category_id ?? p.id) !== (category.category_id ?? category.id)));
    } catch (err: any) {
      alert(err?.message || 'Failed to delete category');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center gap-3 mb-4">
        <input
          className="border rounded px-3 py-2 w-64"
          placeholder="Search categories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="ml-auto text-sm text-gray-500">{loading ? 'Loading...' : `${filtered.length} categories`}</div>
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
                <td colSpan={4} className="p-6 text-center text-gray-500">No categories found.</td>
              </tr>
            )}

            {filtered.map((c, idx) => (
              <tr key={c.category_id ?? c.id ?? idx} className="border-b hover:bg-gray-50">
                <td className="py-2 px-3 text-sm">{idx + 1}</td>
                <td className="py-2 px-3">{c.name ?? '-'}</td>
                <td className="py-2 px-3">{c.description ?? '-'}</td>
                <td className="py-2 px-3 space-x-2">
                  <Button size="sm" variant="ghost" onClick={() => onEdit?.(c)}>Edit</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(c)}>Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}