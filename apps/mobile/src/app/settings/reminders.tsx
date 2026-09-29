import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  type BreakCadenceMinutes,
  type ReminderType,
  type StretchCadenceMinutes,
} from '@kitchen/contracts';
import {
  Screen,
  Header,
  AppText,
  Badge,
  ListGroup,
  ToggleRow,
  QuantityStepper,
  LoadingState,
  ErrorState,
  SectionLabel,
} from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { formatQty } from '../../lib/format';
import { useReminderSettings, useUpdateReminderSettings } from '../../hooks/reminders';
import { clampHydrationGoal, clampQuietHour } from '../../lib/reminders';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

const REMINDER_ROW_ORDER: ReminderType[] = ['break', 'stretch', 'morning', 'hydration'];

function SettingStepperRow({
  title,
  caption,
  value,
  label,
  min,
  max,
  step = 1,
  onChange,
  decrementLabel,
  incrementLabel,
}: {
  title: string;
  caption: string;
  value: number;
  label: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  decrementLabel: string;
  incrementLabel: string;
}) {
  return (
    <View
      style={{
        minHeight: 54,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="caption" muted>
          {caption}
        </AppText>
      </View>
      <QuantityStepper
        value={value}
        label={label}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        accessibilityLabel={title}
        decrementLabel={decrementLabel}
        incrementLabel={incrementLabel}
      />
    </View>
  );
}

function QuietHourRow({
  title,
  value,
  onChange,
  decrementLabel,
  incrementLabel,
}: {
  title: string;
  value: number;
  onChange: (value: number) => void;
  decrementLabel: string;
  incrementLabel: string;
}) {
  return (
    <View style={{ flex: 1, gap: spacing.xs }}>
      <AppText variant="caption">{title}</AppText>
      <QuantityStepper
        value={value}
        label={`${String(value).padStart(2, '0')}:00`}
        min={0}
        max={23}
        onChange={onChange}
        accessibilityLabel={title}
        decrementLabel={decrementLabel}
        incrementLabel={incrementLabel}
      />
    </View>
  );
}

export default function Reminders() {
  const { t, locale, prefs } = useFormat();
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
  const cadenceEvery = (minutes: number) =>
    t('mobile.reminders.cadenceEvery', { minutes }).replace(
      String(minutes),
      formatQty(locale, minutes, prefs),
    );

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
    <Screen scroll contentStyle={{ gap: spacing.lg }}>
      <Header title={t('mobile.reminders.title')} onBack={() => router.back()} />

      <AppText variant="body" muted>
        {t('mobile.reminders.subtitle')}
      </AppText>

      <View style={{ gap: spacing.sm }}>
        <SectionLabel>{t('mobile.reminders.nudgesTitle')}</SectionLabel>
        <ListGroup>
          {REMINDER_ROW_ORDER.map((type) => {
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
        </ListGroup>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionLabel>{t('mobile.reminders.howOftenTitle')}</SectionLabel>
        <SettingStepperRow
          title={t('mobile.reminders.cadenceTitle')}
          caption={cadenceEvery(s.breakCadenceMinutes)}
          value={s.breakCadenceMinutes}
          label={formatQty(locale, s.breakCadenceMinutes, prefs)}
          min={30}
          max={120}
          step={30}
          onChange={(v) => update.mutate({ breakCadenceMinutes: v as BreakCadenceMinutes })}
          decrementLabel={t('mobile.reminders.decrease')}
          incrementLabel={t('mobile.reminders.increase')}
        />
        <SettingStepperRow
          title={t('mobile.reminders.stretchCadenceTitle')}
          caption={cadenceEvery(s.stretchCadenceMinutes)}
          value={s.stretchCadenceMinutes}
          label={formatQty(locale, s.stretchCadenceMinutes, prefs)}
          min={30}
          max={120}
          step={30}
          onChange={(v) => update.mutate({ stretchCadenceMinutes: v as StretchCadenceMinutes })}
          decrementLabel={t('mobile.reminders.decrease')}
          incrementLabel={t('mobile.reminders.increase')}
        />
        <SettingStepperRow
          title={t('mobile.reminders.hydrationGoalTitle')}
          caption={t('mobile.reminders.hydrationGoalValue', { count: s.hydrationGoalCups })}
          value={s.hydrationGoalCups}
          label={String(s.hydrationGoalCups)}
          min={1}
          max={20}
          onChange={(v) => update.mutate({ hydrationGoalCups: clampHydrationGoal(v) })}
          decrementLabel={t('mobile.reminders.decrease')}
          incrementLabel={t('mobile.reminders.increase')}
        />
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionLabel>{t('mobile.reminders.quietHoursTitle')}</SectionLabel>
        <AppText variant="caption" muted>
          {t('mobile.reminders.quietHoursHint')}
        </AppText>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <QuietHourRow
            title={t('mobile.reminders.quietFrom')}
            value={s.quietHoursStart}
            onChange={(v) => update.mutate({ quietHoursStart: clampQuietHour(v) })}
            decrementLabel={t('mobile.reminders.decrease')}
            incrementLabel={t('mobile.reminders.increase')}
          />
          <QuietHourRow
            title={t('mobile.reminders.quietTo')}
            value={s.quietHoursEnd}
            onChange={(v) => update.mutate({ quietHoursEnd: clampQuietHour(v) })}
            decrementLabel={t('mobile.reminders.decrease')}
            incrementLabel={t('mobile.reminders.increase')}
          />
        </View>
      </View>

      {update.isSuccess ? <Badge tone="success" label={t('mobile.reminders.saved')} /> : null}

      {update.isError ? (
        <AppText variant="caption" accessibilityRole="alert" style={{ color: colors.danger }}>
          {t('mobile.reminders.saveFailed')}
        </AppText>
      ) : null}
    </Screen>
  );
}
