import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useInventory } from './inventory';
import { usePlans } from './plans';
import { useShoppingList } from './shopping';
import { useTimers } from './timers';
import { useLocale } from '../lib/locale';
import { useAuthStore } from '../stores/auth';
import { useSettingsStore } from '../stores/settings';
import { useNotificationStatus } from '../stores/notification-status';
import {
  planNotifications,
  schedulerSignature,
  type NotificationToggles,
  type PlannedMeal,
  type RunningTimer,
} from '../lib/notifications';
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
  const notifyExpired = useSettingsStore((state) => state.notifyExpired);
  const notifyShopping = useSettingsStore((state) => state.notifyShopping);
  const notifyPlanning = useSettingsStore((state) => state.notifyPlanning);
  const notifyTimers = useSettingsStore((state) => state.notifyTimers);
  const leadDays = useSettingsStore((state) => state.expiryLeadDays);
  const reminderHour = useSettingsStore((state) => state.reminderHour);

  const inventory = useInventory({ limit: 200 });
  const plans = usePlans();
  const shopping = useShoppingList();
  // Mounted here rather than only on the timers screen: an alert is worth
  // having precisely when the cook has navigated away from the countdown.
  // TanStack dedupes by key, so this shares the screen's poll rather than
  // adding a second one.
  const timerQuery = useTimers();

  const items = inventory.data?.items;
  const planList = plans.data;
  const shoppingItems = shopping.data;
  const timers: RunningTimer[] = timerQuery.data?.items ?? [];

  const permission = useNotificationStatus((state) => state.permission);
  const revision = useNotificationStatus((state) => state.revision);

  const toggles: NotificationToggles = {
    expiry: notifyExpiry,
    meals: notifyMeals,
    expired: notifyExpired,
    shopping: notifyShopping,
    planning: notifyPlanning,
    timers: notifyTimers,
  };
  const anyEnabled = Object.values(toggles).some(Boolean);

  const today = todayISODate();
  // Handed over whole, with the toggles alongside: the planning nudge has to
  // see the meals even when meal reminders themselves are silenced.
  const meals: PlannedMeal[] = (planList ?? [])
    .flatMap((plan) => plan.entries)
    .filter((entry) => entry.date >= today)
    .map((entry) => ({ date: entry.date, title: entry.recipe.title }));

  const unpurchased = (shoppingItems ?? []).filter((line) => !line.purchased);

  // A stale signature is the whole failure mode, so it is derived from the
  // exact values the plan is built out of rather than from object identity —
  // TanStack hands back a new array on every refetch even when nothing moved.
  const signature = schedulerSignature({
    locale,
    toggles,
    leadDays,
    hour: reminderHour,
    permission: permission ?? 'unknown',
    revision,
    items: items ?? [],
    meals,
    unpurchasedCount: unpurchased.length,
    timers,
  });

  const lastApplied = useRef<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    if (items === undefined && planList === undefined) return;
    if (lastApplied.current === signature) return;

    let cancelled = false;
    const run = async () => {
      const observed = await currentPermission();
      if (cancelled) return;

      // Recording it changes the signature, which re-runs this effect with the
      // real value. That indirection is the point: it is also how permission
      // granted from the settings screen — with nothing else in the app
      // changing — gets the reminders armed straight away instead of at the
      // next foreground.
      if (observed !== permission) {
        useNotificationStatus.getState().setPermission(observed);
        return;
      }

      // Never scheduled without permission — and clear anything left over from
      // when it was granted, or the user revokes it and reminders keep firing.
      if (observed !== 'granted' || !anyEnabled) {
        await cancelAllNotifications();
        useNotificationStatus.getState().setScheduledCount(0);
        lastApplied.current = signature;
        return;
      }

      await ensureAndroidChannel(t('mobile.settings.notifications'));

      const plan = planNotifications({
        items: items ?? [],
        meals,
        shopping: shoppingItems ?? [],
        timers,
        toggles,
        leadDays,
        hour: reminderHour,
        now: new Date(),
      });

      if (cancelled) return;
      const scheduled = await applyNotificationPlan(plan, t);
      useNotificationStatus.getState().setScheduledCount(scheduled);
      lastApplied.current = signature;
    };

    void run();
    return () => {
      cancelled = true;
    };
    // `t` is rebuilt on every render and so is deliberately absent: `locale`,
    // which is the only thing that changes its output, is inside `signature`.
    // So are the toggles, the meals and the permission — everything read
    // inside `run` other than the raw query results, which are listed here.
  }, [signedIn, signature, items, planList, shoppingItems, timerQuery.data]);

  /*
   * Reminders are scheduled relative to "now", so an app left open across
   * midnight — or reopened days later — is holding a plan built against the
   * wrong day. Coming back to the foreground bumps a counter that is inside
   * the signature; nulling a ref here would do nothing, because a ref cannot
   * re-run the effect that reads it.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') useNotificationStatus.getState().bumpRevision();
    });
    return () => subscription.remove();
  }, []);
}
