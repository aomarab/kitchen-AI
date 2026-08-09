'use client';

import { useState } from 'react';
import { useLocale } from '../../lib/locale';
import { formatNumber } from '@kitchen/i18n';
import { cn } from '../../lib/cn';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { CheckIcon, ChevronIcon, PlusIcon, SparklesIcon } from '../ui/icons';
import { DirectionalIcon } from '../ui/DirectionalIcon';

export interface RailEntry {
  id: string;
  name: string;
  detail?: string;
}

export interface PantryRailViewProps {
  coveredCount: number;
  totalCount: number;
  inStock: RailEntry[];
  missing: RailEntry[];
  onAddAll?: () => void;
  addAllPending?: boolean;
}

/**
 * The live pantry rail — the point of the product (spec §6.2): it always shows
 * *why* a plan was suggested (what it draws from the kitchen) and what it will
 * cost at the store (what is missing). Presentational and locale-driven.
 */
export function PantryRailView({
  coveredCount,
  totalCount,
  inStock,
  missing,
  onAddAll,
  addAllPending,
}: PantryRailViewProps) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <div className="flex justify-center">
        <IconButton label={t('web.rail.expand')} onClick={() => setOpen(true)}>
          <DirectionalIcon icon={ChevronIcon} />
        </IconButton>
      </div>
    );
  }

  return (
    <section aria-label={t('web.rail.title')} className="flex flex-col gap-4 rounded-2xl border border-border bg-background p-5">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <SparklesIcon className="h-4 w-4 text-primary-text" />
            {t('web.rail.title')}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('web.rail.hint')}</p>
        </div>
        <IconButton label={t('web.rail.collapse')} onClick={() => setOpen(false)}>
          <DirectionalIcon icon={ChevronIcon} className="rotate-180" />
        </IconButton>
      </header>

      <p className="rounded-lg bg-muted px-3 py-2 text-sm font-medium">
        {t('web.rail.coveredMeals', {
          covered: formatNumber(locale, coveredCount),
          total: formatNumber(locale, totalCount),
        })}
      </p>

      <RailGroup
        tone="success"
        label={t('web.rail.inStock')}
        icon={<CheckIcon className="h-4 w-4 text-primary-text" />}
        entries={inStock}
        empty={t('common.empty')}
      />

      <RailGroup
        tone="warning"
        label={t('web.rail.missing')}
        icon={<PlusIcon className="h-4 w-4 text-primary-text" />}
        entries={missing}
        empty={t('web.rail.nothingMissing')}
      />

      {missing.length > 0 && onAddAll ? (
        <Button variant="outline" size="sm" block onClick={onAddAll} disabled={addAllPending}>
          {t('web.rail.addAllToShopping')}
        </Button>
      ) : null}

      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t('web.rail.why')} · </span>
        {t('web.rail.whyHint')}
      </p>
    </section>
  );
}

function RailGroup({
  label,
  icon,
  entries,
  empty,
  tone,
}: {
  label: string;
  icon: React.ReactNode;
  entries: RailEntry[];
  empty: string;
  tone: 'success' | 'warning';
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        {icon}
        <span>{label}</span>
        <Badge tone={tone} className="ms-auto">
          {entries.length}
        </Badge>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {entries.map((e) => (
            <li
              key={e.id}
              className={cn(
                'flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm',
                tone === 'success' ? 'border border-success bg-success-soft' : 'border border-warning bg-warning-soft',
              )}
            >
              <span className="truncate">{e.name}</span>
              {e.detail ? <span className="text-xs text-muted-foreground">{e.detail}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
