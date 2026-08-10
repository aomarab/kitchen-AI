'use client';

import { cn } from '../../lib/cn';

export interface StarRatingProps {
  value: number;
  onChange: (value: number) => void;
  /** Accessible label for the nth star, e.g. "Rate 3 out of 5". */
  labelFor: (value: number) => string;
  legend: string;
  disabled?: boolean;
}

const STARS = [1, 2, 3, 4, 5];

/**
 * A real radiogroup of five inputs rather than a click-tracked row of glyphs:
 * keyboard users get arrow-key selection for free, and every option is
 * separately announced.
 *
 * The glyph is a text character, not an icon font, so it inherits `currentColor`
 * and needs no new asset. `flex` mirrors under RTL on its own.
 */
export function StarRating({ value, onChange, labelFor, legend, disabled }: StarRatingProps) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="text-sm font-medium text-foreground">{legend}</legend>
      <div className="flex gap-1">
        {STARS.map((star) => (
          <label
            key={star}
            className={cn(
              'flex h-11 w-11 cursor-pointer items-center justify-center rounded text-2xl leading-none transition',
              'focus-within:outline-none focus-within:ring-2 focus-within:ring-primary',
              star <= value ? 'text-primary-text' : 'text-muted-foreground',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <input
              type="radio"
              name="feedback-rating"
              value={star}
              checked={value === star}
              onChange={() => onChange(star)}
              aria-label={labelFor(star)}
              className="sr-only"
            />
            <span aria-hidden="true">{star <= value ? '\u2605' : '\u2606'}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
