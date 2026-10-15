import { proxyRequest } from '@/app/api/proxy/utils';

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

/** Try to get user from middleware forwarded header if present */
function getUserFromForwarded(headers: Headers): any | null {
  const j = headers.get('x-user-json')
  if (!j) return null
  try { return JSON.parse(j) } catch { return null }
}

/** If needed, call backend /auth/me to validate token and get user */
async function fetchUserFromBackend(authHeader?: string | null) {
  if (!authHeader) return null
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: authHeader, Accept: 'application/json' } })
    if (!res.ok) return null
    const body = await res.json().catch(() => null)
    return body?.user ?? body
  } catch {
    return null
  }
}

/** Normalize role tokens */
function normalizeRole(raw: any): string {
  if (raw === undefined || raw === null) return ''
  if (typeof raw === 'number') return String(raw)
  return String(raw).toLowerCase().trim().replace(/[\s\-\_]+/g, '_')
}

// GET /api/tasks/:id -> proxies to BACKEND_URL/tasks/:id
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(req, `/tasks/${encodeURIComponent(id)}`);
}

// PUT /api/tasks/:id -> proxies to BACKEND_URL/tasks/:id
// CRITICAL FIX: Intercept engineer's "Completed" status change and redirect to "PendingTLApproval"
// The C# backend does NOT implement this interception, so we handle it in the proxy layer.
// When an engineer sets status to 2 (Completed), we change it to 8 (PendingTLApproval) before forwarding.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  try {
    // Read the request body
    const bodyText = await req.text()
    let bodyJson: any = null
    
    try {
      bodyJson = JSON.parse(bodyText)
    } catch {
      // If body isn't JSON, just proxy as-is
      // proxyRequest() will forward CSRF headers to the backend
      const newReq = new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: bodyText,
      })
      return proxyRequest(newReq, `/tasks/${encodeURIComponent(id)}`)
    }
    
    // Check if the request is setting status to Completed (2)
    const requestedStatus = bodyJson?.status
    const isSettingCompleted = requestedStatus === 2 || requestedStatus === '2'
    
    if (isSettingCompleted) {
      // Resolve the authenticated user to check their role
      const forwardedUser = getUserFromForwarded(new Headers(req.headers))
      let user = forwardedUser ?? null
      
      if (!user) {
        const auth = req.headers.get('authorization')
        if (auth) {
          user = await fetchUserFromBackend(auth)
        }
      }
      
      const role = normalizeRole(user?.role ?? user?.role_name ?? user?.roleName ?? user?.roleDisplayName ?? '')
      const isEngineer = role === 'engineer' || role === '2'
      
      console.log(`🔐 [PUT /api/tasks/${id}] Status change to Completed detected. User role: '${role}', isEngineer: ${isEngineer}`)
      
      if (isEngineer) {
        // CRITICAL: Engineer is trying to mark task as Completed
        // Intercept and change to PendingTLApproval (8) instead
        console.log(`🔄 [PUT /api/tasks/${id}] INTERCEPTING: Engineer completing task -> changing status from 2 (Completed) to 8 (PendingTLApproval)`)
        
        bodyJson.status = 8 // PendingTLApproval
        
        const modifiedBody = JSON.stringify(bodyJson)
        
        // Create a new request with the modified body
        // NOTE: CSRF headers are stripped by proxyRequest() — do NOT add them here
        const headers: Record<string, string> = {}
        req.headers.forEach((value, key) => {
          if (key.toLowerCase() !== 'host') {
            headers[key] = value
          }
        })
        // Ensure content-type is set for JSON
        headers['content-type'] = 'application/json'
        
        const newReq = new Request(req.url, {
          method: req.method,
          headers: headers,
          body: modifiedBody,
        })
        
        const response = await proxyRequest(newReq, `/tasks/${encodeURIComponent(id)}`)
        
        // After proxying, modify the response to include the intercepted status
        // so the frontend can detect the status change
        try {
          const responseBody = await response.arrayBuffer()
          const responseText = new TextDecoder().decode(responseBody)
          let responseJson: any = null
          
          try {
            responseJson = JSON.parse(responseText)
          } catch {
            // Response isn't JSON, return as-is but add status info
          }
          
          if (responseJson && response.status >= 200 && response.status < 300) {
            // Ensure the response includes the actual status (PendingTLApproval)
            // This helps the frontend detect the status change
            if (responseJson.status === undefined && responseJson.Status === undefined) {
              responseJson.status = 8
            }
            // Also set a flag so the frontend knows this was intercepted
            responseJson._interceptedByProxy = true
            responseJson._originalRequestedStatus = 2
            responseJson._actualStatus = 8
            
            console.log(`✅ [PUT /api/tasks/${id}] Successfully intercepted. Task is now PendingTLApproval (8) instead of Completed (2)`)
            
            const resHeaders = new Headers()
            response.headers.forEach((value, key) => {
              resHeaders.set(key, value)
            })
            resHeaders.set('content-type', 'application/json')
            
            return new Response(JSON.stringify(responseJson), {
              status: response.status,
              headers: resHeaders,
            })
          }
          
          // If we couldn't parse the response, return original with status info header
          const resHeaders = new Headers()
          response.headers.forEach((value, key) => {
            resHeaders.set(key, value)
          })
          
          return new Response(responseBody, {
            status: response.status,
            headers: resHeaders,
          })
        } catch {
          // If response manipulation fails, return the original response
          return response
        }
      }
    }
    
    // For non-engineer or non-Completed status changes, proxy as-is with original body
    // NOTE: CSRF headers are stripped by proxyRequest() — no need to handle them here
    const headers: Record<string, string> = {}
    req.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'host') {
        headers[key] = value
      }
    })
    
    const newReq = new Request(req.url, {
      method: req.method,
      headers: headers,
      body: bodyText,
    })
    
    return proxyRequest(newReq, `/tasks/${encodeURIComponent(id)}`)
  } catch (err: any) {
    console.error(`❌ [PUT /api/tasks/${id}] Error in interception logic:`, err)
    // Fallback: try to proxy the original request
    // Since we already consumed the body, we need to handle this carefully
    return new Response(
      JSON.stringify({ error: 'Proxy interception failed', details: err?.message }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// PATCH /api/tasks/:id -> proxies to BACKEND_URL/tasks/:id
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(req, `/tasks/${encodeURIComponent(id)}`);
}

// DELETE /api/tasks/:id -> proxies to BACKEND_URL/tasks/:id
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(req, `/tasks/${encodeURIComponent(id)}`);
}