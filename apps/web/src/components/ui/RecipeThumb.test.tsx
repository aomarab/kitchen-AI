import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Locale } from '@kitchen/i18n';
import { LocaleProvider } from '../../lib/locale';
import { RecipeThumb } from './RecipeThumb';

function renderThumb(props: { src: string | null; title: string; dishKey: string }, locale: Locale = 'en') {
  return render(
    <LocaleProvider locale={locale}>
      <RecipeThumb {...props} />
    </LocaleProvider>,
  );
}

// Fixtures use production-representative title-case values — the shape recipes actually have.
const KABSA = { src: null, title: 'Chicken Kabsa', dishKey: 'Chicken Kabsa' };
const MOUSSAKA = { src: null, title: 'Moussaka', dishKey: 'Moussaka' };

describe('RecipeThumb', () => {
  it('renders the image when one resolved', () => {
    renderThumb({ ...KABSA, src: 'https://i.ytimg.com/vi/Xtspw022mb4/hqdefault.jpg' });
    expect(screen.getByRole('img', { name: 'Chicken Kabsa' })).toBeInTheDocument();
  });

  it('renders a placeholder instead of a wrong image when nothing resolved', () => {
    renderThumb(KABSA);
    // Labelled, not silent: a screen reader must be told the photo is missing
    // rather than encountering a bare heading-like string.
    expect(screen.getByRole('img', { name: 'No photo available for Chicken Kabsa' })).toBeInTheDocument();
    expect(screen.getByText('Chicken Kabsa')).toBeInTheDocument();
  });

  it('labels the placeholder in Arabic under the Arabic locale', () => {
    renderThumb(KABSA, 'ar');
    expect(screen.getByRole('img', { name: 'لا توجد صورة لـ Chicken Kabsa' })).toBeInTheDocument();
  });

  it('gives one dish the same tone every time it is rendered', () => {
    const { container: a } = renderThumb(KABSA);
    const { container: b } = renderThumb(KABSA);
    expect(a.firstElementChild?.className).toBe(b.firstElementChild?.className);
  });

  it('both tones are reachable across the dish space', () => {
    // With only two tones, dish collisions are expected: ~half of all pairs must hash
    // to the same tone. This test asserts the component is not degenerate — it actually
    // uses both tones. We verify this with real titles from the space: Chicken Kabsa
    // and Moussaka both appear in real plans and hash to different tones.
    const { container: primary } = renderThumb(MOUSSAKA);
    const { container: accent } = renderThumb(KABSA);
    const primaryClass = primary.firstElementChild?.className;
    const accentClass = accent.firstElementChild?.className;
    expect(primaryClass).toContain('bg-primary-soft');
    expect(accentClass).toContain('bg-accent-soft');
    expect(primaryClass).not.toBe(accentClass);
  });
});
