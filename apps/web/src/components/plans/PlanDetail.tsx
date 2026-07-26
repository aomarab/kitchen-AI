'use client';

import { useState } from 'react';
import type { MealPlan, MealPlanEntry } from '@kitchen/contracts';
import { formatNumber } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';
import { slotKey } from '../../lib/labels';
import { entriesForDate, planDates, todayIso } from '../../lib/plan';
import { cn } from '../../lib/cn';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { IconButton } from '../ui/IconButton';
import { DirectionalIcon } from '../ui/DirectionalIcon';
import { AppImage } from '../ui/AppImage';
import { LocalizedDate } from '../common/LocalizedDate';
import { EmptyState } from '../ui/states';
import { ChevronIcon } from '../ui/icons';
import { EntrySheet } from './EntrySheet';

type View = 'day' | 'week' | 'month';

export function PlanDetail({ plan }: { plan: MealPlan }) {
  const { t } = useLocale();
  const dates = planDates(plan);
  const [view, setView] = useState<View>(plan.scope === 'monthly' ? 'month' : plan.scope === 'daily' ? 'day' : 'week');
  const [activeDate, setActiveDate] = useState<string>(
    dates.includes(todayIso()) ? todayIso() : dates[0] ?? todayIso(),
  );
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const openEntry = (entry: MealPlanEntry) => setSelectedEntryId(entry.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('web.nav.plans')}>
        <ViewTab view="day" current={view} onSelect={setView} label={t('web.plans.dayView')} />
        <ViewTab view="week" current={view} onSelect={setView} label={t('web.plans.weekView')} />
        <ViewTab view="month" current={view} onSelect={setView} label={t('web.plans.monthView')} />
      </div>

      {view === 'day' ? (
        <DayView plan={plan} dates={dates} activeDate={activeDate} setActiveDate={setActiveDate} onOpen={openEntry} />
      ) : null}
      {view === 'week' ? <WeekView plan={plan} dates={dates} onOpen={openEntry} /> : null}
      {view === 'month' ? (
        <MonthView
          plan={plan}
          dates={dates}
          onPickDay={(d) => {
            setActiveDate(d);
            setView('day');
          }}
        />
      ) : null}

      <EntrySheet plan={plan} entryId={selectedEntryId} onClose={() => setSelectedEntryId(null)} />
    </div>
  );
}

function ViewTab({
  view,
  current,
  onSelect,
  label,
}: {
  view: View;
  current: View;
  onSelect: (v: View) => void;
  label: string;
}) {
  const active = view === current;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(view)}
      className={cn(
        'rounded-full border px-4 py-1.5 text-sm font-medium transition',
        active ? 'border-primary bg-primary/12 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
      )}
    >
      {label}
    </button>
  );
}

export function EntryCard({ entry, onOpen }: { entry: MealPlanEntry; onOpen: (e: MealPlanEntry) => void }) {
  const { t } = useLocale();
  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      className="flex w-full items-center gap-3 rounded-xl border border-border p-2 text-start transition hover:border-primary/50 hover:bg-muted"
    >
      {entry.recipe.heroImageUrl ? (
        <AppImage src={entry.recipe.heroImageUrl} alt={entry.recipe.title} className="h-14 w-14 shrink-0 rounded-lg" sizes="56px" />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{t(slotKey(entry.slot))}</p>
        <p className="truncate font-medium">{entry.recipe.title}</p>
      </div>
      <Badge tone={entry.fullyCovered ? 'success' : 'warning'}>
        {entry.fullyCovered ? t('plans.fullyCovered') : t('recipe.notInStock')}
      </Badge>
    </button>
  );
}

function DayView({
  plan,
  dates,
  activeDate,
  setActiveDate,
  onOpen,
}: {
  plan: MealPlan;
  dates: string[];
  activeDate: string;
  setActiveDate: (d: string) => void;
  onOpen: (e: MealPlanEntry) => void;
}) {
  const { t } = useLocale();
  const index = Math.max(0, dates.indexOf(activeDate));
  const entries = entriesForDate(plan, activeDate);
  const go = (delta: number) => {
    const next = dates[index + delta];
    if (next) setActiveDate(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <IconButton label={t('web.recipe.prevStep')} onClick={() => go(-1)} disabled={index <= 0}>
          <DirectionalIcon icon={ChevronIcon} className="rotate-180" />
        </IconButton>
        <p className="font-medium">
          <LocalizedDate value={activeDate} options={{ weekday: 'long', day: 'numeric', month: 'long' }} />
        </p>
        <IconButton label={t('web.recipe.nextStep')} onClick={() => go(1)} disabled={index >= dates.length - 1}>
          <DirectionalIcon icon={ChevronIcon} />
        </IconButton>
      </div>
      {entries.length === 0 ? (
        <EmptyState title={t('web.plans.noEntries')} />
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

function WeekView({
  plan,
  dates,
  onOpen,
}: {
  plan: MealPlan;
  dates: string[];
  onOpen: (e: MealPlanEntry) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {dates.map((date) => (
        <Card key={date} className="flex flex-col gap-2 p-3">
          <p className="text-sm font-medium">
            <LocalizedDate value={date} options={{ weekday: 'short', day: 'numeric', month: 'short' }} />
          </p>
          {entriesForDate(plan, date).map((entry) => (
            <EntryCard key={entry.id} entry={entry} onOpen={onOpen} />
          ))}
        </Card>
      ))}
    </div>
  );
}

function MonthView({
  plan,
  dates,
  onPickDay,
}: {
  plan: MealPlan;
  dates: string[];
  onPickDay: (d: string) => void;
}) {
  const { locale } = useLocale();
  const withEntries = new Set(dates);
  const first = new Date(`${plan.startsOn}T00:00:00`);
  const year = first.getFullYear();
  const month = first.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = new Date(year, month, 1).getDay();

  const cells: (string | null)[] = [];
  for (let i = 0; i < leading; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {cells.map((iso, i) => {
        if (!iso) return <div key={`empty-${i}`} />;
        const has = withEntries.has(iso);
        const dayNum = Number(iso.slice(8, 10));
        return (
          <button
            key={iso}
            type="button"
            disabled={!has}
            onClick={() => has && onPickDay(iso)}
            className={cn(
              'aspect-square rounded-lg border p-1 text-sm transition',
              has ? 'border-primary/40 bg-primary/10 font-medium text-primary hover:bg-primary/20' : 'border-border text-muted-foreground',
            )}
          >
            {formatNumber(locale, dayNum)}
          </button>
        );
      })}
    </div>
  );
}
