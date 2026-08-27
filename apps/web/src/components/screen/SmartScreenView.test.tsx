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

function mockData(settings: typeof allOn, timers: unknown[] = []) {
  call.mockImplementation((route: string) => {
    if (route === 'listHouseholds') return Promise.resolve([{ id: 'h1', name: 'Family Kitchen' }]);
    if (route === 'getReminderSettings') return Promise.resolve(settings);
    if (route === 'listTimers') return Promise.resolve({ items: timers });
    return Promise.resolve(undefined);
  });
}

const NOW = new Date('2026-08-27T10:00:00.000Z');
const runningTimer = {
  id: 't1',
  householdId: 'h1',
  label: 'Rice',
  durationSec: 600,
  status: 'running' as const,
  endsAt: new Date(NOW.getTime() + 300_000).toISOString(),
  remainingSec: 300,
  createdAt: new Date(NOW.getTime() - 300_000).toISOString(),
};

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

  it('shows the running timer on the kitchen screen instead of the empty placeholder', async () => {
    vi.setSystemTime(NOW);
    mockData(allOn, [runningTimer]);
    renderView();
    const card = await screen.findByTestId('screen-timer');
    expect(card).toHaveTextContent('Rice');
    expect(card).toHaveTextContent('5:00');
    expect(screen.queryByText('No active timer')).not.toBeInTheDocument();
  });

  it('falls back to the empty placeholder when every timer has been stopped', async () => {
    vi.setSystemTime(NOW);
    mockData(allOn, []);
    renderView();
    expect(await screen.findByText('No active timer')).toBeInTheDocument();
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
