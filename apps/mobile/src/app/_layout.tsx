import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';
import { I18nManager } from 'react-native';
import { directionFor } from '@kitchen/i18n';
import { useLocale } from '../lib/locale';

/**
 * Root layout. Locale drives layout direction, so Arabic mirrors the whole
 * navigator rather than individual screens.
 */
export default function RootLayout() {
  const { locale } = useLocale();
  const client = useMemo(() => new QueryClient(), []);

  const rtl = directionFor(locale) === 'rtl';
  if (I18nManager.isRTL !== rtl) {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
  }

  return (
    <QueryClientProvider client={client}>
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}
