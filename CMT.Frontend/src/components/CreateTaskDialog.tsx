'use client'

import React from 'react'
import CreateTaskForm from '@/components/CreateTaskForm'

interface CreateTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onTaskCreated?: (task: any) => void
}

/**
 * CreateTaskDialog - Wrapper component for CreateTaskForm
 * 
 * This component provides a simple interface that matches the expected
 * Dialog-style API while delegating to the actual CreateTaskForm component.
 */
const CreateTaskDialog: React.FC<CreateTaskDialogProps> = ({
  open,
  onOpenChange,
  onTaskCreated
}) => {
  // Determine if user can assign engineers based on their role
  const canAssign = true // This will be determined by CreateTaskForm based on auth context

  if (!open) {
    return null
  }

  return (
    <CreateTaskForm
      onClose={() => onOpenChange(false)}
      onTaskCreated={onTaskCreated}
      canAssign={canAssign}
    />
  )
}

export default CreateTaskDialog