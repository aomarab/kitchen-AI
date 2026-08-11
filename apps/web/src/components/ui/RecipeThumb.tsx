'use client';

import { AppImage } from './AppImage';
import { cn } from '../../lib/cn';
import { useLocale } from '../../lib/locale';

/**
 * A recipe's image, or an honest stand-in for it.
 *
 * Every call site used to null-guard `heroImageUrl` by hand, so a new one could
 * silently forget and render nothing. Routing all of them through here means the
 * fallback cannot be skipped.
 *
 * The tones are the two soft/text token pairs the palette guard validates, so
 * the placeholder cannot drift out of contrast compliance.
 */
const TONES = [
  'bg-primary-soft text-primary-text',
  'bg-accent-soft text-accent-text',
] as const;

/** Stable across renders and processes, so a dish keeps its colour. */
function toneFor(dishKey: string): string {
  let hash = 0;
  for (let i = 0; i < dishKey.length; i += 1) {
    hash = (hash * 31 + dishKey.charCodeAt(i)) | 0;
  }
  return TONES[Math.abs(hash) % TONES.length]!;
}

export function RecipeThumb({
  src,
  title,
  dishKey,
  className,
  sizes,
  priority = false,
}: {
  src: string | null;
  title: string;
  dishKey: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const { t } = useLocale();

  if (src) {
    return <AppImage src={src} alt={title} className={className} sizes={sizes} priority={priority} />;
  }

  return (
    <div
      role="img"
      aria-label={t('web.recipe.noPhoto', { dish: title })}
      className={cn(
        'flex items-center justify-center overflow-hidden p-3 text-center text-sm font-medium',
        toneFor(dishKey),
        className,
      )}
    >
      <span aria-hidden className="line-clamp-3">
        {title}
      </span>
    </div>
  );
}
