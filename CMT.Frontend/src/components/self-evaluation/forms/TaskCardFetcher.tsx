/**
 * TASK CARD tab — Documentation section
 *
 * Task Card counterpart of CapabilitySelfEvaluationForm (CMM REV. STATUS). It reads the
 * ATA and P/N of the selected ATA Record, searches MaintainX (Maintenix) for the matching
 * task definitions, and stores the "Preview Task Cards" PDF in this application, grouped
 * by Part Number.
 *
 * Reproduced MaintainX flow (executed server-side by MaintainXExternalService):
 *   1. login.jsp with the configured credentials
 *   2. Menu (#idMenuButton) → Shop Technician → Task Definition Search
 *   3. "Task Definition Code:" (aTaskCd) ← the ATA code shown below (editable)
 *   4. Search (#idButtonSearch)
 *   5. Pick the DTC-JIC entry from the Task Definition column
 *   6. Preview Task Cards → PDF → stored under this P/N
 */
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Code,
  Download,
  ExternalLink,
  FileText,
  Info,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'

// ===== Types (mirror TaskCardSearchResult / TaskCardDocumentDto) =====

interface TaskCardItem {
  taskDefinitionCode: string
  taskDefinitionName: string
  taskDefinitionUrl: string
  pdfUrl?: string
  fileName?: string
  revisionNumber?: string
  isDtcJic: boolean
}

interface TaskCardSearchResult {
  found: boolean
  partNumber?: string
  ataChapterCode?: string
  taskCode?: string
  items?: TaskCardItem[]
  primaryItem?: TaskCardItem | null
  errorMessage?: string
  searchSteps?: string[]
  rawHtmlSnippet?: string
}

interface TaskCardDocumentDto {
  id: string
  ataRecordId: string
  partNumber: string
  ataChapterCode: string
  taskCode: string
  taskDefinitionCode: string
  taskDefinitionName: string
  taskDefinitionUrl: string
  sourcePdfUrl: string
  sourceSystem: string
  fileName: string
  contentType: string
  fileSizeBytes: number
  revisionNumber: string
  version: number
  isLatest: boolean
  fetchedAt: string
  fetchedBy: string
  downloadUrl: string
}

interface TaskCardGroupDto {
  partNumber: string
  ataChapterCode: string
  documentCount: number
  documents: TaskCardDocumentDto[]
}

interface FetchTaskCardResponse {
  success: boolean
  alreadyStored?: boolean
  document?: TaskCardDocumentDto
  errorMessage?: string
  searchSteps?: string[]
  rawHtmlSnippet?: string
}

const PROXY_BASE = '/api/self-evaluation/taskcard-proxy'

// ===== API helpers =====

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text().catch(() => '')
  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const parsed = JSON.parse(text)
      message = parsed.errorMessage || parsed.message || message
    } catch {
      message = text || message
    }
    throw new Error(message)
  }
  return JSON.parse(text) as T
}

async function searchTaskCards(
  ataCode: string,
  partNumber: string,
  ataRecordId: string,
): Promise<TaskCardSearchResult> {
  const params = new URLSearchParams()
  if (ataCode) params.set('ataCode', ataCode)
  if (partNumber) params.set('partNumber', partNumber)
  if (ataRecordId) params.set('ataRecordId', ataRecordId)

  const response = await fetch(`${PROXY_BASE}/search?${params.toString()}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  return readJson<TaskCardSearchResult>(response)
}

async function loadStoredTaskCards(
  ataRecordId: string,
  partNumber: string,
): Promise<TaskCardGroupDto[]> {
  const params = new URLSearchParams()
  if (ataRecordId) params.set('ataRecordId', ataRecordId)
  else if (partNumber) params.set('partNumber', partNumber)

  const response = await fetch(`${PROXY_BASE}/documents?${params.toString()}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const data = await readJson<{ totalDocuments: number; groups: TaskCardGroupDto[] }>(response)
  return data.groups ?? []
}

async function fetchAndStoreTaskCard(payload: {
  ataRecordId: string
  ataCode: string
  partNumber: string
  taskDefinitionUrl?: string
  taskDefinitionCode?: string
  taskDefinitionName?: string
}): Promise<FetchTaskCardResponse> {
  const response = await fetch(`${PROXY_BASE}/fetch-and-store`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  })
  return readJson<FetchTaskCardResponse>(response)
}

// ===== Presentation helpers =====

function formatBytes(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDate(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

// ===== Component =====

export default function TaskCardFetcher() {
  const { selectedATARecord, selectedComponent, selectedATAChapter } = useSelfEvaluation()

  const ataRecordId = selectedATARecord?.id || ''

  const recordAta = useMemo(
    () =>
      selectedATARecord?.ataChapter ||
      selectedATARecord?.ataChapterNumber ||
      selectedATARecord?.ataChapterCode ||
      selectedATAChapter?.chapterNumber ||
      selectedComponent?.ataChapterNumber ||
      '',
    [selectedATARecord, selectedATAChapter, selectedComponent],
  )

  const partNumber = useMemo(
    () => selectedATARecord?.partNumber || selectedComponent?.partNumber || '',
    [selectedATARecord, selectedComponent],
  )

  // Editable "Task Definition Code:" box, pre-filled from the CMM Revision tab data.
  const [ataCodeInput, setAtaCodeInput] = useState(recordAta)
  const [searching, setSearching] = useState(false)
  const [searchResult, setSearchResult] = useState<TaskCardSearchResult | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [groups, setGroups] = useState<TaskCardGroupDto[]>([])
  const [loadingStored, setLoadingStored] = useState(false)
  const [storingKey, setStoringKey] = useState<string | null>(null)
  const [storeMessage, setStoreMessage] = useState<string | null>(null)
  const [storeError, setStoreError] = useState<string | null>(null)

  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [showRawHtml, setShowRawHtml] = useState(false)

  const autoRunRef = useRef<string | null>(null)

  useEffect(() => {
    setAtaCodeInput(recordAta)
  }, [recordAta])

  const refreshStored = useCallback(async () => {
    if (!ataRecordId && !partNumber) return
    setLoadingStored(true)
    try {
      setGroups(await loadStoredTaskCards(ataRecordId, partNumber))
    } catch (err: any) {
      setStoreError(err?.message || 'Failed to load stored task cards.')
    } finally {
      setLoadingStored(false)
    }
  }, [ataRecordId, partNumber])

  const runSearch = useCallback(
    async (code: string) => {
      if (!code.trim()) {
        setSearchError('Enter an ATA / Task Definition Code (e.g. 25-35-10 or 253510).')
        return
      }

      setSearching(true)
      setSearchError(null)
      setSearchResult(null)
      setStoreMessage(null)
      setStoreError(null)
      setShowDiagnostics(false)
      setShowRawHtml(false)

      try {
        setSearchResult(await searchTaskCards(code.trim(), partNumber, ataRecordId))
      } catch (err: any) {
        setSearchError(err?.message || 'Failed to search task cards in MaintainX.')
      } finally {
        setSearching(false)
      }
    },
    [ataRecordId, partNumber],
  )

  // On opening the tab: show what is already stored, then search MaintainX once.
  useEffect(() => {
    const key = ataRecordId || partNumber
    if (!key) return
    if (autoRunRef.current === key) return
    autoRunRef.current = key

    void refreshStored()
    if (recordAta) void runSearch(recordAta)
  }, [ataRecordId, partNumber, recordAta, refreshStored, runSearch])

  const handleStore = async (item?: TaskCardItem) => {
    if (!ataRecordId) {
      setStoreError('Select an ATA Record first — task cards are filed under its P/N.')
      return
    }

    const key = item?.taskDefinitionUrl || 'primary'
    setStoringKey(key)
    setStoreError(null)
    setStoreMessage(null)

    try {
      const data = await fetchAndStoreTaskCard({
        ataRecordId,
        ataCode: ataCodeInput.trim() || recordAta,
        partNumber,
        taskDefinitionUrl: item?.taskDefinitionUrl,
        taskDefinitionCode: item?.taskDefinitionCode,
        taskDefinitionName: item?.taskDefinitionName,
      })

      if (!data.success) {
        setStoreError(data.errorMessage || 'MaintainX did not return a task card PDF.')
        if (data.searchSteps?.length) {
          setSearchResult(prev => ({
            found: prev?.found ?? false,
            items: prev?.items,
            primaryItem: prev?.primaryItem,
            searchSteps: data.searchSteps,
            rawHtmlSnippet: data.rawHtmlSnippet,
            errorMessage: data.errorMessage,
          }))
        }
        return
      }

      setStoreMessage(
        data.alreadyStored
          ? `Task card ${data.document?.taskDefinitionCode} is already stored and unchanged (v${data.document?.version}).`
          : `Task card ${data.document?.taskDefinitionCode} stored under P/N ${data.document?.partNumber} (v${data.document?.version}).`,
      )
      await refreshStored()
    } catch (err: any) {
      setStoreError(err?.message || 'Failed to fetch and store the task card.')
    } finally {
      setStoringKey(null)
    }
  }

  const items = searchResult?.items ?? []

  return (
    <div className="w-full space-y-4">
      {/* ============ MaintainX search panel ============ */}
      <Card className="shadow-none border border-indigo-100 bg-gradient-to-r from-indigo-50/50 to-blue-50/30">
        <CardHeader className="pb-2 px-4 pt-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-indigo-600" />
            TASK CARD (MaintainX)
          </CardTitle>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Logs in to MaintainX automatically → Shop Technician → Task Definition Search →
            DTC-JIC entry → Preview Task Cards, then stores the PDF under this P/N.
          </p>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-3">
          {/* ATA / P/N carried over from the CMM Revision tab data */}
          <div className="flex flex-wrap items-end gap-3 p-2 bg-white/60 rounded-md border border-indigo-100">
            <div className="space-y-1">
              <Label className="text-[10px] text-gray-500 uppercase">Task Definition Code (ATA)</Label>
              <Input
                value={ataCodeInput}
                onChange={e => setAtaCodeInput(e.target.value)}
                placeholder="e.g. 25-35-10 or 253510"
                className="h-8 w-[190px] text-xs"
              />
            </div>
            <div className="text-xs text-gray-600 space-y-1">
              <p className="text-[10px] text-gray-500 uppercase">Part Number (P/N)</p>
              <p className="font-semibold text-gray-800 h-8 flex items-center">{partNumber || '—'}</p>
            </div>
            {(recordAta || partNumber) && (
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 bg-green-50 border-green-200 text-green-700 ml-auto"
              >
                Auto-filled from ATA Record
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => runSearch(ataCodeInput)}
              disabled={searching || !ataCodeInput.trim()}
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
            >
              {searching ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Searching MaintainX...
                </>
              ) : (
                <>
                  <Search className="h-3.5 w-3.5 mr-1.5" />
                  Search Task Definitions
                </>
              )}
            </Button>

            <Button
              onClick={() => handleStore(searchResult?.primaryItem ?? undefined)}
              disabled={searching || storingKey !== null || !ataRecordId || !ataCodeInput.trim()}
              size="sm"
              variant="outline"
              className="text-xs text-indigo-700 border-indigo-200 hover:bg-indigo-50"
            >
              {storingKey === 'primary' ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Fetching Task Card PDF...
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Fetch &amp; Store DTC-JIC Task Card
                </>
              )}
            </Button>

            <Button
              onClick={refreshStored}
              disabled={loadingStored}
              size="sm"
              variant="ghost"
              className="text-xs text-gray-600"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${loadingStored ? 'animate-spin' : ''}`} />
              Refresh Stored
            </Button>
          </div>

          {searching && (
            <div className="text-[10px] text-gray-500 italic space-y-0.5">
              <p>→ Step 1-2: Logging in to http://svdcmpa01/maintenix ...</p>
              <p>→ Step 3-4: Shop Technician → Task Definition Search ...</p>
              <p>→ Step 5: Submitting the Task Definition Code ...</p>
              <p>→ Step 6-7: Selecting DTC-JIC and resolving Preview Task Cards ...</p>
            </div>
          )}

          {searchError && (
            <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-red-700 font-medium">Error Searching Task Cards</p>
                <p className="text-[10px] text-red-600 mt-0.5">{searchError}</p>
              </div>
            </div>
          )}

          {storeMessage && (
            <div className="flex items-start gap-2 p-2.5 bg-green-50 border border-green-200 rounded-md">
              <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-green-800">{storeMessage}</p>
            </div>
          )}

          {storeError && (
            <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-md">
              <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">{storeError}</p>
            </div>
          )}

          {/* ---- Search results ---- */}
          {searchResult && (
            <div
              className={`p-3 rounded-md border ${
                searchResult.found ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
              }`}
            >
              {searchResult.found ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-xs font-semibold text-green-800">
                      {items.length} task definition(s) found for task code {searchResult.taskCode}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {items.map(item => (
                      <div
                        key={item.taskDefinitionUrl}
                        className="flex flex-wrap items-center gap-2 p-2 bg-white rounded border border-green-100"
                      >
                        <div className="min-w-[220px] flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-gray-800">
                              {item.taskDefinitionCode}
                            </span>
                            {item.isDtcJic && (
                              <Badge className="bg-indigo-100 text-indigo-700 text-[9px] px-1.5 py-0">
                                DTC-JIC
                              </Badge>
                            )}
                            {item.revisionNumber && (
                              <span className="text-[10px] text-gray-500">
                                Rev {item.revisionNumber}
                              </span>
                            )}
                          </div>
                          {item.taskDefinitionName && (
                            <p className="text-[10px] text-gray-500 mt-0.5">
                              {item.taskDefinitionName}
                            </p>
                          )}
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[10px] h-7 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                          disabled={storingKey !== null || !ataRecordId}
                          onClick={() => handleStore(item)}
                        >
                          {storingKey === item.taskDefinitionUrl ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              Storing...
                            </>
                          ) : (
                            <>
                              <Download className="h-3 w-3 mr-1" />
                              Fetch &amp; Store
                            </>
                          )}
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-[10px] h-7 text-gray-600"
                          onClick={() =>
                            window.open(
                              `${PROXY_BASE}/pdf?taskDefinitionUrl=${encodeURIComponent(
                                item.taskDefinitionUrl,
                              )}`,
                              '_blank',
                              'noopener,noreferrer',
                            )
                          }
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Preview
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      {searchResult.errorMessage ||
                        'No task definitions were found in MaintainX for this ATA code.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Diagnostics — same pattern as the CMM Revision tab */}
              {searchResult.searchSteps && searchResult.searchSteps.length > 0 && (
                <div className="mt-2">
                  <button
                    onClick={() => setShowDiagnostics(!showDiagnostics)}
                    className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    <Info className="h-3 w-3" />
                    {showDiagnostics ? 'Hide' : 'Show'} Diagnostic Steps (
                    {searchResult.searchSteps.length})
                  </button>
                  {showDiagnostics && (
                    <div className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded text-[10px] text-gray-600 space-y-0.5 max-h-60 overflow-y-auto font-mono">
                      {searchResult.searchSteps.map((step, idx) => (
                        <p
                          key={idx}
                          className={
                            step.includes('FAILED')
                              ? 'text-red-600 font-medium'
                              : step.includes('WARNING')
                                ? 'text-amber-600'
                                : ''
                          }
                        >
                          {step}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {searchResult.rawHtmlSnippet && (
                <div className="mt-1">
                  <button
                    onClick={() => setShowRawHtml(!showRawHtml)}
                    className="text-[10px] text-purple-600 hover:text-purple-800 flex items-center gap-1"
                  >
                    <Code className="h-3 w-3" />
                    {showRawHtml ? 'Hide' : 'Show'} Raw HTML Response
                  </button>
                  {showRawHtml && (
                    <div className="mt-1 p-2 bg-gray-900 border border-gray-700 rounded text-[9px] text-green-300 max-h-48 overflow-y-auto overflow-x-auto font-mono whitespace-pre-wrap break-all">
                      {searchResult.rawHtmlSnippet}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============ Stored task cards, grouped by P/N ============ */}
      <Card className="shadow-none border border-gray-200">
        <CardHeader className="pb-2 px-4 pt-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-gray-600" />
            Stored Task Cards by P/N
          </CardTitle>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Task card PDFs saved in this application. Older fetches are kept as revision history.
          </p>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-3">
          {loadingStored && groups.length === 0 && (
            <p className="text-[11px] text-gray-500 italic flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading stored task cards...
            </p>
          )}

          {!loadingStored && groups.length === 0 && (
            <p className="text-[11px] text-gray-500 italic">
              No task cards stored yet for this record. Use “Fetch &amp; Store” above.
            </p>
          )}

          {groups.map(group => (
            <div key={group.partNumber} className="border border-gray-200 rounded-md overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">P/N</span>
                <span className="text-xs font-semibold text-gray-800">{group.partNumber}</span>
                {group.ataChapterCode && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                    ATA {group.ataChapterCode}
                  </Badge>
                )}
                <Badge className="ml-auto bg-gray-200 text-gray-700 text-[9px] px-1.5 py-0">
                  {group.documentCount} document(s)
                </Badge>
              </div>

              <div className="divide-y divide-gray-100">
                {group.documents.map(doc => (
                  <div key={doc.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <div className="min-w-[220px] flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-gray-800">
                          {doc.taskDefinitionCode}
                        </span>
                        {doc.isLatest ? (
                          <Badge className="bg-green-100 text-green-700 text-[9px] px-1.5 py-0">
                            Latest v{doc.version}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-gray-500">
                            v{doc.version}
                          </Badge>
                        )}
                        {doc.revisionNumber && (
                          <span className="text-[10px] text-gray-500">Rev {doc.revisionNumber}</span>
                        )}
                      </div>
                      {doc.taskDefinitionName && (
                        <p className="text-[10px] text-gray-500 mt-0.5">{doc.taskDefinitionName}</p>
                      )}
                      <p className="text-[9px] text-gray-400 mt-0.5">
                        {doc.fileName} · {formatBytes(doc.fileSizeBytes)} · fetched{' '}
                        {formatDate(doc.fetchedAt)}
                        {doc.fetchedBy ? ` by ${doc.fetchedBy}` : ''}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[10px] h-7 border-green-300 text-green-700 hover:bg-green-50"
                      onClick={() => window.open(doc.downloadUrl, '_blank', 'noopener,noreferrer')}
                    >
                      <FileText className="h-3 w-3 mr-1" />
                      Open PDF
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}