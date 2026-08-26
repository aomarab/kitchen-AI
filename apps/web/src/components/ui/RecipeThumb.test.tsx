import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createElement, type ComponentProps, type ImgHTMLAttributes } from 'react';
import { LocaleProvider } from '../../lib/locale';
import {
  RecipeThumb,
  RECIPE_THUMB_TONES,
  recipeThumbToneForDishKey,
  type RecipeThumbTone,
} from './RecipeThumb';

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    fill: _fill,
    priority: _priority,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & {
    src: string | { src: string };
    alt: string;
    fill?: boolean;
    priority?: boolean;
  }) => createElement('img', { src: typeof src === 'string' ? src : src.src, alt, ...props }),
}));

// Restated independently rather than imported, so a change to the component's
// list is caught here instead of silently redefining what "approved" means.
const ALLOWED_TONES: readonly RecipeThumbTone[] = [
  { bg: 'bg-primary-soft', fg: 'text-primary-text' },
  { bg: 'bg-accent-soft', fg: 'text-accent-text' },
  { bg: 'bg-warning-soft', fg: 'text-warning' },
  { bg: 'bg-success-soft', fg: 'text-success' },
];

const ALLOWED_BACKGROUNDS = new Set<string>(ALLOWED_TONES.map((tone) => tone.bg));

function renderThumb(props: Partial<ComponentProps<typeof RecipeThumb>> = {}) {
  return render(
    <LocaleProvider locale="en">
      <RecipeThumb
        heroImageUrl={null}
        title="Chicken kabsa"
        dishKey="en:chicken-kabsa"
        className="aspect-video w-full rounded-xl"
        {...props}
      />
    </LocaleProvider>,
  );
}

describe('RecipeThumb', () => {
  it('renders the recipe image when heroImageUrl is present', () => {
    const heroImageUrl = 'https://i.ytimg.com/vi/kabsa/maxresdefault.jpg';

    renderThumb({ heroImageUrl });

    expect(screen.getByAltText('Chicken kabsa')).toHaveAttribute('src', heroImageUrl);
    expect(screen.queryByRole('img', { name: 'No photo available for Chicken kabsa' })).not.toBeInTheDocument();
  });

  it('renders a localized placeholder when heroImageUrl is null', () => {
    renderThumb({ heroImageUrl: null });

    const placeholder = screen.getByRole('img', { name: 'No photo available for Chicken kabsa' });
    const tone = placeholder.getAttribute('data-tone');

    expect(screen.queryByAltText('Chicken kabsa')).not.toBeInTheDocument();
    expect(tone).not.toBeNull();
    expect(ALLOWED_BACKGROUNDS.has(tone as string)).toBe(true);
    expect(placeholder).toHaveClass(tone as string);
    expect(placeholder).toHaveClass('aspect-video', 'w-full', 'rounded-xl');
    expect(placeholder.querySelector('svg')).not.toBeNull();
  });

  it('selects a stable tone for the same dish key', () => {
    const key = 'ar:كبسة-دجاج';
    const first = recipeThumbToneForDishKey(key);
    const second = recipeThumbToneForDishKey(key);

    expect(second).toBe(first);
  });

  it('only produces approved palette token classes', () => {
    expect([...RECIPE_THUMB_TONES]).toEqual(ALLOWED_TONES);

    for (const key of ['en:chicken-kabsa', 'en:shakshuka', 'ar:شكشوكه', 'en:lemon-potatoes']) {
      expect(ALLOWED_BACKGROUNDS.has(recipeThumbToneForDishKey(key).bg)).toBe(true);
    }
  });

  it('spreads dishes across every tone rather than collapsing onto one', () => {
    // A constant hash would satisfy the stability test on its own, so prove the
    // spread too: this is what makes a list of cards look varied.
    const keys = Array.from({ length: 60 }, (_, i) => `en:dish-${i}`);
    const used = new Set(keys.map((key) => recipeThumbToneForDishKey(key).bg));

    expect(used.size).toBe(ALLOWED_TONES.length);
  });
});
