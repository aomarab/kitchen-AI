import { useRouter } from 'expo-router';
import { View } from 'react-native';
import type { BreakCadenceMinutes } from '@kitchen/contracts';
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
import { colors, spacing } from '../../theme';

export default function Reminders() {
  const { t } = useFormat();
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
  if (query.isError) return frame(<ErrorState error={query.error} onRetry={() => void query.refetch()} />);
  if (!query.data) return frame(null);

  const s = query.data;
  const cadenceOptions = BREAK_CADENCES.map((c) => ({
    value: String(c),
    label: t('mobile.reminders.cadenceEvery', { minutes: c }),
  }));

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
        <ToggleRow
          label={t('mobile.reminders.breakLabel')}
          hint={t('mobile.reminders.breakHint')}
          value={s.breakEnabled}
          onValueChange={(v) => update.mutate({ breakEnabled: v })}
        />
        <ToggleRow
          label={t('mobile.reminders.stretchLabel')}
          hint={t('mobile.reminders.stretchHint')}
          value={s.stretchEnabled}
          onValueChange={(v) => update.mutate({ stretchEnabled: v })}
        />
        <ToggleRow
          label={t('mobile.reminders.morningLabel')}
          hint={t('mobile.reminders.morningHint')}
          value={s.morningEnabled}
          onValueChange={(v) => update.mutate({ morningEnabled: v })}
        />
        <ToggleRow
          label={t('mobile.reminders.hydrationLabel')}
          hint={t('mobile.reminders.hydrationHint')}
          value={s.hydrationEnabled}
          onValueChange={(v) => update.mutate({ hydrationEnabled: v })}
        />
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
