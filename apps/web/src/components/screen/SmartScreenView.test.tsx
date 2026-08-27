import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  timeZone: 'UTC',
};
const allOff = {
  ...allOn,
  breakEnabled: false,
  stretchEnabled: false,
  morningEnabled: false,
  hydrationEnabled: false,
};

function mockData(settings: typeof allOn, timers: unknown[] = [], occurrences: unknown[] = []) {
  call.mockImplementation((route: string) => {
    if (route === 'listHouseholds') return Promise.resolve([{ id: 'h1', name: 'Family Kitchen' }]);
    if (route === 'getReminderSettings') return Promise.resolve(settings);
    if (route === 'listTimers') return Promise.resolve({ items: timers });
    if (route === 'listReminderOccurrences') return Promise.resolve(occurrences);
    return Promise.resolve(undefined);
  });
}

const nudge = (over: Record<string, unknown> = {}) => ({
  id: 'n1',
  householdId: 'h1',
  type: 'hydration',
  channel: 'screen',
  messageKey: 'reminders.hydration.body',
  firedAt: '2026-08-27T09:00:00.000Z',
  acknowledgedAt: null,
  ...over,
});

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
    // the water card counts acknowledged cups only, never a fabricated consumed count
    expect(screen.getByText('0 of 8 cups')).toBeInTheDocument();
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

describe('SmartScreenView nudges', () => {
  beforeEach(() => call.mockReset());

  it('counts only acknowledged hydration nudges as cups drunk', async () => {
    mockData(
      allOn,
      [],
      [nudge({ id: 'a', acknowledgedAt: '2026-08-27T09:01:00.000Z' }), nudge({ id: 'b' })],
    );
    renderView();
    expect(await screen.findByText('1 of 8 cups')).toBeInTheDocument();
  });

  it('takes over the hero with the live nudge and acknowledges it on tap', async () => {
    mockData(allOn, [], [nudge()]);
    renderView();
    const card = await screen.findByTestId('screen-nudge');
    expect(card).toHaveTextContent('water');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('acknowledgeReminder', {
        params: { id: 'n1' },
      }),
    );
  });

  it('shows the wellness plan when nothing is waiting to be acknowledged', async () => {
    mockData(allOn, [], [nudge({ acknowledgedAt: '2026-08-27T09:01:00.000Z' })]);
    renderView();
    expect(await screen.findByText('Hydration reminders')).toBeInTheDocument();
    expect(screen.queryByTestId('screen-nudge')).toBeNull();
  });
});
