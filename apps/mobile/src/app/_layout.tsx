import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, I18nManager, View } from 'react-native';
import { queryClient } from '../lib/queryClient';
import { normalizeNativeDirection } from '../lib/direction';
import { useLocale } from '../lib/locale';
import { useBootstrap } from '../lib/bootstrap';
import { useAppFonts } from '../lib/font-loader';
import { useOfflineSync } from '../hooks/offline-sync';
import { useNotificationScheduler } from '../hooks/notifications';
import { configureNotificationHandler } from '../lib/notification-scheduler';
import { setMockLocale } from '../mocks';
import { startConnectivityMonitor } from '../stores/connectivity';
import { useAuthStore } from '../stores/auth';
import { OfflineBanner } from '../components/OfflineBanner';
import { SyncFailuresBanner } from '../components/SyncFailuresBanner';
import { colors } from '../theme';

/**
 * Layout direction is a *style*, not a native flag.
 *
 * `I18nManager.forceRTL` only takes effect at launch, so switching language
 * used to leave Arabic text inside an English layout until the user restarted
 * the app — the "corruption" people reported, and the reason Settings had to
 * show a restart prompt. Every component here is written in logical properties
 * (`start`/`end`, `marginStart`, `writingDirection`), which is precisely what
 * Yoga's `direction` resolves, so setting `direction` on the root view mirrors
 * the whole tree the moment the locale changes.
 *
 * The persisted native flag is still cleared once at startup, or an install
 * upgraded from a build that called `forceRTL(true)` would mirror twice.
 */


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
  const { locale, dir } = useLocale();
  const ready = useBootstrap();
  useAppFonts();
  useOfflineSync();
  useNotificationScheduler();
  useSignedOutRedirect(ready);

  useEffect(() => {
    configureNotificationHandler();
  }, []);

  useEffect(() => {
    normalizeNativeDirection(I18nManager);
  }, []);
  // Mocks have no locale header; mirror the app locale into the mock layer so
  // AI-generated plan/entry content comes back in the right language.
  useEffect(() => {
    setMockLocale(locale);
  }, [locale]);

  // Track real device connectivity for the whole app lifetime.
  useEffect(() => startConnectivityMonitor(), []);

  return (
    <GestureHandlerRootView style={{ flex: 1, direction: dir }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              // Push has to travel *with* the reading direction, or Arabic
              // screens arrive from the side the back gesture lives on.
              animation: dir === 'rtl' ? 'slide_from_left' : 'slide_from_right',
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
