import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  RoundButton,
  TabHeader,
  SegmentedControl,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../components';
import { DayChipStrip } from '../../features/plans/DayChipStrip';
import { PlanBoard, type PlanView } from '../../features/plans/PlanBoard';
import { PlanTiles } from '../../features/plans/PlanTiles';
import { useFormat } from '../../hooks/useFormat';
import { usePlanCoverage, usePlans } from '../../hooks/plans';
import { todayISODate } from '../../lib/expiry';
import { spacing } from '../../theme';

export default function Plans() {
  const { t } = useFormat();
  const router = useRouter();
  const [view, setView] = useState<PlanView>('week');
  const [selectedDate, setSelectedDate] = useState(todayISODate());
  const plans = usePlans();
  const plan = plans.data?.[0];
  const coverage = usePlanCoverage(plan?.id ?? null);
  // The empty state carries its own generate CTA. Showing the header button
  // too put two identical primary actions on one screen.
  const isEmpty = !plan || plan.entries.length === 0;
  const showHeaderAction = !plans.isLoading && !plans.isError && !isEmpty;

  return (
    <Screen scroll tabBar refreshing={plans.isRefetching} onRefresh={() => void plans.refetch()}>
      <TabHeader
        title={t('plans.title')}
        action={
          showHeaderAction ? (
            <RoundButton
              icon="plus"
              tone="primary"
              accessibilityLabel={t('plans.generate')}
              onPress={() => router.push('/generate-plan')}
            />
          ) : undefined
        }
      />

      <View style={{ marginTop: spacing.sm }}>
        {plans.isLoading ? (
          <LoadingState />
        ) : plans.isError ? (
          <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
        ) : isEmpty ? (
          <EmptyState
            icon="plans"
            title={t('plans.empty')}
            actionLabel={t('plans.generate')}
            onAction={() => router.push('/generate-plan')}
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            <SegmentedControl<PlanView>
              value={view}
              onChange={setView}
              options={[
                { value: 'day', label: t('mobile.plans.day') },
                { value: 'week', label: t('mobile.plans.week') },
                { value: 'month', label: t('mobile.plans.month') },
              ]}
            />

            {view !== 'month' ? (
              <DayChipStrip
                plan={plan}
                selectedDate={selectedDate}
                onSelectDate={(date) => {
                  setSelectedDate(date);
                  setView('day');
                }}
              />
            ) : null}

            <PlanTiles
              plan={plan}
              coverage={coverage.isSuccess ? coverage.data : undefined}
              onOpenShopping={() => router.push('/shopping')}
            />

            <PlanBoard
              plan={plan}
              view={view}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onOpenEntry={(entry) => router.push(`/entry/${entry.id}?planId=${plan.id}`)}
            />
          </View>
        )}
      </View>
    </Screen>
  );
}
