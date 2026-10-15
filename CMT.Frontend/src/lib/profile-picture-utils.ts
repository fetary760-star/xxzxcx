/**
 * Shared profile-picture utilities used by Sidebar, Header and Profile page.
 * This update fixes 404s for the default image by using an inline SVG data-URI
 * as the guaranteed fallback (so there is no network request to /images/... that
 * can return 404). It still supports absolute URLs, /uploads paths and the
 * /api/uploads -> /uploads rewrite. A cache-bust query param is applied when
 * `version` is provided, but we skip adding it for data: URIs.
 */

export function getInitials(fullName?: string | null): string {
  if (!fullName) return 'U'
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * A small neutral inline SVG used as a guaranteed default avatar.
 * Using a data: URI prevents 404s in environments where /images/... assets
 * are not present (like some preview/dev containers).
 */
function defaultAvatarDataUri(): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'>
    <rect width='100%' height='100%' fill='#F3F4F6'/>
    <g fill='#9CA3AF'>
      <circle cx='60' cy='42' r='26'/>
      <rect x='24' y='78' width='72' height='18' rx='9'/>
    </g>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/**
 * Resolve a profile picture path into the URL the frontend should use.
 * - Handles absolute URLs (http/https) unchanged.
 * - Converts "/api/uploads/..." -> "/uploads/..." to match the Next.js rewrite and backend static file serving.
 * - Leaves "/uploads/..." as-is (these are proxied to backend by next.config rewrites).
 * - If path is falsy, returns an inline SVG data URI (no network request; no 404).
 * - Optionally appends a cache-bust query parameter `cb` when `version` is provided to force reload after update.
 *
 * version can be a number/string (e.g. timestamp) or undefined.
 */
export function getProfilePictureUrl(path?: string | null, version?: number | string | null): string {
  const defaultImage = defaultAvatarDataUri()

  if (!path) {
    return appendCacheBust(defaultImage, version)
  }

  const trimmed = path.trim()

  // Absolute URL -> return as-is (but append cache bust if requested)
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return appendCacheBust(trimmed, version)
  }

  // Backend API uploads may be returned as "/api/uploads/..." -> rewrite to "/uploads/"
  if (trimmed.startsWith('/api/uploads')) {
    const replaced = trimmed.replace(/^\/api\/uploads/, '/uploads')
    return appendCacheBust(replaced, version)
  }

  // If already a backend uploads path
  if (trimmed.startsWith('/uploads')) {
    return appendCacheBust(trimmed, version)
  }

  // If it's a local/public path like "/images/foo.jpg" treat as-is
  return appendCacheBust(trimmed, version)
}

function appendCacheBust(url: string, version?: number | string | null) {
  if (version === undefined || version === null || String(version) === '') return url
  // Do NOT append cache-bust to data: URIs
  if (url.startsWith('data:')) return url
  // If url already has query params, append with &
  return url.includes('?') ? `${url}&cb=${encodeURIComponent(String(version))}` : `${url}?cb=${encodeURIComponent(String(version))}`
}