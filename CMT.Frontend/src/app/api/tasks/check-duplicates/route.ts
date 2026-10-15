import { NextResponse } from 'next/server';
import { query } from '@/lib/server/db';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const serialNumber = (body?.serial_number || body?.serialNumber || '').toString().trim();
  const partNumber = (body?.part_number || body?.partNumber || '').toString().trim();
  const poNumber = (body?.po_number || body?.poNumber || '').toString().trim();

  const response = { is_duplicate: false, duplicates: [] as any[] };

  if (!serialNumber && !partNumber && !poNumber) {
    return NextResponse.json(response);
  }

  try {
    const sql = `
      SELECT
        task_id,
        serial_number,
        part_number,
        po_number,
        status,
        description,
        comments,
        assigned_engineer,
        created_at
      FROM tasks
      WHERE (serial_number = @serial OR part_number = @part OR po_number = @po)
        AND status != 'Completed'
      ORDER BY created_at DESC
    `;
    const rows: any[] = await query(sql, { serial: serialNumber, part: partNumber, po: poNumber });
    if (rows.length > 0) {
      response.is_duplicate = true;
      response.duplicates = rows.map((task) => ({
        task_id: task.task_id,
        serial_number: task.serial_number,
        part_number: task.part_number,
        po_number: task.po_number,
        status: task.status,
        description: (task.description ? String(task.description).replace(/<[^>]*>/g, '') : '').slice(0, 500),
        comments: (task.comments ? String(task.comments).replace(/<[^>]*>/g, '') : '').slice(0, 500),
        assigned_engineer: task.assigned_engineer,
        created_at: task.created_at,
      }));
    }
    return NextResponse.json(response);
  } catch (err) {
    console.error('Error checking duplicates', err);
    return NextResponse.json(response);
  }
}