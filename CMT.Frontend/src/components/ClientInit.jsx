'use client';
// Small client component that imports and runs the suppressor when the app renders.
// Add this file and then include <ClientInit /> once in your root layout.

import '../lib/suppressPerformanceProxyLogs';

export default function ClientInit() {
  // This component intentionally renders nothing; it simply ensures the suppressor runs on the client.
  return null;
}