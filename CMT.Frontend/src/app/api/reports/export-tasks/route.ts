import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/server/db';

const ALLOWED_ROLES = new Set(['team_leader', 'teamleader', 'director']);

export async function GET(req: NextRequest) {
  // Skip auth for now since we don't have proper next-auth setup
  // In production, implement proper authentication

  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'All';

  try {
    let sql = `
      SELECT t.task_id, t.serial_number, t.part_number, t.po_number, t.status,
             t.description, t.assigned_engineer, t.priority_id, t.estimated_completion_date, t.target_completion_date,
             t.created_by, t.created_at, s.name AS shop_name
      FROM tasks t
      LEFT JOIN shops s ON t.shop_id = s.shop_id
    `;
    const params: any = {};
    if (status && status !== 'All') {
      sql += ' WHERE t.status = @status';
      params.status = status;
    }
    sql += ' ORDER BY t.created_at DESC';

    const rows = await query(sql, params);

    const headers = ['Task ID', 'Serial Number', 'Part Number', 'PO Number', 'Status', 'Description', 'Assigned Engineer', 'Priority', 'Estimated Completion', 'Target Completion', 'Created By', 'Created At', 'Variance', 'Shop'];
    const csv = [headers.join(',')]
      .concat(rows.map((r: any) => {
        // Calculate Variance: difference in days between Created At and Target Completion
        let variance = '';
        if (r.created_at && r.target_completion_date) {
          try {
            const created = new Date(r.created_at);
            const target = new Date(r.target_completion_date);
            if (!isNaN(created.getTime()) && !isNaN(target.getTime())) {
              const diffMs = target.getTime() - created.getTime();
              const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
              variance = `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
            }
          } catch {
            variance = '';
          }
        }
        return [
          r.task_id,
          `"${String(r.serial_number ?? '').replace(/"/g, '""')}"`,
          `"${String(r.part_number ?? '').replace(/"/g, '""')}"`,
          `"${String(r.po_number ?? '').replace(/"/g, '""')}"`,
          `"${String(r.status ?? '').replace(/"/g, '""')}"`,
          `"${String(r.description ?? '').replace(/"/g, '""')}"`,
          `"${String(r.assigned_engineer ?? '').replace(/"/g, '""')}"`,
          r.priority_id ?? '',
          r.estimated_completion_date ?? '',
          r.target_completion_date ?? '',
          r.created_by ?? '',
          r.created_at ?? '',
          `"${variance}"`,
          `"${String(r.shop_name ?? '').replace(/"/g, '""')}"`,
        ].join(',');
      }))
      .join('\n');

    const filename = `tasks_export_${status.toLowerCase() === 'all' ? 'all' : status}_${new Date().toISOString().slice(0,10)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('Export tasks failed', err);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}