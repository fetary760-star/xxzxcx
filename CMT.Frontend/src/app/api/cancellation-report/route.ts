// url=REPLACE_WITH_YOUR_REPO_URL/src/app/api/cancellation-report/route.ts
import { NextResponse } from 'next/server'
import { query } from '@/lib/server/db' // adapt to your DB helper
import { getUserFromRequest } from '@/lib/serverAuth'

function isAllowed(role: string | undefined) {
  if (!role) return false
  return ['team_leader', 'shop_tl', 'director', 'shop_manager'].includes(role)
}

export async function GET(req: Request) {
  //('Cancellation Report API - Starting request')
  
  const user = await getUserFromRequest(req)
  //('Cancellation Report API - User info:', user?.authenticated ? 'authenticated' : 'not authenticated')
  
  if (!user || !isAllowed(user.role)) {
    //('Cancellation Report API - Access denied for role:', user?.role)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const url = new URL(req.url)
  const startDate = url.searchParams.get('start_date') || ''
  const endDate = url.searchParams.get('end_date') || ''

  const params: (string | number)[] = []
  let where = `WHERE t.status = 'Cancelled'`

  if (startDate) {
    where += ` AND DATE(t.cancelled_at) >= ?`
    params.push(startDate)
  }
  if (endDate) {
    where += ` AND DATE(t.cancelled_at) <= ?`
    params.push(endDate)
  }

  // shop_tl or shop_manager role filter
  if ((user.role === 'shop_tl' || user.role === 'shop_manager') && user.shop_id) {
    where += ` AND t.shop_id = ?`
    params.push(user.shop_id)
  }

  const sql = `
    SELECT 
      t.task_id, 
      t.serial_number, 
      t.part_number, 
      t.cancellation_reason, 
      t.cancelled_at,
      u_canceller.full_name AS canceled_by_user,
      u_creator.full_name AS created_by_user,
      s.name as shop_name
    FROM tasks t
    LEFT JOIN users u_canceller ON t.cancelled_by = u_canceller.user_id
    LEFT JOIN users u_creator ON t.created_by = u_creator.user_id
    LEFT JOIN shops s ON t.shop_id = s.shop_id
    ${where}
    ORDER BY t.cancelled_at DESC
  `

  try {
    //('Cancellation Report API - Executing SQL query')
    const rows: Record<string, unknown>[] = await query(sql, params)
    //('Cancellation Report API - Query returned', rows.length, 'rows')

    // Build CSV
    const header = [
      'Task ID', 'Serial Number', 'Part Number', 'Shop Name',
      'Cancelled By', 'Task Creator', 'Cancellation Reason', 'Cancelled At'
    ]
    const csvLines = [header.join(',')]
    for (const t of rows) {
      const line = [
        `"TC-${String(t.task_id || '')}"`,
        `"${(t.serial_number || 'N/A').toString().replace(/"/g, '""')}"`,
        `"${(t.part_number || 'N/A').toString().replace(/"/g, '""')}"`,
        `"${(t.shop_name || 'N/A').toString().replace(/"/g, '""')}"`,
        `"${(t.canceled_by_user || 'N/A').toString().replace(/"/g, '""')}"`,
        `"${(t.created_by_user || 'N/A').toString().replace(/"/g, '""')}"`,
        `"${(t.cancellation_reason || 'N/A').toString().replace(/"/g, '""')}"`,
        `"${(t.cancelled_at || '').toString().replace(/"/g, '"')}"`
      ].join(',')
      csvLines.push(line)
    }

    const csv = csvLines.join('\r\n')
    //('Cancellation Report API - CSV generated successfully, length:', csv.length)

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="cancellation_report_${new Date().toISOString().replace(/[:.-]/g, '')}.csv"`,
      },
    })
  } catch (err) {
    console.error('Cancellation Report API - Error building cancellation report', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}