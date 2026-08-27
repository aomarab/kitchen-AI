'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { formatDate } from '@kitchen/i18n';
import { formatRemaining } from '@kitchen/contracts';
import { useLocale } from '../../lib/locale';
import { cn } from '../../lib/cn';
import { useOrientation } from '../../lib/useOrientation';
import { useHousehold } from '../../hooks/settings';
import { useReminderSettings } from '../../hooks/reminders';
import { useTimers } from '../../hooks/timers';
import { featuredTimer, hasRunningTimer, useTimerTick } from '../../lib/timers';
import { hasAnyNudge, hydrationGoalText, wellnessPlanLines } from '../../lib/screen';
import { LoadingState, ErrorState } from '../ui/states';

function useClock(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function SmartScreenView() {
  const { t, locale } = useLocale();
  const orientation = useOrientation();
  const householdQuery = useHousehold();
  const settingsQuery = useReminderSettings();
  const timersQuery = useTimers();
  const now = useClock();
  const timers = timersQuery.data?.items ?? [];
  const tick = useTimerTick(hasRunningTimer(timers, new Date()));
  const timer = featuredTimer(timers, tick);

  if (settingsQuery.isLoading || householdQuery.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas">
        <LoadingState />
      </div>
    );
  }
  if (settingsQuery.isError) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas">
        <ErrorState error={settingsQuery.error} onRetry={() => void settingsQuery.refetch()} />
      </div>
    );
  }
  if (!settingsQuery.data) return null;

  const settings = settingsQuery.data;
  const householdName = householdQuery.data?.name ?? t('web.screen.wordmark');
  const planLines = wellnessPlanLines(settings, t);
  const clock = now ? formatDate(locale, now, { hour: '2-digit', minute: '2-digit' }) : '—';
  const isLandscape = orientation === 'landscape';

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-foreground">
      <header className="flex items-center justify-between gap-3 px-6 py-4">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold tabular-nums tracking-heading-sm">{clock}</span>
          <span className="text-sm font-semibold text-muted-foreground">{householdName}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary-text">
            {t('web.screen.wordmark')}
          </span>
          <Link href="/" className="text-sm font-semibold text-muted-foreground hover:text-foreground">
            {t('web.screen.exit')}
          </Link>
        </div>
      </header>

      <main
        data-testid="screen-main"
        data-orientation={orientation}
        className={cn('flex-1 px-6 pb-4', isLandscape ? 'grid grid-cols-[1.4fr_1fr] gap-4' : 'flex flex-col gap-4')}
      >
        <section className="flex flex-col justify-center gap-4 rounded-3xl bg-inverse p-6 text-inverse-foreground shadow-raised">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 flex-none place-items-center rounded-full border border-inverse-muted text-inverse-foreground">
              <SpeakerIcon />
            </span>
            <span className="text-xs font-bold uppercase tracking-heading-sm text-inverse-muted">
              {hasAnyNudge(settings) ? t('web.screen.planLabel') : t('web.screen.planIdleLabel')}
            </span>
          </div>

          {planLines.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {planLines.map((line) => (
                <li key={line} className="text-xl font-semibold leading-snug">
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="text-lg font-medium text-inverse-muted">{t('web.screen.planIdle')}</p>
              <Link
                href="/settings/reminders"
                className="rounded-full bg-inverse-foreground px-4 py-2 text-sm font-bold text-inverse"
              >
                {t('web.screen.planIdleCta')}
              </Link>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-4">
          <MiniCard
            tone="primary"
            icon={<TimerIcon />}
            label={timer ? timer.label : t('web.screen.timerLabel')}
            value={timer ? formatRemaining(timer.remainingSec) : t('web.screen.timerEmpty')}
            testId="screen-timer"
          />
          <MiniCard
            tone="accent"
            icon={<WaterIcon />}
            label={t('web.screen.hydrationLabel')}
            value={hydrationGoalText(settings, t)}
          />
        </div>
      </main>

      <nav className="grid grid-cols-4 gap-2 border-t border-border bg-background px-4 py-3">
        <NavItem icon={<TimerIcon />} label={t('web.screen.navTimers')} href="/timers" />
        <NavItem icon={<BookIcon />} label={t('web.screen.navRecipes')} href="/recipes" />
        <NavItem icon={<NoteIcon />} label={t('web.screen.navNotes')} />
        <NavItem icon={<BellIcon />} label={t('web.screen.navAlerts')} href="/settings/reminders" active />
      </nav>
    </div>
  );
}

function MiniCard({
  tone,
  icon,
  label,
  value,
  testId,
}: {
  tone: 'primary' | 'accent';
  icon: ReactNode;
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex items-center gap-4 rounded-2xl border border-border bg-background p-5 shadow-card"
    >
      <span
        className={cn(
          'grid h-12 w-12 flex-none place-items-center rounded-xl',
          tone === 'primary' ? 'bg-primary-soft text-primary-text' : 'bg-accent-soft text-accent-text',
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-muted-foreground">{label}</div>
        <div className="text-lg font-bold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function NavItem({
  icon,
  label,
  href,
  active = false,
}: {
  icon: ReactNode;
  label: string;
  href?: string;
  active?: boolean;
}) {
  const className = cn(
    'flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-sm font-bold',
    active ? 'bg-primary-soft text-primary-text' : 'text-muted-foreground',
    href && !active && 'hover:bg-canvas hover:text-foreground',
  );
  if (href) {
    return (
      <Link href={href} className={className}>
        {icon}
        <span>{label}</span>
      </Link>
    );
  }
  return (
    <span className={className} aria-disabled="true">
      {icon}
      <span>{label}</span>
    </span>
  );
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function TimerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2 2" />
      <path d="M9 2h6" />
    </svg>
  );
}

function WaterIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
