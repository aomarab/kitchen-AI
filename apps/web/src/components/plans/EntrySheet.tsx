'use client';

import Link from 'next/link';
import type { MealPlan } from '@kitchen/contracts';
import { formatNumber } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';
import { slotKey } from '../../lib/labels';
import { useRegenerateEntry, useUpdateEntry } from '../../hooks/plans';
import { Sheet } from '../ui/Sheet';
import { Button, buttonClasses } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { RecipeThumb } from '../ui/RecipeThumb';
import { LocalizedDate } from '../common/LocalizedDate';

export function EntrySheet({
  plan,
  entryId,
  onClose,
}: {
  plan: MealPlan;
  entryId: string | null;
  onClose: () => void;
}) {
  const { t, locale } = useLocale();
  const regenerate = useRegenerateEntry(plan.id);
  const update = useUpdateEntry(plan.id);
  const entry = plan.entries.find((e) => e.id === entryId) ?? null;

  if (!entry) return null;

  return (
    <Sheet open={Boolean(entryId)} onClose={onClose} title={t('web.plans.entryDetail')}>
      <div className="flex flex-col gap-4">
        <RecipeThumb
          heroImageUrl={entry.recipe.heroImageUrl}
          title={entry.recipe.title}
          dishKey={`${entry.recipe.locale}:${entry.recipe.title}`}
          className="aspect-video w-full rounded-xl"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">{t(slotKey(entry.slot))}</Badge>
          <Badge tone={entry.fullyCovered ? 'success' : 'warning'}>
            {entry.fullyCovered ? t('plans.fullyCovered') : t('recipe.notInStock')}
          </Badge>
          <Badge tone={entry.state === 'cooked' ? 'success' : 'neutral'}>{t(`plans.${entry.state}`)}</Badge>
        </div>

        <div>
          <h3 className="text-xl font-semibold tracking-heading-sm">{entry.recipe.title}</h3>
          <p className="text-sm text-muted-foreground">
            <LocalizedDate value={entry.date} /> ·{' '}
            {t('recipe.servings', { count: formatNumber(locale, entry.servings) })}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link className={buttonClasses()} href={`/recipes/${entry.recipe.id}`}>
            {t('web.plans.openRecipe')}
          </Link>
          <Button
            variant="outline"
            onClick={() => regenerate.mutate({ entryId: entry.id, excludeRecipeIds: [entry.recipe.id] })}
            disabled={regenerate.isPending}
          >
            {t('plans.regenerate')}
          </Button>
          {entry.state !== 'cooked' ? (
            <Button
              variant="secondary"
              onClick={() => update.mutate({ entryId: entry.id, body: { state: 'cooked' } })}
              disabled={update.isPending}
            >
              {t('plans.cooked')}
            </Button>
          ) : null}
          {entry.state !== 'skipped' ? (
            <Button
              variant="ghost"
              onClick={() => update.mutate({ entryId: entry.id, body: { state: 'skipped' } })}
              disabled={update.isPending}
            >
              {t('plans.skipped')}
            </Button>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}
