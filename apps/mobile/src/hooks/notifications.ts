import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useInventory } from './inventory';
import { usePlans } from './plans';
import { useLocale } from '../lib/locale';
import { useAuthStore } from '../stores/auth';
import { useSettingsStore } from '../stores/settings';
import { planNotifications, type PlannedMeal } from '../lib/notifications';
import {
  applyNotificationPlan,
  cancelAllNotifications,
  currentPermission,
  ensureAndroidChannel,
} from '../lib/notification-scheduler';
import { todayISODate } from '../lib/expiry';

/**
 * Keeps the phone's pending reminders in step with the kitchen.
 *
 * Local notifications are a snapshot: once scheduled they know nothing about
 * the food being eaten, the date being corrected or the language changing. So
 * everything that could make a pending reminder wrong is a dependency here,
 * and the whole set is rebuilt when any of it moves.
 *
 * Deliberately does *not* ask for permission. iOS grants exactly one system
 * prompt per install, and spending it on a launch screen — before the user has
 * any food in the app to be reminded about — is how an app ends up permanently
 * unable to notify. The ask lives in Settings, next to the explanation.
 */
export function useNotificationScheduler(): void {
  const signedIn = useAuthStore((state) => state.status === 'signedIn');
  const { t, locale } = useLocale();
  const notifyExpiry = useSettingsStore((state) => state.notifyExpiry);
  const notifyMeals = useSettingsStore((state) => state.notifyMeals);
  const leadDays = useSettingsStore((state) => state.expiryLeadDays);
  const reminderHour = useSettingsStore((state) => state.reminderHour);

  const inventory = useInventory({ limit: 200 });
  const plans = usePlans();

  const items = inventory.data?.items;
  const planList = plans.data;

  // A stale signature is the whole failure mode, so it is derived from the
  // exact fields the plan is built out of rather than from object identity —
  // TanStack hands back a new array on every refetch even when nothing moved.
  const signature = [
    locale,
    notifyExpiry,
    notifyMeals,
    leadDays,
    reminderHour,
    (items ?? []).map((item) => item.expiresAt ?? '-').join(','),
    (planList ?? [])
      .flatMap((plan) => plan.entries.map((entry) => `${entry.date}:${entry.recipe.title}`))
      .join(','),
  ].join('|');

  const lastApplied = useRef<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    if (items === undefined && planList === undefined) return;
    if (lastApplied.current === signature) return;

    let cancelled = false;
    const run = async () => {
      const permission = await currentPermission();
      if (cancelled) return;

      // Never scheduled without permission — and clear anything left over from
      // when it was granted, or the user revokes it and reminders keep firing.
      if (permission !== 'granted' || (!notifyExpiry && !notifyMeals)) {
        await cancelAllNotifications();
        lastApplied.current = signature;
        return;
      }

      await ensureAndroidChannel(t('mobile.settings.notifications'));

      const today = todayISODate();
      const meals: PlannedMeal[] = notifyMeals
        ? (planList ?? [])
            .flatMap((plan) => plan.entries)
            .filter((entry) => entry.date >= today)
            .map((entry) => ({ date: entry.date, title: entry.recipe.title }))
        : [];

      const plan = planNotifications({
        items: notifyExpiry ? (items ?? []) : [],
        meals,
        leadDays,
        hour: reminderHour,
        now: new Date(),
      });

      if (cancelled) return;
      await applyNotificationPlan(plan, t);
      lastApplied.current = signature;
    };

    void run();
    return () => {
      cancelled = true;
    };
    // `t` is rebuilt on every render and so is deliberately absent: `locale`,
    // which is the only thing that changes its output, is inside `signature`.
  }, [signedIn, signature, items, planList, notifyExpiry, notifyMeals, leadDays, reminderHour]);

  /*
   * Reminders are scheduled relative to "now", so an app left open across
   * midnight — or reopened days later — is holding a plan built against the
   * wrong day. Coming back to the foreground re-runs it.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') lastApplied.current = null;
    });
    return () => subscription.remove();
  }, []);
}
