import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  Screen,
  SegmentedControl,
  TabHeader,
} from '../../components';
import { useTabBarClearance } from '../../components/TabBar';
import { DayChipStrip } from '../../features/plans/DayChipStrip';
import {
  GeneratingPlanState,
  PlanGenerationFailedState,
} from '../../features/plans/GeneratingPlanState';
import { PlanBoard, type PlanView } from '../../features/plans/PlanBoard';
import { PlanTiles } from '../../features/plans/PlanTiles';
import { useCredits } from '../../hooks/credits';
import { isTerminal, useJob } from '../../hooks/job';
import { useFormat } from '../../hooks/useFormat';
import { usePlanCoverage, usePlans } from '../../hooks/plans';
import { costOf, totalCredits } from '../../lib/credits';
import { todayISODate } from '../../lib/expiry';
import { formatQty } from '../../lib/format';
import { planViewForScope } from '../../lib/plans';
import { usePlanGenerationStore } from '../../stores/plan-generation';
import { spacing } from '../../theme';

export default function Plans() {
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  const qc = useQueryClient();
  const tabBarClearance = useTabBarClearance();
  const [view, setView] = useState<PlanView>('week');
  const [selectedDate, setSelectedDate] = useState(todayISODate());
  const activeGeneration = usePlanGenerationStore((state) => state.active);
  const generationFailure = usePlanGenerationStore((state) => state.failure);
  const finishSuccess = usePlanGenerationStore((state) => state.finishSuccess);
  const finishFailure = usePlanGenerationStore((state) => state.finishFailure);
  const clearFailure = usePlanGenerationStore((state) => state.clearFailure);
  const plans = usePlans();
  const credits = useCredits();
  const generationJob = useJob(activeGeneration?.jobId ?? null);
  const plan = plans.data?.[0];
  const coverage = usePlanCoverage(plan?.id ?? null);
  const isEmpty = !plan || plan.entries.length === 0;
  const openGenerate = () => router.push('/generate-plan');
  const openShopping = () => router.push('/shopping');
  const effectiveView = activeGeneration
    ? planViewForScope(activeGeneration.scope)
    : generationFailure
      ? planViewForScope(generationFailure.scope)
      : view;
  const generating = !!activeGeneration && !isTerminal(generationJob.data);
  const contentBottomPadding =
    effectiveView === 'day' ? spacing.gutter + tabBarClearance : spacing.gutter;
  const weeklyCost = costOf('plan.weekly');
  const emptyCostLine = credits.data
    ? t('mobile.plans.weeklyCostLine', {
        cost: t('mobile.plans.creditCount', {
          count: weeklyCost,
        }).replace(String(weeklyCost), formatQty(locale, weeklyCost, prefs)),
        balance: formatQty(locale, totalCredits(credits.data), prefs),
      })
    : undefined;

  useEffect(() => {
    if (!activeGeneration) return;
    if (generationJob.data?.status === 'done') {
      finishSuccess();
      void qc.invalidateQueries({ queryKey: ['plans'] });
      if (generationJob.data.resultRef?.kind === 'meal_plan') {
        router.replace(`/plan/${generationJob.data.resultRef.id}`);
      }
    } else if (generationJob.data?.status === 'failed') {
      finishFailure(generationJob.data.error);
    }
  }, [
    activeGeneration,
    finishFailure,
    finishSuccess,
    generationJob.data?.error,
    generationJob.data?.resultRef?.id,
    generationJob.data?.resultRef?.kind,
    generationJob.data?.status,
    qc,
    router,
  ]);

  const retryGeneration = () => {
    clearFailure();
    router.push('/generate-plan');
  };

  return (
    <Screen
      scroll
      padded={false}
      tabBar
      refreshing={plans.isRefetching}
      onRefresh={() => {
        void plans.refetch();
        void credits.refetch();
      }}
    >
      <TabHeader
        title={t('plans.title')}
        action={
          !plans.isLoading && !plans.isError ? (
            <IconButton
              icon="plus"
              tone="plain"
              accessibilityLabel={t('plans.generate')}
              onPress={openGenerate}
            />
          ) : undefined
        }
      />

      <View
        style={{
          paddingHorizontal: spacing.gutter,
          paddingBottom: contentBottomPadding,
          gap: spacing.xl,
        }}
      >
        <SegmentedControl<PlanView>
          value={effectiveView}
          onChange={(next) => {
            if (!activeGeneration && !generationFailure) setView(next);
          }}
          options={[
            { value: 'day', label: t('plans.daily') },
            { value: 'week', label: t('plans.weekly') },
            { value: 'month', label: t('plans.monthly') },
          ]}
        />

        {generating ? (
          <GeneratingPlanState progress={generationJob.data?.progress ?? 0.42} />
        ) : generationFailure ? (
          <PlanGenerationFailedState failure={generationFailure} onRetry={retryGeneration} />
        ) : plans.isLoading ? (
          <LoadingState />
        ) : plans.isError ? (
          <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
        ) : isEmpty ? (
          <EmptyState
            illustration="calendar"
            title={t('mobile.home.noPlanTitle')}
            message={emptyCostLine ?? t('mobile.plans.emptyBody')}
            actionLabel={t('plans.generate')}
            onAction={openGenerate}
          />
        ) : (
          <>
            {view === 'week' ? (
              <>
                <PlanTiles
                  plan={plan}
                  coverage={coverage.isSuccess ? coverage.data : undefined}
                  variant="summary"
                  onOpenShopping={openShopping}
                />
                <DayChipStrip
                  plan={plan}
                  selectedDate={selectedDate}
                  onSelectDate={(date) => {
                    setSelectedDate(date);
                    setView('day');
                  }}
                />
                <PlanBoard
                  plan={plan}
                  view={view}
                  selectedDate={selectedDate}
                  coverage={coverage.isSuccess ? coverage.data : undefined}
                  onSelectDate={setSelectedDate}
                  onOpenEntry={(entry) => router.push(`/entry/${entry.id}?planId=${plan.id}`)}
                />
              </>
            ) : view === 'day' ? (
              <>
                <DayChipStrip
                  plan={plan}
                  selectedDate={selectedDate}
                  onSelectDate={(date) => {
                    setSelectedDate(date);
                    setView('day');
                  }}
                />
                <PlanTiles
                  plan={plan}
                  coverage={coverage.isSuccess ? coverage.data : undefined}
                  variant="shortfall"
                  onOpenShopping={openShopping}
                />
                <PlanBoard
                  plan={plan}
                  view={view}
                  selectedDate={selectedDate}
                  coverage={coverage.isSuccess ? coverage.data : undefined}
                  onSelectDate={setSelectedDate}
                  onOpenEntry={(entry) => router.push(`/entry/${entry.id}?planId=${plan.id}`)}
                />
              </>
            ) : (
              <>
                <PlanTiles
                  plan={plan}
                  coverage={coverage.isSuccess ? coverage.data : undefined}
                  variant="summary"
                  onOpenShopping={openShopping}
                />
                <PlanBoard
                  plan={plan}
                  view={view}
                  selectedDate={selectedDate}
                  coverage={coverage.isSuccess ? coverage.data : undefined}
                  onSelectDate={setSelectedDate}
                  onOpenEntry={(entry) => router.push(`/entry/${entry.id}?planId=${plan.id}`)}
                />
              </>
            )}
          </>
        )}
      </View>
    </Screen>
  );
}
