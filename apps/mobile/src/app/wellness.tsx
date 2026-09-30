import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, EmptyState, ErrorState, Header, LoadingState, Screen } from '../components';
import {
  HydrationSummaryCard,
  NudgeList,
  WellnessSettingsButton,
} from '../features/wellness/WellnessBlocks';
import { useFormat } from '../hooks/useFormat';
import {
  useAcknowledgeReminder,
  useReminderOccurrences,
  useReminderSettings,
} from '../hooks/reminders';
import { nudgeRows, outstandingCount } from '../lib/wellness';
import { spacing } from '../theme';

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
        <HydrationSummaryCard occurrences={occurrences} settings={settingsQuery.data} />
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
          illustration="bell"
          title={t('mobile.wellness.empty')}
          message={t('mobile.wellness.emptyHint')}
        />
      ) : (
        <NudgeList
          rows={rows}
          outstanding={outstanding}
          busy={acknowledge.isPending}
          onAcknowledge={(id) => acknowledge.mutate(id)}
        />
      )}

      <View style={{ paddingTop: spacing.sm }}>
        <WellnessSettingsButton onPress={() => router.push('/settings/reminders')} />
      </View>
    </Screen>
  );
}
