import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocaleProvider } from '../../lib/locale';
import { SmartScreenView } from './SmartScreenView';

const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: { call } }));
vi.mock('../../mocks/provider', () => ({ useMocksReady: () => true }));

const allOn = {
  householdId: '11111111-1111-4111-8111-111111111111',
  breakEnabled: true,
  stretchEnabled: true,
  morningEnabled: true,
  hydrationEnabled: true,
  breakCadenceMinutes: 60,
  hydrationGoalCups: 8,
  quietHoursStart: 22,
  quietHoursEnd: 7,
};
const allOff = { ...allOn, breakEnabled: false, stretchEnabled: false, morningEnabled: false, hydrationEnabled: false };

function mockData(settings: typeof allOn) {
  call.mockImplementation((route: string) => {
    if (route === 'listHouseholds') return Promise.resolve([{ id: 'h1', name: 'Family Kitchen' }]);
    if (route === 'getReminderSettings') return Promise.resolve(settings);
    return Promise.resolve(undefined);
  });
}

function renderView(locale: 'en' | 'ar' = 'en') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider locale={locale}>
        <SmartScreenView />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe('SmartScreenView', () => {
  beforeEach(() => call.mockReset());

  it('shows the household, the enabled nudges and the configured water goal', async () => {
    mockData(allOn);
    renderView();
    expect(await screen.findByText('Family Kitchen')).toBeInTheDocument();
    expect(screen.getByText("Today's wellness plan")).toBeInTheDocument();
    expect(screen.getByText('Movement breaks · Every 60 min')).toBeInTheDocument();
    expect(screen.getByText('Hydration reminders')).toBeInTheDocument();
    // the water card shows the goal, never a fabricated consumed count
    expect(screen.getByText('8 cups')).toBeInTheDocument();
    expect(screen.getByText('No active timer')).toBeInTheDocument();
  });

  it('shows an honest idle state with a settings link when every nudge is off', async () => {
    mockData(allOff);
    renderView();
    expect(await screen.findByText('Wellness reminders are off')).toBeInTheDocument();
    expect(screen.queryByText("Today's wellness plan")).not.toBeInTheDocument();
    const cta = screen.getByRole('link', { name: /open reminder settings/i });
    expect(cta).toHaveAttribute('href', '/settings/reminders');
  });

  it('renders natively in Arabic without throwing', async () => {
    mockData(allOn);
    renderView('ar');
    expect(await screen.findAllByText('رفيق المطبخ')).not.toHaveLength(0);
  });
});
