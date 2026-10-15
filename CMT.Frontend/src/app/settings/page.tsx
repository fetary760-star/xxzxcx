'use client'

import React, { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Settings,
  Bell,
  Shield,
  Palette,
  Monitor,
  Moon,
  Sun,
  Save,
  Key,
  Eye,
  EyeOff,
  MessageSquare,
  Phone,
  UserCircle
} from 'lucide-react'

import { toast } from 'sonner'
import { getCsrfToken } from '@/lib/csrf'
import { useNotificationSettings } from '@/hooks/useNotificationSettings'

interface UserSettings {
  userId: number
  username: string
  email: string
  fullName: string
  role: string
  status: string
  phoneNumber?: string
  shopId?: number
  shopName?: string
  supervisorId?: number
  supervisorName?: string

  // User preference settings
  emailNotifications: boolean
  taskReminders: boolean
  weeklyReports: boolean
  inAppToastNotifications: boolean
  darkMode: boolean
  language: string
  timeZone: string
  // Permission flags
  canChangeRole: boolean
  canChangeShop: boolean
  canChangeSupervisor: boolean
}

// ================================================================
// Local persistence helpers for user preferences.
//
// The backend SettingsController always returns hardcoded defaults
// for preference fields (emailNotifications, taskReminders, etc.)
// because there is no UserPreferences table yet. To ensure the
// user's choices actually persist across page reloads, we store
// them in localStorage and merge them back on load.
// ================================================================
const PREFS_STORAGE_KEY = 'cmt_user_preferences'

interface StoredPreferences {
  emailNotifications?: boolean
  taskReminders?: boolean
  weeklyReports?: boolean
  inAppToastNotifications?: boolean
  darkMode?: boolean
  language?: string
  timeZone?: string
}

function loadStoredPreferences(): StoredPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore parse errors
  }
  return {}
}

function saveStoredPreferences(prefs: StoredPreferences): void {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // ignore storage errors
  }
}

/**
 * Merge backend settings with locally-stored preferences.
 * Local preferences take precedence over backend defaults.
 */
function mergeWithStoredPreferences(backendSettings: UserSettings): UserSettings {
  const stored = loadStoredPreferences()
  return {
    ...backendSettings,
    emailNotifications: stored.emailNotifications ?? backendSettings.emailNotifications,
    taskReminders: stored.taskReminders ?? backendSettings.taskReminders,
    weeklyReports: stored.weeklyReports ?? backendSettings.weeklyReports,
    inAppToastNotifications: stored.inAppToastNotifications ?? backendSettings.inAppToastNotifications,
    darkMode: stored.darkMode ?? backendSettings.darkMode,
    language: stored.language ?? backendSettings.language,
    timeZone: stored.timeZone ?? backendSettings.timeZone,
  }
}

export default function SettingsPage() {
  const { user } = useAuth()
  const { updateSettings: updateNotificationSettingsCache } = useNotificationSettings()
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/settings', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Accept': 'application/json',
        },
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error(`Failed to load settings: ${response.status}`)
      }

      const data = await response.json()
      // Ensure inAppToastNotifications has a default value if not present from backend
      if (typeof data.inAppToastNotifications !== 'boolean') {
        data.inAppToastNotifications = true
      }

      // Merge with locally-stored preferences (backend returns hardcoded defaults)
      const merged = mergeWithStoredPreferences(data)
      setSettings(merged)
      setError(null)

// Persist timezone from server settings to localStorage for use across the app
      const effectiveTimeZone = merged.timeZone
      if (effectiveTimeZone) {
        try {
          localStorage.setItem('user_timezone', effectiveTimeZone)
          window.dispatchEvent(new CustomEvent('settings:timezone-changed', { detail: { timeZone: effectiveTimeZone } }))
        } catch {}
      }

    } catch (err: any) {
      setError('Failed to load settings. Please try again later.')
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    if (!settings) return

    try {
      setSaving(true)
      
      // Get CSRF token before making the request
      const csrfToken = await getCsrfToken()
      
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include',
                body: JSON.stringify({
          fullName: settings.fullName,
          username: settings.username,
          email: settings.email,
          phoneNumber: settings.phoneNumber,
          emailNotifications: settings.emailNotifications,
          taskReminders: settings.taskReminders,
          weeklyReports: settings.weeklyReports,
          inAppToastNotifications: settings.inAppToastNotifications,
          darkMode: settings.darkMode,
          language: settings.language,
          timeZone: settings.timeZone
        })

      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || errorData.message || `Failed to save settings: ${response.status}`)
      }

      const updatedSettings = await response.json()
      // Ensure inAppToastNotifications has a default value if not present from backend
      if (typeof updatedSettings.inAppToastNotifications !== 'boolean') {
        updatedSettings.inAppToastNotifications = settings.inAppToastNotifications
      }

      // ================================================================
      // FIX: Persist the user's preference choices locally.
      //
      // The backend does not yet store preferences in a UserPreferences
      // table — it only logs them and echoes back the request values.
      // On the next GET it will return hardcoded defaults again.
      // By saving to localStorage we ensure the user's choices survive
      // page reloads and are merged back on the next load.
      // ================================================================
      const prefsToStore: StoredPreferences = {
        emailNotifications: settings.emailNotifications,
        taskReminders: settings.taskReminders,
        weeklyReports: settings.weeklyReports,
        inAppToastNotifications: settings.inAppToastNotifications,
        darkMode: settings.darkMode,
        language: settings.language,
        timeZone: settings.timeZone,
      }
      saveStoredPreferences(prefsToStore)

      // Merge the backend response with local preferences (use local as source of truth)
      const mergedAfterSave = mergeWithStoredPreferences(updatedSettings)
      setSettings(mergedAfterSave)

// Dispatch timezone change event so all components update their date formatting
      const savedTimeZone = mergedAfterSave.timeZone || settings.timeZone
      if (savedTimeZone) {
        try {
          localStorage.setItem('user_timezone', savedTimeZone)
          window.dispatchEvent(new CustomEvent('settings:timezone-changed', { detail: { timeZone: savedTimeZone } }))
        } catch {}
      }

      // Immediately update the notification settings cache so all components
      // (NotificationToaster, useSignalRNotifications) pick up the new preferences
      updateNotificationSettingsCache({
        emailNotifications: mergedAfterSave.emailNotifications,
        taskReminders: mergedAfterSave.taskReminders,
        weeklyReports: mergedAfterSave.weeklyReports,
        inAppToastNotifications: mergedAfterSave.inAppToastNotifications,
      })

      toast.success('Settings saved successfully')
    } catch (err: any) {
      toast.error(err.message || 'Failed to save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const changePassword = async (e?: React.FormEvent) => {
    // Prevent default form submission if called from form event
    if (e) {
      e.preventDefault()
    }

    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error('Please fill in all password fields')
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match')
      return
    }

    if (passwordForm.newPassword.length < 8) {
      toast.error('New password must be at least 8 characters long')
      return
    }

    try {
      setChangingPassword(true)
      
      // Get CSRF token before making the request
      const csrfToken = await getCsrfToken()
      
      const response = await fetch('/api/settings/password', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || errorData.message || 'Failed to change password'
        
        // Map technical errors to user-friendly messages
        let userFriendlyMessage = errorMessage
        if (errorMessage.toLowerCase().includes('incorrect') || errorMessage.toLowerCase().includes('current password')) {
          userFriendlyMessage = 'The current password you entered is incorrect. Please try again.'
        } else if (errorMessage.toLowerCase().includes('weak') || errorMessage.toLowerCase().includes('strength')) {
          userFriendlyMessage = 'Your new password is too weak. Please choose a stronger password.'
        } else if (errorMessage.toLowerCase().includes('same') || errorMessage.toLowerCase().includes('previous')) {
          userFriendlyMessage = 'Your new password cannot be the same as your current password.'
        }
        
        throw new Error(userFriendlyMessage)
      }

      toast.success('Password changed successfully')
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err: any) {
      // Only show user-friendly error message in toast, suppress console errors
      toast.error(err.message || 'Failed to change password. Please try again.')
    } finally {
      setChangingPassword(false)
    }
  }

  const updateSetting = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    if (!settings) return
    setSettings(prev => prev ? { ...prev, [key]: value } : null)
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading settings...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (error || !settings) {
    return (
      <MainLayout>
        <div className="rounded-md bg-red-50 p-4">
          <div className="text-sm text-red-700">{error || 'Failed to load settings'}</div>
          <Button onClick={loadSettings} className="mt-2" variant="outline" size="sm">
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
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-600 mt-1">Customize your experience and manage your preferences</p>
          </div>
          <Button onClick={saveSettings} disabled={saving}>
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Settings
              </>
            )}
          </Button>
        </div>

                <Tabs defaultValue="account" className="space-y-6">

                    <TabsList>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="display">Display</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>


                    {/* Account Tab */}
          <TabsContent value="account">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCircle className="h-5 w-5" />
                  Account Information
                </CardTitle>
                <CardDescription>View and update your account details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input
                      id="fullName"
                      value={settings.fullName || ''}
                      onChange={(e) => updateSetting('fullName', e.target.value)}
                      placeholder="Enter your full name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      value={settings.username || ''}
                      onChange={(e) => updateSetting('username', e.target.value)}
                      placeholder="Enter your username"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={settings.email || ''}
                      onChange={(e) => updateSetting('email', e.target.value)}
                      placeholder="Enter your email address"
                    />
                  </div>
                  <div>
                    <Label>Role</Label>
                    <Input value={settings.role || ''} disabled className="bg-gray-50" />
                  </div>
                </div>
                <Separator />
                <div>
                  <Label htmlFor="phoneNumber" className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Phone Contact Number
                  </Label>
                  <p className="text-sm text-gray-600 mb-2">
                    Update your phone contact number. This will be visible on tasks you are assigned to.
                  </p>
                  <Input
                    id="phoneNumber"
                    type="tel"
                    value={settings.phoneNumber || ''}
                    onChange={(e) => updateSetting('phoneNumber', e.target.value)}
                    placeholder="e.g. +251-XXX-XXXXXXX or ext. 1234"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications">

            <div className="space-y-6">
              {/* Desktop Notifications Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Desktop Notifications
                  </CardTitle>
                  <CardDescription>
                    Control OS-level desktop notifications that appear at the bottom-right of your screen 
                    (Windows Action Center / macOS Notification Center). These notifications are stored in 
                    your operating system's notification center so you can review them later.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Enable Desktop Notifications</Label>
                      <p className="text-sm text-gray-600">
                        Show OS-level notifications when new events occur. Notifications are stored in your 
                        system notification center for later review.
                      </p>
                    </div>
                    <Switch
                      checked={settings.inAppToastNotifications}
                      onCheckedChange={(checked) => updateSetting('inAppToastNotifications', checked)}
                    />
                  </div>
                  {!settings.inAppToastNotifications && (
                    <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
                      <p className="text-sm text-amber-800">
                        <strong>Note:</strong> Desktop notifications are currently disabled. You will not receive 
                        OS-level notification alerts, but notifications will still be available in the notification bell panel.
                      </p>
                    </div>
                  )}
                  <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
                    <p className="text-sm text-blue-800">
                      <strong>Tip:</strong> Make sure your browser has permission to show notifications. 
                      If prompted, click &quot;Allow&quot; to enable desktop notifications. You can also check 
                      your browser settings under <em>Settings → Privacy and security →Site settings →Notifications → Sites can ask to send notifications.</em>.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Existing Notification Settings Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Notification Preferences
                  </CardTitle>
                  <CardDescription>Control how and when you receive notifications</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Email Notifications</Label>
                      <p className="text-sm text-gray-600">Receive notifications via email</p>
                    </div>
                    <Switch
                      checked={settings.emailNotifications}
                      onCheckedChange={(checked) => updateSetting('emailNotifications', checked)}
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Task Reminders</Label>
                      <p className="text-sm text-gray-600">
                        Get reminders and toast alerts for task assignments, status changes, and upcoming deadlines
                      </p>
                    </div>
                    <Switch
                      checked={settings.taskReminders}
                      onCheckedChange={(checked) => updateSetting('taskReminders', checked)}
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Weekly Reports</Label>
                      <p className="text-sm text-gray-600">Weekly performance summaries</p>
                    </div>
                    <Switch
                      checked={settings.weeklyReports}
                      onCheckedChange={(checked) => updateSetting('weeklyReports', checked)}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Display Tab */}
          <TabsContent value="display">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Display & Appearance
                </CardTitle>
                <CardDescription>Customize the look and feel of the application</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Theme</Label>
                  <Select 
                    value={settings.darkMode ? 'dark' : 'light'} 
                    onValueChange={(value) => updateSetting('darkMode', value === 'dark')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">
                        <div className="flex items-center gap-2">
                          <Sun className="h-4 w-4" />
                          Light
                        </div>
                      </SelectItem>
                      <SelectItem value="dark">
                        <div className="flex items-center gap-2">
                          <Moon className="h-4 w-4" />
                          Dark
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Language</Label>
                  <Select value={settings.language} onValueChange={(value) => updateSetting('language', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en-US">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Timezone</Label>
                  <p className="text-sm text-gray-600 mb-2">
                    All dates and times across the application (including task details, comments, and timelines) will be displayed in the selected timezone.
                  </p>
                  <Select
                    value={settings.timeZone}
                    onValueChange={(value) => {
                      updateSetting('timeZone', value)
                      // Immediately dispatch timezone change so all components update in real-time
                      // (without waiting for the user to click Save Settings)
                      try {
                        localStorage.setItem('user_timezone', value)
                        window.dispatchEvent(new CustomEvent('settings:timezone-changed', { detail: { timeZone: value } }))
                      } catch {}
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Africa/Addis_Ababa">East Africa Time (UTC+3) — Africa/Addis Ababa</SelectItem>
                      <SelectItem value="UTC">UTC (Coordinated Universal Time)</SelectItem>
                    </SelectContent>
                  </Select>
                  {settings.timeZone && (
                    <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                      <strong>Current timezone:</strong> {settings.timeZone} — All task dates and times will display in this timezone.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Security
                </CardTitle>
                <CardDescription>Manage your account security and authentication</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={changePassword} className="space-y-3">
                  <Label className="text-base">Change Password</Label>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="currentPassword">Current Password</Label>
                      <div className="relative">
                        <Input
                          id="currentPassword"
                          type={showPassword ? 'text' : 'password'}
                          value={passwordForm.currentPassword}
                          onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                          placeholder="Enter current password"
                          autoComplete="current-password"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="newPassword">New Password</Label>
                      <Input
                        id="newPassword"
                        type={showPassword ? 'text' : 'password'}
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                        placeholder="Enter new password"
                        autoComplete="new-password"
                      />
                    </div>
                    <div>
                      <Label htmlFor="confirmPassword">Confirm New Password</Label>
                      <Input
                        id="confirmPassword"
                        type={showPassword ? 'text' : 'password'}
                        value={passwordForm.confirmPassword}
                        onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        placeholder="Confirm new password"
                        autoComplete="new-password"
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={changingPassword}>
                      {changingPassword ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Changing Password...
                        </>
                      ) : (
                        <>
                          <Key className="h-4 w-4 mr-2" />
                          Change Password
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  )
}