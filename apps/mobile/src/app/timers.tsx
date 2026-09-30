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
  type IconName,
} from '../components';
import type { RoundButtonTone } from '../components/RoundButton';
import { useFormat } from '../hooks/useFormat';
import { useCreateTimer, useDeleteTimer, useTimers, useUpdateTimer } from '../hooks/timers';
import { hasRunningTimer, sortTimers, useTimerTick } from '../lib/timers';
import { spacing } from '../theme';

const PRESET_MINUTES = [1, 3, 5, 10, 20, 45] as const;

interface TimerControlItem {
  name: string;
  label: string;
  icon?: IconName;
  visibleLabel?: string;
  tone: RoundButtonTone;
  onPress: () => void;
}

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

  const timerControls: TimerControlItem[] = [
    {
      name: 'extend',
      label: t('mobile.timers.addMinute'),
      visibleLabel: '+1',
      tone: 'primary',
      onPress: () => onAction({ action: 'extend', seconds: 60 }),
    },
    ...(timer.status === 'running'
      ? ([
          {
            name: 'pause',
            label: t('mobile.timers.pause'),
            icon: 'timerPause',
            tone: 'surface',
            onPress: () => onAction({ action: 'pause' }),
          },
        ] satisfies TimerControlItem[])
      : []),
    ...(timer.status === 'paused'
      ? ([
          {
            name: 'resume',
            label: t('mobile.timers.resume'),
            icon: 'play',
            tone: 'primary',
            onPress: () => onAction({ action: 'resume' }),
          },
        ] satisfies TimerControlItem[])
      : []),
    timer.status === 'done'
      ? {
          name: 'remove',
          label: t('mobile.timers.remove'),
          icon: 'trash',
          tone: 'surface',
          onPress: onRemove,
        }
      : {
          name: 'cancel',
          label: t('mobile.timers.cancel'),
          icon: 'close',
          tone: 'surface',
          onPress: () => onAction({ action: 'stop' }),
        },
  ];
  const timerActions = busy
    ? undefined
    : timerControls.map(({ name, label, onPress }) => ({ name, label, onPress }));

  if (timer.status === 'running') {
    return (
      <Tile
        tint="butter"
        accessibilityLabel={`${timer.label}, ${remaining}`}
        actions={timerActions}
      >
        <View style={{ gap: spacing.md }}>
          <View style={{ gap: spacing.xs }}>
            <AppText variant="heading">{timer.label}</AppText>
            <AppText variant="numeral">{remaining}</AppText>
            <AppText variant="caption" muted>
              {statusLabel}
            </AppText>
          </View>
          <TimerControls controls={timerControls} busy={busy} />
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
        <TimerControls controls={timerControls} busy={busy} />
      </View>
    </Card>
  );
}

function TimerControls({
  controls,
  busy,
}: {
  controls: readonly TimerControlItem[];
  busy: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: spacing.sm,
      }}
    >
      {controls.map((control) => (
        <RoundButton
          key={control.name}
          tone={control.tone}
          accessibilityLabel={control.label}
          label={control.visibleLabel}
          icon={control.icon}
          disabled={busy}
          onPress={control.onPress}
        />
      ))}
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
