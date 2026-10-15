'use client';

import React from 'react';
import {
  DraggableDialog,
  DraggableDialogContent,
  DraggableDialogHeader,
  DraggableDialogTitle,
} from '@/components/ui/draggable-dialog';
import TaskDetails from '@/components/TaskDetails';
import { Eye } from 'lucide-react';

/**
 * TaskDetailsModal - DRAGGABLE VERSION
 * 
 * A draggable modal wrapper for TaskDetails component.
 * Used when clicking "View Details" from the task table.
 * 
 * Features:
 * - Draggable by title bar (left or right mouse button)
 * - Modern modal with backdrop (lighter so background remains visible)
 * - Smooth animations
 * - Responsive design
 */

interface TaskDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: number | null;
  task?: any;
}

const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({ 
  open, 
  onOpenChange, 
  taskId,
  task 
}) => {
  return (
    <DraggableDialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto" showMaximize>
        <DraggableDialogHeader className="bg-gradient-to-r from-gray-50 via-white to-gray-50">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-full">
              <Eye className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <DraggableDialogTitle className="text-xl font-semibold text-gray-900">
                Task Details {taskId ? `TC-${taskId}` : ''}
              </DraggableDialogTitle>
              <p className="text-sm text-gray-500 mt-1">Drag this window by the title bar to move it</p>
            </div>
          </div>
        </DraggableDialogHeader>

        <div className="p-2">
          {taskId ? (
            <TaskDetails taskId={taskId} task={task} />
          ) : (
            <div className="flex items-center justify-center py-8 text-gray-500">
              No task selected
            </div>
          )}
        </div>
      </DraggableDialogContent>
    </DraggableDialog>
  );
};

export default TaskDetailsModal;