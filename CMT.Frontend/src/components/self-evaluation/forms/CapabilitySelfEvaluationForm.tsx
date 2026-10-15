/**
 * CMM REV. STATUS Form - AMENDED v7
 * 
 * CHANGES v7:
 * - Auto-fetches CMM revision on mount (when user clicks "CMM REV. STATUS")
 * - Stores CMM result in localStorage for instant retrieval on future visits
 * - Removed manual "Fetch Latest CMM Revision" button (auto-triggered)
 * - Kept "Refresh" button for manual re-fetch
 * - Stores PDF URL so user can access stored CMM PDF directly
 */
'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, ExternalLink, FileText, AlertCircle, CheckCircle2, RefreshCw, Info, Code, Database } from 'lucide-react'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'

// ===== CMM External System Integration Types =====
interface CMMSearchResult {
  found: boolean
  manualType?: string
  revisionNumber?: string
  revisionDate?: string
  pdfUrl?: string
  errorMessage?: string
  searchSteps?: string[]
  rawHtmlSnippet?: string
  indexComponent?: string
  mfgPartNo?: string
  etPartNo?: string
  etRevisionNo?: string
  etRevisionDate?: string
  vendorRevisionNo?: string
  vendorRevisionDate?: string
  subscriptionDate?: string
  subscriptionMethod?: string
  vendor?: string
  shop?: string
}

interface StoredCMMData {
  result: CMMSearchResult
  fetchedAt: string
  ataNumber: string
  partNumber: string
}

/**
 * Gets the localStorage key for a specific ATA record's CMM data
 */
function getCMMStorageKey(ataRecordId: string): string {
  return `cmm_data_${ataRecordId}`
}

/**
 * Stores CMM result in localStorage for future retrieval
 */
function storeCMMResult(ataRecordId: string, result: CMMSearchResult, ataNumber: string, partNumber: string): void {
  if (!ataRecordId) return
  const data: StoredCMMData = {
    result,
    fetchedAt: new Date().toISOString(),
    ataNumber,
    partNumber,
  }
  try {
    localStorage.setItem(getCMMStorageKey(ataRecordId), JSON.stringify(data))
  } catch (e) {
    console.warn('Failed to store CMM data in localStorage:', e)
  }
}

/**
 * Retrieves stored CMM result from localStorage
 */
function getStoredCMMResult(ataRecordId: string): StoredCMMData | null {
  if (!ataRecordId) return null
  try {
    const raw = localStorage.getItem(getCMMStorageKey(ataRecordId))
    if (!raw) return null
    return JSON.parse(raw) as StoredCMMData
  } catch {
    return null
  }
}

/**
 * Fetches CMM revision from the external system via the proxy endpoint.
 */
async function fetchCMMRevision(ataNumber: string, partNumber: string): Promise<CMMSearchResult> {
  const params = new URLSearchParams()
  if (ataNumber) params.set('ataNumber', ataNumber)
  if (partNumber) params.set('partNumber', partNumber)

  const response = await fetch(`/api/self-evaluation/cmm-proxy?${params.toString()}`, {
    credentials: 'include',
    headers: { 'Accept': 'application/json' },
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    let errorMessage = `HTTP ${response.status}`
    try {
      const errorJson = JSON.parse(errorBody)
      errorMessage = errorJson.errorMessage || errorJson.message || errorMessage
    } catch {
      errorMessage = errorBody || errorMessage
    }
    throw new Error(errorMessage)
  }

  return response.json()
}

export default function CapabilitySelfEvaluationForm() {
  const { selectedATARecord, selectedComponent, selectedATAChapter } = useSelfEvaluation()

  // ===== CMM Integration State =====
  const [cmmLoading, setCmmLoading] = useState(false)
  const [cmmResult, setCmmResult] = useState<CMMSearchResult | null>(null)
  const [cmmError, setCmmError] = useState<string | null>(null)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [showRawHtml, setShowRawHtml] = useState(false)
  const [isFromCache, setIsFromCache] = useState(false)

  // Track if auto-fetch has been triggered for this record
  const autoFetchTriggeredRef = useRef<string | null>(null)

  const ataRecordId = selectedATARecord?.id || selectedComponent?.id || ''

  // ===== Auto-populate ATA and P/N from context =====
  const ataValue = useMemo(() => {
    return selectedATARecord?.ataChapter ||
           selectedATARecord?.ataChapterNumber ||
           selectedATARecord?.ataChapterCode ||
           selectedATAChapter?.chapterNumber ||
           selectedComponent?.ataChapterNumber || ''
  }, [selectedATARecord, selectedATAChapter, selectedComponent])

  const partNumberValue = useMemo(() => {
    return selectedATARecord?.partNumber ||
           selectedComponent?.partNumber || ''
  }, [selectedATARecord, selectedComponent])

  // ===== Auto-fetch on mount: Load cached data first, then fetch fresh =====
  useEffect(() => {
    if (!ataRecordId) return
    // Prevent duplicate auto-fetch for the same record
    if (autoFetchTriggeredRef.current === ataRecordId) return
    autoFetchTriggeredRef.current = ataRecordId

    // Step 1: Check if we have stored CMM data for this record
    const stored = getStoredCMMResult(ataRecordId)
    if (stored && stored.result.found) {
      setCmmResult(stored.result)
      setIsFromCache(true)
      setCmmError(null)
      // Still auto-fetch fresh data in background to update
      triggerFetch(true)
    } else {
      // No cached data — fetch immediately
      triggerFetch(false)
    }
  }, [ataRecordId])

  // ===== CMM Fetch Handler =====
  const triggerFetch = async (isBackgroundRefresh: boolean) => {
    let searchPartNumber = partNumberValue

    // Use base part number for broader matching
    if (searchPartNumber) {
      const baseMatch = searchPartNumber.match(/^(\d{3}-\d{4})/)
      if (baseMatch) {
        searchPartNumber = baseMatch[1]
      }
    }

    if (!ataValue && !searchPartNumber) {
      if (!isBackgroundRefresh) {
        setCmmError('No ATA number or Part Number available. Please ensure the ATA Record has been created with valid ATA and P/N values.')
      }
      return
    }

    if (!isBackgroundRefresh) {
      setCmmLoading(true)
      setCmmError(null)
      setCmmResult(null)
      setIsFromCache(false)
      setShowDiagnostics(false)
      setShowRawHtml(false)
    } else {
      setCmmLoading(true)
    }

    try {
      const data = await fetchCMMRevision(ataValue, searchPartNumber)
      setCmmResult(data)
      setIsFromCache(false)
      setCmmError(null)

      // Store the result for future retrieval
      if (data.found && ataRecordId) {
        storeCMMResult(ataRecordId, data, ataValue, searchPartNumber)
      }
    } catch (err: any) {
      if (!isBackgroundRefresh) {
        setCmmError(err?.message || 'Failed to fetch CMM revision from external system.')
      }
      // If background refresh fails, keep the cached result visible
    } finally {
      setCmmLoading(false)
    }
  }

  const handleManualRefresh = () => {
    triggerFetch(false)
  }

  return (
    <div className="w-full space-y-4">
      {/* ===== CMM External System Integration Section ===== */}
      <Card className="shadow-none border border-blue-100 bg-gradient-to-r from-blue-50/50 to-indigo-50/30">
        <CardHeader className="pb-2 px-4 pt-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" />
            CMM REV. STATUS
          </CardTitle>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Auto-connects to external CMM system — retrieves and stores CMM revision data automatically
          </p>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-3">
          {/* ATA and P/N auto-populated from the ATA Record */}
          <div className="text-xs text-gray-600 flex items-center gap-4 p-2 bg-white/60 rounded-md border border-blue-100">
            <span><strong>ATA:</strong> {ataValue || '—'}</span>
            <span><strong>P/N:</strong> {partNumberValue || '—'}</span>
            {(ataValue || partNumberValue) && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-green-50 border-green-200 text-green-700 ml-auto">
                Auto-filled from ATA Record
              </Badge>
            )}
          </div>

          {/* Refresh button only (auto-fetch replaces the old Fetch button) */}
          <div className="flex items-center gap-2">
            <Button
              onClick={handleManualRefresh}
              disabled={cmmLoading || (!ataValue && !partNumberValue)}
              variant="outline"
              size="sm"
              className="text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
            >
              {cmmLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Fetching from External System...
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Refresh CMM Data
                </>
              )}
            </Button>

            {isFromCache && cmmResult?.found && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-purple-50 border-purple-200 text-purple-700">
                <Database className="h-2.5 w-2.5 mr-1" />
                Loaded from stored data
              </Badge>
            )}
          </div>

          {cmmLoading && !cmmResult && (
            <div className="text-[10px] text-gray-500 italic space-y-0.5">
              <p>→ Connecting to external CMM system...</p>
              <p>→ Logging in and searching by ATA/Part Number...</p>
              <p>→ Retrieving CMM revision data...</p>
            </div>
          )}

          {cmmError && (
            <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-red-700 font-medium">Error Fetching CMM</p>
                <p className="text-[10px] text-red-600 mt-0.5">{cmmError}</p>
              </div>
            </div>
          )}

          {cmmResult && (
            <div className={`p-3 rounded-md border ${cmmResult.found ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
              {cmmResult.found ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-xs font-semibold text-green-800">CMM Found — Latest Revision Retrieved Successfully</span>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 text-xs mt-2">
                    <div>
                      <span className="text-gray-500">Manual Type:</span>
                      <Badge className="ml-1 bg-green-100 text-green-700 text-[10px]">{cmmResult.manualType}</Badge>
                    </div>
                    {cmmResult.revisionNumber && (
                      <div>
                        <span className="text-gray-500">Rev No:</span>
                        <span className="ml-1 font-semibold text-gray-800">{cmmResult.revisionNumber}</span>
                      </div>
                    )}
                    {cmmResult.indexComponent && (
                      <div>
                        <span className="text-gray-500">Component:</span>
                        <span className="ml-1 font-medium">{cmmResult.indexComponent}</span>
                      </div>
                    )}
                  </div>
                  {cmmResult.pdfUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 text-xs border-green-300 text-green-700 hover:bg-green-100"
                      onClick={() => window.open(cmmResult.pdfUrl!, '_blank', 'noopener,noreferrer')}
                    >
                      <FileText className="h-3 w-3 mr-1.5" />
                      Open CMM PDF (Rev {cmmResult.revisionNumber})
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      {cmmResult.errorMessage || 'No matching results found for the given ATA/Part Number in the external system.'}
                    </p>
                  </div>

                  {cmmResult.searchSteps && cmmResult.searchSteps.length > 0 && (
                    <div className="mt-2">
                      <button
                        onClick={() => setShowDiagnostics(!showDiagnostics)}
                        className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        <Info className="h-3 w-3" />
                        {showDiagnostics ? 'Hide' : 'Show'} Diagnostic Steps ({cmmResult.searchSteps.length})
                      </button>
                      {showDiagnostics && (
                        <div className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded text-[10px] text-gray-600 space-y-0.5 max-h-60 overflow-y-auto font-mono">
                          {cmmResult.searchSteps.map((step, idx) => (
                            <p key={idx} className={step.includes('FAILED') ? 'text-red-600 font-medium' : step.includes('WARNING') ? 'text-amber-600' : ''}>
                              {step}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {cmmResult.rawHtmlSnippet && (
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
                          {cmmResult.rawHtmlSnippet}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
