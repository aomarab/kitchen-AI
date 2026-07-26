import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Screen,
  Header,
  AppText,
  Badge,
  SegmentedControl,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../components';
import { PlanBoard, type PlanView } from '../../features/plans/PlanBoard';
import { useFormat } from '../../hooks/useFormat';
import { usePlan, usePlanCoverage } from '../../hooks/plans';
import { todayISODate } from '../../lib/expiry';
import { formatQty } from '../../lib/format';
import { spacing } from '../../theme';

export default function PlanDetail() {
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const plan = usePlan(id ?? null);
  const coverage = usePlanCoverage(id ?? null);
  const [view, setView] = useState<PlanView>('week');
  const [selectedDate, setSelectedDate] = useState(todayISODate());

  return (
    <Screen scroll refreshing={plan.isRefetching} onRefresh={() => void plan.refetch()}>
      <Header title={t('plans.title')} onBack={() => router.back()} />

      {plan.isLoading ? (
        <LoadingState />
      ) : plan.isError || !plan.data ? (
        <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />
      ) : plan.data.entries.length === 0 ? (
        <EmptyState icon="plans" title={t('plans.empty')} />
      ) : (
        <>
          {coverage.data ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Badge
                tone={coverage.data.coverageRatio >= 1 ? 'success' : 'warn'}
                label={t('plans.coverage')}
              />
              <AppText variant="caption" muted>
                {formatQty(locale, Math.round(coverage.data.coverageRatio * 100), prefs)}%
              </AppText>
            </View>
          ) : null}

          <SegmentedControl<PlanView>
            value={view}
            onChange={setView}
            options={[
              { value: 'day', label: t('mobile.plans.day') },
              { value: 'week', label: t('mobile.plans.week') },
              { value: 'month', label: t('mobile.plans.month') },
            ]}
          />

          <PlanBoard
            plan={plan.data}
            view={view}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onOpenEntry={(entry) => router.push(`/entry/${entry.id}?planId=${plan.data.id}`)}
          />
        </>
      )}
    </Screen>
  );
}
