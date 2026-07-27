'use client';

import { useState } from 'react';
import { formatNumber } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';
import { localizedName } from '../../lib/name';
import { unitKey } from '../../lib/labels';
import { useRecipe, useMarkCooked } from '../../hooks/recipes';
import { Card, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { AppImage } from '../ui/AppImage';
import { LoadingState, ErrorState } from '../ui/states';
import { FlameIcon, PlayIcon, CheckIcon } from '../ui/icons';
import { CookMode } from './CookMode';

export function RecipeView({ id }: { id: string }) {
  const { t, locale } = useLocale();
  const recipeQuery = useRecipe(id, locale);
  const markCooked = useMarkCooked(id);
  const [cookMode, setCookMode] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (recipeQuery.isLoading) return <LoadingState />;
  if (recipeQuery.isError) return <ErrorState error={recipeQuery.error} onRetry={() => void recipeQuery.refetch()} />;
  if (!recipeQuery.data) return <ErrorState error={{ code: 'NOT_FOUND', messageKey: 'errors.NOT_FOUND' }} />;

  const recipe = recipeQuery.data;
  const inStockCount = recipe.ingredients.filter((ri) => ri.inStock).length;

  if (cookMode) return <CookMode recipe={recipe} onExit={() => setCookMode(false)} />;

  return (
    <div className="flex flex-col gap-6">
      {recipe.heroImageUrl ? (
        <AppImage
          src={recipe.heroImageUrl}
          alt={recipe.title}
          priority
          sizes="(max-width: 1024px) 100vw, 900px"
          className="aspect-[21/9] w-full rounded-2xl"
        />
      ) : null}

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">{t(`recipe.difficulty.${recipe.difficulty}`)}</Badge>
          <Badge>{t('recipe.prepTime', { minutes: formatNumber(locale, recipe.prepMinutes) })}</Badge>
          <Badge>{t('recipe.cookTime', { minutes: formatNumber(locale, recipe.cookMinutes) })}</Badge>
          <Badge>{t('recipe.servings', { count: formatNumber(locale, recipe.servings) })}</Badge>
        </div>
        <h2 className="text-2xl font-semibold">{recipe.title}</h2>
        <p className="text-muted-foreground">{recipe.description}</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={() => setCookMode(true)}>
            <PlayIcon className="h-4 w-4" />
            {t('recipe.cookMode')}
          </Button>
          <Button variant="outline" onClick={() => setConfirming(true)}>
            <FlameIcon className="h-4 w-4" />
            {t('recipe.markCooked')}
          </Button>
        </div>
      </header>

      {confirming ? (
        <Card className="flex flex-col gap-3 border-primary-text bg-primary-soft">
          {markCooked.isSuccess ? (
            <p className="flex items-center gap-2 font-medium text-primary-text">
              <CheckIcon className="h-5 w-5" />
              {t('recipe.cookedDone')}
            </p>
          ) : (
            <>
              <p className="font-medium">{t('recipe.cookedConfirm')}</p>
              <div className="flex gap-2">
                <Button onClick={() => markCooked.mutate({})} disabled={markCooked.isPending}>
                  {t('common.confirm')}
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </>
          )}
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-3">
            {t('recipe.ingredients')}{' '}
            <span className="text-sm font-normal text-muted-foreground">
              {t('web.recipe.coverageBadge', {
                inStock: formatNumber(locale, inStockCount),
                total: formatNumber(locale, recipe.ingredients.length),
              })}
            </span>
          </CardTitle>
          <ul className="flex flex-col gap-2">
            {recipe.ingredients.map((ri, i) => (
              <li key={`${ri.ingredient.id}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {localizedName(locale, { en: ri.ingredient.canonicalNameEn, ar: ri.ingredient.canonicalNameAr })}
                  <span className="text-muted-foreground">
                    {' '}
                    · {formatNumber(locale, ri.quantity)} {t(unitKey(ri.unit))}
                  </span>
                </span>
                {ri.optional ? (
                  <Badge>{t('recipe.optional')}</Badge>
                ) : ri.inStock ? (
                  <Badge tone="success">{t('recipe.inStock')}</Badge>
                ) : (
                  <Badge tone="warning">{t('recipe.notInStock')}</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle className="mb-3">{t('recipe.steps')}</CardTitle>
          <ol className="flex flex-col gap-3">
            {recipe.steps.map((step) => (
              <li key={step.index} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary-text">
                  {formatNumber(locale, step.index)}
                </span>
                <p className="text-sm leading-relaxed">{step.text}</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {recipe.nutrition ? (
        <Card>
          <CardTitle className="mb-3">{t('web.recipe.nutritionTitle')}</CardTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <NutritionCell label={t('web.recipe.calories')} value={formatNumber(locale, recipe.nutrition.calories)} />
            <NutritionCell label={t('web.recipe.protein')} value={`${formatNumber(locale, recipe.nutrition.proteinG)} g`} />
            <NutritionCell label={t('web.recipe.carbs')} value={`${formatNumber(locale, recipe.nutrition.carbsG)} g`} />
            <NutritionCell label={t('web.recipe.fat')} value={`${formatNumber(locale, recipe.nutrition.fatG)} g`} />
          </div>
        </Card>
      ) : null}

      {recipe.videos.length > 0 ? (
        <Card>
          <CardTitle className="mb-3">{t('recipe.videos')}</CardTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            {recipe.videos.map((video) => (
              <figure key={video.youtubeId} className="flex flex-col gap-2">
                <div className="aspect-video w-full overflow-hidden rounded-xl">
                  <iframe
                    className="h-full w-full"
                    src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}`}
                    title={video.title}
                    loading="lazy"
                    allowFullScreen
                  />
                </div>
                <figcaption className="text-sm">
                  <p className="font-medium">{video.title}</p>
                  <p className="text-muted-foreground">{video.channel}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">{t('recipe.noVideos')}</p>
      )}
    </div>
  );
}

function NutritionCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-3 text-center">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
