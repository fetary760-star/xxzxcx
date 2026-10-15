'use client';

/**
 * =====================================================================================
 * PHASE 1 — AMENDED (NEW FILE)
 * Copy to: CMT.Frontend/src/app/admin/signatures/page.tsx
 *
 * THE ROUTE for the Admin specimen library.
 *
 * Everything substantive lives in `SignatureSpecimenPanel`, so this file only does the
 * two things a route segment should:
 *   (1) inject navigation (`router.push('/admin')`) — the panel itself imports no
 *       router, which is why the same component can also be embedded as a tab inside
 *       `/admin`;
 *   (2) mark the segment dynamic, because the coverage table is per-session data and
 *       must never be statically pre-rendered or cached.
 *
 * NOTE ON THE OLD FILE
 * --------------------
 * `src/app/pages/AdminSignatures.tsx` must be DELETED as part of this phase. It lived
 * under `src/app/**` without being a `page.tsx`, so it was never routable, and it
 * duplicated the contract types and the upload transport that now live in
 * `src/lib/signature-api.ts`.
 * =====================================================================================
 */

import { useRouter } from 'next/navigation';
import SignatureSpecimenPanel from '@/components/admin/SignatureSpecimenPanel';

export default function AdminSignaturesPage() {
  const router = useRouter();
  return <SignatureSpecimenPanel onBack={() => router.push('/admin')} />;
}