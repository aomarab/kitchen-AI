import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Button,
  EmptyState,
  ErrorState,
  Header,
  LoadingState,
  Screen,
  AppText,
} from '../components';
import { NewTimerSheet } from '../features/timers/NewTimerSheet';
import { TimerCard } from '../features/timers/TimerCard';
import { useFormat } from '../hooks/useFormat';
import { useDeleteTimer, useTimers, useUpdateTimer } from '../hooks/timers';
import { hasRunningTimer, sortTimers, useTimerTick } from '../lib/timers';
import { spacing } from '../theme';

export default function Timers() {
  const { t } = useFormat();
  const router = useRouter();
  const timersQuery = useTimers();
  const update = useUpdateTimer();
  const remove = useDeleteTimer();
  const [sheetOpen, setSheetOpen] = useState(false);

  const timers = timersQuery.data?.items ?? [];
  // The tick drives the countdown; it stays off while nothing is counting down.
  const tick = useTimerTick(hasRunningTimer(timers, new Date()));
  const ordered = sortTimers(timers, tick);
  const busy = update.isPending || remove.isPending;
  const showFooter = !timersQuery.isLoading && !timersQuery.isError && ordered.length > 0;

  return (
    <>
      <Screen
        scroll
        refreshing={timersQuery.isRefetching}
        onRefresh={() => void timersQuery.refetch()}
        footer={
          showFooter ? (
            <Button
              title={t('mobile.timers.newTimer')}
              leadingIcon="plus"
              onPress={() => setSheetOpen(true)}
            />
          ) : undefined
        }
      >
        <Header title={t('mobile.timers.title')} onBack={() => router.back()} />
        <AppText variant="caption" muted>
          {t('mobile.timers.subtitle')}
        </AppText>

        {timersQuery.isLoading ? (
          <LoadingState />
        ) : timersQuery.isError ? (
          <ErrorState error={timersQuery.error} onRetry={() => void timersQuery.refetch()} />
        ) : ordered.length === 0 ? (
          <EmptyState
            illustration="timer"
            title={t('mobile.timers.empty')}
            message={t('mobile.timers.emptyHint')}
            actionLabel={t('mobile.timers.newTimer')}
            onAction={() => setSheetOpen(true)}
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {ordered.map((timer) => (
              <TimerCard
                key={timer.id}
                timer={timer}
                busy={busy}
                onAction={(body) => update.mutate({ id: timer.id, body })}
                onRemove={() => remove.mutate(timer.id)}
              />
            ))}
          </View>
        )}
      </Screen>

      <NewTimerSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
