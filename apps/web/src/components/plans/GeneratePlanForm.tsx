'use client';

import { useState } from 'react';
import type { GeneratePlanRequest, Job, MealSlot, PlanScope } from '@kitchen/contracts';
import { formatNumber } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';
import { todayIso } from '../../lib/plan';
import { slotKey, scopeKey } from '../../lib/labels';
import { useGeneratePlan } from '../../hooks/plans';
import { useJob } from '../../hooks/jobs';
import { Card, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input, Field, Select } from '../ui/Input';
import { ProgressBar } from '../ui/ProgressBar';
import { ErrorState } from '../ui/states';

const SCOPES: PlanScope[] = ['daily', 'weekly', 'monthly'];
const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export function GeneratePlanForm({ onGenerated }: { onGenerated: (planId: string) => void }) {
  const { t, locale } = useLocale();
  const generate = useGeneratePlan();
  const [jobId, setJobId] = useState<string | null>(null);

  const [scope, setScope] = useState<PlanScope>('weekly');
  const [startsOn, setStartsOn] = useState(todayIso());
  const [slots, setSlots] = useState<MealSlot[]>(['breakfast', 'lunch', 'dinner']);
  const [servings, setServings] = useState('4');
  const [maxCook, setMaxCook] = useState('60');

  const onDone = (job: Job) => {
    if (job.status === 'done' && job.resultRef?.kind === 'meal_plan') onGenerated(job.resultRef.id);
  };
  const jobQuery = useJob(jobId, onDone);
  const generating = Boolean(jobId) && jobQuery.data?.status !== 'failed' && jobQuery.data?.status !== 'done';
  const failed = jobQuery.data?.status === 'failed';

  const toggleSlot = (slot: MealSlot) =>
    setSlots((prev) => (prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]));

  const submit = () => {
    const body: GeneratePlanRequest = {
      scope,
      startsOn,
      slots: slots.length ? slots : undefined,
      servings: Number(servings) || undefined,
      maxCookMinutes: Number(maxCook) || undefined,
    };
    generate.mutate(body, { onSuccess: (job) => setJobId(job.id) });
  };

  if (generating) {
    const percent = Math.round((jobQuery.data?.progress ?? 0) * 100);
    return (
      <Card className="flex flex-col gap-3">
        <CardTitle>{t('plans.generating')}</CardTitle>
        <ProgressBar value={(jobQuery.data?.progress ?? 0)} label={t('plans.generating')} />
        <p className="text-sm text-muted-foreground">
          {t('web.plans.generatingProgress', { percent: formatNumber(locale, percent) })}
        </p>
        <p className="text-sm text-muted-foreground">{t('web.plans.keepUsing')}</p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>{t('web.plans.generateTitle')}</CardTitle>

      <Field label={t('web.plans.scopeLabel')} htmlFor="scope">
        <Select id="scope" value={scope} onChange={(e) => setScope(e.target.value as PlanScope)}>
          {SCOPES.map((s) => (
            <option key={s} value={s}>
              {t(scopeKey(s))}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t('web.plans.startLabel')} htmlFor="starts">
        <Input id="starts" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t('web.plans.slotsLabel')}</legend>
        <div className="flex flex-wrap gap-2">
          {SLOTS.map((slot) => {
            const on = slots.includes(slot);
            return (
              <button
                key={slot}
                type="button"
                aria-pressed={on}
                onClick={() => toggleSlot(slot)}
                className={
                  on
                    ? 'rounded-full border border-primary-text bg-primary-soft px-3 py-1.5 text-sm font-medium text-primary-text'
                    : 'rounded-full border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted'
                }
              >
                {t(slotKey(slot))}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('web.plans.servingsLabel')} htmlFor="servings">
          <Input
            id="servings"
            type="number"
            inputMode="numeric"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
          />
        </Field>
        <Field label={t('web.plans.maxCookLabel')} htmlFor="maxcook">
          <Input
            id="maxcook"
            type="number"
            inputMode="numeric"
            value={maxCook}
            onChange={(e) => setMaxCook(e.target.value)}
          />
        </Field>
      </div>

      {failed ? <ErrorState error={{ code: 'JOB_FAILED', messageKey: 'errors.JOB_FAILED' }} /> : null}
      {generate.isError ? <ErrorState error={generate.error} /> : null}

      <Button onClick={submit} disabled={generate.isPending || slots.length === 0}>
        {t('web.plans.generateCta')}
      </Button>
    </Card>
  );
}
