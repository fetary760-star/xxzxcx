import React from 'react'
import TaskDetails from '@/components/TaskDetails' // adjust path if your TaskDetails file is elsewhere

type Props = {
  params: Promise<{ id: string }>
}

/**
 * Server Component page for the app router that simply renders the client TaskDetails component.
 * Your existing TaskDetails (use-client) handles data loading, attachments, upload, and UI logic.
 *
 * If your TaskDetails file path differs, update the import above.
 */
export default async function Page({ params }: Props) {
  const { id } = await params;
  const taskId = Number(id ?? 0)

  // Minimal wrapper: pass the taskId into your client component.
  // Your client component will fetch task details / attachments / comments itself.
  return <TaskDetails taskId={taskId} />
}