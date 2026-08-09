import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Locale } from '@kitchen/i18n';
import { LocaleProvider, useLocale } from '../../lib/locale';
import { AppShell } from './AppShell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/kitchen',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mirrors what the server layout does: it stamps `dir` from the locale onto the
// document root. Rendering that here lets us assert the same mapping in jsdom.
function DocProbe({ children }: { children: React.ReactNode }) {
  const { dir } = useLocale();
  return (
    <div data-testid="doc" dir={dir}>
      {children}
    </div>
  );
}

function renderShell(locale: Locale) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider locale={locale}>
        <DocProbe>
          <AppShell>
            <p>content</p>
          </AppShell>
        </DocProbe>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe('AppShell layout', () => {
  it('renders dir="ltr" with English navigation by default', () => {
    renderShell('en');
    expect(screen.getByTestId('doc')).toHaveAttribute('dir', 'ltr');
    expect(screen.getAllByText('My Kitchen').length).toBeGreaterThan(0);
  });

  it('mirrors to dir="rtl" with Arabic navigation under the Arabic locale', () => {
    renderShell('ar');
    expect(screen.getByTestId('doc')).toHaveAttribute('dir', 'rtl');
    // Arabic nav label for "My Kitchen" — content is translated, not just flipped.
    expect(screen.getAllByText('مطبخي').length).toBeGreaterThan(0);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});
