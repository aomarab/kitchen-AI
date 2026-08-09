'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Locale } from '@kitchen/i18n';
import { MOCKING_ENABLED } from '../lib/config';
import { setMockLocale } from './runtime';

const MocksReadyContext = createContext(!MOCKING_ENABLED);

/**
 * True once mock interception is live (or immediately when mocking is off).
 * Query hooks gate on this so no request escapes the mock during service-worker
 * activation. Server-rendered content is never blocked — only client fetching.
 */
export function useMocksReady(): boolean {
  return useContext(MocksReadyContext);
}

export function MswProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [ready, setReady] = useState(!MOCKING_ENABLED);

  useEffect(() => {
    setMockLocale(locale);
    if (!MOCKING_ENABLED) return;
    let active = true;
    void import('./browser')
      .then(({ worker }) => worker.start({ onUnhandledRequest: 'bypass', quiet: true }))
      .catch((error: unknown) => {
        // Service-worker registration fails on insecure origins, in private
        // windows, and when the script 404s. Every query gates on `ready`, so
        // swallowing this left the whole app as a permanent spinner with no
        // clue why. Let the requests through and let them fail visibly.
        console.error('[mocks] worker failed to start; continuing unmocked', error);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [locale]);

  return <MocksReadyContext.Provider value={ready}>{children}</MocksReadyContext.Provider>;
}
