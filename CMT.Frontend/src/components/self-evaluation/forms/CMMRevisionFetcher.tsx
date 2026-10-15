/**
 * CMMRevisionFetcher.tsx - FULLY AMENDED v3
 * 
 * Standalone component that fetches CMM revision from the external system.
 * AMENDED v3: Added raw HTML diagnostic display and improved error handling.
 */
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, FileText, ExternalLink, AlertCircle, CheckCircle2, RefreshCw, Info, Code } from 'lucide-react'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'

// ===== Types =====
export interface CMMSearchResult {
  found: boolean
  manualType?: string
  revisionNumber?: string
  revisionDate?: string
  pdfUrl?: string
  errorMessage?: string
  searchSteps?: string[]
  rawHtmlSnippet?: string
  // Additional details from Index Details page
  indexComponent?: string
  mfgPartNo?: string
  etPartNo?: string
  etRevisionNo?: string
  etRevisionDate?: string
  vendorRevisionNo?: string
  vendorRevisionDate?: string
  subscriptionDate?: string
  subscriptionMethod?: string
  inspectionNo?: string
  inspectionDate?: string
  remark?: string
  vendor?: string
  shop?: string
  effectivity?: string
}

// ===== API Function =====
export async function fetchCMMRevision(ataNumber: string, partNumber: string): Promise<CMMSearchResult> {
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

// ===== Component =====
export default function CMMRevisionFetcher() {
  const { selectedATARecord, selectedComponent } = useSelfEvaluation()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CMMSearchResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [showRawHtml, setShowRawHtml] = useState(false)

  const ataNumber = selectedATARecord?.ataChapter ||
                    selectedATARecord?.ataChapterNumber ||
                    selectedComponent?.ataChapterNumber || ''
  const partNumber = selectedATARecord?.partNumber ||
                     selectedComponent?.partNumber || ''

  const handleFetchCMM = async () => {
    if (!ataNumber && !partNumber) {
      setError('No ATA number or Part Number available for this record. Please select a component first.')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)
    setShowDiagnostics(false)
    setShowRawHtml(false)

    try {
      const data = await fetchCMMRevision(ataNumber, partNumber)
      setResult(data)

      // Automatically open the CMM PDF if found
      if (data.found && data.pdfUrl) {
        window.open(data.pdfUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch CMM revision from external system.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="shadow-none border border-blue-100 bg-blue-50/30">
      <CardHeader className="pb-2 px-4 pt-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-600" />
          CMM Revision Status (External System)
        </CardTitle>
        <p className="text-[10px] text-gray-500 mt-0.5">
          Auto-connects to http://svhqmcweb02:1500 — Logs in automatically, searches by ATA No or Mfg Part No, navigates to Index Details, and retrieves CMM from Manual Attachments
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-3">
        <div className="text-xs text-gray-600 flex items-center gap-4">
          <span><strong>ATA:</strong> {ataNumber || '—'}</span>
          <span><strong>P/N:</strong> {partNumber || '—'}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleFetchCMM}
            disabled={loading || (!ataNumber && !partNumber)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            size="sm"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Connecting to External System...
              </>
            ) : (
              <>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Fetch Latest CMM Revision
              </>
            )}
          </Button>

          {result && (
            <Button
              onClick={handleFetchCMM}
              disabled={loading}
              variant="ghost"
              size="sm"
              className="text-xs text-blue-600"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Refresh
            </Button>
          )}
        </div>

        {loading && (
          <div className="text-[10px] text-gray-500 italic space-y-0.5">
            <p>→ Step 1: Logging into external system (http://svhqmcweb02:1500)...</p>
            <p>→ Step 2: Navigating to search page...</p>
            <p>→ Step 3: Searching by ATA/Part Number...</p>
            <p>→ Step 4: Opening Index Details...</p>
            <p>→ Step 5: Finding CMM in Manual Attachments...</p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-md">
            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-red-700 font-medium">Error Fetching CMM</p>
              <p className="text-[10px] text-red-600 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {result && (
          <div className={`p-3 rounded-md border ${result.found ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
            {result.found ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-xs font-semibold text-green-800">CMM Found — Latest Revision Retrieved</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-gray-500">Manual Type:</span>
                    <Badge className="ml-1 bg-green-100 text-green-700 text-[10px]">{result.manualType}</Badge>
                  </div>
                  {result.revisionNumber && (
                    <div>
                      <span className="text-gray-500">Rev No:</span>
                      <span className="ml-1 font-semibold text-gray-800">{result.revisionNumber}</span>
                    </div>
                  )}
                  {result.revisionDate && (
                    <div>
                      <span className="text-gray-500">Rev Date:</span>
                      <span className="ml-1 font-semibold text-gray-800">{result.revisionDate}</span>
                    </div>
                  )}
                  {result.indexComponent && (
                    <div>
                      <span className="text-gray-500">Component:</span>
                      <span className="ml-1 font-medium">{result.indexComponent}</span>
                    </div>
                  )}
                  {result.vendor && (
                    <div>
                      <span className="text-gray-500">Vendor:</span>
                      <span className="ml-1 font-medium">{result.vendor}</span>
                    </div>
                  )}
                  {result.etPartNo && (
                    <div>
                      <span className="text-gray-500">ET P/N:</span>
                      <span className="ml-1 font-medium">{result.etPartNo}</span>
                    </div>
                  )}
                </div>
                {result.pdfUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 text-xs border-green-300 text-green-700 hover:bg-green-100"
                    onClick={() => window.open(result.pdfUrl!, '_blank', 'noopener,noreferrer')}
                  >
                    <FileText className="h-3 w-3 mr-1.5" />
                    Open CMM PDF (Rev {result.revisionNumber})
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    {result.errorMessage || 'No matching results found for the given ATA/Part Number in the external system.'}
                  </p>
                </div>

                {/* Diagnostic Steps */}
                {result.searchSteps && result.searchSteps.length > 0 && (
                  <div className="mt-2">
                    <button
                      onClick={() => setShowDiagnostics(!showDiagnostics)}
                      className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <Info className="h-3 w-3" />
                      {showDiagnostics ? 'Hide' : 'Show'} Diagnostic Steps ({result.searchSteps.length})
                    </button>
                    {showDiagnostics && (
                      <div className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded text-[10px] text-gray-600 space-y-0.5 max-h-60 overflow-y-auto font-mono">
                        {result.searchSteps.map((step, idx) => (
                          <p key={idx} className={step.includes('FAILED') ? 'text-red-600 font-medium' : step.includes('WARNING') ? 'text-amber-600' : ''}>
                            {step}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Raw HTML Snippet for debugging */}
                {result.rawHtmlSnippet && (
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
                        {result.rawHtmlSnippet}
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
  )
}
