'use client'

import { MainLayout } from '@/components/layout/main-layout'
import CreateTaskForm from '@/components/CreateTaskForm'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'

function normalizeRole(raw: any): string {
  if (raw === undefined || raw === null) return ''
  if (typeof raw === 'number') return String(raw)
  return String(raw).toLowerCase().trim().replace(/[\s\-\_]+/g, '_')
}

export default function CreateTaskPage() {
  const { user } = useAuth()
  const router = useRouter()
  
  // Determine if user can assign engineers (only team_leader and director)
  const role = normalizeRole(user?.role ?? user?.role_name ?? user?.roleName ?? '')
  const canAssign = role === 'team_leader' || role === 'director' || role === '0' || role === '1'

  const handleTaskCreated = (task: any) => {
    // Redirect to dashboard after task creation
    router.push('/dashboard')
  }

  const handleClose = () => {
    // Go back to previous page or dashboard
    router.back()
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <img
            src="https://cdn.imgbin.com/18/13/16/imgbin-ethiopian-airlines-flight-logo-business-business-6fvk0fGfDtxUuLSkpNq6weQLi.jpg"
            alt="Ethiopian Airlines"
            className="h-8 w-auto"
          />
          <h1 className="text-2xl font-bold">Create New Task</h1>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <CreateTaskForm 
            onClose={handleClose}
            onTaskCreated={handleTaskCreated}
            canAssign={canAssign}
          />
        </div>
      </div>
    </MainLayout>
  )
}