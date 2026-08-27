'use client';

import { useState, type ReactNode } from 'react';
import { formatRemaining, projectTimer, type CookingTimer } from '@kitchen/contracts';
import { useLocale } from '../../lib/locale';
import { cn } from '../../lib/cn';
import { dialFraction, hasRunningTimer, useTimerTick } from '../../lib/timers';
import { useCreateTimer, useDeleteTimer, useTimers, useUpdateTimer } from '../../hooks/timers';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Input';
import { EmptyState, ErrorState, LoadingState } from '../ui/states';

const PRESET_MINUTES = [1, 3, 5, 10, 20, 45];

type TimerAction = { action: 'pause' | 'resume' | 'stop' } | { action: 'extend'; seconds: number };

export function TimersView() {
  const { t } = useLocale();
  const timersQuery = useTimers();
  const timers = timersQuery.data?.items ?? [];
  const tick = useTimerTick(hasRunningTimer(timers, new Date()));
  const update = useUpdateTimer();
  const remove = useDeleteTimer();

  if (timersQuery.isLoading) return <LoadingState />;
  if (timersQuery.isError) {
    return <ErrorState error={timersQuery.error} onRetry={() => void timersQuery.refetch()} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-heading">{t('web.timers.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('web.timers.subtitle')}</p>
      </header>

      <NewTimerForm />

      {timers.length === 0 ? (
        <EmptyState title={t('web.timers.empty')} hint={t('web.timers.emptyHint')} />
      ) : (
        <ul
          data-testid="timer-list"
          className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4"
        >
          {timers.map((timer) => (
            <li key={timer.id}>
              <TimerCard
                timer={projectTimer(timer, tick)}
                now={tick}
                busy={update.isPending || remove.isPending}
                onAction={(body) => update.mutate({ id: timer.id, body })}
                onRemove={() => remove.mutate(timer.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
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
  onAction: (body: TimerAction) => void;
  onRemove: () => void;
}) {
  const { t } = useLocale();
  const finished = timer.status === 'done';

  return (
    <div
      data-testid="timer-card"
      data-status={timer.status}
      className={cn(
        'flex flex-col items-center gap-3 rounded-2xl border border-border bg-background p-5 text-center shadow-sm',
        finished && 'border-primary ring-4 ring-primary-soft',
      )}
    >
      <Dial fraction={dialFraction(timer, now)} alerting={finished}>
        <span
          className="text-xl font-bold tabular-nums tracking-heading-sm"
          data-testid="timer-remaining"
        >
          {formatRemaining(timer.remainingSec)}
        </span>
      </Dial>

      <div className="flex flex-col gap-0.5">
        <span className="font-semibold">{timer.label}</span>
        <span className="text-xs font-semibold text-muted-foreground">
          {finished
            ? t('web.timers.finished')
            : timer.status === 'paused'
              ? t('web.timers.paused')
              : t('web.timers.remainingLabel')}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => onAction({ action: 'extend', seconds: 60 })}
        >
          {t('web.timers.addMinute')}
        </Button>
        {timer.status === 'running' ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onAction({ action: 'pause' })}
          >
            {t('web.timers.pause')}
          </Button>
        ) : null}
        {timer.status === 'paused' ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onAction({ action: 'resume' })}
          >
            {t('web.timers.resume')}
          </Button>
        ) : null}
        {finished ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={onRemove}>
            {t('web.timers.remove')}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => onAction({ action: 'stop' })}
          >
            {t('web.timers.stop')}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * The ring uses `pathLength={1}`, so the dash maths is the fraction itself and
 * does not depend on the radius. It is decoration — the remaining time is
 * already text inside it — so the svg stays `aria-hidden`.
 */
function Dial({
  fraction,
  alerting,
  children,
}: {
  fraction: number;
  alerting: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative grid h-24 w-24 place-items-center">
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-24 w-24 -rotate-90"
        aria-hidden="true"
      >
        <circle cx="50" cy="50" r="44" fill="none" strokeWidth="8" className="stroke-muted" />
        <circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - fraction}
          className={alerting ? 'stroke-danger' : 'stroke-primary'}
        />
      </svg>
      {children}
    </div>
  );
}

function NewTimerForm() {
  const { t } = useLocale();
  const create = useCreateTimer();
  const [label, setLabel] = useState('');
  const [minutes, setMinutes] = useState(5);

  const canSubmit = label.trim().length > 0 && minutes >= 1 && !create.isPending;

  return (
    <form
      className="flex flex-col gap-4 rounded-2xl border border-border bg-background p-5 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        create.mutate(
          { label: label.trim(), durationSec: Math.round(minutes * 60) },
          { onSuccess: () => setLabel('') },
        );
      }}
    >
      <h2 className="text-lg font-semibold tracking-heading-sm">{t('web.timers.newTimer')}</h2>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label={t('web.timers.label')} htmlFor="timer-label">
            <Input
              id="timer-label"
              value={label}
              placeholder={t('web.timers.labelPlaceholder')}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={60}
            />
          </Field>
        </div>
        <div className="sm:w-32">
          <Field label={t('web.timers.minutes')} htmlFor="timer-minutes">
            <Input
              id="timer-minutes"
              type="number"
              min={1}
              max={720}
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
            />
          </Field>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PRESET_MINUTES.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setMinutes(preset)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-bold tabular-nums transition',
              preset === minutes
                ? 'border-primary bg-primary-soft text-primary-text'
                : 'border-border text-muted-foreground hover:bg-canvas-tint',
            )}
          >
            {formatRemaining(preset * 60)}
          </button>
        ))}
      </div>

      {create.isError ? <ErrorState error={create.error} /> : null}

      <div>
        <Button type="submit" disabled={!canSubmit}>
          {t('web.timers.start')}
        </Button>
      </div>
    </form>
  );
}
