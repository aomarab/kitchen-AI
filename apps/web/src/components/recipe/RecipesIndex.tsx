'use client';

import Link from 'next/link';
import type { RecipeSummary } from '@kitchen/contracts';
import { formatNumber } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';
import { usePlans } from '../../hooks/plans';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { RecipeThumb } from '../ui/RecipeThumb';
import { LoadingState, ErrorState, EmptyState } from '../ui/states';

export function RecipesIndex() {
  const { t, locale } = useLocale();
  const plansQuery = usePlans();

  if (plansQuery.isLoading) return <LoadingState />;
  if (plansQuery.isError) return <ErrorState error={plansQuery.error} onRetry={() => void plansQuery.refetch()} />;

  const byId = new Map<string, RecipeSummary>();
  for (const plan of plansQuery.data ?? []) {
    for (const entry of plan.entries) byId.set(entry.recipe.id, entry.recipe);
  }
  const recipes = [...byId.values()];

  if (recipes.length === 0) {
    return <EmptyState title={t('plans.empty')} hint={t('web.plans.generateTitle')} />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {recipes.map((recipe) => (
        <Link key={recipe.id} href={`/recipes/${recipe.id}`} className="block">
          <Card className="flex h-full flex-col gap-3 p-3 transition hover:border-primary-text">
            <RecipeThumb src={recipe.heroImageUrl} title={recipe.title} dishKey={recipe.title} className="aspect-video w-full rounded-xl" />
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium">{recipe.title}</h3>
              <Badge tone="info">{t(`recipe.difficulty.${recipe.difficulty}`)}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('recipe.cookTime', { minutes: formatNumber(locale, recipe.cookMinutes) })} ·{' '}
              {t('recipe.servings', { count: formatNumber(locale, recipe.servings) })}
            </p>
          </Card>
        </Link>
      ))}
    </div>
  );
}
