'use client';

import { useEffect } from 'react';
import { initErrorSuppressor } from '@/lib/error-suppressor';

export function ClientInit() {
  useEffect(() => {
    // Initialize error suppressor to show user-friendly messages in production
    initErrorSuppressor();
  }, []);

  return null;
}