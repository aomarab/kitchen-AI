import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatRemaining, type CookingTimer, type UpdateTimerRequest } from '@kitchen/contracts';
import {
  Screen,
  Header,
  Card,
  Button,
  Chip,
  Field,
  Ring,
  AppText,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../components';
import { useFormat } from '../hooks/useFormat';
import { useCreateTimer, useDeleteTimer, useTimers, useUpdateTimer } from '../hooks/timers';
import { dialFraction, hasRunningTimer, ringTicks, sortTimers, useTimerTick } from '../lib/timers';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

const PRESET_MINUTES = [1, 3, 5, 10, 20, 45] as const;
const RING_TICKS = 24;

export default function Timers() {
  const { t } = useFormat();
  const router = useRouter();
  const timersQuery = useTimers();
  const update = useUpdateTimer();
  const remove = useDeleteTimer();

  const timers = timersQuery.data?.items ?? [];
  // The tick drives the countdown; it stays off while nothing is counting down.
  const tick = useTimerTick(hasRunningTimer(timers, new Date()));
  const ordered = sortTimers(timers, tick);
  const busy = update.isPending || remove.isPending;

  return (
    <Screen
      scroll
      refreshing={timersQuery.isRefetching}
      onRefresh={() => void timersQuery.refetch()}
    >
      <Header title={t('mobile.timers.title')} onBack={() => router.back()} />
      <AppText variant="caption" muted>
        {t('mobile.timers.subtitle')}
      </AppText>

      <NewTimerForm />

      {timersQuery.isLoading ? (
        <LoadingState />
      ) : timersQuery.isError ? (
        <ErrorState error={timersQuery.error} onRetry={() => void timersQuery.refetch()} />
      ) : ordered.length === 0 ? (
        <EmptyState
          icon="clock"
          title={t('mobile.timers.empty')}
          message={t('mobile.timers.emptyHint')}
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {ordered.map((timer) => (
            <TimerCard
              key={timer.id}
              timer={timer}
              now={tick}
              busy={busy}
              onAction={(body) => update.mutate({ id: timer.id, body })}
              onRemove={() => remove.mutate(timer.id)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function TimerCard({
  timer,
  now,
  busy,
  onAction,
  onRemove,
}: {
  timer: CookingTimer;
  now: Date;
  busy: boolean;
  onAction: (body: UpdateTimerRequest) => void;
  onRemove: () => void;
}) {
  const { t } = useFormat();
  const { colors } = useTheme();
  const finished = timer.status === 'done';

  const statusLabel = finished
    ? t('mobile.timers.finished')
    : timer.status === 'paused'
      ? t('mobile.timers.paused')
      : t('mobile.timers.remainingLabel');

  return (
    <Card>
      <View style={{ alignItems: 'center', gap: spacing.md }}>
        <Ring
          size={132}
          ticks={ringTicks(
            dialFraction(timer, now),
            RING_TICKS,
            finished ? colors.danger : colors.primary,
            colors.surfaceAlt,
          )}
        >
          {/* The ring is decoration; this is the accessible reading of it. */}
          <AppText variant="title">{formatRemaining(timer.remainingSec)}</AppText>
        </Ring>

        <View style={{ alignItems: 'center', gap: spacing.xs }}>
          <AppText variant="heading">{timer.label}</AppText>
          <AppText variant="caption" muted>
            {statusLabel}
          </AppText>
        </View>

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: spacing.sm,
          }}
        >
          <Button
            title={t('mobile.timers.addMinute')}
            variant="secondary"
            disabled={busy}
            onPress={() => onAction({ action: 'extend', seconds: 60 })}
          />
          {timer.status === 'running' ? (
            <Button
              title={t('mobile.timers.pause')}
              variant="secondary"
              disabled={busy}
              onPress={() => onAction({ action: 'pause' })}
            />
          ) : null}
          {timer.status === 'paused' ? (
            <Button
              title={t('mobile.timers.resume')}
              variant="secondary"
              disabled={busy}
              onPress={() => onAction({ action: 'resume' })}
            />
          ) : null}
          {finished ? (
            <Button
              title={t('mobile.timers.remove')}
              variant="ghost"
              disabled={busy}
              onPress={onRemove}
            />
          ) : (
            <Button
              title={t('mobile.timers.stop')}
              variant="ghost"
              disabled={busy}
              onPress={() => onAction({ action: 'stop' })}
            />
          )}
        </View>
      </View>
    </Card>
  );
}

function NewTimerForm() {
  const { t } = useFormat();
  const create = useCreateTimer();
  const [label, setLabel] = useState('');
  const [minutes, setMinutes] = useState<number>(5);

  const canSubmit = label.trim().length > 0 && !create.isPending;

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <AppText variant="heading">{t('mobile.timers.newTimer')}</AppText>

        <Field
          label={t('mobile.timers.label')}
          value={label}
          placeholder={t('mobile.timers.labelPlaceholder')}
          maxLength={60}
          onChangeText={setLabel}
        />

        <View style={{ gap: spacing.xs }}>
          <AppText variant="label" muted>
            {t('mobile.timers.minutes')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {PRESET_MINUTES.map((preset) => (
              <Chip
                key={preset}
                label={String(preset)}
                selected={minutes === preset}
                onPress={() => setMinutes(preset)}
              />
            ))}
          </View>
        </View>

        <Button
          title={t('mobile.timers.start')}
          icon="clock"
          loading={create.isPending}
          disabled={!canSubmit}
          onPress={() => {
            if (!canSubmit) return;
            create.mutate(
              { label: label.trim(), durationSec: minutes * 60 },
              { onSuccess: () => setLabel('') },
            );
          }}
        />
      </View>
    </Card>
  );
}
