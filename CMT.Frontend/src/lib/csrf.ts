/**
 * CSRF Token Management
 * Handles fetching and caching CSRF tokens for API requests
 */

let cachedToken: string | null = null
let tokenExpiry: number = 0

/**
 * Get CSRF token from cookie
 */
function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null
  
  const cookies = document.cookie.split(';')
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=')
    if (name === 'CSRF-TOKEN' || name === 'X-CSRF-TOKEN' || name === 'csrf-token') {
      // Decode the URL-encoded cookie value
      return decodeURIComponent(value)
    }
  }
  return null
}

/**
 * Get a valid CSRF token, fetching a new one if needed
 */
export async function getCsrfToken(): Promise<string> {
  // First, try to get token from cookie (backend sets this)
  const cookieToken = getCsrfTokenFromCookie()
  if (cookieToken) {
    cachedToken = cookieToken
    return cookieToken
  }
  
  // Return cached token if still valid
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken
  }
  
  try {
    // Fetch new token from our API endpoint (which proxies to backend)
    const response = await fetch('/api/csrf', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch CSRF token: ${response.status}`)
    }
    
    const data = await response.json()
    cachedToken = data.token || data.csrfToken || data.csrf_token
    
    // After fetching, check cookie again as backend may have set it
    const newCookieToken = getCsrfTokenFromCookie()
    if (newCookieToken) {
      cachedToken = newCookieToken
    }
    
    // Set expiry to 50 minutes (tokens typically valid for 1 hour)
    tokenExpiry = Date.now() + (50 * 60 * 1000)
    
    return cachedToken || ''
  } catch (error) {
    console.error('Error fetching CSRF token:', error)
    // Return empty string as fallback - backend will handle validation
    return ''
  }
}

/**
 * Clear the cached CSRF token (e.g., after logout or on 403 error)
 */
export function clearCsrfToken(): void {
  cachedToken = null
  tokenExpiry = 0
  
  // Also clear the cookie
  if (typeof document !== 'undefined') {
    document.cookie = 'CSRF-TOKEN=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    document.cookie = 'X-CSRF-TOKEN=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    document.cookie = 'csrf-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  }
}

/**
 * Add CSRF token to request headers
 */
export async function addCsrfHeader(headers: Record<string, string> = {}): Promise<Record<string, string>> {
  const token = await getCsrfToken()
  
  if (token) {
    return {
      ...headers,
      'X-CSRF-Token': token,
      'X-Requested-With': 'XMLHttpRequest'
    }
  }
  
  return {
    ...headers,
    'X-Requested-With': 'XMLHttpRequest'
  }
}