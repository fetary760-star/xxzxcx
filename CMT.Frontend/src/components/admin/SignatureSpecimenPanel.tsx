'use client';

/**
 * =====================================================================================
 * SignatureSpecimenPanel.tsx — v5 AMENDMENT (THE "MaintainX specimen" COLUMN RENDERS)
 * Copy to: CMT.Frontend/src/components/admin/SignatureSpecimenPanel.tsx
 *
 * THE DEFECT v5 FIXES
 * -------------------
 * The "MaintainX ID" column matched rows such as "director" upstream, but the
 * "MaintainX specimen" column under "Preview" ALWAYS showed nothing. Root cause, exactly
 * as diagnosed:
 *
 *   (1) v4 imported `previewMaintainXSignature` and the type `MaintainXSignaturePreview`
 *       from `@/lib/maintainx/maintainx-connector`. NEITHER SYMBOL EXISTS in the
 *       connector. In a bundler that is a hard module error (or an undefined import at
 *       runtime), so the cell could never render — regardless of MaintainX.
 *
 *   (2) There was NO `signatures/preview` endpoint on the server, so even a correct
 *       import had nothing to call.
 *
 * WHAT v5 DOES
 *   (A) SELF-CONTAINED PREVIEW CLIENT. This file no longer imports anything that does
 *       not exist. `previewMaintainXSignature()` and the `MaintainXSignaturePreview`
 *       type are declared HERE, on top of the same `/api/maintainx` proxy the connector
 *       uses. Dropping this one file in therefore fixes the client half completely, with
 *       ZERO edits to maintainx-connector.ts.
 *
 *   (B) TOLERANT RESPONSE PARSING. The preview accepts `dataUrl`, or
 *       `contentBase64` + `contentType`, or a plain `base64`/`content` field, in camelCase
 *       or PascalCase, wrapped in `{ data: ... }` or not. So it renders against the v5
 *       controller AND against any slightly different shape a deployment already has.
 *
 *   (C) GRACEFUL DEGRADATION, NEVER A BROKEN COLUMN. A 404 (endpoint not deployed yet)
 *       resolves as `ConnectorDisabled` with a clear cell message instead of throwing.
 *       The panel keeps working; the column simply says preview is unavailable.
 *
 *   (D) SPECIMEN-FIRST FALLBACK. If preview is genuinely unavailable but the row already
 *       has an imported specimen on file, the cell says so and offers "Import" as the way
 *       to obtain the upstream image, so the operator is never left with an empty box and
 *       no explanation.
 *
 *   (E) TRUTHFUL ID COLUMN (kept from v4). The verdict uses the SAME canonicalisation as
 *       the backend, and a role login such as "director" is reported as "not a staff
 *       number" — never as a false upstream match. After a successful preview the column
 *       ADOPTS the id MaintainX just confirmed, which is the automatic SE -> MaintainX
 *       user-id alignment the requirement asks for.
 *
 * UNCHANGED: upload card (2 MB, PNG/JPEG/WebP/PDF), coverage table with gaps first,
 * version history dialog, revoke confirmation, and the deliberate non-blocking rule for a
 * missing specimen.
 *
 * BACKEND CONTRACT USED BY (A)
 * ----------------------------
 * GET /api/maintainx/signatures/preview?userId={id}  ->
 *   { status, found, maintainXUsername, canonicalStaffNumber, contentType,
 *     dataUrl | contentBase64, sourceUrl, sizeBytes, message, steps[] }
 * The endpoint is READ-ONLY: it never creates a specimen version. "Import" remains the
 * only operation that writes.
 * =====================================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { roleLabel } from '@/lib/role-hierarchy';
import {
  ALLOWED_SIGNATURE_EXTENSIONS,
  ALLOWED_SIGNATURE_MIME,
  MAX_SIGNATURE_BYTES,
  SignatureApiError,
  formatBytes,
  formatUtc,
  fetchCoverage,
  fetchHistory,
  revokeSignature,
  shaPrefix,
  uploadSignature,
  validateSignatureFile,
  type SignatureCoverageRow,
  type UserSignatureResponse,
} from '@/lib/signature-api';
import {
  SIGNATURE_ACCESS_DENIED_MESSAGE,
  canManageSignatures,
} from '@/lib/signature/signature-access';
import {
  describeIdentityStatus,
  describeSignatureFetchStatus,
  fetchConnectorStatus,
  fetchMaintainXIdentity,
  importMaintainXSignature,
  MAINTAINX_PROXY_BASE,
  SIGNATURE_FETCH_STATUS_NAMES,
  type MaintainXConnectorStatus,
  type MaintainXIdentity,
  type MaintainXSignatureFetchStatus,
} from '@/lib/maintainx/maintainx-connector';
import SignatureImage from '@/components/admin/SignatureImage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  DownloadCloud,
  Eye,
  FileText,
  History,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';

export interface SignatureSpecimenPanelProps {
  /**
   * Optional navigation callback supplied by the host route (`router.push('/admin')`).
   * When omitted the Back button is not rendered, which is what the embedded
   * "Signatures" tab wants.
   */
  onBack?: () => void;
  /** Renders without the page chrome (header + page padding) when embedded in a tab. */
  embedded?: boolean;
}

/** Message extraction that keeps the server's error CODE visible to the operator. */
function describeError(error: unknown, fallback: string): { code: string | null; message: string } {
  if (error instanceof SignatureApiError) {
    return { code: error.errorCode, message: error.message };
  }
  return { code: null, message: error instanceof Error ? error.message : fallback };
}

// =====================================================================================
// (A) SELF-CONTAINED MaintainX SPECIMEN PREVIEW CLIENT
//     Declared here on purpose: v4 imported `previewMaintainXSignature` /
//     `MaintainXSignaturePreview` from the connector, where they DO NOT EXIST, which is
//     why the column could never render. Keeping them local makes this file a true
//     drop-in with no connector edit required.
// =====================================================================================

export interface MaintainXSignaturePreview {
  status: MaintainXSignatureFetchStatus;
  /** True only when a real specimen was read AND encoded for display. */
  found: boolean;
  /** The ALIGNED upstream account the specimen belongs to, e.g. "21041". */
  maintainXUsername: string;
  canonicalStaffNumber: string;
  seUserId: number;
  contentType: string;
  /** Ready-to-render data URL, e.g. "data:image/png;base64,...". */
  dataUrl: string;
  sizeBytes: number;
  sourceUrl: string;
  message: string;
  steps: string[];
}

/** Reads a value under camelCase or PascalCase, so either serialiser casing works. */
function pickField(raw: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null) return raw[key];
    const pascal = key.charAt(0).toUpperCase() + key.slice(1);
    if (raw[pascal] !== undefined && raw[pascal] !== null) return raw[pascal];
  }
  return undefined;
}

function asText(value: unknown, fallback = ''): string {
  return value === undefined || value === null ? fallback : String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBool(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).toLowerCase();
  return text === 'true' || text === '1' || text === 'yes';
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => asText(item)).filter(Boolean);
  if (value && typeof value === 'object') {
    const nested = (value as Record<string, unknown>).$values;
    if (Array.isArray(nested)) return nested.map(item => asText(item)).filter(Boolean);
  }
  return [];
}

/** Accepts "Fetched", "fetched" or the numeric ordinal, mirroring the C# enum order. */
function toFetchStatus(value: unknown): MaintainXSignatureFetchStatus {
  const names = SIGNATURE_FETCH_STATUS_NAMES;
  if (typeof value === 'number' && names[value] !== undefined) return names[value];
  const text = asText(value).trim();
  if (!text) return 'SignatureNotRegistered';
  if (/^\d+$/.test(text)) {
    const byIndex = names[Number(text)];
    if (byIndex !== undefined) return byIndex;
  }
  const match = names.find(name => name.toLowerCase() === text.toLowerCase());
  return match ?? 'SignatureNotRegistered';
}

/**
 * GET /api/maintainx/signatures/preview?userId={id}
 *
 * READ-ONLY: the server walks References -> user details -> Electronic Signature for the
 * ALIGNED account and returns the specimen as base64. NOTHING is persisted, so this can
 * safely back a dashboard column. Never throws for a MaintainX-side condition; a missing
 * endpoint resolves as `ConnectorDisabled` so the panel degrades instead of breaking.
 */
export async function previewMaintainXSignature(userId: number): Promise<MaintainXSignaturePreview> {
  const base: MaintainXSignaturePreview = {
    status: 'Unavailable',
    found: false,
    maintainXUsername: '',
    canonicalStaffNumber: '',
    seUserId: userId,
    contentType: '',
    dataUrl: '',
    sizeBytes: 0,
    sourceUrl: '',
    message: '',
    steps: [],
  };

  let response: Response;
  try {
    response = await fetch(
      `${MAINTAINX_PROXY_BASE}/signatures/preview?userId=${encodeURIComponent(String(userId))}`,
      { method: 'GET', headers: { Accept: 'application/json' }, credentials: 'include', cache: 'no-store' },
    );
  } catch {
    return {
      ...base,
      message:
        'The MaintainX service is unreachable. It is intranet-only, so check the connection and retry.',
    };
  }

  const text = await response.text().catch(() => '');

  if (!response.ok) {
    if (response.status === 404) {
      return {
        ...base,
        status: 'ConnectorDisabled',
        message:
          'The MaintainX specimen preview endpoint is not deployed on this server yet, so the upstream ' +
          'image cannot be shown. Use Import to pull the specimen instead.',
      };
    }
    if (response.status === 401) {
      return { ...base, message: 'Your session has expired. Sign in again to continue.' };
    }
    if (response.status === 403) {
      return { ...base, message: 'You do not have permission to read MaintainX specimens.' };
    }

    let message = `The MaintainX service returned HTTP ${response.status}.`;
    try {
      const parsed = JSON.parse(text) as { message?: string; errorMessage?: string; title?: string };
      message = parsed.errorMessage || parsed.message || parsed.title || message;
    } catch {
      if (text && text.length < 300) message = text;
    }
    return { ...base, message };
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ...base, message: 'The MaintainX service returned a non-JSON response.' };
  }

  const payload = (pickField(raw, 'data') as Record<string, unknown>) ?? raw;
  const status = toFetchStatus(pickField(payload, 'status'));
  const contentType = asText(pickField(payload, 'contentType'), 'image/png');

  // (B) Accept dataUrl, or base64 + contentType, under either casing.
  let dataUrl = asText(pickField(payload, 'dataUrl', 'dataURL'));
  if (!dataUrl) {
    const base64 = asText(pickField(payload, 'contentBase64', 'base64', 'content'));
    if (base64) {
      dataUrl = base64.startsWith('data:') ? base64 : `data:${contentType};base64,${base64}`;
    }
  }

  const maintainXUsername = asText(
    pickField(payload, 'maintainXUsername', 'maintainXUserName', 'username'),
  );

  const foundFlag = pickField(payload, 'found');
  const found = foundFlag !== undefined ? asBool(foundFlag) && Boolean(dataUrl) : status === 'Fetched' && Boolean(dataUrl);

  return {
    status,
    found,
    maintainXUsername,
    canonicalStaffNumber: asText(pickField(payload, 'canonicalStaffNumber')),
    seUserId: asNumber(pickField(payload, 'seUserId'), userId),
    contentType,
    dataUrl,
    sizeBytes: asNumber(pickField(payload, 'sizeBytes')),
    sourceUrl: asText(pickField(payload, 'sourceUrl')),
    message: asText(pickField(payload, 'message')) || describeSignatureFetchStatus(status),
    steps: asList(pickField(payload, 'steps')),
  };
}

// =====================================================================================
// ID canonicalisation — the browser-side MIRROR of MaintainXStaffNumber.Canonical
// =====================================================================================

/**
 * Uppercase, alphanumeric-only form with a trailing "(NAME)" annotation removed and
 * leading zeros dropped for a purely numeric value. Mirrors the C# canonicaliser so the
 * verdict this panel renders can never disagree with the verdict the importer enforces.
 *
 *   "21041"         -> "21041"
 *   " 021041 "      -> "21041"
 *   "21041 (SMITH)" -> "21041"
 *   "director"      -> "DIRECTOR"
 */
function canonicalStaffNo(value?: string | null): string {
  if (!value) return '';
  const withoutAnnotation = value.split('(')[0];
  const cleaned = withoutAnnotation
    .replace(/[\u200B\u200C\u200D\uFEFF\u00A0]/g, '')
    .replace(/[^0-9A-Za-z]/g, '')
    .toUpperCase();
  if (!cleaned) return '';
  if (/^\d+$/.test(cleaned)) {
    const trimmed = cleaned.replace(/^0+/, '');
    return trimmed.length === 0 ? '0' : trimmed;
  }
  return cleaned;
}

/** True when the value could be a Maintenix staff number (has at least one digit). */
function looksLikeStaffNo(value?: string | null): boolean {
  const canonical = canonicalStaffNo(value);
  return canonical.length >= 3 && canonical.length <= 20 && /\d/.test(canonical);
}

/** True when two identifiers denote the same MaintainX account. */
function sameStaffNo(left?: string | null, right?: string | null): boolean {
  const a = canonicalStaffNo(left);
  return a.length > 0 && a === canonicalStaffNo(right);
}

/** The canonical id the server reported, falling back to the local mirror. */
function alignedCanonical(identity?: MaintainXIdentity): string {
  if (!identity) return '';
  return identity.canonicalStaffNumber || canonicalStaffNo(identity.maintainXUsername);
}

// =====================================================================================
// (E) MaintainX ID cell — an HONEST alignment verdict
// =====================================================================================

function MaintainXIdCell({
  identity,
  username,
  userId,
}: {
  identity?: MaintainXIdentity;
  username: string;
  userId: number;
}) {
  if (!identity) {
    return <span className="text-[10px] text-slate-400">checking…</span>;
  }

  if (identity.isMapped) {
    const canonical = alignedCanonical(identity);
    const identical = sameStaffNo(username, identity.maintainXUsername);

    return (
      <div className="space-y-0.5">
        <Badge variant="outline" className="gap-1 border-emerald-300 text-[10px] text-emerald-700">
          <CheckCircle2 className="h-3 w-3" />
          {identity.maintainXUsername}
        </Badge>
        <div className="text-[9px] leading-snug text-slate-500">
          {identical ? (
            <>same id in both systems{canonical ? ` (${canonical})` : ''}</>
          ) : (
            <span className="inline-flex items-center gap-0.5">
              <Link2 className="h-2.5 w-2.5" />
              SE &ldquo;{username || `#${userId}`}&rdquo; &rarr; MaintainX &ldquo;{canonical || identity.maintainXUsername}&rdquo;
            </span>
          )}
        </div>
        {identity.source && (
          <div className="text-[9px] text-slate-400">resolved via {identity.source.toLowerCase()}</div>
        )}
      </div>
    );
  }

  // NOT mapped. When the stored value is a role-style login, say so explicitly instead of
  // pretending "director" matches something upstream.
  const roleStyleLogin = username.length > 0 && !looksLikeStaffNo(username);

  return (
    <div className="space-y-0.5">
      <Badge variant="outline" className="gap-1 border-amber-400 text-[10px] text-amber-700">
        <AlertCircle className="h-3 w-3" />
        {roleStyleLogin ? 'Not a staff number' : 'Unmapped'}
      </Badge>
      <div
        className="max-w-[200px] text-[9px] leading-snug text-slate-500"
        title={identity.message || describeIdentityStatus(identity.status)}
      >
        {roleStyleLogin
          ? `“${username}” is a role login, not a MaintainX ID. The preview aligns it by person name and reads the real staff number from References → My User Details → Electronic Signature.`
          : identity.message || describeIdentityStatus(identity.status)}
      </div>
    </div>
  );
}

// =====================================================================================
// MaintainX specimen cell — renders the image that ALREADY EXISTS upstream
// =====================================================================================

function MaintainXSpecimenCell({
  preview,
  loading,
  disabled,
  disabledReason,
  hasLocalSpecimen,
  onPreview,
}: {
  preview?: MaintainXSignaturePreview;
  loading: boolean;
  disabled: boolean;
  disabledReason: string;
  hasLocalSpecimen: boolean;
  onPreview: () => void;
}) {
  if (loading) {
    return (
      <div className="flex h-10 w-24 items-center justify-center rounded border border-slate-200 bg-white">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!preview) {
    // (D) Never an unexplained empty box: when preview is unavailable, say why and point
    // at the action that still works.
    if (disabled) {
      return (
        <div className="max-w-[150px] space-y-0.5">
          <Badge variant="outline" className="gap-1 border-slate-300 text-[10px] text-slate-600">
            <AlertCircle className="h-3 w-3" />
            Preview unavailable
          </Badge>
          <div className="text-[9px] leading-snug text-slate-500" title={disabledReason}>
            {disabledReason}
            {hasLocalSpecimen ? ' A specimen is already on file for this user.' : ''}
          </div>
        </div>
      );
    }

    return (
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-[10px]"
        title="Read the Electronic Signature tab in MaintainX (nothing is saved)"
        onClick={onPreview}
      >
        <Eye className="mr-1 h-3 w-3" />
        Preview
      </Button>
    );
  }

  if (preview.found && preview.dataUrl) {
    const isPdf = preview.contentType.toLowerCase().includes('pdf');

    return (
      <div className="space-y-1">
        {isPdf ? (
          <a
            href={preview.dataUrl}
            target="_blank"
            rel="noreferrer"
            className="flex h-10 w-24 flex-col items-center justify-center gap-0.5 rounded border border-slate-200 bg-white hover:border-blue-400"
            title="PDF specimen held in MaintainX (opens in a new tab)"
          >
            <FileText className="h-3.5 w-3.5 text-rose-600" />
            <span className="text-[8px] font-medium text-slate-600">PDF</span>
          </a>
        ) : (
          <div className="flex h-10 w-24 items-center justify-center overflow-hidden rounded border border-emerald-200 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- inline data URL from the read-only preview endpoint */}
            <img
              src={preview.dataUrl}
              alt={`MaintainX signature of account ${preview.maintainXUsername || 'unknown'}`}
              className="max-h-full max-w-full object-contain"
              decoding="async"
            />
          </div>
        )}
        <div className="text-[9px] text-slate-500">
          account {preview.maintainXUsername || preview.canonicalStaffNumber || '—'}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[150px] space-y-0.5">
      <Badge variant="outline" className="gap-1 border-amber-400 text-[10px] text-amber-700">
        <AlertCircle className="h-3 w-3" />
        {preview.status === 'ConnectorDisabled' ? 'Preview unavailable' : 'None upstream'}
      </Badge>
      <div
        className="text-[9px] leading-snug text-slate-500"
        title={preview.message || describeSignatureFetchStatus(preview.status)}
      >
        {preview.message || describeSignatureFetchStatus(preview.status)}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-5 px-1 text-[9px] text-blue-600 hover:text-blue-700"
        onClick={onPreview}
      >
        <RefreshCw className="mr-1 h-2.5 w-2.5" />
        Retry
      </Button>
    </div>
  );
}

// =====================================================================================
// Access denied
// =====================================================================================

function AccessDenied({ role, onBack, embedded }: { role: string; onBack?: () => void; embedded?: boolean }) {
  const body = (
    <Card className="border-amber-300">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Administrator access required</CardTitle>
        <CardDescription className="text-xs">{SIGNATURE_ACCESS_DENIED_MESSAGE}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-slate-600">
        <p>
          You are signed in as <span className="font-medium">{roleLabel(role) || 'an unknown role'}</span>.
        </p>
        <p className="text-[11px] text-slate-500">
          Server guard: <code className="rounded bg-slate-100 px-1 py-0.5">SIGNATURE_ADMIN_ONLY</code>
        </p>
      </CardContent>
    </Card>
  );

  if (embedded) return body;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex h-14 items-center gap-3 border-b bg-white px-4 shadow-sm">
        {onBack && (
          <Button variant="ghost" size="sm" className="h-8" onClick={onBack}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        )}
        <ShieldAlert className="h-5 w-5 text-amber-600" />
        <h1 className="text-sm font-bold">Signature Specimens</h1>
      </header>
      <div className="mx-auto max-w-3xl p-6">{body}</div>
    </div>
  );
}

// =====================================================================================
// The panel
// =====================================================================================

export default function SignatureSpecimenPanel({ onBack, embedded = false }: SignatureSpecimenPanelProps = {}) {
  const { user, isLoading: authLoading } = useAuth();
  const currentRole = String((user as { role?: string } | null)?.role ?? '');
  const isAdmin = canManageSignatures(currentRole);

  const [coverage, setCoverage] = useState<SignatureCoverageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [approverOnly, setApproverOnly] = useState(false);

  // ----- upload card state -----
  const [selectedUserId, setSelectedUserId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [remarks, setRemarks] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ----- version history dialog -----
  const [historyRow, setHistoryRow] = useState<SignatureCoverageRow | null>(null);
  const [historyRows, setHistoryRows] = useState<UserSignatureResponse[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ----- MaintainX import -----
  const [mxConnector, setMxConnector] = useState<MaintainXConnectorStatus | null>(null);
  const [importingUserId, setImportingUserId] = useState<number | null>(null);

  // ----- MaintainX ID mapping (DB-only, no browser launched) -----
  const [identities, setIdentities] = useState<Record<number, MaintainXIdentity>>({});

  // ----- MaintainX upstream specimen previews (read-only, lazy) -----
  // A preview DOES launch a browser session upstream, so it is never fired automatically
  // for the whole table: the operator asks for one row, or for the visible rows.
  const [previews, setPreviews] = useState<Record<number, MaintainXSignaturePreview>>({});
  const [previewingIds, setPreviewingIds] = useState<number[]>([]);

  // ----- revoke confirmation -----
  const [revokeTarget, setRevokeTarget] = useState<SignatureCoverageRow | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revoking, setRevoking] = useState(false);

  // -----------------------------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------------------------

  const loadCoverage = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const rows = await fetchCoverage(approverOnly);
      setCoverage(rows);
      if (rows.length === 0) {
        setLoadError('The coverage list came back empty. No users are visible to the signature service yet.');
      }
    } catch (error: unknown) {
      setCoverage([]);
      setLoadError(describeError(error, 'Failed to load the signature coverage list.').message);
    } finally {
      setLoading(false);
    }
  }, [approverOnly]);

  useEffect(() => {
    if (authLoading) return;
    if (isAdmin) {
      void loadCoverage();
    } else {
      setLoading(false);
    }
  }, [authLoading, isAdmin, loadCoverage]);

  /** Probe the connector once so the MaintainX affordances know whether to act. */
  useEffect(() => {
    if (!isAdmin) return;
    void fetchConnectorStatus()
      .then(status => setMxConnector(status))
      .catch(() => setMxConnector(null));
  }, [isAdmin]);

  /**
   * Load the resolver verdict for every visible user so the MaintainX ID column can state
   * the TRUE alignment ("SE 'director' -> MaintainX '21041'") rather than echoing the SE
   * username back. DB-only endpoint; failures degrade to "no verdict" silently.
   */
  useEffect(() => {
    if (!isAdmin || coverage.length === 0) return;
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        coverage.map(async row => {
          try {
            const identity = await fetchMaintainXIdentity(row.userId);
            return [row.userId, identity] as const;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      const next: Record<number, MaintainXIdentity> = {};
      for (const entry of entries) {
        if (entry) next[entry[0]] = entry[1];
      }
      setIdentities(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, coverage]);

  /** Local object URL for the drag-and-drop preview (revoked on change/unmount). */
  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setLocalPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setLocalPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // -----------------------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------------------

  const stats = useMemo(() => {
    const total = coverage.length;
    const covered = coverage.filter(row => row.hasActiveSignature).length;
    const approverGaps = coverage.filter(row => row.isApproverRole && !row.hasActiveSignature).length;
    const mapped = coverage.filter(row => identities[row.userId]?.isMapped).length;
    const upstream = coverage.filter(row => previews[row.userId]?.found).length;
    return { total, covered, gaps: total - covered, approverGaps, mapped, upstream };
  }, [coverage, identities, previews]);

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return coverage.filter(row => {
      if (onlyGaps && row.hasActiveSignature) return false;
      if (!needle) return true;
      const identity = identities[row.userId];
      return (
        row.fullName.toLowerCase().includes(needle) ||
        row.username.toLowerCase().includes(needle) ||
        (identity?.maintainXUsername ?? '').toLowerCase().includes(needle) ||
        alignedCanonical(identity).toLowerCase().includes(needle) ||
        (row.roleLabel || row.role).toLowerCase().includes(needle) ||
        roleLabel(row.role).toLowerCase().includes(needle) ||
        String(row.userId) === needle
      );
    });
  }, [coverage, identities, onlyGaps, search]);

  const selectedRow = useMemo(
    () => coverage.find(row => String(row.userId) === selectedUserId) ?? null,
    [coverage, selectedUserId],
  );

  /**
   * Why the MaintainX affordances are unavailable for a row, or '' when they are usable.
   *
   * NOTE: an UNMAPPED id is NOT a blocker any more. The v5 server aligns a role-style
   * login by PERSON NAME and reads the real staff number back from the Electronic
   * Signature tab, so a row such as "director" must still be previewable — that is
   * precisely the case that used to render nothing.
   */
  const maintainXBlockReason = useCallback(
    (row: SignatureCoverageRow): string => {
      if (!mxConnector?.canImportSignatures) {
        return 'MaintainX signature access is not configured on this server';
      }
      const identity = identities[row.userId];
      const mappable = identity?.isMapped || looksLikeStaffNo(row.username);
      if (!mappable && !row.fullName.trim()) {
        return 'This user has neither a MaintainX staff number nor a full name, so no upstream account can be aligned';
      }
      return '';
    },
    [identities, mxConnector],
  );

  // -----------------------------------------------------------------------------------
  // Upload
  // -----------------------------------------------------------------------------------

  const acceptFile = useCallback((candidate: File | null | undefined) => {
    if (!candidate) return;
    const problem = validateSignatureFile(candidate);
    if (problem) {
      setFile(null);
      setFileError(problem);
      toast.error(problem);
      return;
    }
    setFileError('');
    setFile(candidate);
  }, []);

  const clearFile = useCallback(() => {
    setFile(null);
    setFileError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const resetUploadForm = useCallback(() => {
    clearFile();
    setRemarks('');
    setSelectedUserId('');
  }, [clearFile]);

  const handleUpload = useCallback(async () => {
    if (!selectedUserId) {
      toast.error('Select the user this specimen belongs to.');
      return;
    }
    if (!file) {
      toast.error('Choose a signature image or PDF first.');
      return;
    }
    const problem = validateSignatureFile(file);
    if (problem) {
      setFileError(problem);
      toast.error(problem);
      return;
    }

    setUploading(true);
    try {
      const created = await uploadSignature({
        userId: Number(selectedUserId),
        file,
        remarks: remarks.trim() || undefined,
      });
      toast.success(
        `Specimen registered for ${created.userFullName || selectedRow?.fullName || `user ${selectedUserId}`}` +
          ` (version ${created.version}). Any previous active specimen was revoked automatically.`,
      );
      resetUploadForm();
      await loadCoverage();
    } catch (error: unknown) {
      const { code, message } = describeError(error, 'The signature upload failed.');
      setFileError(code ? `${code}: ${message}` : message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  }, [file, loadCoverage, remarks, resetUploadForm, selectedRow, selectedUserId]);

  // -----------------------------------------------------------------------------------
  // Version history
  // -----------------------------------------------------------------------------------

  const openHistory = useCallback(async (row: SignatureCoverageRow) => {
    setHistoryRow(row);
    setHistoryRows([]);
    setHistoryLoading(true);
    try {
      setHistoryRows(await fetchHistory(row.userId));
    } catch (error: unknown) {
      toast.error(describeError(error, 'Failed to load the version history.').message);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // -----------------------------------------------------------------------------------
  // Revoke
  // -----------------------------------------------------------------------------------

  const confirmRevoke = useCallback(async () => {
    if (!revokeTarget?.signatureId) return;
    setRevoking(true);
    try {
      await revokeSignature(revokeTarget.signatureId, revokeReason.trim() || undefined);
      toast.success(
        `Specimen version ${revokeTarget.version} revoked for ${revokeTarget.fullName}. ` +
          'Signatures already stamped on approved forms remain intact.',
      );
      const revokedUserId = revokeTarget.userId;
      setRevokeTarget(null);
      setRevokeReason('');
      await loadCoverage();
      if (historyRow?.userId === revokedUserId) {
        await openHistory(historyRow);
      }
    } catch (error: unknown) {
      toast.error(describeError(error, 'Failed to revoke the specimen.').message);
    } finally {
      setRevoking(false);
    }
  }, [historyRow, loadCoverage, openHistory, revokeReason, revokeTarget]);

  // -----------------------------------------------------------------------------------
  // MaintainX upstream preview (read-only — nothing is persisted)
  // -----------------------------------------------------------------------------------

  const loadPreview = useCallback(async (row: SignatureCoverageRow) => {
    setPreviewingIds(ids => (ids.includes(row.userId) ? ids : [...ids, row.userId]));
    try {
      const preview = await previewMaintainXSignature(row.userId);
      setPreviews(current => ({ ...current, [row.userId]: preview }));

      // (E) When the source confirms an account, adopt it so the ID column states the
      // TRUE alignment instead of echoing the SE login back.
      if (preview.found && preview.maintainXUsername) {
        setIdentities(current => {
          const existing = current[row.userId];
          if (existing && sameStaffNo(existing.maintainXUsername, preview.maintainXUsername)) {
            return current;
          }
          return {
            ...current,
            [row.userId]: {
              status: 'Mapped',
              isMapped: true,
              maintainXUsername: preview.maintainXUsername,
              canonicalStaffNumber:
                preview.canonicalStaffNumber || canonicalStaffNo(preview.maintainXUsername),
              seUserId: row.userId,
              source: 'MaintainX',
              message: 'Confirmed on the Electronic Signature tab in MaintainX.',
            },
          };
        });
      }
    } catch (error: unknown) {
      // previewMaintainXSignature never throws for a MaintainX-side condition, so this is
      // a genuine client fault worth surfacing.
      toast.error(describeError(error, 'The MaintainX specimen preview failed.').message);
    } finally {
      setPreviewingIds(ids => ids.filter(id => id !== row.userId));
    }
  }, []);

  /** Sequential on purpose: each preview drives a real upstream browser session. */
  const previewVisible = useCallback(async () => {
    const targets = visibleRows.filter(row => !previews[row.userId] && maintainXBlockReason(row) === '');
    if (targets.length === 0) {
      toast.info('Every visible row already has a MaintainX result.');
      return;
    }
    toast.info(`Reading MaintainX for ${targets.length} user(s). This runs one account at a time.`);
    for (const row of targets) {
      await loadPreview(row);
    }
  }, [loadPreview, maintainXBlockReason, previews, visibleRows]);

  // -----------------------------------------------------------------------------------
  // MaintainX import (References -> user details -> Electronic Signature)
  // -----------------------------------------------------------------------------------

  const importFromMaintainX = useCallback(
    async (row: SignatureCoverageRow) => {
      setImportingUserId(row.userId);
      try {
        const res = await importMaintainXSignature(row.userId);
        const upstreamId = res.maintainXUsername || res.canonicalStaffNumber;
        const aligned = upstreamId && !sameStaffNo(upstreamId, row.username);

        if (res.imported) {
          toast.success(
            `Specimen imported for ${row.fullName} (version ${res.version}) from MaintainX account ` +
              `${upstreamId || row.username}` +
              (aligned ? ` — aligned with SE user “${row.username || `#${row.userId}`}”.` : '.'),
          );
        } else if (res.skippedUnchanged) {
          toast.info(
            `MaintainX specimen for ${row.fullName} is unchanged (version ${res.version}); no new version created.`,
          );
        } else {
          toast.warning(res.message || describeSignatureFetchStatus(res.status));
        }

        if (upstreamId) {
          setIdentities(current => ({
            ...current,
            [row.userId]: {
              status: 'Mapped',
              isMapped: true,
              maintainXUsername: res.maintainXUsername || upstreamId,
              canonicalStaffNumber: res.canonicalStaffNumber || canonicalStaffNo(upstreamId),
              seUserId: row.userId,
              source: 'MaintainX',
              message: 'Confirmed on the Electronic Signature tab in MaintainX.',
            },
          }));
        }

        await loadCoverage();
      } catch (error: unknown) {
        toast.error(describeError(error, 'The MaintainX signature import failed.').message);
      } finally {
        setImportingUserId(null);
      }
    },
    [loadCoverage],
  );

  // -----------------------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------------------

  if (authLoading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!isAdmin) {
    return <AccessDenied role={currentRole} onBack={onBack} embedded={embedded} />;
  }

  const content = (
    <div className={embedded ? 'space-y-4' : 'mx-auto max-w-7xl space-y-4 p-6'}>
      {/* ============================ UPLOAD CARD ============================ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Register a signature specimen</CardTitle>
          <CardDescription className="text-xs">
            The file is streamed to private storage; only the server-generated storage key is kept in the database and
            it is never returned to the browser. Uploading again bumps the version and auto-revokes the previous active
            specimen — stamps already frozen onto approved forms are untouched.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {/* ---- left: owner + remarks ---- */}
            <div className="space-y-3">
              <div>
                <Label className="text-xs">
                  Signature owner <span className="text-red-600">*</span>
                </Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="mt-1 h-8 text-sm">
                    <SelectValue placeholder="Select the user this specimen belongs to..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {coverage.map(row => (
                      <SelectItem key={row.userId} value={String(row.userId)} className="text-xs">
                        {row.fullName || `User ${row.userId}`} — {row.roleLabel || roleLabel(row.role)}
                        {row.hasActiveSignature ? ` (v${row.version} on file)` : ' — MISSING'}
                      </SelectItem>
                    ))}
                    {coverage.length === 0 && (
                      <SelectItem value="__none__" disabled className="text-xs">
                        No users available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {selectedRow && (
                  <p className="mt-1 text-[10px] text-slate-500">
                    {selectedRow.hasActiveSignature
                      ? `Current specimen: version ${selectedRow.version}, uploaded ${formatUtc(
                          selectedRow.uploadedAt,
                        )}. Uploading again creates version ${selectedRow.version + 1}.`
                      : 'No specimen on file yet. Approvals by this user are recorded with a “specimen missing” warning until one is registered.'}
                  </p>
                )}
              </div>

              <div>
                <Label className="text-xs">Remarks</Label>
                <Textarea
                  value={remarks}
                  onChange={event => setRemarks(event.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="e.g. Wet-ink specimen collected 2026-08-27, scanned at 600 dpi."
                  className="mt-1 text-sm"
                />
                <p className="mt-1 text-[10px] text-slate-400">{remarks.length}/500</p>
              </div>

              <div className="rounded border border-slate-200 bg-slate-50 p-2 text-[10px] leading-relaxed text-slate-600">
                <p className="font-medium text-slate-700">Server-side guards</p>
                <p>
                  Max {formatBytes(MAX_SIGNATURE_BYTES)} · {ALLOWED_SIGNATURE_MIME.join(' · ')}
                </p>
                <p>Extension must match the declared type · magic-number sniffing · SHA-256 tamper digest</p>
                <p>Transactional version bump — a half-applied replacement is impossible</p>
              </div>
            </div>

            {/* ---- right: drag & drop ---- */}
            <div className="space-y-3">
              <Label className="text-xs">
                Specimen file <span className="text-red-600">*</span>
              </Label>
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={event => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={event => {
                  event.preventDefault();
                  setDragging(false);
                  acceptFile(event.dataTransfer?.files?.[0]);
                }}
                className={`flex min-h-[150px] cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-4 text-center transition-colors ${
                  dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white hover:border-blue-400'
                }`}
              >
                {file ? (
                  <>
                    {localPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element -- local blob preview, never uploaded through the optimiser
                      <img src={localPreview} alt="Selected specimen preview" className="max-h-20 max-w-full object-contain" />
                    ) : (
                      <FileText className="h-6 w-6 text-rose-600" />
                    )}
                    <p className="text-xs font-medium text-slate-700">{file.name}</p>
                    <p className="text-[10px] text-slate-500">
                      {file.type || 'unknown type'} · {formatBytes(file.size)}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] text-red-600 hover:text-red-700"
                      onClick={event => {
                        event.stopPropagation();
                        clearFile();
                      }}
                    >
                      <X className="mr-1 h-3 w-3" />
                      Remove
                    </Button>
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-7 w-7 text-slate-400" />
                    <p className="text-xs font-medium text-slate-700">Drop the signature file here, or click to browse</p>
                    <p className="text-[10px] text-slate-500">
                      PNG · JPEG · WebP · PDF — up to {formatBytes(MAX_SIGNATURE_BYTES)}
                    </p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={[...ALLOWED_SIGNATURE_MIME, ...ALLOWED_SIGNATURE_EXTENSIONS].join(',')}
                className="hidden"
                onChange={event => acceptFile(event.target.files?.[0])}
              />
              {fileError && (
                <p className="flex items-start gap-1 text-[10px] text-red-600">
                  <AlertCircle className="mt-[1px] h-3 w-3 flex-shrink-0" />
                  <span>{fileError}</span>
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={resetUploadForm} disabled={uploading}>
                  Clear
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => void handleUpload()}
                  disabled={uploading || !file || !selectedUserId}
                >
                  {uploading ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <UploadCloud className="mr-1 h-3.5 w-3.5" />
                  )}
                  Upload specimen
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ============================ COVERAGE TABLE ============================ */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-sm font-medium">Specimen coverage ({visibleRows.length})</CardTitle>
              <CardDescription className="text-xs">
                Users without a specimen are listed first, then signing roles, then name. The MaintainX ID column shows
                the REAL upstream staff number the Self-Evaluation user is aligned to — a role login such as
                “director” is reported as “not a staff number” instead of a false match. The MaintainX specimen column
                reads References → My User Details → Electronic Signature upstream and shows that image WITHOUT saving
                anything, so you can compare it with the specimen on file before importing.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search name, staff no, role or id..."
                  className="h-8 w-56 pl-7 text-xs"
                />
              </div>
              <Button
                variant={onlyGaps ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setOnlyGaps(value => !value)}
              >
                Gaps only
              </Button>
              <Button
                variant={approverOnly ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
                title="Ask the API for signing roles only (approverRolesOnly=true)"
                onClick={() => setApproverOnly(value => !value)}
              >
                Signing roles only
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                title="Read the MaintainX Electronic Signature tab for every visible user (read-only)"
                disabled={!mxConnector?.canImportSignatures || previewingIds.length > 0}
                onClick={() => void previewVisible()}
              >
                {previewingIds.length > 0 ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Eye className="mr-1 h-3.5 w-3.5" />
                )}
                Preview all
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadError && (
            <p className="mb-3 flex items-start gap-1 text-xs text-amber-700">
              <AlertCircle className="mt-[2px] h-3.5 w-3.5 flex-shrink-0" />
              <span>{loadError}</span>
            </p>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">On file</TableHead>
                  <TableHead className="text-xs">MaintainX specimen</TableHead>
                  <TableHead className="text-xs">User</TableHead>
                  <TableHead className="text-xs">MaintainX ID</TableHead>
                  <TableHead className="text-xs">Role</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Version</TableHead>
                  <TableHead className="text-xs">Uploaded (UTC)</TableHead>
                  <TableHead className="text-xs">SHA-256</TableHead>
                  <TableHead className="text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                    </TableCell>
                  </TableRow>
                )}

                {!loading &&
                  visibleRows.map(row => {
                    const identity = identities[row.userId];
                    const blockReason = maintainXBlockReason(row);
                    const alignedId = alignedCanonical(identity) || row.username;

                    return (
                      <TableRow key={row.userId} className={row.hasActiveSignature ? '' : 'bg-amber-50/60'}>
                        <TableCell>
                          <SignatureImage signatureId={row.signatureId} signerName={row.fullName} />
                        </TableCell>
                        <TableCell>
                          <MaintainXSpecimenCell
                            preview={previews[row.userId]}
                            loading={previewingIds.includes(row.userId)}
                            disabled={blockReason !== ''}
                            disabledReason={blockReason}
                            hasLocalSpecimen={row.hasActiveSignature}
                            onPreview={() => void loadPreview(row)}
                          />
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium">{row.fullName || `User ${row.userId}`}</div>
                          <div className="text-[10px] text-slate-500">
                            #{row.userId}
                            {row.username ? ` · ${row.username}` : ''}
                            {row.isActiveUser ? '' : ' · inactive user'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <MaintainXIdCell identity={identity} username={row.username} userId={row.userId} />
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="w-fit text-[10px]">
                              {row.roleLabel || roleLabel(row.role)}
                            </Badge>
                            {row.isApproverRole && <span className="text-[9px] text-slate-500">signs forms</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {row.hasActiveSignature ? (
                            <Badge className="gap-1 text-[10px]">
                              <CheckCircle2 className="h-3 w-3" />
                              On file
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 border-amber-400 text-[10px] text-amber-700">
                              <AlertCircle className="h-3 w-3" />
                              Missing
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.hasActiveSignature ? (
                            <span className="font-mono">
                              v{row.version}
                              {row.totalVersions && row.totalVersions > 1 ? (
                                <span className="ml-1 text-[10px] text-slate-400">of {row.totalVersions}</span>
                              ) : null}
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-[11px]">{formatUtc(row.uploadedAt)}</TableCell>
                        <TableCell className="font-mono text-[10px]" title={row.fileSha256Short || undefined}>
                          {shaPrefix(row.fileSha256Short)}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-blue-600 hover:text-blue-700"
                              title={
                                blockReason ||
                                `Import the Electronic Signature specimen from MaintainX account ${alignedId}`
                              }
                              disabled={blockReason !== '' || importingUserId !== null}
                              onClick={() => void importFromMaintainX(row)}
                            >
                              {importingUserId === row.userId ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <DownloadCloud className="h-3 w-3" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              title="Version history"
                              onClick={() => void openHistory(row)}
                            >
                              <History className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              title={row.hasActiveSignature ? 'Replace specimen' : 'Upload specimen'}
                              onClick={() => {
                                setSelectedUserId(String(row.userId));
                                clearFile();
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                            >
                              <UploadCloud className="h-3 w-3" />
                            </Button>
                            {row.signatureId && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                                title="Revoke active specimen"
                                onClick={() => {
                                  setRevokeReason('');
                                  setRevokeTarget(row);
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                {!loading && visibleRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-xs text-slate-400">
                      No users match the current filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ============================ VERSION HISTORY ============================ */}
      <Dialog
        open={Boolean(historyRow)}
        onOpenChange={open => {
          if (!open) {
            setHistoryRow(null);
            setHistoryRows([]);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Specimen history — {historyRow?.fullName || (historyRow ? `User ${historyRow.userId}` : '')}
            </DialogTitle>
            <DialogDescription>
              Every version ever registered. Revoking a version never rewrites a stamp already frozen onto an approved
              form, which is what keeps historical approvals auditable.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {historyLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : historyRows.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">
                No specimen has ever been registered for this user.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Preview</TableHead>
                    <TableHead className="text-xs">Version</TableHead>
                    <TableHead className="text-xs">File</TableHead>
                    <TableHead className="text-xs">Uploaded (UTC)</TableHead>
                    <TableHead className="text-xs">By</TableHead>
                    <TableHead className="text-xs">State</TableHead>
                    <TableHead className="text-xs">SHA-256</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyRows.map(signature => (
                    <TableRow key={signature.id}>
                      <TableCell>
                        <SignatureImage
                          signatureId={signature.id}
                          signerName={signature.userFullName}
                          fileKind={signature.fileKind}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">v{signature.version}</TableCell>
                      <TableCell className="text-[11px]">
                        <div className="max-w-[160px] truncate font-medium" title={signature.fileName}>
                          {signature.fileName || '—'}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {signature.contentType || signature.fileKind} · {formatBytes(signature.fileSizeBytes)}
                        </div>
                      </TableCell>
                      <TableCell className="text-[11px]">{formatUtc(signature.uploadedAt)}</TableCell>
                      <TableCell className="text-[11px]">{signature.uploadedBy || '—'}</TableCell>
                      <TableCell>
                        {signature.isActive ? (
                          <Badge className="text-[10px]">Active</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            Revoked{signature.revokedAt ? ` · ${formatUtc(signature.revokedAt)}` : ''}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[10px]" title={signature.fileSha256Short || undefined}>
                        {shaPrefix(signature.fileSha256Short)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setHistoryRow(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================ REVOKE CONFIRMATION ============================ */}
      <Dialog
        open={Boolean(revokeTarget)}
        onOpenChange={open => {
          if (!open) {
            setRevokeTarget(null);
            setRevokeReason('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke this specimen?</DialogTitle>
            <DialogDescription>
              {revokeTarget
                ? `Version ${revokeTarget.version} of ${revokeTarget.fullName}'s specimen will be marked revoked and ` +
                  'will no longer be applied to new approvals. Signature blocks already frozen onto approved forms ' +
                  'keep their stored reference and remain valid.'
                : ''}
            </DialogDescription>
          </DialogHeader>
          {revokeTarget && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded border border-slate-200 bg-slate-50 p-3">
                <SignatureImage signatureId={revokeTarget.signatureId} signerName={revokeTarget.fullName} size="lg" />
                <div className="space-y-1 text-[11px]">
                  <div className="font-medium">{revokeTarget.fullName}</div>
                  <div className="text-slate-500">{revokeTarget.roleLabel || roleLabel(revokeTarget.role)}</div>
                  <div className="font-mono text-[10px] text-slate-500">{shaPrefix(revokeTarget.fileSha256Short)}</div>
                </div>
              </div>
              <div>
                <Label className="text-xs">Reason (recorded in the audit log)</Label>
                <Input
                  value={revokeReason}
                  onChange={event => setRevokeReason(event.target.value)}
                  maxLength={200}
                  placeholder="e.g. Employee left the organisation."
                  className="mt-1 h-8 text-sm"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setRevokeTarget(null);
                setRevokeReason('');
              }}
              disabled={revoking}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => void confirmRevoke()}
              disabled={revoking}
            >
              {revoking && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Revoke specimen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  if (embedded) return content;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex h-14 items-center gap-3 border-b bg-white px-4 shadow-sm">
        {onBack && (
          <Button variant="ghost" size="sm" className="h-8" onClick={onBack}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        )}
        <ShieldCheck className="h-5 w-5 text-blue-600" />
        <h1 className="text-sm font-bold">Signature Specimens</h1>
        <Badge variant="outline" className="ml-2 text-xs">
          {roleLabel(currentRole)}
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {stats.covered}/{stats.total} on file
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {stats.mapped}/{stats.total} MaintainX-aligned
          </Badge>
          {stats.upstream > 0 && (
            <Badge variant="outline" className="border-emerald-300 text-[10px] text-emerald-700">
              {stats.upstream} upstream specimen(s) found
            </Badge>
          )}
          {stats.approverGaps > 0 && (
            <Badge variant="outline" className="border-amber-300 text-[10px] text-amber-700">
              {stats.approverGaps} signing roles missing
            </Badge>
          )}
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => void loadCoverage()} disabled={loading}>
            {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>
      </header>
      {content}
    </div>
  );
}