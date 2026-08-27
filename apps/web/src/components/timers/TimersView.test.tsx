import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CookingTimer } from '@kitchen/contracts';
import { LocaleProvider } from '../../lib/locale';
import { TimersView } from './TimersView';

const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: { call } }));
vi.mock('../../mocks/provider', () => ({ useMocksReady: () => true }));

const NOW = new Date('2026-08-27T10:00:00.000Z');
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000).toISOString();

function timer(overrides: Partial<CookingTimer> = {}): CookingTimer {
  return {
    id: 't1',
    householdId: 'h1',
    label: 'Rice',
    durationSec: 600,
    status: 'running',
    endsAt: at(300),
    remainingSec: 300,
    createdAt: at(-300),
    ...overrides,
  };
}

function mockTimers(items: CookingTimer[]) {
  call.mockImplementation((route: string) => {
    if (route === 'listTimers') return Promise.resolve({ items });
    if (route === 'createTimer') return Promise.resolve(timer({ id: 'created' }));
    if (route === 'updateTimer') {
      return Promise.resolve(timer({ ...items[0], status: 'paused', endsAt: null }));
    }
    if (route === 'deleteTimer') return Promise.resolve({ ok: true });
    return Promise.resolve(undefined);
  });
}

function renderView(locale: 'en' | 'ar' = 'en') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider locale={locale}>
        <TimersView />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe('TimersView', () => {
  beforeEach(() => {
    call.mockReset();
    vi.setSystemTime(NOW);
  });

  it('shows an empty state rather than a fabricated timer', async () => {
    mockTimers([]);
    renderView();
    expect(await screen.findByText('No timers yet')).toBeInTheDocument();
    expect(screen.queryByTestId('timer-card')).not.toBeInTheDocument();
  });

  it('renders the countdown derived from the deadline, not the stored snapshot', async () => {
    mockTimers([timer({ remainingSec: 9999 })]);
    renderView();
    expect(await screen.findByTestId('timer-remaining')).toHaveTextContent('5:00');
  });

  it('shows a lapsed timer as finished with a remove button, and no stop button', async () => {
    mockTimers([timer({ endsAt: at(-30) })]);
    renderView();
    const card = await screen.findByTestId('timer-card');
    expect(card).toHaveAttribute('data-status', 'done');
    expect(screen.getByText('Time is up')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
  });

  it('offers resume, not pause, for a paused timer', async () => {
    mockTimers([timer({ status: 'paused', endsAt: null })]);
    renderView();
    expect(await screen.findByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
  });

  it('sends a pause action for the timer that was pressed', async () => {
    mockTimers([timer()]);
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('updateTimer', {
        params: { id: 't1' },
        body: { action: 'pause' },
      }),
    );
  });

  it('adds exactly one minute when the +1 min button is pressed', async () => {
    mockTimers([timer()]);
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: '+1 min' }));
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('updateTimer', {
        params: { id: 't1' },
        body: { action: 'extend', seconds: 60 },
      }),
    );
  });

  it('creates a timer from the trimmed label and the chosen minutes', async () => {
    mockTimers([]);
    renderView();
    fireEvent.change(await screen.findByLabelText('What is cooking?'), {
      target: { value: '  Rice  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start timer' }));
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('createTimer', {
        body: { label: 'Rice', durationSec: 600 },
      }),
    );
  });

  it('refuses to start a timer with no label', async () => {
    mockTimers([]);
    renderView();
    const start = await screen.findByRole('button', { name: 'Start timer' });
    expect(start).toBeDisabled();
    fireEvent.click(start);
    expect(call).not.toHaveBeenCalledWith('createTimer', expect.anything());
  });

  it('renders natively in Arabic', async () => {
    mockTimers([timer({ label: 'الأرز' })]);
    renderView('ar');
    expect(await screen.findByText('مؤقّتات الطبخ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+دقيقة' })).toBeInTheDocument();
  });
});
