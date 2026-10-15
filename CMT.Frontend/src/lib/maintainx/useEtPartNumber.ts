/**
 * =====================================================================================
 * NEW FILE
 * Copy to: CMT.Frontend/src/lib/maintainx/useEtPartNumber.ts
 *
 * WHAT THIS FILE IS
 * -----------------
 * The shared behaviour behind every "ET P/N" fetch button on a controlled document.
 * Exactly two sheets in the Table of Contents print an ET P/N box (see ET_PN_FORMS in
 * ./maintainx-connector):
 *
 *   - TNA / TOOL NEED ANALYSIS REPORT  -> MNT-1229B  (both variants)
 *   - PERIODIC CAPABILITY SELF-AUDIT   -> MNT-1325
 *
 * This hook keeps their behaviour identical: one connector-status probe (cached at
 * module level so opening ten forms does not fire ten requests), one fetch, and one
 * operator-facing hint with a tone.
 *
 * THE RULES IT ENFORCES
 * ---------------------
 * (1) The field is ALWAYS manually editable. A missing MaintainX lookup never blocks
 *     a controlled form — the connector may be disabled, intranet-unreachable, or the
 *     task definition may simply not list the part number yet.
 * (2) Only the bare stock number is applied. resolveEtPartNumber already runs the
 *     value through parseStockNumber ("25H0026 (SLIDE AY)" -> "25H0026"); the hook
 *     applies `resolved.etPartNumber` and nothing else.
 * (3) A hand-typed value clears the previous fetch hint, so a stale "Resolved" note
 *     can never sit under a number somebody changed by hand.
 * =====================================================================================
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  describeEtPartNumberStatus,
  fetchConnectorStatus,
  resolveEtPartNumber,
  type EtPartNumberResult,
  type MaintainXConnectorStatus,
} from './maintainx-connector'

// ---- module-level cache: the connector status is a server-wide fact, not per-form ----
let cachedStatus: MaintainXConnectorStatus | null = null
let statusPromise: Promise<MaintainXConnectorStatus> | null = null

const DISABLED_STATUS: MaintainXConnectorStatus = {
  enabled: false,
  provider: 'None',
  etPartNumberEnabled: false,
  signatureImportEnabled: false,
  userIdSource: 'Username',
  canResolveEtPartNumber: false,
  canImportSignatures: false,
}

function loadConnectorStatusOnce(): Promise<MaintainXConnectorStatus> {
  if (!statusPromise) {
    statusPromise = fetchConnectorStatus()
      .then(status => {
        // Only a probe that actually reached the server is cached. A resolved
        // enabled=false is authoritative (the connector really is off) and stays cached.
        cachedStatus = status
        return status
      })
      .catch(() => {
        // fetchConnectorStatus now THROWS only on a transient condition (401 / 5xx /
        // network). Drop the cached promise so the NEXT mount probes again and can recover
        // once the session is live — otherwise a single pre-login failure would disable the
        // Fetch button for the rest of the session.
        statusPromise = null
        return cachedStatus ?? DISABLED_STATUS
      })
  }
  return statusPromise
}

export type EtPnHintTone = 'idle' | 'success' | 'warning' | 'error'

export interface EtPnFetchArgs {
  /** ATA chapter / task code of the selected ATA Record, e.g. "25-31-21". */
  ataCode: string
  /** Component MFG P/N from the ATA Record, e.g. "62773-336". */
  partNumber: string
  /** "MNT-1229B" | "MNT-1325" — recorded on the audit trail. */
  formNo: string
  ataRecordId?: string
}

export interface UseEtPartNumber {
  /** Null until the first probe answers. */
  connector: MaintainXConnectorStatus | null
  /** True only when a live lookup may actually be attempted. */
  canFetch: boolean
  fetching: boolean
  result: EtPartNumberResult | null
  /** Operator-facing sentence for the last outcome ('' before any fetch). */
  hint: string
  tone: EtPnHintTone
  /** Resolves with the result, or null when the request was rejected locally. */
  fetchEtPartNumber: (args: EtPnFetchArgs) => Promise<EtPartNumberResult | null>
  clearHint: () => void
}

export function useEtPartNumber(): UseEtPartNumber {
  const [connector, setConnector] = useState<MaintainXConnectorStatus | null>(cachedStatus)
  const [fetching, setFetching] = useState(false)
  const [result, setResult] = useState<EtPartNumberResult | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    if (!cachedStatus) {
      void loadConnectorStatusOnce().then(status => {
        if (mountedRef.current) setConnector(status)
      })
    }
    return () => {
      mountedRef.current = false
    }
  }, [])

  const fetchEtPartNumber = useCallback(async (args: EtPnFetchArgs) => {
    const ata = (args.ataCode || '').trim()
    const pn = (args.partNumber || '').trim()
    if (!ata || !pn) {
      // Same vocabulary as the server: both keys are required before a lookup makes sense.
      setResult({
        status: 'InvalidRequest',
        found: false,
        etPartNumber: '',
        etPartDescription: '',
        rawDetailEntry: '',
        stockNo: '',
        stockNoUrl: '',
        stockCode: '',
        ataCode: ata,
        partNumber: pn,
        taskCode: ata,
        taskDefinitionCode: '',
        taskDefinitionName: '',
        taskDefinitionUrl: '',
        matchedApplicabilityPartNumber: '',
        resolvedAtUtc: '',
        provider: 'None',
        message: describeEtPartNumberStatus('InvalidRequest'),
        steps: [],
        candidates: [],
      })
      return null
    }

    setFetching(true)
    try {
      const resolved = await resolveEtPartNumber({
        ataCode: ata,
        partNumber: pn,
        formNo: args.formNo,
        ataRecordId: args.ataRecordId || undefined,
      })
      if (mountedRef.current) setResult(resolved)
      return resolved
    } finally {
      if (mountedRef.current) setFetching(false)
    }
  }, [])

  const clearHint = useCallback(() => setResult(null), [])

  const hint = result ? result.message || describeEtPartNumberStatus(result.status) : ''
  let tone: EtPnHintTone = 'idle'
  if (result) {
    if (result.status === 'Resolved') tone = 'success'
    else if (result.status === 'AuthenticationFailed' || result.status === 'Unavailable') tone = 'error'
    else tone = 'warning'
  }

  return {
    connector,
    canFetch: Boolean(connector?.canResolveEtPartNumber),
    fetching,
    result,
    hint,
    tone,
    fetchEtPartNumber,
    clearHint,
  }
}
