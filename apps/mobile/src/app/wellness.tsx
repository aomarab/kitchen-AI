import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  hydrationCupsDrunk,
  type ReminderSettings,
  type ReminderType,
} from '@kitchen/contracts';
import {
  Screen,
  Header,
  Card,
  Button,
  Icon,
  AppText,
  LoadingState,
  ErrorState,
  EmptyState,
  type IconName,
} from '../components';
import { useFormat } from '../hooks/useFormat';
import {
  useAcknowledgeReminder,
  useReminderOccurrences,
  useReminderSettings,
} from '../hooks/reminders';
import {
  hydrationFraction,
  minutesSinceFired,
  nudgeRows,
  outstandingCount,
  type NudgeRow,
} from '../lib/wellness';
import { radius, spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

const NUDGE_ICONS = {
  break: 'pause',
  stretch: 'stretch',
  morning: 'sunrise',
  hydration: 'water',
} as const satisfies Record<ReminderType, IconName>;

export default function Wellness() {
  const { t } = useFormat();
  const router = useRouter();
  const occurrencesQuery = useReminderOccurrences();
  const settingsQuery = useReminderSettings();
  const acknowledge = useAcknowledgeReminder();

  const occurrences = occurrencesQuery.data ?? [];
  const rows = nudgeRows(occurrences);
  const outstanding = outstandingCount(occurrences);

  return (
    <Screen
      scroll
      refreshing={occurrencesQuery.isRefetching}
      onRefresh={() => void occurrencesQuery.refetch()}
    >
      <Header title={t('mobile.wellness.title')} onBack={() => router.back()} />
      <AppText variant="caption" muted>
        {t('mobile.wellness.subtitle')}
      </AppText>

      {settingsQuery.data ? (
        <HydrationCard occurrences={occurrences} settings={settingsQuery.data} />
      ) : null}

      {occurrencesQuery.isLoading ? (
        <LoadingState />
      ) : occurrencesQuery.isError ? (
        <ErrorState
          error={occurrencesQuery.error}
          onRetry={() => void occurrencesQuery.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="bell"
          title={t('mobile.wellness.empty')}
          message={t('mobile.wellness.emptyHint')}
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          <AppText variant="label" muted>
            {outstanding > 0
              ? t('mobile.wellness.outstanding', { count: outstanding })
              : t('mobile.wellness.allAnswered')}
          </AppText>
          {rows.map((row) => (
            <NudgeCard
              key={row.id}
              row={row}
              busy={acknowledge.isPending}
              onAcknowledge={() => acknowledge.mutate(row.id)}
            />
          ))}
        </View>
      )}

      <Button
        title={t('mobile.wellness.editSettings')}
        variant="ghost"
        icon="settings"
        onPress={() => router.push('/settings/reminders')}
      />
    </Screen>
  );
}

function HydrationCard({
  occurrences,
  settings,
}: {
  occurrences: Parameters<typeof hydrationFraction>[0];
  settings: ReminderSettings;
}) {
  const { t } = useFormat();
  const { colors } = useTheme();
  const fraction = hydrationFraction(occurrences, settings);

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Icon name="water" size={20} color={colors.primary} />
          <AppText variant="heading">{t('mobile.wellness.hydrationTitle')}</AppText>
        </View>

        <AppText variant="title">
          {t('mobile.wellness.hydrationProgress', {
            count: hydrationCupsDrunk(occurrences),
            goal: settings.hydrationGoalCups,
          })}
        </AppText>

        {/* Decoration only — the reading above it is the accessible one. */}
        <View
          style={{
            height: 10,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceAlt,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${Math.round(fraction * 100)}%`,
              height: '100%',
              borderRadius: radius.pill,
              backgroundColor: colors.primary,
            }}
          />
        </View>

        <AppText variant="caption" muted>
          {t('mobile.wellness.hydrationHint')}
        </AppText>
      </View>
    </Card>
  );
}

function NudgeCard({
  row,
  busy,
  onAcknowledge,
}: {
  row: NudgeRow;
  busy: boolean;
  onAcknowledge: () => void;
}) {
  const { t } = useFormat();
  const { colors } = useTheme();
  const answered = row.acknowledgedAt !== null;
  const minutes = minutesSinceFired(row.firedAt, new Date());

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: answered ? colors.surfaceAlt : colors.primarySoft,
          }}
        >
          <Icon
            name={NUDGE_ICONS[row.type]}
            size={20}
            color={answered ? colors.textMuted : colors.primaryText}
          />
        </View>

        <View style={{ flex: 1, gap: spacing.xs }}>
          <AppText variant="body">{t(row.messageKey as 'reminders.break.body')}</AppText>
          <AppText variant="caption" muted>
            {minutes === 0
              ? t('mobile.wellness.justNow')
              : t('mobile.wellness.minutesAgo', { minutes })}
          </AppText>

          {answered ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Icon name="check" size={14} color={colors.success} />
              <AppText variant="caption" muted>
                {t('mobile.wellness.answered')}
              </AppText>
            </View>
          ) : (
            <Button
              title={t('mobile.wellness.acknowledge')}
              variant="secondary"
              disabled={busy}
              onPress={onAcknowledge}
            />
          )}
        </View>
      </View>
    </Card>
  );
}
