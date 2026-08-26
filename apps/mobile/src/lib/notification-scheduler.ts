import { Platform } from 'react-native';
import type * as NotificationsModule from 'expo-notifications';
import type { Translator } from '@kitchen/i18n';
import type { PendingNotification } from './notifications';

/**
 * The only file that talks to the OS notification APIs.
 *
 * Everything about *what* to schedule lives in `notifications.ts`, which is
 * pure and tested. This half is the part that cannot be tested without a
 * device, so it is kept as small and as boring as possible.
 */

type NotificationsApi = typeof NotificationsModule;

let resolved: NotificationsApi | null | undefined;

/**
 * Is the native half of the notifications module actually in this binary?
 *
 * This is the same check Expo's own `requireOptionalNativeModule` makes,
 * inlined so that reading it costs nothing and cannot itself throw.
 */
function nativeModuleInstalled(name: string): boolean {
  const registry = (globalThis as { expo?: { modules?: Record<string, unknown> } }).expo?.modules;
  return Boolean(registry?.[name]);
}

/**
 * Loaded lazily, and allowed to be missing.
 *
 * `expo-notifications` calls `requireNativeModule` for ten native modules as
 * it is imported, and each one *throws* when the binary predates the
 * dependency. Because this file is reached from the root layout, that throw
 * took the entire app down to a red screen before a single pixel rendered —
 * no kitchen, no pantry, no plans, over a feature the user may never have
 * switched on.
 *
 * The JS and the native binary drift apart routinely here: the dev server
 * serves today's JavaScript to whatever build happens to be installed. So the
 * registry is asked first, and the import only happens once the answer is yes.
 * A `try` around it is not enough on its own — the throw escapes it — but it
 * stays as a second line of defence for the other nine modules.
 */
function api(): NotificationsApi | null {
  if (resolved !== undefined) return resolved;
  if (!nativeModuleInstalled('ExpoNotificationScheduler')) {
    resolved = null;
    return resolved;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    resolved = require('expo-notifications') as NotificationsApi;
  } catch {
    resolved = null;
  }
  return resolved;
}

/**
 * Delivered while the app is open, too.
 *
 * Without this, a notification that fires with the app in the foreground is
 * swallowed on iOS — which reads as "notifications don't work" during exactly
 * the moment someone is testing whether notifications work.
 */
export function configureNotificationHandler(): void {
  const notifications = api();
  if (!notifications) return;
  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** `unavailable` means this build cannot notify at all — not that it was refused. */
export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export async function currentPermission(): Promise<PermissionState> {
  const notifications = api();
  if (!notifications) return 'unavailable';
  const { status } = await notifications.getPermissionsAsync();
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

/**
 * Asks only when there is something to ask about.
 *
 * iOS gives an app exactly one chance at the system prompt for the life of the
 * install; once denied, calling this again does nothing at all and the only
 * remaining route is the Settings app. So the caller must have a reason to
 * ask — never on first launch, before the user has any food to be reminded of.
 */
export async function requestPermission(): Promise<PermissionState> {
  const notifications = api();
  if (!notifications) return 'unavailable';
  const existing = await currentPermission();
  if (existing !== 'undetermined') return existing;
  const { status } = await notifications.requestPermissionsAsync();
  return status === 'granted' ? 'granted' : 'denied';
}

function textFor(
  notification: PendingNotification,
  t: Translator,
): { title: string; body: string } {
  if (notification.kind === 'meal') {
    return {
      title: t('mobile.notifications.mealTitle'),
      body: t('mobile.notifications.mealBody', { title: notification.title ?? '' }),
    };
  }

  if (notification.kind === 'expired') {
    return {
      title: t('mobile.notifications.expiredTitle'),
      body: t('mobile.notifications.expiredBody', { count: notification.count }),
    };
  }

  if (notification.kind === 'shopping') {
    return {
      title: t('mobile.notifications.shoppingTitle'),
      body: t('mobile.notifications.shoppingBody', { count: notification.count }),
    };
  }

  if (notification.kind === 'planning') {
    return {
      title: t('mobile.notifications.planningTitle'),
      body: t('mobile.notifications.planningBody'),
    };
  }

  const { count, daysUntil } = notification;
  const title = t('mobile.notifications.expiryTitle');
  if (daysUntil <= 0) return { title, body: t('mobile.notifications.expiryToday', { count }) };
  if (daysUntil === 1) return { title, body: t('mobile.notifications.expiryTomorrow', { count }) };
  return { title, body: t('mobile.notifications.expirySoon', { count, days: daysUntil }) };
}

/**
 * Replaces everything pending with the given plan.
 *
 * Cancel-then-schedule rather than diffing: the inventory changes constantly,
 * and a diff that gets it slightly wrong leaves a notification about food that
 * was eaten last week — which teaches people the reminders are wrong and to
 * ignore them. Rescheduling ~50 local notifications is cheap.
 *
 * The text is baked in at schedule time, so this must re-run when the language
 * changes or pending notifications would arrive in the previous one.
 */
export async function applyNotificationPlan(
  plan: readonly PendingNotification[],
  t: Translator,
): Promise<number> {
  const notifications = api();
  if (!notifications) return 0;
  await notifications.cancelAllScheduledNotificationsAsync();

  let scheduled = 0;
  for (const notification of plan) {
    const { title, body } = textFor(notification, t);
    await notifications.scheduleNotificationAsync({
      content: { title, body, data: { kind: notification.kind } },
      trigger: {
        type: notifications.SchedulableTriggerInputTypes.DATE,
        date: notification.fireAt,
      },
    });
    scheduled += 1;
  }
  return scheduled;
}

export async function cancelAllNotifications(): Promise<void> {
  const notifications = api();
  if (!notifications) return;
  await notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Android refuses to show a notification that has no channel, silently, and
 * the default channel is not created for you. iOS has no such concept.
 */
export async function ensureAndroidChannel(name: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  const notifications = api();
  if (!notifications) return;
  await notifications.setNotificationChannelAsync('kitchen-reminders', {
    name,
    importance: notifications.AndroidImportance.DEFAULT,
  });
}
