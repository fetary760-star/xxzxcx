'use client'

import React, { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { getCsrfToken } from '@/lib/csrf'
import {
  AlertCircle,
  Building,
  ClipboardCheck,
  ClipboardList,
  Clock,
  HelpCircle,
  Mail,
  Phone,
  PlayCircle,
  Search,
  Send,
  Settings,
  User,
  Users,
  FileText,
  Video,
  ExternalLink,
  BookOpen,
  MessageSquare,
  PhoneCall
} from 'lucide-react'
import { toast } from 'sonner'

interface HelpSection {
  title: string
  icon: string
  articles: HelpArticle[]
}
interface HelpArticle {
  title: string
  content: string
}
interface HelpContent {
  userRole: string
  sections: HelpSection[]
  contactInfo: ContactInfo
  systemInfo: SystemInfo
}
interface ContactInfo {
  supportEmail: string
  supportPhone: string
  helpDeskHours: string
  emergencyContact: string
}
interface SystemInfo {
  version: string
  lastUpdated: string
  supportedBrowsers: string[]
}

export default function HelpPage() {
  const { user } = useAuth()
  const [helpContent, setHelpContent] = useState<HelpContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [feedbackForm, setFeedbackForm] = useState({
    type: 'general',
    subject: '',
    message: '',
    priority: 'normal'
  })
  const [submittingFeedback, setSubmittingFeedback] = useState(false)

  useEffect(() => {
    loadHelpContent()
  }, [])

  const loadHelpContent = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/help', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Accept': 'application/json',
        },
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error(`Failed to load help content: ${response.status}`)
      }
      const data = await response.json()
      setHelpContent(data)
      setError(null)
    } catch (err: any) {
      console.error('Failed to load help content:', err)
      setError('Failed to load help content. Please try again later.')
    } finally {
      setLoading(false)
    }
  }

  const submitFeedback = async () => {
    if (!feedbackForm.subject.trim() || !feedbackForm.message.trim()) {
      toast.error('Please fill in both subject and message')
      return
    }
    try {
      setSubmittingFeedback(true)
      const csrfToken = await getCsrfToken()
      const response = await fetch('/api/help/feedback', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify(feedbackForm)
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to submit feedback')
      }
      const data = await response.json()
      toast.success(`Feedback submitted successfully. Ticket ID: ${data.ticketId || 'N/A'}`)
      setFeedbackForm({ type: 'general', subject: '', message: '', priority: 'normal' })
    } catch (err: any) {
      console.error('Failed to submit feedback:', err)
      toast.error(err.message || 'Failed to submit feedback. Please try again.')
    } finally {
      setSubmittingFeedback(false)
    }
  }

  const getIconComponent = (iconName: string) => {
    const icons: Record<string, any> = {
      'play-circle': PlayCircle,
      'clipboard-list': ClipboardList,
      'users': Users,
      'clipboard-check': ClipboardCheck,
      'user': User,
      'building': Building,
      'alert-circle': AlertCircle,
      'settings': Settings
    }
    return icons[iconName] || HelpCircle
  }

  // Filter sections by category AND search term
  const filteredSections = helpContent?.sections
    .filter(section => {
      if (selectedCategory !== 'all' && !section.title.toLowerCase().includes(selectedCategory.toLowerCase())) {
        return false
      }
      if (searchTerm.trim()) {
        const searchLower = searchTerm.toLowerCase()
        const sectionMatches = section.title.toLowerCase().includes(searchLower)
        const articleMatches = section.articles.some(article =>
          article.title.toLowerCase().includes(searchLower) ||
          article.content.toLowerCase().includes(searchLower)
        )
        return sectionMatches || articleMatches
      }
      return true
    })
    .map(section => {
      if (searchTerm.trim()) {
        const searchLower = searchTerm.toLowerCase()
        return {
          ...section,
          articles: section.articles.filter(article =>
            article.title.toLowerCase().includes(searchLower) ||
            article.content.toLowerCase().includes(searchLower)
          )
        }
      }
      return section
    })
    .filter(section => section.articles.length > 0) || []

  const categories = [
    {
      id: 'all',
      name: 'All Topics',
      icon: HelpCircle,
      description: 'Browse all available help topics'
    },
    {
      id: 'getting started',
      name: 'Getting Started',
      icon: PlayCircle,
      description: 'Learn the basics of using the CMT Task Management System'
    },
    {
      id: 'task',
      name: 'Task Management',
      icon: ClipboardList,
      description: 'Create, update, and manage engineering tasks'
    },
    {
      id: 'user',
      name: 'User Management',
      icon: Users,
      description: 'Manage users, roles, and permissions'
    },
    {
      id: 'profile',
      name: 'Profile & Settings',
      icon: User,
      description: 'Update your profile and customize settings'
    },
    {
      id: 'shop',
      name: 'Shop Management',
      icon: Building,
      description: 'Manage shops, locations, and assignments'
    },
    {
      id: 'troubleshooting',
      name: 'Troubleshooting',
      icon: Settings,
      description: 'Resolve common issues and errors'
    }
  ]

  // Reference Material URLs
  const trainingDocumentsUrl = 'https://portal.ethiopianairlines.com/default/Ops/MRO/Comp_Maint/Com_MaintSup/Production/Shared%20Documents/WEEKLY%20PERFORMANCE%20REPORT/AVIONICS_WEEKLY_PERFORMANCE_REPORT/CMT%20Eng%20Task%20Management/CMT%20Eng%20Task%20Management%E2%80%94%20User%20Manual%20v1.0.0.html'
  const videoTutorialsUrl = 'https://portal.ethiopianairlines.com/default/Ops/MRO/Comp_Maint/Com_MaintSup/Production/Shared%20Documents/WEEKLY%20PERFORMANCE%20REPORT/AVIONICS_WEEKLY_PERFORMANCE_REPORT/CMT%20Eng%20Task%20Management/CMT%20Eng%20Task%20Management.mp4'
  const technicalDocumentUrl = 'https://portal.ethiopianairlines.com/default/Ops/MRO/Comp_Maint/Com_MaintSup/Production/Shared%20Documents/WEEKLY%20PERFORMANCE%20REPORT/AVIONICS_WEEKLY_PERFORMANCE_REPORT/CMT%20Eng%20Task%20Management/CMT%20Eng%20Task%20Management%20system.html'

  if (loading) {
    return (
      <MainLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading help content...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (error || !helpContent) {
    return (
      <MainLayout>
        <div className="rounded-md bg-red-50 p-4">
          <div className="text-sm text-red-700">{error || 'Failed to load help content'}</div>
          <Button onClick={loadHelpContent} className="mt-2" variant="outline" size="sm">
            Try Again
          </Button>
        </div>
      </MainLayout>
    )
  }

  // 🟢 -- New: Modernized quick contacts array for side card
  const quickContacts = [
    {
      name: 'Sintayehu Hailu',
      role: 'Primary Support',
      items: [
        {
          type: 'email',
          label: 'Email',
          value: 'SintayehuH@ethiopianairlines.com',
          icon: Mail,
          href: 'mailto:SintayehuH@ethiopianairlines.com'
        },
        {
          type: 'teams',
          label: 'MS Teams',
          value: 'MS Teams',
          icon: MessageSquare,
          href: undefined
        },
        {
          type: 'internal-phone',
          label: 'Extension',
          value: '3387',
          icon: PhoneCall,
        }
      ]
    },
    {
      name: 'Sintayehu Hailu',
      role: 'Secondary Support',
      items: [
        {
          type: 'email',
          label: 'Email',
          value: 'adeyanos@gmail.com',
          icon: Mail,
          href: 'mailto:adeyanos@gmail.com'
        },
        
        {
          type: 'mobile',
          label: 'Mobile',
          value: '+251-912-67-46-68',
          icon: PhoneCall,
        },
        {
          type: 'hours',
          label: 'Support Hours',
          value: 'Mon-Fri 08:00 - 11:00',
          icon: Clock,
        },
      ]
    },
  ]

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Help & Support</h1>
            <p className="text-gray-600 mt-1">
              Find answers, get support, and learn how to use the system effectively
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Browse Topics</CardTitle>
                <CardDescription className="text-sm">
                  Select a category to view related help articles
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {categories.map(category => {
                  const Icon = category.icon
                  const isActive = selectedCategory === category.id
                  return (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      className={`w-full text-left flex items-start gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'hover:bg-gray-50 border border-transparent'
                      }`}
                    >
                      <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{category.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                          {category.description}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </CardContent>
            </Card>

            {/* Reference Materials Section */}
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Reference Materials
                </CardTitle>
                <CardDescription className="text-sm">
                  Access training documents, technical docs, and video tutorials
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm text-gray-600 mb-3">
                  Browse comprehensive guides, PDFs, technical documents, and video tutorials to help you understand how to create, assign, and follow up on tasks.
                </div>
                <a
                  href={trainingDocumentsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 px-4 py-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-blue-900">
                        Training Documents
                      </div>
                      <div className="text-xs text-blue-700">
                        PDFs and guides
                      </div>
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-blue-600 group-hover:translate-x-0.5 transition-transform" />
                </a>
                <a
                  href={videoTutorialsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 px-4 py-3 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      <Video className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-purple-900">
                        Video Tutorials
                      </div>
                      <div className="text-xs text-purple-700">
                        Step-by-step guides
                      </div>
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-purple-600 group-hover:translate-x-0.5 transition-transform" />
                </a>
                <a
                  href={technicalDocumentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 px-4 py-3 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      <FileText className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-green-900">
                        Technical Document
                      </div>
                      <div className="text-xs text-green-700">
                        CMT Eng Task Management
                      </div>
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-green-600 group-hover:translate-x-0.5 transition-transform" />
                </a>
                <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="text-xs text-gray-600">
                    <strong>Note:</strong> These materials are hosted externally. You may need to authenticate with your corporate credentials.
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Modernized Quick Contact */}
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-lg">Need More Help?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-gray-600 mb-1">
                  Can't find what you're looking for? Contact directly.
                </div>
                {/* Beautifully separated contact blocks */}
                {quickContacts.map((contact, idx) => (
                  <div
                    key={idx}
                    className={`rounded-lg border p-4 transition-all ${
                      idx === 0 ? 'bg-green-700/90 text-white/95 border-green-600 shadow-sm' : 'bg-green-700/80 text-white/95 border-green-500'
                    }`}
                  >
                    <div className="flex items-center space-x-2 font-semibold mb-2">
                      <User className="h-4 w-4" />
                      <span>{contact.name}</span>
                      <span className="text-xs font-normal opacity-80">({contact.role})</span>
                    </div>
                    <div className="space-y-1">
                      {contact.items.map((item, i) => (
                        <div key={i} className="flex items-center text-sm">
                          {item.icon && <item.icon className="h-4 w-4 mr-1" />}
                          {item.href ? (
                            <a
                              href={item.href}
                              className="underline hover:text-gray-100"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {item.value}
                            </a>
                          ) : (
                            <span>{item.value}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            <Card>
              <CardContent className="pt-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search help articles..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {searchTerm && (
                  <div className="mt-2 text-sm text-gray-600">
                    Found {filteredSections.reduce((acc, section) => acc + section.articles.length, 0)} articles matching "{searchTerm}"
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Help Sections */}
            <div className="space-y-4">
              {filteredSections.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No articles found</h3>
                    <p className="text-gray-600">
                      Try adjusting your search terms or browse different categories.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                filteredSections.map((section, idx) => {
                  const Icon = getIconComponent(section.icon)
                  return (
                    <Card key={idx}>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Icon className="h-5 w-5" />
                          {section.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {section.articles.map((article, articleIdx) => (
                          <div key={articleIdx} className="border-b last:border-b-0 pb-3 last:pb-0">
                            <h4 className="font-medium text-gray-900 mb-1">{article.title}</h4>
                            <p className="text-sm text-gray-600">{article.content}</p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )
                })
              )}
            </div>

            {/* Contact Support */}
            <Card>
              <CardHeader>
                <CardTitle>Contact Support</CardTitle>
                <CardDescription>Send us a message and we'll get back to you as soon as possible</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="type">Type</Label>
                    <select
                      id="type"
                      value={feedbackForm.type}
                      onChange={(e) => setFeedbackForm(prev => ({ ...prev, type: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="general">General</option>
                      <option value="bug">Feedback</option>
                      <option value="feature">Feature Request</option>
                      <option value="support">Support</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="priority">Priority</Label>
                    <select
                      id="priority"
                      value={feedbackForm.priority}
                      onChange={(e) => setFeedbackForm(prev => ({ ...prev, priority: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    value={feedbackForm.subject}
                    onChange={(e) => setFeedbackForm(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="Brief description of your issue"
                  />
                </div>
                <div>
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    value={feedbackForm.message}
                    onChange={(e) => setFeedbackForm(prev => ({ ...prev, message: e.target.value }))}
                    placeholder="Describe your issue or question in detail..."
                    rows={4}
                  />
                </div>
                <Button onClick={submitFeedback} disabled={submittingFeedback}>
                  {submittingFeedback ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send Message
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card>
  <CardHeader>
    <CardTitle>Contact Information</CardTitle>
    <CardDescription>Reach out for support directly at the below address. Limited time only:</CardDescription>
  </CardHeader>
  <CardContent>
    <div className="rounded-lg border bg-green-700/80 text-white/95 border-green-500 p-4 transition-all shadow-sm">
      <div className="flex items-center space-x-2 font-semibold mb-1">
        <User className="h-4 w-4" />
        <span>Sintayehu Hailu</span>
        <span className="text-xs font-normal opacity-80">(Secondary Support)</span>
      </div>
      <div className="space-y-1 text-sm">
        <div className="flex items-center">
          <Mail className="h-4 w-4 mr-2" />
          <a
            href="mailto:adeyanos@gmail.com"
            className="underline hover:text-gray-100"
            target="_blank"
            rel="noopener noreferrer"
          >
            adeyanos@gmail.com
          </a>
        </div>
        <div className="flex items-center">
          <PhoneCall className="h-4 w-4 mr-2" />
          <span>+251-912-67-46-68</span>
        </div>
        <div className="flex items-center">
          <Clock className="h-4 w-4 mr-2" />
          <span>Mon-Fri 08:00 - 11:00</span>
        </div>
      </div>
    </div>
  </CardContent>
</Card>
            {/* System Information */}
            <Card>
              <CardHeader>
                <CardTitle>System Information</CardTitle>
                <CardDescription>Current system status and version information</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="font-medium text-gray-900">Version</div>
                    <div className="text-gray-600">{helpContent.systemInfo.version}</div>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">Status</div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-green-600">Operational</span>
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">Last Update</div>
                    <div className="text-gray-600">
                      {new Date(helpContent.systemInfo.lastUpdated).toLocaleDateString()}
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">Uptime</div>
                    <div className="text-gray-600">99.9%</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}