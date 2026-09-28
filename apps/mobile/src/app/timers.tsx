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
  Badge,
  RoundButton,
  Tile,
  AppText,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../components';
import { useFormat } from '../hooks/useFormat';
import { useCreateTimer, useDeleteTimer, useTimers, useUpdateTimer } from '../hooks/timers';
import { hasRunningTimer, sortTimers, useTimerTick } from '../lib/timers';
import { spacing } from '../theme';

const PRESET_MINUTES = [1, 3, 5, 10, 20, 45] as const;

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
  busy,
  onAction,
  onRemove,
}: {
  timer: CookingTimer;
  busy: boolean;
  onAction: (body: UpdateTimerRequest) => void;
  onRemove: () => void;
}) {
  const { t } = useFormat();
  const finished = timer.status === 'done';
  const paused = timer.status === 'paused';
  const remaining = formatRemaining(timer.remainingSec);

  const statusLabel = finished
    ? t('mobile.timers.finished')
    : paused
      ? t('mobile.timers.paused')
      : t('mobile.timers.remainingLabel');

  const controls = (
    <TimerControls
      status={timer.status}
      busy={busy}
      onExtend={() => onAction({ action: 'extend', seconds: 60 })}
      onPause={() => onAction({ action: 'pause' })}
      onResume={() => onAction({ action: 'resume' })}
      onCancel={() => onAction({ action: 'stop' })}
      onRemove={onRemove}
    />
  );

  if (timer.status === 'running') {
    return (
      <Tile tint="butter" accessibilityLabel={`${timer.label}, ${remaining}`}>
        <View style={{ gap: spacing.md }}>
          <View style={{ gap: spacing.xs }}>
            <AppText variant="heading">{timer.label}</AppText>
            <AppText variant="numeral">{remaining}</AppText>
            <AppText variant="caption" muted>
              {statusLabel}
            </AppText>
          </View>
          {controls}
        </View>
      </Tile>
    );
  }

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ gap: spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: spacing.md,
            }}
          >
            <AppText variant="heading" style={{ flex: 1 }}>
              {timer.label}
            </AppText>
            <Badge tone={finished ? 'danger' : 'warn'} label={statusLabel} />
          </View>
          <AppText variant="numeral">{remaining}</AppText>
        </View>
        {controls}
      </View>
    </Card>
  );
}

function TimerControls({
  status,
  busy,
  onExtend,
  onPause,
  onResume,
  onCancel,
  onRemove,
}: {
  status: CookingTimer['status'];
  busy: boolean;
  onExtend: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const { t } = useFormat();

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: spacing.sm,
      }}
    >
      <RoundButton
        icon="plus"
        tone="primary"
        accessibilityLabel={t('mobile.timers.addMinute')}
        disabled={busy}
        onPress={onExtend}
      />
      {status === 'running' ? (
        <RoundButton
          icon="pause"
          tone="surface"
          accessibilityLabel={t('mobile.timers.pause')}
          disabled={busy}
          onPress={onPause}
        />
      ) : null}
      {status === 'paused' ? (
        <RoundButton
          icon="play"
          tone="primary"
          accessibilityLabel={t('mobile.timers.resume')}
          disabled={busy}
          onPress={onResume}
        />
      ) : null}
      {status === 'done' ? (
        <RoundButton
          icon="trash"
          tone="surface"
          accessibilityLabel={t('mobile.timers.remove')}
          disabled={busy}
          onPress={onRemove}
        />
      ) : (
        <RoundButton
          icon="close"
          tone="surface"
          accessibilityLabel={t('mobile.timers.cancel')}
          disabled={busy}
          onPress={onCancel}
        />
      )}
    </View>
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
