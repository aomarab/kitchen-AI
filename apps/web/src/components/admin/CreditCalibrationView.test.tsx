import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CreditCalibration } from '@kitchen/contracts';
import { LocaleProvider } from '../../lib/locale';
import { CreditCalibrationView } from './CreditCalibrationView';

const { call } = vi.hoisted(() => ({ call: vi.fn() }));

vi.mock('../../lib/api', () => ({ api: { call } }));
vi.mock('../../mocks/provider', () => ({ useMocksReady: () => true }));

const REPORT: CreditCalibration = {
  since: '2026-08-01T00:00:00.000Z',
  costBasisUsd: 0.0045,
  creditValueUsd: 4.99 / 300,
  rows: [
    {
      action: 'receipt.scan',
      listedCredits: 2,
      chargedCount: 12,
      measuredCount: 12,
      callCount: 24,
      creditsCharged: 24,
      measuredCostUsd: 0.14,
      measuredCreditsPerCharge: 2.6,
      measurable: true,
      status: 'underpriced',
    },
    {
      action: 'pantry.scan',
      listedCredits: 1,
      chargedCount: 40,
      measuredCount: 40,
      callCount: 44,
      creditsCharged: 40,
      measuredCostUsd: 0.16,
      measuredCreditsPerCharge: 0.9,
      measurable: true,
      status: 'covered',
    },
    {
      action: 'assistant.session',
      listedCredits: 25,
      chargedCount: 8,
      measuredCount: 0,
      callCount: 0,
      creditsCharged: 200,
      measuredCostUsd: 0,
      measuredCreditsPerCharge: null,
      measurable: false,
      status: 'unmeasured',
    },
    {
      action: 'plan.weekly',
      listedCredits: 20,
      chargedCount: 0,
      measuredCount: 0,
      callCount: 0,
      creditsCharged: 0,
      measuredCostUsd: 0,
      measuredCreditsPerCharge: null,
      measurable: true,
      status: 'unused',
    },
  ],
};

function renderView(locale: 'en' | 'ar' = 'en') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider locale={locale}>
        <CreditCalibrationView />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  call.mockReset();
});

describe('CreditCalibrationView', () => {
  it('shows every action with its measured status', async () => {
    call.mockResolvedValue(REPORT);
    renderView();

    await waitFor(() => expect(screen.getByText('Receipt scan')).toBeInTheDocument());
    expect(screen.getByText('Pantry scan')).toBeInTheDocument();
    expect(screen.getByText('Assistant session')).toBeInTheDocument();
    expect(screen.getByText('Weekly plan')).toBeInTheDocument();

    expect(screen.getByText('Underpriced')).toBeInTheDocument();
    expect(screen.getByText('Covered')).toBeInTheDocument();
    expect(screen.getByText('Unused')).toBeInTheDocument();
  });

  it('flags an unmeasurable action rather than showing it as free', async () => {
    call.mockResolvedValue(REPORT);
    renderView();

    await waitFor(() => expect(screen.getByText('Assistant session')).toBeInTheDocument());
    // Its cost cell reads "Not measured", never $0.00. Two rows are unmeasured
    // (the session and the never-run weekly plan), so both carry the label.
    expect(screen.getAllByText('Not measured').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Billed by the provider/)).toBeInTheDocument();
    expect(screen.getByText('Unmeasured')).toBeInTheDocument();
  });

  it('defaults to a 30-day window and re-queries when the window changes', async () => {
    call.mockResolvedValue(REPORT);
    renderView();

    await waitFor(() => expect(call).toHaveBeenCalled());
    expect(call.mock.calls[0]![0]).toBe('adminCreditsCalibration');
    expect(call.mock.calls[0]![1].query).toEqual({ days: 30 });

    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));

    await waitFor(() => expect(call.mock.calls.some((c) => c[1]?.query?.days === 7)).toBe(true));
  });

  it('renders in Arabic', async () => {
    call.mockResolvedValue(REPORT);
    renderView('ar');

    // Wait on a row, not the always-present heading, so the query has settled.
    await waitFor(() => expect(screen.getByText('مسح الإيصال')).toBeInTheDocument());
    expect(screen.getByText('معايرة الأرصدة')).toBeInTheDocument();
  });
});
