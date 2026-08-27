'use client';

import type { FocusEvent } from 'react';
import {
  SCHEDULED_REMINDER_TYPES,
  type BreakCadenceMinutes,
  type ReminderSettings,
  type ReminderType,
  type UpdateReminderSettingsRequest,
} from '@kitchen/contracts';
import { translateErrorKey } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';
import { resolveErrorKey } from '../../lib/errors';
import { cn } from '../../lib/cn';
import { useReminderSettings, useUpdateReminderSettings } from '../../hooks/reminders';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Input, Field } from '../ui/Input';
import { LoadingState, ErrorState } from '../ui/states';

const CADENCES: BreakCadenceMinutes[] = [30, 60, 90, 120];

/**
 * The toggles offered are derived from `SCHEDULED_REMINDER_TYPES`, never
 * hand-listed.
 *
 * This screen once offered a stretch switch the engine could not act on: it
 * defaulted to on, so it told every household that stretch reminders were
 * running when none could ever fire. #14 removed the switch; a cadence setting
 * has since made stretch schedulable and the switch is back. Reading the
 * contract's list is what makes that swing automatic instead of a thing
 * somebody has to remember.
 *
 * `Record<ReminderType, …>` is exhaustive on purpose: a new nudge type in the
 * contract fails to compile here until it is given a label.
 */
type ToggleKey = `${ReminderType}Enabled`;

export function ReminderSettingsView() {
  const { t, locale } = useLocale();
  const query = useReminderSettings();
  const update = useUpdateReminderSettings();

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return null;

  const settings: ReminderSettings = query.data;
  const save = (patch: UpdateReminderSettingsRequest) => update.mutate(patch);

  const copy: Record<ReminderType, { key: ToggleKey; label: string; hint: string }> = {
    break: {
      key: 'breakEnabled',
      label: t('web.reminders.breakLabel'),
      hint: t('web.reminders.breakHint'),
    },
    stretch: {
      key: 'stretchEnabled',
      label: t('web.reminders.stretchLabel'),
      hint: t('web.reminders.stretchHint'),
    },
    morning: {
      key: 'morningEnabled',
      label: t('web.reminders.morningLabel'),
      hint: t('web.reminders.morningHint'),
    },
    hydration: {
      key: 'hydrationEnabled',
      label: t('web.reminders.hydrationLabel'),
      hint: t('web.reminders.hydrationHint'),
    },
  };
  const toggles = SCHEDULED_REMINDER_TYPES.map((type) => copy[type]);

  const cadenceCard = (title: string, key: 'breakCadenceMinutes' | 'stretchCadenceMinutes') => (
    <Card className="flex flex-col gap-3">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <div className="flex flex-wrap gap-2" role="group" aria-label={title}>
        {CADENCES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={settings[key] === c}
            onClick={() => save({ [key]: c })}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium transition',
              settings[key] === c
                ? 'border-primary-text bg-primary-soft text-primary-text'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {t('web.reminders.cadenceEvery', { minutes: c })}
          </button>
        ))}
      </div>
    </Card>
  );

  const clampHour = (
    e: FocusEvent<HTMLInputElement>,
    current: number,
    key: 'quietHoursStart' | 'quietHoursEnd',
  ) => {
    const parsed = Math.round(Number(e.target.value));
    const next = Number.isFinite(parsed) ? Math.min(23, Math.max(0, parsed)) : current;
    // Snap the uncontrolled field to the clamped value so it never shows an
    // out-of-range entry that differs from what was persisted.
    e.target.value = String(next);
    if (next !== current) save({ [key]: next });
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('web.reminders.title')}</CardTitle>
          {update.isSuccess ? <Badge tone="success">{t('web.reminders.saved')}</Badge> : null}
        </CardHeader>
        <p className="text-sm text-muted-foreground">{t('web.reminders.subtitle')}</p>
      </Card>

      <Card className="flex flex-col gap-5">
        <CardHeader>
          <CardTitle>{t('web.reminders.nudgesTitle')}</CardTitle>
        </CardHeader>
        {toggles.map(({ key, label, hint }) => (
          <section key={key} className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">{label}</h3>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
            <input
              type="checkbox"
              role="switch"
              checked={settings[key]}
              onChange={(e) => save({ [key]: e.target.checked })}
              aria-label={label}
              className="h-5 w-5 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-primary"
            />
          </section>
        ))}
      </Card>

      {cadenceCard(t('web.reminders.cadenceTitle'), 'breakCadenceMinutes')}
      {cadenceCard(t('web.reminders.stretchCadenceTitle'), 'stretchCadenceMinutes')}

      <Card className="flex flex-col gap-4">
        <CardHeader>
          <CardTitle>{t('web.reminders.hydrationGoalTitle')}</CardTitle>
        </CardHeader>
        <Field label={t('web.reminders.hydrationGoalTitle')} htmlFor="hydration-goal">
          <Input
            id="hydration-goal"
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            defaultValue={settings.hydrationGoalCups}
            onBlur={(e) => {
              const parsed = Math.round(Number(e.target.value));
              const next = Number.isFinite(parsed)
                ? Math.min(20, Math.max(1, parsed))
                : settings.hydrationGoalCups;
              e.target.value = String(next);
              if (next !== settings.hydrationGoalCups) save({ hydrationGoalCups: next });
            }}
            className="w-32"
          />
        </Field>
      </Card>

      <Card className="flex flex-col gap-4">
        <CardHeader>
          <CardTitle>{t('web.reminders.quietHoursTitle')}</CardTitle>
        </CardHeader>
        <p className="text-xs text-muted-foreground">{t('web.reminders.quietHoursHint')}</p>
        <div className="flex flex-wrap gap-4">
          <Field label={t('web.reminders.quietFrom')} htmlFor="quiet-start">
            <Input
              id="quiet-start"
              type="number"
              inputMode="numeric"
              min={0}
              max={23}
              defaultValue={settings.quietHoursStart}
              onBlur={(e) => clampHour(e, settings.quietHoursStart, 'quietHoursStart')}
              className="w-24"
            />
          </Field>
          <Field label={t('web.reminders.quietTo')} htmlFor="quiet-end">
            <Input
              id="quiet-end"
              type="number"
              inputMode="numeric"
              min={0}
              max={23}
              defaultValue={settings.quietHoursEnd}
              onBlur={(e) => clampHour(e, settings.quietHoursEnd, 'quietHoursEnd')}
              className="w-24"
            />
          </Field>
        </div>
      </Card>

      {update.isError ? (
        <p role="alert" className="text-sm text-danger">
          {translateErrorKey(locale, resolveErrorKey(update.error))}
        </p>
      ) : null}
    </div>
  );
}
