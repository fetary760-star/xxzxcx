'use client';

/**
 * =====================================================================================
 * PHASE 1 — AMENDED (NEW FILE)
 * Copy to: CMT.Frontend/src/components/admin/SignatureImage.tsx
 *
 * WHAT THIS COMPONENT IS
 * ----------------------
 * The ONE sanctioned way a stored specimen is ever rendered in this application.
 * It is used by the Admin specimen library (Phase 1) and will be reused unchanged by
 * the per-form signature block (Phase 2), so there is exactly one place where a
 * signature image can appear — and therefore exactly one place to audit.
 *
 * WHY IT FETCHES INSTEAD OF USING `<img src="/api/...">`
 * -----------------------------------------------------
 * The previous panel did `<img src={`/api/admin/signatures/${id}/file`} />`. That
 * works only while the browser is willing to attach the session cookie to a
 * sub-resource request. Under `SameSite=Strict` / `Lax` cookies, a stricter CSP, or
 * any deployment where the API sits on another origin, the image request goes out
 * ANONYMOUS and the specimen silently renders as a broken image — with no error the
 * operator can act on.
 *
 * This component instead calls `loadSignatureObject(id)`, which performs a real
 * `fetch(..., { credentials: 'include' })` through the Phase 1 proxy, reads the
 * bytes, and wraps them in a short-lived `blob:` object URL. Consequences:
 *   - no credential, token or bucket key ever appears in markup;
 *   - a 401 / 403 / 404 surfaces as a readable message instead of a broken icon;
 *   - the object URL is revoked on unmount / id change, so specimen bytes do not
 *     accumulate in memory across a long admin session.
 *
 * PDF SPECIMENS
 * -------------
 * A PDF cannot be shown inside `<img>`. Requirement #13 explicitly allows "image or
 * PDF", so a PDF specimen renders as a labelled card with an "Open" affordance that
 * uses the very same authorised object URL.
 * =====================================================================================
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, ImageOff, Loader2 } from 'lucide-react';
import { isPdfSpecimen, loadSignatureObject } from '@/lib/signature-api';

export type SignatureImageSize = 'sm' | 'md' | 'lg';

const BOX_CLASS: Record<SignatureImageSize, string> = {
  sm: 'h-10 w-24',
  md: 'h-16 w-40',
  lg: 'h-28 w-56',
};

export interface SignatureImageProps {
  /** `user_signatures.id`. When null/empty an explicit "no specimen" box is drawn. */
  signatureId: string | null | undefined;
  /** Used for the alt text and the PDF label. */
  signerName?: string | null;
  /** "Image" | "Pdf" | a MIME type. Decides preview vs PDF card. */
  fileKind?: string | null;
  size?: SignatureImageSize;
  /** Extra classes on the outer box. */
  className?: string;
  /** Hide the dashed placeholder and render nothing when there is no specimen. */
  hideWhenEmpty?: boolean;
}

export default function SignatureImage({
  signatureId,
  signerName,
  fileKind,
  size = 'sm',
  className = '',
  hideWhenEmpty = false,
}: SignatureImageProps) {
  const [objectUrl, setObjectUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string>('');
  const releaseRef = useRef<(() => void) | null>(null);
  const box = `${BOX_CLASS[size]} ${className}`.trim();
  const isPdf = isPdfSpecimen(fileKind);

  /** Releases the previous object URL before a new one replaces it. */
  const release = useCallback(() => {
    if (releaseRef.current) {
      releaseRef.current();
      releaseRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    release();
    setObjectUrl('');
    setFailure('');

    if (!signatureId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    void (async () => {
      try {
        const object = await loadSignatureObject(signatureId);
        if (cancelled) {
          if (object.isObjectUrl) URL.revokeObjectURL(object.url);
          return;
        }
        if (object.isObjectUrl) {
          releaseRef.current = () => URL.revokeObjectURL(object.url);
        }
        setObjectUrl(object.url);
      } catch (error: unknown) {
        if (!cancelled) {
          setFailure(error instanceof Error ? error.message : 'The specimen could not be loaded.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      release();
    };
  }, [signatureId, release]);

  if (!signatureId) {
    if (hideWhenEmpty) return null;
    return (
      <div
        className={`${box} flex items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50`}
        title="No specimen registered for this user"
      >
        <span className="text-[9px] text-slate-400">No specimen</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`${box} flex items-center justify-center rounded border border-slate-200 bg-white`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (failure) {
    return (
      <div
        className={`${box} flex items-center justify-center gap-1 rounded border border-amber-300 bg-amber-50 px-1`}
        title={failure}
      >
        <ImageOff className="h-3 w-3 flex-shrink-0 text-amber-600" />
        <span className="truncate text-[9px] text-amber-700">Unavailable</span>
      </div>
    );
  }

  if (isPdf) {
    return (
      <a
        href={objectUrl || undefined}
        target="_blank"
        rel="noreferrer"
        className={`${box} flex flex-col items-center justify-center gap-1 rounded border border-slate-200 bg-white hover:border-blue-400`}
        title={`PDF specimen${signerName ? ` — ${signerName}` : ''} (opens in a new tab)`}
      >
        <FileText className="h-4 w-4 text-rose-600" />
        <span className="text-[9px] font-medium text-slate-600">PDF specimen</span>
      </a>
    );
  }

  return (
    <div className={`${box} flex items-center justify-center overflow-hidden rounded border border-slate-200 bg-white`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a blob: object URL must not go through the image optimiser */}
      <img
        src={objectUrl}
        alt={`Signature specimen${signerName ? ` of ${signerName}` : ''}`}
        className="max-h-full max-w-full object-contain"
        decoding="async"
        onError={() => setFailure('The specimen bytes could not be decoded.')}
      />
    </div>
  );
}