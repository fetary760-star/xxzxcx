'use client'

import React, { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { getProfilePictureUrl } from '@/lib/profile-picture-utils'
import { getCsrfToken } from '@/lib/csrf'
import { 
  Building,
  Camera,
  Clock,
  MapPin,
  Phone
} from 'lucide-react'
import { toast } from 'sonner'

interface UserProfile {
  userId: number
  username: string
  fullName: string
  email: string
  phoneNumber?: string
  role: string
  status: string
  profilePicturePath?: string
  shopId?: number
  shopName?: string
  supervisorId?: number
  supervisorName?: string
  createdAt: string
  updatedAt: string
}

export default function ProfilePage() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [profilePicVersion, setProfilePicVersion] = useState<number>(() => {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem('profile_picture_updated_at') : null
    return v ? Number(v) : 0
  })

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      setLoading(true)

      // SECURITY/AUTH FIX:
      // The auth token is now stored httpOnly in the `auth_token` / `authToken`
      // cookie (see auth-context.tsx) and is NOT available via
      // localStorage.getItem('token'). Previously we were reading it from
      // localStorage anyway, which produced a literal
      //     Authorization: Bearer null
      // header on every profile request and caused 401 Unauthorized responses.
      //
      // We now rely on the httpOnly cookie (credentials: 'include') and let
      // the /api/profile Next.js route extract the bearer token from the
      // cookie on the server side. If an in-memory token has been cached
      // somewhere (e.g. by apiClient), we include it as Authorization too,
      // but never the string "null" / "undefined".
      const maybeToken =
        (typeof window !== 'undefined' && window.localStorage.getItem('token')) ||
        null
      const headers: Record<string, string> = {
        Accept: 'application/json',
      }
      if (maybeToken && maybeToken !== 'null' && maybeToken !== 'undefined') {
        headers.Authorization = `Bearer ${maybeToken}`
      }

      const response = await fetch('/api/profile', {
        method: 'GET',
        headers,
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(`Failed to load profile: ${response.status}`)
      }

      const data = await response.json()
      setProfile(data)
      setError(null)
    } catch (err: any) {
      console.error('Failed to load profile:', err)
      setError('Failed to load profile. Please try again later.')
    } finally {
      setLoading(false)
    }
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Only JPG, PNG, and GIF files are allowed.')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size cannot exceed 5MB')
      return
    }

    try {
      setUploadingImage(true)
      const formData = new FormData()
      formData.append('file', file)

      //('Uploading file:', { name: file.name, type: file.type, size: file.size })

      // Get CSRF token for the request
      const csrfToken = await getCsrfToken()
      //('CSRF token obtained:', csrfToken ? 'Yes' : 'No')

      // AUTH FIX: do not send a hard-coded `Bearer ${localStorage...}` header.
      // The auth token lives in an httpOnly cookie and is forwarded via
      // `credentials: 'include'`. Only attach the Authorization header if
      // an actual JS-readable token happens to be cached.
      const maybeToken =
        (typeof window !== 'undefined' && window.localStorage.getItem('token')) ||
        null
      const headers: Record<string, string> = {}
      if (maybeToken && maybeToken !== 'null' && maybeToken !== 'undefined') {
        headers['Authorization'] = `Bearer ${maybeToken}`
      }

      // Add CSRF token header if available
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken
      }

      const response = await fetch('/api/profile/upload-picture', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('Upload failed:', response.status, errorData)
        throw new Error(errorData.error || errorData.message || 'Failed to upload profile picture')
      }

      const data = await response.json()
      //('Upload response:', data)
      toast.success('Profile picture updated successfully')
      
      // Reload profile to get updated picture
      await loadProfile()

      // Persist a timestamp so other components can append cache-bust and reload image
      try {
        const ts = Date.now()
        localStorage.setItem('profile_picture_updated_at', String(ts))
        // Notify other windows/components to reload the image
        window.dispatchEvent(new Event('profileUpdated'))
        setProfilePicVersion(ts)
      } catch (e) {
        // ignore storage errors
      }

    } catch (err: any) {
      console.error('Failed to upload profile picture:', err)
      toast.error(err.message || 'Failed to upload profile picture. Please try again.')
    } finally {
      setUploadingImage(false)
      // Reset the input so the same file can be uploaded again if needed
      event.target.value = ''
    }
  }

  const getRoleDisplayName = (role: string) => {
    const roleMap: Record<string, string> = {
      'team_leader': 'Team Leader',
      'director': 'Director',
      'engineer': 'Engineer',
      'customer': 'Customer',
      'customer_personnel': 'Customer Personnel',
      'shop_tl': 'Shop Team Leader'
    }
    
    return roleMap[role] || role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const getRoleBadgeVariant = (role: string): "default" | "secondary" | "outline" => {
    switch (role) {
      case 'director': return 'default'
      case 'team_leader': return 'secondary'
      case 'shop_tl': return 'outline'
      case 'engineer': return 'secondary'
      case 'customer_personnel': return 'outline'
      default: return 'secondary'
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading profile...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (error) {
    return (
      <MainLayout>
        <div className="rounded-md bg-red-50 p-4">
          <div className="text-sm text-red-700">{error}</div>
          <Button onClick={loadProfile} className="mt-2" variant="outline" size="sm">
            Try Again
          </Button>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Profile</h1>
            <p className="text-gray-600 mt-1">View your personal information and account details</p>
          </div>
        </div>

        <div className="max-w-3xl mx-auto">
          <Card>
            <CardHeader className="flex items-center gap-6">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  <AvatarImage 
                    src={getProfilePictureUrl(profile?.profilePicturePath, profilePicVersion)} 
                    alt="Profile"
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement
                      target.src = '/images/UserAvatar.jpg'
                    }}
                  />
                  <AvatarFallback className="text-lg">
                    {profile?.fullName?.split(' ').map(n => n[0]).join('') || 'U'}
                  </AvatarFallback>
                </Avatar>

                <label htmlFor="profile-picture-upload">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full cursor-pointer"
                    disabled={uploadingImage}
                    asChild
                  >
                    <span>
                      {uploadingImage ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                      ) : (
                        <Camera className="h-4 w-4" />
                      )}
                    </span>
                  </Button>
                </label>
                <input
                  id="profile-picture-upload"
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={uploadingImage}
                />
              </div>

              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    {/* Hiding full name and email per request; only showing role and selected fields */}
                    <Badge variant={getRoleBadgeVariant(profile?.role || '')}>
                      {getRoleDisplayName(profile?.role || '')}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <Building className="h-5 w-5 text-gray-400 mt-1" />
                <div>
                  <div className="text-sm font-medium text-gray-700">Username</div>
                  <div className="text-sm text-gray-600">{profile?.username || 'Not specified'}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="h-5 w-5 text-gray-400 mt-1" />
                <div>
                  <div className="text-sm font-medium text-gray-700">Phone Contact Number</div>
                  <div className="text-sm text-gray-600">{profile?.phoneNumber || 'Not specified'}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-gray-400 mt-1" />
                <div>
                  <div className="text-sm font-medium text-gray-700">Shop Name</div>
                  <div className="text-sm text-gray-600">{profile?.shopName || 'Not specified'}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Building className="h-5 w-5 text-gray-400 mt-1" />
                <div>
                  <div className="text-sm font-medium text-gray-700">Supervisor</div>
                  <div className="text-sm text-gray-600">{profile?.supervisorName || 'Not specified'}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-gray-400 mt-1" />
                <div>
                  <div className="text-sm font-medium text-gray-700">Last Updated</div>
                  <div className="text-sm text-gray-600">
                    {profile?.updatedAt ? new Date(profile.updatedAt).toLocaleString() : 'Not available'}
                  </div>
                </div>
              </div>

              {/* To explicitly include "Supervisor Name" per request (may duplicate Supervisor above) */}
              <div className="flex items-start gap-3">
                <Building className="h-5 w-5 text-gray-400 mt-1" />
                <div>
                  <div className="text-sm font-medium text-gray-700">Supervisor Name</div>
                  <div className="text-sm text-gray-600">{profile?.supervisorName || 'Not specified'}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Building className="h-5 w-5 text-gray-400 mt-1" />
                <div>
                  <div className="text-sm font-medium text-gray-700">Role</div>
                  <div className="text-sm text-gray-600">{getRoleDisplayName(profile?.role || '')}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  )
}