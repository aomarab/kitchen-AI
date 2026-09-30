import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Screen,
  Header,
  SegmentedControl,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../components';
import { DayChipStrip } from '../../features/plans/DayChipStrip';
import { PlanBoard, type PlanView } from '../../features/plans/PlanBoard';
import { PlanTiles } from '../../features/plans/PlanTiles';
import { useFormat } from '../../hooks/useFormat';
import { usePlan, usePlanCoverage } from '../../hooks/plans';
import { todayISODate } from '../../lib/expiry';
import { spacing } from '../../theme';

export default function PlanDetail() {
  const { t } = useFormat();
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
        <EmptyState illustration="calendar" title={t('plans.empty')} />
      ) : (
        <View style={{ gap: spacing.md }}>
          <PlanTiles
            plan={plan.data}
            coverage={coverage.isSuccess ? coverage.data : undefined}
            showCoverageCaption
            onOpenShopping={() => router.push('/shopping')}
          />
          <SegmentedControl<PlanView>
            value={view}
            onChange={setView}
            options={[
              { value: 'day', label: t('plans.daily') },
              { value: 'week', label: t('plans.weekly') },
              { value: 'month', label: t('plans.monthly') },
            ]}
          />

          {view !== 'month' ? (
            <DayChipStrip
              plan={plan.data}
              selectedDate={selectedDate}
              onSelectDate={(date) => {
                setSelectedDate(date);
                setView('day');
              }}
            />
          ) : null}

          <PlanBoard
            plan={plan.data}
            view={view}
            selectedDate={selectedDate}
            coverage={coverage.isSuccess ? coverage.data : undefined}
            onSelectDate={setSelectedDate}
            onOpenEntry={(entry) => router.push(`/entry/${entry.id}?planId=${plan.data.id}`)}
          />
          <PlanTiles
            plan={plan.data}
            coverage={coverage.isSuccess ? coverage.data : undefined}
            variant="shortfall"
            onOpenShopping={() => router.push('/shopping')}
          />
        </View>
      )}
    </Screen>
  );
}
