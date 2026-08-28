'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import type { Locale } from '@kitchen/i18n';
import { LocaleProvider } from '../lib/locale';
import { MswProvider } from '../mocks/provider';
import { startConnectivityMonitor } from '../stores/connectivity';

export function Providers({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
      }),
  );

  // App-wide, not kiosk-only: the kiosk is the surface that *shows* the state,
  // but the browser's offline event has to be listened for wherever the user is
  // when the wifi drops.
  useEffect(() => startConnectivityMonitor(), []);

  return (
    <QueryClientProvider client={client}>
      <MswProvider locale={locale}>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </MswProvider>
    </QueryClientProvider>
  );
}
