/**
 * FileUploadPanel Component - AMENDED
 * 
 * Provides file upload integration per form node.
 * Users can upload files to specific child items within an ATA.
 * Shows uploaded files with approval status.
 */
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import {
  Upload, Trash2, Download, Loader2, Paperclip,
  CheckCircle2, XCircle, Lock, KeyRound, ShieldCheck
} from 'lucide-react'
import {
  uploadFile, getFilesByForm, getFilesByATARecord, deleteFile, approveFile, rejectFile,
  getFormSubmissionById, listUploadGrants, createUploadGrant, revokeUploadGrant,
  getUsers, ApiError
} from '@/lib/self-evaluation/api'
import type {
  FileAttachmentResponse, UploadGrantResponse, UploadFileResult, UserDto
} from '@/lib/self-evaluation/api'
import {
  ApprovalStatus, getApprovalStatusLabel, getApprovalStatusColor, isTerminalStatus
} from '@/lib/self-evaluation/types'
import { useAuth } from '@/lib/auth-context'
import { normalizeRole } from '@/lib/role-utils'
import { useToast } from '@/hooks/use-toast'
import { useFormUploadStatus } from './FormUploadStatusContext'

interface Props {
  ataRecordId: string
  formSubmissionId?: string
  formNodeType?: string
  canUpload?: boolean
  canApproveFiles?: boolean
  /**
   * v13: the owning form's approval status. When omitted the panel fetches it
   * from GET /forms/{id} so the completion-lock banner is server-authoritative.
   */
  formApprovalStatus?: number
}

/** Shape of any transport failure carrying a structured `{ code, message }` body. */
type ApiErrorLike = { code?: string | null; message?: string }

/**
 * Narrows a thrown value to `{ code, message }`.
 *
 * The `typeof ApiError === 'function'` guard is required: if the export is ever
 * missing or the module graph is partially evaluated, `ApiError` is `undefined`
 * and a bare `err instanceof ApiError` throws
 * "Right-hand side of 'instanceof' is not an object".
 */
function isApiErrorLike(err: unknown): err is ApiErrorLike {
  if (typeof ApiError === 'function' && err instanceof ApiError) return true
  return !!err && typeof err === 'object' && ('code' in err || 'message' in err)
}

/** Maps a structured v13 denial code to a user-facing explanation. */
function describeError(err: unknown, fallback: string): string {
  if (isApiErrorLike(err)) {
    switch (err.code) {
      case 'CompletedFormLocked':
        return 'This form is completed — uploads are locked. An Admin must grant a time-boxed upload privilege (Admins may upload directly via break-glass).'
      case 'NoActiveGrant':
        return 'Uploads are locked and you have no active Admin grant for this form.'
      case 'GrantExpired':
        return 'Your upload grant for this form has expired. Ask an Admin to issue a new one.'
      case 'AdminOnly':
        return 'Only an Admin can perform this upload-grant operation.'
      case 'NotAuthenticated':
      case 'UserNotFound':
        return 'Your session could not be resolved. Please sign in again.'
      default:
        return err.code ? `${err.code}: ${err.message}` : (err.message || fallback)
    }
  }
  return err instanceof Error && err.message ? err.message : fallback
}

function formatExpires(iso: string | null | undefined): string {
  if (!iso) return 'no expiry cap'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

export default function FileUploadPanel({
  ataRecordId,
  formSubmissionId,
  formNodeType,
  canUpload = true,
  canApproveFiles = false,
  formApprovalStatus,
}: Props) {
  const { user } = useAuth()
  const { toast } = useToast()
  const onFilesChanged = useFormUploadStatus()
  const isAdmin = normalizeRole(user?.role) === 'admin'
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<FileAttachmentResponse[]>([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)

  // ===== v13: completion-lock + Admin upload-grant state =====
  const [formStatus, setFormStatus] = useState<number | undefined>(formApprovalStatus)
  const [grants, setGrants] = useState<UploadGrantResponse[]>([])
  const [showGrantDialog, setShowGrantDialog] = useState(false)
  const [grantUserId, setGrantUserId] = useState('')
  const [grantReason, setGrantReason] = useState('')
  const [grantExpires, setGrantExpires] = useState('')
  const [availableUsers, setAvailableUsers] = useState<UserDto[]>([])
  const [grantBusy, setGrantBusy] = useState(false)

  useEffect(() => {
    loadFiles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ataRecordId, formSubmissionId])

  useEffect(() => {
    if (formApprovalStatus !== undefined) setFormStatus(formApprovalStatus)
  }, [formApprovalStatus])

  // When the caller does not pass the status, ask the backend — the server is
  // the only authority on whether the form is completed/locked.
  useEffect(() => {
    if (!formSubmissionId || formStatus !== undefined) return
    let cancelled = false
    getFormSubmissionById(formSubmissionId)
      .then(f => { if (!cancelled && f) setFormStatus(f.approvalStatus) })
      .catch(() => { /* the upload attempt will surface the real error */ })
    return () => { cancelled = true }
  }, [formSubmissionId, formStatus])

  const loadGrants = useCallback(async () => {
    if (!formSubmissionId) { setGrants([]); return }
    try {
      setGrants(await listUploadGrants(formSubmissionId))
    } catch {
      setGrants([])
    }
  }, [formSubmissionId])

  useEffect(() => {
    loadGrants()
  }, [loadGrants])

  const locked =
    !!formSubmissionId &&
    formStatus !== undefined &&
    isTerminalStatus(formStatus as ApprovalStatus)

  const myUserId = Number(user?.userId ?? user?.id ?? 0)
  const nowMs = Date.now()
  const myGrant = locked
    ? grants.find(g =>
        g.isActive &&
        g.forUserId === myUserId &&
        (!g.expiresAt || new Date(g.expiresAt).getTime() > nowMs))
    : undefined

  // A locked form is still uploadable for an Admin (break-glass) or for the
  // holder of an active grant; everyone else is blocked client-side too so the
  // button does not invite a guaranteed 403.
  const uploadsAllowed = canUpload && (!locked || isAdmin || !!myGrant)

  const loadFiles = async () => {
    setLoading(true)
    try {
      let data: FileAttachmentResponse[]
      if (formSubmissionId) {
        data = await getFilesByForm(formSubmissionId)
      } else {
        data = await getFilesByATARecord(ataRecordId)
      }
      // v13: the backend attachment field is `formType` (was wrongly read as
      // `formNodeType`, which was always undefined).
      if (formNodeType) {
        data = data.filter(f => f.formType === formNodeType || !f.formType)
      }
      setFiles(data)
      onFilesChanged?.(data.length > 0)
    } catch (err) {
      console.error('Failed to load files:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files
    if (!selectedFiles || selectedFiles.length === 0) return

    // v13: never invite a guaranteed 403 — block a locked upload client-side for
    // anyone without break-glass or an active grant, then re-sync server state.
    if (locked && !uploadsAllowed) {
      toast({
        title: 'Uploads Locked',
        description: 'This form is completed. Ask an Admin for an upload grant before attaching more files.',
        variant: 'destructive',
      })
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setUploading(true)
    try {
      let lastResult: UploadFileResult | null = null
      for (let i = 0; i < selectedFiles.length; i++) {
        const formData = new FormData()
        formData.append('file', selectedFiles[i])
        formData.append('ataRecordId', ataRecordId)
        if (formSubmissionId) {
          formData.append('formSubmissionId', formSubmissionId)
        }
        if (formNodeType) {
          // v13: the controller binds [FromForm] string? formType (was wrongly
          // sent as formNodeType and silently dropped, leaving FormType empty).
          formData.append('formType', formNodeType)
        }
        lastResult = await uploadFile(formData)
      }
      const description = lastResult?.adminBreakGlass
        ? 'Uploaded via Admin break-glass on a completed form.'
        : lastResult?.grantExpiresAt
          ? `Uploaded under an Admin grant (expires ${formatExpires(lastResult.grantExpiresAt)}).`
          : `${selectedFiles.length} file(s) uploaded successfully.`
      toast({ title: 'Uploaded', description })
      await loadFiles()
    } catch (err) {
      toast({ title: 'Upload Failed', description: describeError(err, 'Failed to upload file'), variant: 'destructive' })
      // Re-read so the banner / grant list reflect the server's authoritative state.
      loadFiles()
      loadGrants()
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDelete = async (fileId: string) => {
    try {
      await deleteFile(fileId)
      const remainingFiles = files.filter(file => file.id !== fileId)
      setFiles(remainingFiles)
      onFilesChanged?.(remainingFiles.length > 0)
      toast({ title: 'Deleted', description: 'File removed successfully.' })
    } catch (err) {
      toast({ title: 'Error', description: describeError(err, 'Failed to delete file'), variant: 'destructive' })
    }
  }

  const handleApproveFile = async (fileId: string) => {
    try {
      await approveFile(fileId, { comments: 'Approved' })
      loadFiles()
      toast({ title: 'Approved', description: 'File approved successfully.' })
    } catch (err) {
      toast({ title: 'Error', description: describeError(err, 'Failed to approve file'), variant: 'destructive' })
    }
  }

  const handleRejectFile = async (fileId: string) => {
    try {
      await rejectFile(fileId, { reason: 'Does not meet requirements' })
      loadFiles()
      toast({ title: 'Rejected', description: 'File rejected.' })
    } catch (err) {
      toast({ title: 'Error', description: describeError(err, 'Failed to reject file'), variant: 'destructive' })
    }
  }

  // ===== Admin grant management (v13) =====
  const openGrantDialog = async () => {
    setShowGrantDialog(true)
    try {
      const users = await getUsers()
      setAvailableUsers(users.filter(u => u.isActive))
    } catch {
      setAvailableUsers([])
    }
  }

  const handleGrant = async () => {
    if (!formSubmissionId) return
    if (!grantUserId) {
      toast({ title: 'Required', description: 'Select the user to grant the upload privilege to.', variant: 'destructive' })
      return
    }
    if (!grantReason.trim()) {
      toast({ title: 'Required', description: 'A reason is mandatory — it is written to the audit trail.', variant: 'destructive' })
      return
    }
    setGrantBusy(true)
    try {
      const grant = await createUploadGrant(formSubmissionId, {
        forUserId: Number(grantUserId),
        reason: grantReason.trim(),
        expiresAt: grantExpires ? new Date(grantExpires).toISOString() : null,
      })
      toast({
        title: 'Upload Privilege Granted',
        description: `${grant.forUserName} may upload until ${formatExpires(grant.expiresAt)}.`,
      })
      setShowGrantDialog(false)
      setGrantUserId('')
      setGrantReason('')
      setGrantExpires('')
      loadGrants()
    } catch (err) {
      toast({ title: 'Grant Failed', description: describeError(err, 'Failed to create the upload grant.'), variant: 'destructive' })
    } finally {
      setGrantBusy(false)
    }
  }

  const handleRevoke = async (grant: UploadGrantResponse) => {
    try {
      await revokeUploadGrant(grant.id, { reason: 'Revoked from the attachments panel.' })
      toast({ title: 'Grant Revoked', description: `${grant.forUserName} can no longer upload to this form.` })
      loadGrants()
    } catch (err) {
      toast({ title: 'Revoke Failed', description: describeError(err, 'Failed to revoke the upload grant.'), variant: 'destructive' })
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFileIcon = (contentType: string) => {
    if (contentType.includes('pdf')) return '📄'
    if (contentType.includes('image')) return '🖼️'
    if (contentType.includes('word') || contentType.includes('document')) return '📝'
    if (contentType.includes('excel') || contentType.includes('spreadsheet')) return '📊'
    return '📎'
  }

  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm text-slate-800">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-100 text-blue-700">
              <Paperclip className="h-4 w-4" />
            </span>
            <span>Attachments</span>
            {files.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">{files.length} {files.length === 1 ? 'file' : 'files'}</Badge>
            )}
          </CardTitle>
          {uploadsAllowed && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleUpload}
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif"
              />
              <Button
                size="sm"
                variant="outline"
                className={locked ? 'border-amber-400 text-amber-700 hover:bg-amber-50' : 'border-blue-200 text-blue-700 hover:bg-blue-50'}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : locked ? (
                  <Lock className="h-3.5 w-3.5 mr-1" />
                ) : (
                  <Upload className="h-3.5 w-3.5 mr-1" />
                )}
                {uploading ? 'Uploading...' : locked ? 'Upload (locked form)' : 'Upload'}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4 py-4">
        {/* ===== v13 completion-lock banner ===== */}
        {locked && (
          <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2">
              <Lock className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs">
                <p className="font-semibold text-amber-800">Uploads locked — the form is completed.</p>
                {isAdmin ? (
                  <p className="text-amber-700 mt-0.5 flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Admin break-glass is active: you may upload directly or grant a time-boxed privilege.
                  </p>
                ) : myGrant ? (
                  <p className="text-amber-700 mt-0.5">
                    You hold an active Admin upload grant until {formatExpires(myGrant.expiresAt)}.
                  </p>
                ) : (
                  <p className="text-amber-700 mt-0.5">
                    Ask an Admin to grant you a time-boxed upload privilege before attaching more files.
                  </p>
                )}
              </div>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto border-amber-400 text-amber-700 hover:bg-amber-100 flex-shrink-0"
                  onClick={openGrantDialog}
                >
                  <KeyRound className="h-3.5 w-3.5 mr-1" />
                  Manage Grants
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ===== Admin: active grants audit list ===== */}
        {isAdmin && grants.length > 0 && (
          <div className="mb-3 space-y-1">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Active Upload Grants</p>
            {grants.map(g => (
              <div key={g.id} className="flex items-center gap-2 p-2 bg-gray-50 border rounded-md text-xs">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">
                    {g.forUserName}
                    <span className={`ml-2 px-1 py-0.5 rounded text-[9px] ${g.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'}`}>
                      {g.isActive ? 'active' : 'revoked'}
                    </span>
                  </p>
                  <p className="text-gray-500 truncate">
                    expires {formatExpires(g.expiresAt)} — {g.reason}
                  </p>
                </div>
                {g.isActive && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-red-400 hover:text-red-600"
                    title="Revoke grant"
                    onClick={() => handleRevoke(g)}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div className="rounded-md border border-slate-100 bg-slate-50/50 py-5 text-center text-xs text-slate-500">Loading files...</div>
        ) : files.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50/40 px-4 py-5 text-center text-xs text-slate-500">
            <Paperclip className="mx-auto mb-2 h-5 w-5 text-slate-300" />
            <p className="font-medium text-slate-600">No files attached yet.</p>
            {uploadsAllowed && <p className="mt-1 text-slate-400">Use Upload to add supporting documents.</p>}
          </div>
        ) : (
          <div className="space-y-2">
            {files.map(file => (
              <div
                key={file.id}
                className="flex items-center gap-3 p-2 bg-gray-50 rounded-md border text-xs hover:bg-gray-100 transition-colors"
              >
                <span className="text-base flex-shrink-0">{getFileIcon(file.contentType)}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">{file.fileName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-gray-400">{formatFileSize(file.fileSizeBytes)}</span>
                    <Badge className={`${getApprovalStatusColor(file.approvalStatus as ApprovalStatus)} text-[9px] px-1 py-0`}>
                      {getApprovalStatusLabel(file.approvalStatus as ApprovalStatus)}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {canApproveFiles && file.approvalStatus === ApprovalStatus.PendingTeamLeaderReview && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-green-600 hover:text-green-700"
                        onClick={() => handleApproveFile(file.id)}
                        title="Approve"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-red-500 hover:text-red-600"
                        onClick={() => handleRejectFile(file.id)}
                        title="Reject"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-gray-500 hover:text-gray-700"
                    title="Download"
                    onClick={() => window.open(`/api/self-evaluation/files/${file.id}/download`, '_blank')}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  {canUpload && file.approvalStatus === ApprovalStatus.Draft && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-red-400 hover:text-red-600"
                      onClick={() => handleDelete(file.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* ===== Admin grant dialog (v13) ===== */}
      <Dialog open={showGrantDialog} onOpenChange={setShowGrantDialog}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-amber-500" />
              Grant Upload Privilege
            </DialogTitle>
            <DialogDescription>
              Time-boxed, revocable, and written to the audit trail. The backend caps the
              window at 7 days and defaults to 72 hours when no expiry is given.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Grant To *</Label>
              <Select value={grantUserId} onValueChange={setGrantUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user..." />
                </SelectTrigger>
                <SelectContent className="z-[110]">
                  {availableUsers.map(u => (
                    <SelectItem key={u.id} value={String(u.userId)}>
                      {u.fullName} ({u.roleDisplayName || u.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Reason * (mandatory)</Label>
              <Textarea
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
                placeholder="Why is the completion lock being lifted for this user?"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Expires At (optional)</Label>
              <Input
                type="datetime-local"
                value={grantExpires}
                onChange={(e) => setGrantExpires(e.target.value)}
              />
              <p className="text-[10px] text-gray-400">Leave empty for the backend default (72 hours).</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowGrantDialog(false); setGrantUserId(''); setGrantReason(''); setGrantExpires('') }}>
              Cancel
            </Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleGrant} disabled={grantBusy}>
              {grantBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Grant Privilege
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}