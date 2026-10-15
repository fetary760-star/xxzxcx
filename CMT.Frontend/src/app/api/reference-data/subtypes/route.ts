import { requireRole } from '@/lib/serverAuth'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'
const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

// Allow customer_personnel and other roles to read subtypes for task creation
const ALLOWED = ['team_leader','teamleader','director','engineer','customer_personnel','customerpersonnel','customer','1','2','3','4','5']

function forwardHeaders(req: Request) {
  const h: Record<string, string> = {}
  const finalAuthHeader = resolveAuthorizationHeader(req)
  if (finalAuthHeader) h.authorization = finalAuthHeader
  if (req.headers.get('cookie')) h.cookie = req.headers.get('cookie') as string
  return h
}

export async function GET(req: Request) {
  try {
    await requireRole(req, ALLOWED)
    
    // FIXED: Use the correct backend endpoint with hyphen
    const backendUrl = `${API_BASE}/reference-data/sub-types`
    //('[api/reference-data/subtypes] Fetching from:', backendUrl)
    
    const res = await fetch(backendUrl, { 
      headers: forwardHeaders(req),
      cache: 'no-store'
    })
    
    //('[api/reference-data/subtypes] Backend response status:', res.status)
    
    if (!res.ok) {
      console.error('[api/reference-data/subtypes] Backend error:', res.status, res.statusText)
      return new Response(JSON.stringify({ 
        error: 'Backend service unavailable', 
        status: res.status,
        message: `Backend returned ${res.status}: ${res.statusText}`
      }), { 
        status: res.status, 
        headers: { 'Content-Type': 'application/json' } 
      })
    }
    
    const text = await res.text()
    //('[api/reference-data/subtypes] Backend response length:', text.length)
    
    // FIXED: Validate JSON before returning
    if (!text || text.trim() === '') {
      console.warn('[api/reference-data/subtypes] Empty response from backend')
      return new Response(JSON.stringify([]), { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      })
    }
    
    // Test if response is valid JSON
    try {
      JSON.parse(text)
    } catch (jsonError) {
      console.error('[api/reference-data/subtypes] Invalid JSON from backend:', jsonError)
      return new Response(JSON.stringify({ 
        error: 'Invalid response from backend', 
        message: 'Backend returned malformed JSON'
      }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      })
    }
    
    return new Response(text, { 
      status: res.status, 
      headers: { 'Content-Type': 'application/json' } 
    })
    
  } catch (err: any) {
    console.error('[api/reference-data/subtypes] Error:', err)
    
    // FIXED: Better error handling for different error types
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      return new Response(JSON.stringify({ 
        error: 'Backend service unavailable', 
        message: 'Cannot connect to backend server. Please ensure the backend is running on port 5000.'
      }), { 
        status: 503, 
        headers: { 'Content-Type': 'application/json' } 
      })
    }
    
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch subtypes', 
      message: err.message || 'Unknown error occurred'
    }), { 
      status: err.status || 500, 
      headers: { 'Content-Type': 'application/json' } 
    })
  }
}