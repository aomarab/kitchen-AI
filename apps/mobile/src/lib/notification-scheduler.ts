import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Translator } from '@kitchen/i18n';
import type { PendingNotification } from './notifications';

/**
 * The only file that talks to the OS notification APIs.
 *
 * Everything about *what* to schedule lives in `notifications.ts`, which is
 * pure and tested. This half is the part that cannot be tested without a
 * device, so it is kept as small and as boring as possible.
 */

/**
 * Delivered while the app is open, too.
 *
 * Without this, a notification that fires with the app in the foreground is
 * swallowed on iOS — which reads as "notifications don't work" during exactly
 * the moment someone is testing whether notifications work.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function currentPermission(): Promise<PermissionState> {
  const { status } = await Notifications.getPermissionsAsync();
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
  const existing = await currentPermission();
  if (existing !== 'undetermined') return existing;
  const { status } = await Notifications.requestPermissionsAsync();
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
  await Notifications.cancelAllScheduledNotificationsAsync();

  let scheduled = 0;
  for (const notification of plan) {
    const { title, body } = textFor(notification, t);
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { kind: notification.kind } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: notification.fireAt,
      },
    });
    scheduled += 1;
  }
  return scheduled;
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Android refuses to show a notification that has no channel, silently, and
 * the default channel is not created for you. iOS has no such concept.
 */
export async function ensureAndroidChannel(name: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('kitchen-reminders', {
    name,
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}
