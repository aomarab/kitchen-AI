import { useRouter } from 'expo-router';
import { View } from 'react-native';
import {
  SCHEDULED_REMINDER_TYPES,
  type BreakCadenceMinutes,
  type ReminderType,
  type StretchCadenceMinutes,
} from '@kitchen/contracts';
import {
  Screen,
  Header,
  AppText,
  Badge,
  Card,
  ToggleRow,
  SegmentedControl,
  QuantityStepper,
  LoadingState,
  ErrorState,
} from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { useReminderSettings, useUpdateReminderSettings } from '../../hooks/reminders';
import { BREAK_CADENCES, clampHydrationGoal, clampQuietHour } from '../../lib/reminders';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export default function Reminders() {
  const { t } = useFormat();
  const { colors } = useTheme();
  const router = useRouter();
  const query = useReminderSettings();
  const update = useUpdateReminderSettings();

  const frame = (child: React.ReactNode) => (
    <Screen scroll>
      <Header title={t('mobile.reminders.title')} onBack={() => router.back()} />
      {child}
    </Screen>
  );

  if (query.isLoading) return frame(<LoadingState />);
  if (query.isError)
    return frame(<ErrorState error={query.error} onRetry={() => void query.refetch()} />);
  if (!query.data) return frame(null);

  const s = query.data;
  const cadenceOptions = BREAK_CADENCES.map((c) => ({
    value: String(c),
    label: t('mobile.reminders.cadenceEvery', { minutes: c }),
  }));

  // Exhaustive on ReminderType: a new nudge type in the contract fails to
  // compile here until it is given a label.
  const toggleCopy: Record<
    ReminderType,
    { key: `${ReminderType}Enabled`; label: string; hint: string }
  > = {
    break: {
      key: 'breakEnabled',
      label: t('mobile.reminders.breakLabel'),
      hint: t('mobile.reminders.breakHint'),
    },
    stretch: {
      key: 'stretchEnabled',
      label: t('mobile.reminders.stretchLabel'),
      hint: t('mobile.reminders.stretchHint'),
    },
    morning: {
      key: 'morningEnabled',
      label: t('mobile.reminders.morningLabel'),
      hint: t('mobile.reminders.morningHint'),
    },
    hydration: {
      key: 'hydrationEnabled',
      label: t('mobile.reminders.hydrationLabel'),
      hint: t('mobile.reminders.hydrationHint'),
    },
  };

  return (
    <Screen scroll>
      <Header title={t('mobile.reminders.title')} onBack={() => router.back()} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <AppText variant="caption" muted style={{ flex: 1 }}>
          {t('mobile.reminders.subtitle')}
        </AppText>
        {update.isSuccess ? <Badge tone="info" label={t('mobile.reminders.saved')} /> : null}
      </View>

      <Card style={{ gap: spacing.lg }}>
        <AppText variant="label" muted>
          {t('mobile.reminders.nudgesTitle')}
        </AppText>
        {/*
          The rows are derived from SCHEDULED_REMINDER_TYPES, not hand-listed,
          so this screen can only offer a switch the firing engine can act on.
          Stretch was absent until a cadence setting existed; it is back for
          the same reason, without anyone having to edit this list.
        */}
        {SCHEDULED_REMINDER_TYPES.map((type) => {
          const row = toggleCopy[type];
          return (
            <ToggleRow
              key={type}
              label={row.label}
              hint={row.hint}
              value={s[row.key]}
              onValueChange={(v) => update.mutate({ [row.key]: v })}
            />
          );
        })}
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <AppText variant="label" muted>
          {t('mobile.reminders.cadenceTitle')}
        </AppText>
        <SegmentedControl
          options={cadenceOptions}
          value={String(s.breakCadenceMinutes)}
          onChange={(v) => update.mutate({ breakCadenceMinutes: Number(v) as BreakCadenceMinutes })}
        />
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <AppText variant="label" muted>
          {t('mobile.reminders.stretchCadenceTitle')}
        </AppText>
        <SegmentedControl
          options={cadenceOptions}
          value={String(s.stretchCadenceMinutes)}
          onChange={(v) =>
            update.mutate({ stretchCadenceMinutes: Number(v) as StretchCadenceMinutes })
          }
        />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <AppText variant="label" muted>
          {t('mobile.reminders.hydrationGoalTitle')}
        </AppText>
        <QuantityStepper
          value={s.hydrationGoalCups}
          onChange={(v) => update.mutate({ hydrationGoalCups: clampHydrationGoal(v) })}
          min={1}
          label={t('mobile.reminders.hydrationGoalValue', { count: s.hydrationGoalCups })}
          decrementLabel={t('mobile.reminders.decrease')}
          incrementLabel={t('mobile.reminders.increase')}
        />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <AppText variant="label" muted>
          {t('mobile.reminders.quietHoursTitle')}
        </AppText>
        <AppText variant="caption" muted>
          {t('mobile.reminders.quietHoursHint')}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <AppText variant="body" style={{ minWidth: 44 }}>
            {t('mobile.reminders.quietFrom')}
          </AppText>
          <QuantityStepper
            value={s.quietHoursStart}
            onChange={(v) => update.mutate({ quietHoursStart: clampQuietHour(v) })}
            min={0}
            label={t('mobile.reminders.hourValue', { hour: s.quietHoursStart })}
            decrementLabel={t('mobile.reminders.decrease')}
            incrementLabel={t('mobile.reminders.increase')}
          />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <AppText variant="body" style={{ minWidth: 44 }}>
            {t('mobile.reminders.quietTo')}
          </AppText>
          <QuantityStepper
            value={s.quietHoursEnd}
            onChange={(v) => update.mutate({ quietHoursEnd: clampQuietHour(v) })}
            min={0}
            label={t('mobile.reminders.hourValue', { hour: s.quietHoursEnd })}
            decrementLabel={t('mobile.reminders.decrease')}
            incrementLabel={t('mobile.reminders.increase')}
          />
        </View>
      </Card>

      {update.isError ? (
        <AppText variant="caption" accessibilityRole="alert" style={{ color: colors.danger }}>
          {t('mobile.reminders.saveFailed')}
        </AppText>
      ) : null}
    </Screen>
  );
}
