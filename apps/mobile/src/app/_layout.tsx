import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, I18nManager, View } from 'react-native';
import { directionFor, type Locale } from '@kitchen/i18n';
import { queryClient } from '../lib/queryClient';
import { useLocale } from '../lib/locale';
import { useBootstrap } from '../lib/bootstrap';
import { useAppFonts } from '../lib/font-loader';
import { useOfflineSync } from '../hooks/offline-sync';
import { setMockLocale } from '../mocks';
import { startConnectivityMonitor } from '../stores/connectivity';
import { useAuthStore } from '../stores/auth';
import { OfflineBanner } from '../components/OfflineBanner';
import { SyncFailuresBanner } from '../components/SyncFailuresBanner';
import { colors } from '../theme';

/**
 * Apply layout direction from the active locale. `I18nManager.forceRTL` only
 * takes full effect after an app reload, so switching language in Settings
 * prompts the user to restart (see settings screen). On a fresh launch the
 * device locale is already applied here.
 */
function applyDirection(locale: Locale): void {
  const rtl = directionFor(locale) === 'rtl';
  if (I18nManager.isRTL !== rtl) {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
  }
}

/**
 * Sends the user to sign-in the moment the session ends, from wherever they
 * are. `onAuthExpired` flips the auth store, but only `app/index.tsx` reads it
 * to redirect and it is not remounted — so a 401 mid-session used to leave the
 * user sitting on a screen whose every query now failed.
 */
function useSignedOutRedirect(ready: boolean): void {
  const router = useRouter();
  const segments = useSegments();
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    if (!ready || status !== 'signedOut') return;
    // The auth group is already the destination; redirecting again would fight
    // the user typing their password.
    if (segments[0] === '(auth)') return;
    router.replace('/sign-in');
  }, [ready, status, segments, router]);
}

export default function RootLayout() {
  const { locale } = useLocale();
  const ready = useBootstrap();
  applyDirection(locale);
  useAppFonts();
  useOfflineSync();
  useSignedOutRedirect(ready);

  // Mocks have no locale header; mirror the app locale into the mock layer so
  // AI-generated plan/entry content comes back in the right language.
  useEffect(() => {
    setMockLocale(locale);
  }, [locale]);

  // Track real device connectivity for the whole app lifetime.
  useEffect(() => startConnectivityMonitor(), []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: 'slide_from_right',
            }}
          />
          {ready ? null : (
            <View
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                start: 0,
                end: 0,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.bg,
              }}
            >
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          )}
          <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, start: 0, end: 0 }}>
            <OfflineBanner />
            <SyncFailuresBanner />
          </View>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
