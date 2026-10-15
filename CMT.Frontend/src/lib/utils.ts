import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get the correct URL for a profile picture
 * Handles both relative paths from backend and local paths
 */
export function getProfilePictureUrl(path?: string | null): string {
  // Default fallback image
  const defaultImage = '/images/photo1764853586.jpg'
  
  if (!path) return defaultImage
  
  // If it's already an absolute URL, return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  
  // If it starts with /uploads, it's from the backend
  // The Next.js rewrite rule will proxy it to the backend
  if (path.startsWith('/uploads')) {
    return path
  }
  
  // If it starts with /api/uploads, strip /api prefix
  if (path.startsWith('/api/uploads')) {
    return path.replace('/api/uploads', '/uploads')
  }
  
  // Otherwise treat as a local path
  return path
}

/**
 * Format a date to a readable string
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

/**
 * Format a date to include time
 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}