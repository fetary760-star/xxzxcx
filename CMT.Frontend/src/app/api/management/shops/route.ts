import { NextRequest, NextResponse } from 'next/server'
import { requireRole, forwardAuthHeaders } from '@/lib/serverAuth'

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

export async function GET(request: NextRequest) {
  try {
    //('[api/management/shops] GET request received')
    
    // Check if user has required role for shop management
    const user = await requireRole(request, [
      'team_leader', 'teamleader', 'director', 'engineer', 
      'customer_personnel', 'customerpersonnel', 'customer',
      'shop_tl', 'shoptl', 'shop-tl',
      'manager', 'shop_manager', 'shopmanager',
      '1', '2', '3', '4', '5', '6', '8'
    ])
    
    ('[api/management/shops] User authorized:', { 
      userId: user.user_id || user.userId, 
      role: user.role || user.role_name 
    })

    // Forward request to backend API
    const headers = forwardAuthHeaders(request)
    const backendUrl = `${API_BASE}/shops`
    
    //('[api/management/shops] Forwarding to backend:', backendUrl)
    
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers,
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error('[api/management/shops] Backend error:', response.status, errorText)
      return NextResponse.json(
        { error: 'Backend error', message: `Failed to fetch shops: ${response.status} ${response.statusText}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    //('[api/management/shops] Successfully fetched from backend:', Array.isArray(data) ? data.length : 'unknown', 'shops')
    return NextResponse.json(data)
    
  } catch (error) {
    console.error('[api/management/shops] Error:', error)
    
    if (error instanceof Response) {
      const errorData = await error.json().catch(() => ({ error: 'unauthorized', message: 'requireRole failed' }))
      return NextResponse.json(errorData, { status: error.status })
    }
    
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to process request' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    //('[api/management/shops] POST request received')
    
    // Check if user has required role for shop creation
    const user = await requireRole(request, [
      'team_leader', 'teamleader', 'director', 'manager',
      'shop_manager', 'minimanager', 'mini-manager',
      '5', '6', '8'
    ])
    
    const body = await request.json()
    ('[api/management/shops] Create shop request:', { 
      name: body.name, 
      description: body.description,
      teamLeaderId: body.teamLeaderId || body.team_leader_id
    })

    // Forward request to backend API
    const headers = forwardAuthHeaders(request)
    headers['Content-Type'] = 'application/json'
    
    const backendUrl = `${API_BASE}/shops`
    
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        Name: body.name,
        Description: body.description,
        TeamLeaderId: body.teamLeaderId || body.team_leader_id
      }),
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error('[api/management/shops] Backend create error:', response.status, errorText)
      return NextResponse.json(
        { error: 'Backend error', message: `Failed to create shop: ${response.status} ${response.statusText}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    //('[api/management/shops] Successfully created shop')
    return NextResponse.json(data, { status: 201 })
    
  } catch (error) {
    console.error('[api/management/shops] Create error:', error)
    
    if (error instanceof Response) {
      const errorData = await error.json().catch(() => ({ error: 'unauthorized', message: 'requireRole failed' }))
      return NextResponse.json(errorData, { status: error.status })
    }
    
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to create shop' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    //onsole.log('[api/management/shops] PUT request received')
    
    // Check if user has required role for shop update
    const user = await requireRole(request, [
      'team_leader', 'teamleader', 'director', 'manager',
      'shop_manager', 'minimanager', 'mini-manager',
      '5', '6', '8'
    ])
    
    const body = await request.json()
    const shopId = body.shopId || body.shop_id || body.id
    
    if (!shopId) {
      return NextResponse.json(
        { error: 'Bad request', message: 'Shop ID is required' },
        { status: 400 }
      )
    }
    
    ('[api/management/shops] Update shop request:', { 
      shopId,
      name: body.name, 
      description: body.description,
      teamLeaderId: body.teamLeaderId || body.team_leader_id
    })

    // Forward request to backend API
    const headers = forwardAuthHeaders(request)
    headers['Content-Type'] = 'application/json'
    
    const backendUrl = `${API_BASE}/shops/${shopId}`
    
    const response = await fetch(backendUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        Name: body.name,
        Description: body.description,
        TeamLeaderId: body.teamLeaderId || body.team_leader_id
      }),
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error('[api/management/shops] Backend update error:', response.status, errorText)
      return NextResponse.json(
        { error: 'Backend error', message: `Failed to update shop: ${response.status} ${response.statusText}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    //('[api/management/shops] Successfully updated shop')
    return NextResponse.json(data)
    
  } catch (error) {
    console.error('[api/management/shops] Update error:', error)
    
    if (error instanceof Response) {
      const errorData = await error.json().catch(() => ({ error: 'unauthorized', message: 'requireRole failed' }))
      return NextResponse.json(errorData, { status: error.status })
    }
    
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to update shop' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    //('[api/management/shops] DELETE request received')
    
    // Check if user has required role for shop deletion
    const user = await requireRole(request, [
      'team_leader', 'teamleader', 'director', 'manager',
      'shop_manager', 'minimanager', 'mini-manager',
      '5', '6', '8'
    ])
    
    const { searchParams } = new URL(request.url)
    const shopId = searchParams.get('id')
    
    if (!shopId) {
      return NextResponse.json(
        { error: 'Bad request', message: 'Shop ID is required' },
        { status: 400 }
      )
    }
    
    //('[api/management/shops] Delete shop request:', { shopId })

    // Forward request to backend API
    const headers = forwardAuthHeaders(request)
    const backendUrl = `${API_BASE}/shops/${shopId}`
    
    const response = await fetch(backendUrl, {
      method: 'DELETE',
      headers,
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error('[api/management/shops] Backend delete error:', response.status, errorText)
      
      // Parse error message for better user feedback
      try {
        const errorJson = JSON.parse(errorText)
        return NextResponse.json(errorJson, { status: response.status })
      } catch {
        return NextResponse.json(
          { error: 'Backend error', message: errorText || `Failed to delete shop: ${response.status}` },
          { status: response.status }
        )
      }
    }

    //('[api/management/shops] Successfully deleted shop')
    return NextResponse.json({ message: 'Shop deleted successfully' })
    
  } catch (error) {
    console.error('[api/management/shops] Delete error:', error)
    
    if (error instanceof Response) {
      const errorData = await error.json().catch(() => ({ error: 'unauthorized', message: 'requireRole failed' }))
      return NextResponse.json(errorData, { status: error.status })
    }
    
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to delete shop' },
      { status: 500 }
    )
  }
}