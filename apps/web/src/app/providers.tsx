'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { Locale } from '@kitchen/i18n';
import { LocaleProvider } from '../lib/locale';
import { MswProvider } from '../mocks/provider';

export function Providers({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <MswProvider locale={locale}>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </MswProvider>
    </QueryClientProvider>
  );
}
