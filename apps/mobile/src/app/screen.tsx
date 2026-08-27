import { useEffect, type ReactNode } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useRouter } from 'expo-router';
import { formatRemaining } from '@kitchen/contracts';
import { AppText, Button, Icon, LoadingState, ErrorState } from '../components';
import { useFormat } from '../hooks/useFormat';
import { useHouseholds } from '../hooks/profile';
import {
  useAcknowledgeReminder,
  useReminderOccurrences,
  useReminderSettings,
} from '../hooks/reminders';
import { useTimers } from '../hooks/timers';
import { useTimerTick } from '../lib/timers';
import { useAuthStore } from '../stores/auth';
import {
  activeNudge,
  featuredTimer,
  hasAnyNudge,
  hydrationProgressText,
  kioskOrientation,
  needsTick,
  wellnessPlanLines,
} from '../lib/screen';
import { formatDateL } from '../lib/format';
import { radius, spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

/**
 * The kitchen kiosk: the phone propped against the backsplash while you cook
 * (kitchen companion spec — Feature 1).
 *
 * It shows nothing it cannot source. The wellness plan comes from
 * `SCHEDULED_REMINDER_TYPES`, the nudge from the same `pendingNudge` the web
 * kiosk reads, the countdown from a real `cooking_timers` row. This screen was
 * held back until those engines existed precisely so it would not have to
 * invent any of them.
 *
 * Two behaviours are the point of it being a *kiosk* rather than another list:
 *
 * - `useKeepAwake` holds the display on. A screen that sleeps after 30 seconds
 *   is not something you glance at with wet hands.
 * - It is the only screen allowed to rotate. `app.json` locks the app to
 *   portrait, which is right everywhere else and wrong here: a phone on its
 *   side against a wall is the shape this view was designed for. The lock is
 *   restored on the way out, so nothing else inherits landscape.
 */
export default function KitchenScreen() {
  useKeepAwake();
  const { t, locale } = useFormat();
  const router = useRouter();
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();

  const householdsQuery = useHouseholds();
  const activeHouseholdId = useAuthStore((state) => state.activeHouseholdId);
  const settingsQuery = useReminderSettings();
  const occurrencesQuery = useReminderOccurrences();
  const timersQuery = useTimers();
  const acknowledge = useAcknowledgeReminder();

  const timers = timersQuery.data?.items ?? [];
  const tick = useTimerTick(needsTick(timers, new Date()));

  useEffect(() => {
    void ScreenOrientation.unlockAsync();
    return () => {
      // Restoring the app-wide lock is not cleanup politeness: leaving the
      // orientation unlocked would let every screen pushed after this one
      // rotate into a layout none of them were built for.
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  const frame = (child: ReactNode) => (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>{child}</SafeAreaView>
  );

  if (settingsQuery.isLoading) return frame(<LoadingState />);
  if (settingsQuery.isError) {
    return frame(
      <ErrorState error={settingsQuery.error} onRetry={() => void settingsQuery.refetch()} />,
    );
  }
  if (!settingsQuery.data) return frame(null);

  const settings = settingsQuery.data;
  const occurrences = occurrencesQuery.data ?? [];
  const nudge = activeNudge(occurrences);
  const planLines = wellnessPlanLines(settings, t);
  const timer = featuredTimer(timers, tick);
  const isLandscape = kioskOrientation(width, height) === 'landscape';
  const householdName =
    householdsQuery.data?.find((household) => household.id === activeHouseholdId)?.name ??
    t('mobile.screen.title');

  const hero = (
    <View
      accessibilityLabel={t('mobile.screen.planLabel')}
      style={{
        flex: isLandscape ? 1.4 : undefined,
        gap: spacing.lg,
        padding: spacing.xl,
        borderRadius: radius.xl,
        backgroundColor: colors.surfaceInverse,
        justifyContent: 'center',
      }}
    >
      <AppText variant="label" style={{ color: colors.textInverseMuted }}>
        {hasAnyNudge(settings) ? t('mobile.screen.planLabel') : t('mobile.screen.planIdleLabel')}
      </AppText>

      {nudge ? (
        <View style={{ gap: spacing.lg, alignItems: 'flex-start' }}>
          <AppText variant="title" style={{ color: colors.textInverse }}>
            {t(nudge.messageKey as 'reminders.break.body')}
          </AppText>
          <Button
            title={t('mobile.screen.nudgeAcknowledge')}
            disabled={acknowledge.isPending}
            onPress={() => acknowledge.mutate(nudge.id)}
          />
        </View>
      ) : planLines.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          {planLines.map((line) => (
            <AppText key={line} variant="heading" style={{ color: colors.textInverse }}>
              {line}
            </AppText>
          ))}
        </View>
      ) : (
        <View style={{ gap: spacing.lg, alignItems: 'flex-start' }}>
          <AppText variant="body" style={{ color: colors.textInverseMuted }}>
            {t('mobile.screen.planIdle')}
          </AppText>
          <Button
            title={t('mobile.screen.planIdleCta')}
            variant="secondary"
            onPress={() => router.push('/settings/reminders')}
          />
        </View>
      )}
    </View>
  );

  const cards = (
    <View style={{ flex: isLandscape ? 1 : undefined, gap: spacing.lg }}>
      <MiniCard
        icon="clock"
        tone="primary"
        label={timer ? timer.label : t('mobile.screen.timerLabel')}
        value={timer ? formatRemaining(timer.remainingSec) : t('mobile.screen.timerEmpty')}
        onPress={() => router.push('/timers')}
      />
      <MiniCard
        icon="water"
        tone="accent"
        label={t('mobile.screen.hydrationLabel')}
        value={hydrationProgressText(occurrences, settings, t)}
        onPress={() => router.push('/wellness')}
      />
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.md,
        }}
      >
        <AppText variant="display">
          {formatDateL(locale, tick, { hour: '2-digit', minute: '2-digit' })}
        </AppText>
        <AppText variant="label" muted style={{ flex: 1 }} numberOfLines={1}>
          {householdName}
        </AppText>
        <Button title={t('mobile.screen.exit')} variant="ghost" onPress={() => router.back()} />
      </View>

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          gap: spacing.lg,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.xl,
        }}
      >
        <View style={{ flex: 1, gap: spacing.lg, flexDirection: isLandscape ? 'row' : 'column' }}>
          {hero}
          {cards}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MiniCard({
  icon,
  tone,
  label,
  value,
  onPress,
}: {
  icon: 'clock' | 'water';
  tone: 'primary' | 'accent';
  label: string;
  value: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value}`}
      onPress={onPress}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg,
        padding: spacing.xl,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tone === 'primary' ? colors.primarySoft : colors.accentSoft,
        }}
      >
        <Icon name={icon} size={24} color={tone === 'primary' ? colors.primaryText : colors.text} />
      </View>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <AppText variant="label" muted numberOfLines={1}>
          {label}
        </AppText>
        <AppText variant="title">{value}</AppText>
      </View>
    </Pressable>
  );
}
