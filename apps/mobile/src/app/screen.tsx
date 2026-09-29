import { useEffect, type ReactNode } from 'react';
import {
  ScrollView,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useRouter } from 'expo-router';
import { formatRemaining, type CookingTimer } from '@kitchen/contracts';
import {
  AppText,
  Button,
  Card,
  ErrorState,
  Icon,
  IconButton,
  LoadingState,
  Progress,
} from '../components';
import { useFormat } from '../hooks/useFormat';
import { useHouseholds } from '../hooks/profile';
import {
  useAcknowledgeReminder,
  useReminderOccurrences,
  useReminderSettings,
} from '../hooks/reminders';
import { useTimers } from '../hooks/timers';
import { formatDateL, formatMinutes } from '../lib/format';
import {
  activeNudge,
  featuredTimer,
  hasAnyNudge,
  hydrationProgressText,
  kioskLayoutMode,
  needsTick,
  wellnessPlanLines,
} from '../lib/screen';
import { kioskCardAccessibilityLabel } from '../lib/screen-accessibility';
import { useTimerTick } from '../lib/timers';
import { timerDurationMinutes, timerProgressValue } from '../lib/timer-card';
import { hydrationFraction } from '../lib/wellness';
import { useAuthStore } from '../stores/auth';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

export const KIOSK_EXIT_TARGET_SIZE = 44;
const KIOSK_CARD_MIN_HEIGHT = 182;
const KIOSK_TABLET_CARD_MIN_HEIGHT = 518;

/**
 * The kitchen kiosk keeps the display awake and temporarily unlocks rotation;
 * it only renders data sourced by the existing reminder and timer engines.
 */
export default function KitchenScreen() {
  useKeepAwake();
  const { t, locale, prefs } = useFormat();
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
  const mode = kioskLayoutMode(width, height);
  const isWide = mode === 'wide';
  const isPortrait = mode === 'portrait';
  const screenTitle = t('mobile.screen.title');
  const householdName =
    householdsQuery.data?.find((household) => household.id === activeHouseholdId)?.name ??
    screenTitle;
  const householdCaption = householdName === screenTitle ? null : householdName;
  const titleAccessibilityLabel = kioskCardAccessibilityLabel([screenTitle, householdCaption]);
  const planLabel = t('mobile.screen.planLabel');
  const heroEyebrow = hasAnyNudge(settings) ? planLabel : t('mobile.screen.planIdleLabel');
  const nudgeMessage = nudge ? t(nudge.messageKey as 'reminders.break.body') : null;
  const heroMessage =
    nudgeMessage ?? (planLines.length > 0 ? planLines.join(', ') : t('mobile.screen.planIdle'));
  const timeLabel = formatDateL(locale, tick, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const dateLabel = formatDateL(locale, tick, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const exit = () => router.back();

  const exitButton = (
    <Button
      title={t('mobile.screen.exit')}
      variant="ghost"
      size="S"
      leadingIcon="x"
      fullWidth={false}
      style={{ minHeight: KIOSK_EXIT_TARGET_SIZE }}
      onPress={exit}
    />
  );

  const cards = (
    <>
      <KioskPlanCard
        mode={mode}
        eyebrow={heroEyebrow}
        message={heroMessage}
        planLines={planLines}
        nudgeActive={!!nudge}
        busy={acknowledge.isPending}
        onAcknowledge={() => {
          if (nudge) acknowledge.mutate(nudge.id);
        }}
        onSettings={() => router.push('/settings/reminders')}
      />
      <KioskTimerCard
        mode={mode}
        timer={timer}
        durationLabel={
          timer
            ? t('mobile.recipe.minutesValue', {
                minutes: formatMinutes(locale, timerDurationMinutes(timer), prefs),
              })
            : null
        }
        onTimers={() => router.push('/timers')}
      />
      <KioskHydrationCard
        mode={mode}
        progress={hydrationFraction(occurrences, settings)}
        label={t('mobile.screen.hydrationLabel')}
        value={hydrationProgressText(occurrences, settings, t)}
        onPress={() => router.push('/wellness')}
      />
    </>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: isPortrait ? spacing.gutter : spacing.xxl,
          gap: isPortrait ? spacing.xl : spacing.xxl,
        }}
      >
        {isPortrait ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View
                accessible
                accessibilityLabel={titleAccessibilityLabel}
                style={{ flex: 1, gap: spacing.xs }}
              >
                <AppText variant="bodyStrong">{screenTitle}</AppText>
                {householdCaption ? (
                  <AppText variant="caption" muted>
                    {householdName}
                  </AppText>
                ) : null}
              </View>
              <IconButton
                icon="x"
                tone="plain"
                size={KIOSK_EXIT_TARGET_SIZE}
                accessibilityLabel={t('mobile.screen.exit')}
                onPress={exit}
              />
            </View>
            <KioskClock time={timeLabel} date={dateLabel} />
            <View style={{ gap: spacing.md }}>{cards}</View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Icon name="refresh" size={16} color={colors.textMuted} />
              <AppText variant="caption" muted>
                {t('mobile.screen.rotateHint')}
              </AppText>
            </View>
          </>
        ) : isWide ? (
          <View style={{ flex: 1, flexDirection: 'row', gap: spacing.xxl }}>
            <View style={{ width: 240, justifyContent: 'space-between', gap: spacing.xxl }}>
              <KioskClock time={timeLabel} date={dateLabel} caption={householdCaption} />
              {exitButton}
            </View>
            <View style={{ flex: 1, gap: spacing.md }}>
              <KioskPlanCard
                mode={mode}
                eyebrow={heroEyebrow}
                message={heroMessage}
                planLines={planLines}
                nudgeActive={!!nudge}
                busy={acknowledge.isPending}
                onAcknowledge={() => {
                  if (nudge) acknowledge.mutate(nudge.id);
                }}
                onSettings={() => router.push('/settings/reminders')}
              />
              <View style={{ flex: 1, flexDirection: 'row', gap: spacing.md }}>
                <KioskTimerCard
                  mode={mode}
                  timer={timer}
                  durationLabel={
                    timer
                      ? t('mobile.recipe.minutesValue', {
                          minutes: formatMinutes(locale, timerDurationMinutes(timer), prefs),
                        })
                      : null
                  }
                  onTimers={() => router.push('/timers')}
                />
                <KioskHydrationCard
                  mode={mode}
                  progress={hydrationFraction(occurrences, settings)}
                  label={t('mobile.screen.hydrationLabel')}
                  value={hydrationProgressText(occurrences, settings, t)}
                  onPress={() => router.push('/wellness')}
                />
              </View>
            </View>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xl }}>
              <View style={{ flex: 1 }}>
                <KioskClock time={timeLabel} date={dateLabel} caption={householdCaption} />
              </View>
              {exitButton}
            </View>
            <View style={{ flex: 1, flexDirection: 'row', gap: spacing.gutter }}>{cards}</View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function KioskClock({
  time,
  date,
  caption,
}: {
  time: string;
  date: string;
  caption?: string | null;
}) {
  return (
    <View style={{ gap: spacing.lg }}>
      <AppText variant="numeral">{time}</AppText>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="heading" muted>
          {date}
        </AppText>
        {caption ? (
          <AppText variant="caption" muted>
            {caption}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

function KioskCard({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          flex: 1,
          minHeight: KIOSK_CARD_MIN_HEIGHT,
        },
        style,
      ]}
    >
      {children}
    </Card>
  );
}

function KioskPlanCard({
  mode,
  eyebrow,
  message,
  planLines,
  nudgeActive,
  busy,
  onAcknowledge,
  onSettings,
}: {
  mode: 'portrait' | 'wide' | 'tablet';
  eyebrow: string;
  message: string;
  planLines: readonly string[];
  nudgeActive: boolean;
  busy: boolean;
  onAcknowledge: () => void;
  onSettings: () => void;
}) {
  const { t } = useFormat();
  const hasPlan = planLines.length > 0;
  const planAccessibilityLabel = kioskCardAccessibilityLabel([
    eyebrow,
    nudgeActive || !hasPlan ? message : planLines.join(', '),
    nudgeActive ? t('mobile.screen.nudgeAcknowledge') : null,
  ]);
  return (
    <KioskCard style={mode === 'tablet' ? { minHeight: KIOSK_TABLET_CARD_MIN_HEIGHT } : null}>
      <View style={{ flex: 1, gap: spacing.lg }}>
        <View accessible accessibilityLabel={planAccessibilityLabel} style={{ gap: spacing.md }}>
          <AppText variant="eyebrow" muted>
            {eyebrow}
          </AppText>
          {nudgeActive || !hasPlan ? (
            <AppText variant={mode === 'tablet' ? 'display' : 'title'}>{message}</AppText>
          ) : (
            planLines.map((line) => (
              <AppText key={line} variant={mode === 'tablet' ? 'title' : 'heading'}>
                {line}
              </AppText>
            ))
          )}
        </View>
        <View style={{ flexGrow: 1 }} />
        {nudgeActive ? (
          <Button
            title={t('mobile.screen.nudgeAcknowledge')}
            variant="inverse"
            size="S"
            fullWidth={false}
            disabled={busy}
            onPress={onAcknowledge}
          />
        ) : hasPlan ? null : (
          <Button
            title={t('mobile.screen.planIdleCta')}
            variant="secondary"
            size="S"
            fullWidth={false}
            onPress={onSettings}
          />
        )}
      </View>
    </KioskCard>
  );
}

function KioskTimerCard({
  mode,
  timer,
  durationLabel,
  onTimers,
}: {
  mode: 'portrait' | 'wide' | 'tablet';
  timer: CookingTimer | null;
  durationLabel: string | null;
  onTimers: () => void;
}) {
  const { t } = useFormat();
  const remaining = timer ? formatRemaining(timer.remainingSec) : null;
  const title = timer ? timer.label : t('mobile.screen.timerEmpty');
  const caption = timer
    ? mode === 'tablet'
      ? `${timer.label} · ${durationLabel}`
      : durationLabel
    : null;
  const accessibilityLabel = kioskCardAccessibilityLabel(
    timer && mode === 'tablet'
      ? [t('mobile.screen.timerLabel'), remaining, caption, t('mobile.screen.timersCta')]
      : [t('mobile.screen.timerLabel'), title, remaining, caption, t('mobile.screen.timersCta')],
  );

  return (
    <KioskCard style={mode === 'tablet' ? { minHeight: KIOSK_TABLET_CARD_MIN_HEIGHT } : null}>
      <View style={{ flex: 1, gap: spacing.lg }}>
        <View accessible accessibilityLabel={accessibilityLabel} style={{ gap: spacing.md }}>
          <AppText variant="eyebrow" muted>
            {t('mobile.screen.timerLabel')}
          </AppText>
          {timer ? (
            <>
              {mode === 'tablet' ? null : <AppText variant="title">{title}</AppText>}
              <AppText variant={mode === 'tablet' ? 'numeral' : 'numeralSmall'}>
                {remaining}
              </AppText>
            </>
          ) : (
            <AppText variant="title">{title}</AppText>
          )}
          {caption ? (
            <AppText variant="caption" muted>
              {caption}
            </AppText>
          ) : null}
        </View>
        {timer && mode === 'tablet' ? (
          <Progress
            value={timerProgressValue(timer)}
            tone={timer.status === 'paused' ? 'paused' : 'active'}
            accessibilityLabel={accessibilityLabel}
          />
        ) : null}
        <View style={{ flexGrow: 1 }} />
        <Button
          title={t('mobile.screen.timersCta')}
          variant="secondary"
          size="S"
          fullWidth={false}
          onPress={onTimers}
        />
      </View>
    </KioskCard>
  );
}

function KioskHydrationCard({
  mode,
  label,
  value,
  progress,
  onPress,
}: {
  mode: 'portrait' | 'wide' | 'tablet';
  label: string;
  value: string;
  progress: number;
  onPress: () => void;
}) {
  const accessibilityLabel = kioskCardAccessibilityLabel([label, value]);
  return (
    <KioskCard
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={mode === 'tablet' ? { minHeight: KIOSK_TABLET_CARD_MIN_HEIGHT } : null}
    >
      <View style={{ flex: 1, gap: spacing.lg }}>
        <View style={{ gap: spacing.md }}>
          <AppText variant="eyebrow" muted>
            {label}
          </AppText>
          <AppText variant={mode === 'tablet' ? 'numeral' : 'numeralSmall'}>{value}</AppText>
        </View>
        <View style={{ flexGrow: 1 }} />
        <Progress value={progress} accessibilityLabel={accessibilityLabel} />
      </View>
    </KioskCard>
  );
}
