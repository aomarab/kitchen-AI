import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  AppText,
  Button,
  SegmentedControl,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../components';
import { PlanBoard, type PlanView } from '../../features/plans/PlanBoard';
import { useFormat } from '../../hooks/useFormat';
import { usePlans } from '../../hooks/plans';
import { todayISODate } from '../../lib/expiry';
import { spacing } from '../../theme';

export default function Plans() {
  const { t } = useFormat();
  const router = useRouter();
  const [view, setView] = useState<PlanView>('week');
  const [selectedDate, setSelectedDate] = useState(todayISODate());
  const plans = usePlans();
  const plan = plans.data?.[0];
  // The empty state carries its own generate CTA. Showing the header button
  // too put two identical primary actions on one screen.
  const isEmpty = !plan || plan.entries.length === 0;
  const showHeaderAction = !plans.isLoading && !plans.isError && !isEmpty;

  return (
    <Screen scroll refreshing={plans.isRefetching} onRefresh={() => void plans.refetch()}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="title">{t('plans.title')}</AppText>
        {showHeaderAction ? (
          <Button
            title={t('plans.generate')}
            icon="plus"
            fullWidth={false}
            onPress={() => router.push('/generate-plan')}
          />
        ) : null}
      </View>

      <SegmentedControl<PlanView>
        value={view}
        onChange={setView}
        options={[
          { value: 'day', label: t('mobile.plans.day') },
          { value: 'week', label: t('mobile.plans.week') },
          { value: 'month', label: t('mobile.plans.month') },
        ]}
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
          <PlanBoard
            plan={plan}
            view={view}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onOpenEntry={(entry) => router.push(`/entry/${entry.id}?planId=${plan.id}`)}
          />
        )}
      </View>
    </Screen>
  );
}
