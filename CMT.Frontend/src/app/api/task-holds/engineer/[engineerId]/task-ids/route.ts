import { NextRequest, NextResponse } from 'next/server'

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

/**
 * GET /api/task-holds/engineer/[engineerId]/task-ids
 * 
 * Returns distinct task IDs where the specified engineer has submitted hold requests.
 * Used by the RBAC filter to ensure engineers retain visibility of tasks
 * after hold approval changes the task assignment (transfer_to_tl or return_to_initiator).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ engineerId: string }> }
) {
  try {
    const { engineerId } = await params

    // Forward auth headers
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized', taskIds: [] },
        { status: 401 }
      )
    }

    const headers: Record<string, string> = {
      'Authorization': authHeader,
      'Accept': 'application/json',
    }

    const cookieHeader = request.headers.get('cookie')
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader
    }

    const backendUrl = `${API_BASE}/task-holds/engineer/${engineerId}/task-ids`

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers,
    })

    if (!response.ok) {
      console.error(`[task-holds/engineer/${engineerId}/task-ids] Backend error: ${response.status}`)
      // Return empty array on error so RBAC filter doesn't break
      return NextResponse.json({ success: false, taskIds: [], count: 0 }, { status: 200 })
    }

    const data = await response.json()

    // Normalize response - extract taskIds array
    let taskIds: number[] = []
    if (data.taskIds && Array.isArray(data.taskIds)) {
      taskIds = data.taskIds.map((id: any) => Number(id)).filter((id: number) => !isNaN(id) && id > 0)
    } else if (data.payload && Array.isArray(data.payload)) {
      taskIds = data.payload.map((id: any) => Number(id)).filter((id: number) => !isNaN(id) && id > 0)
    } else if (Array.isArray(data)) {
      taskIds = data.map((id: any) => Number(id)).filter((id: number) => !isNaN(id) && id > 0)
    }

    return NextResponse.json({
      success: true,
      taskIds,
      count: taskIds.length
    })

  } catch (error: any) {
    console.error('[task-holds/engineer/task-ids] Error:', error.message)
    // Return empty array on error so RBAC filter doesn't break
    return NextResponse.json({ success: false, taskIds: [], count: 0 }, { status: 200 })
  }
}