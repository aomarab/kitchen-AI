'use client';

import { useLocale } from '../../lib/locale';
import { cn } from '../../lib/cn';
import { AppImage } from './AppImage';
import { RecipesIcon } from './icons';

/**
 * Placeholder tones, as token names. Each is paired with a foreground the
 * palette guard proves legible on it, so a tone cannot be added without a
 * contrast-checked partner.
 *
 * Naming tokens rather than writing a hex or a `/8` opacity tint is what keeps
 * `token-usage.test.ts` satisfied: Tailwind v4 compiles `/8` to `color-mix`,
 * which breaks the contrast maths the palette guard depends on.
 */
export const RECIPE_THUMB_TONES = [
  { bg: 'bg-primary-soft', fg: 'text-primary-text' },
  { bg: 'bg-accent-soft', fg: 'text-accent-text' },
  { bg: 'bg-warning-soft', fg: 'text-warning' },
  { bg: 'bg-success-soft', fg: 'text-success' },
] as const;

export type RecipeThumbTone = (typeof RECIPE_THUMB_TONES)[number];

export function recipeThumbToneForDishKey(dishKey: string): RecipeThumbTone {
  const source = dishKey.normalize('NFKC').trim() || 'recipe';
  let hash = 0x811c9dc5;

  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 0x01000193) >>> 0;
  }

  return RECIPE_THUMB_TONES[hash % RECIPE_THUMB_TONES.length];
}

/**
 * The single entry point for recipe imagery. Every call site goes through it so
 * the fallback cannot be forgotten at a new one — what this replaces was five
 * hand-rolled null guards that each rendered nothing at all.
 */
export function RecipeThumb({
  heroImageUrl,
  title,
  dishKey,
  className,
  sizes,
  priority = false,
}: {
  heroImageUrl: string | null;
  title: string;
  dishKey: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const { t } = useLocale();

  if (heroImageUrl) {
    return (
      <AppImage
        src={heroImageUrl}
        alt={title}
        className={className}
        sizes={sizes}
        priority={priority}
      />
    );
  }

  const tone = recipeThumbToneForDishKey(dishKey);

  return (
    <div
      role="img"
      aria-label={t('web.recipe.imagePlaceholder', { title })}
      data-tone={tone.bg}
      className={cn('grid place-items-center overflow-hidden', tone.bg, className)}
    >
      <RecipesIcon aria-hidden="true" className={cn('h-8 w-8', tone.fg)} />
    </div>
  );
}
