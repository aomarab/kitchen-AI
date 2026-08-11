import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Locale } from '@kitchen/i18n';
import {
  creditBalanceSchema,
  purchaseIntentSchema,
  CREDIT_PACKS,
  type CreditBalance as CreditBalanceData,
} from '@kitchen/contracts';
import { LocaleProvider } from '../../lib/locale';
import { API_URL } from '../../lib/config';
import { db, seed, DEFAULT_HOUSEHOLD_ID } from '../../mocks/db';
import { CreditBalanceView } from './CreditBalanceView';
import { CreditBalance } from './CreditBalance';

const { call } = vi.hoisted(() => ({ call: vi.fn() }));
// The container path: mock the api client (jsdom has no localStorage, so the
// real client cannot run here) and the readiness gate, then assert the hook
// asks for the right route and the balance is mapped into the view.
vi.mock('../../lib/api', () => ({ api: { call } }));
vi.mock('../../mocks/provider', () => ({ useMocksReady: () => true }));

const NOW = new Date().toISOString();

function balance(overrides: Partial<CreditBalanceData> = {}): CreditBalanceData {
  return {
    householdId: DEFAULT_HOUSEHOLD_ID,
    freeBalance: 150,
    paidBalance: 0,
    grantPeriod: NOW.slice(0, 7),
    freeGrant: 150,
    ...overrides,
  };
}

function renderView(
  props: { freeBalance: number; paidBalance: number; freeGrant: number },
  locale: Locale = 'en',
) {
  return render(
    <LocaleProvider locale={locale}>
      <CreditBalanceView {...props} />
    </LocaleProvider>,
  );
}

function renderBalance(locale: Locale = 'en') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider locale={locale}>
        <CreditBalance />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// CreditBalanceView — pure, so total and low-balance logic are tested directly.
// ---------------------------------------------------------------------------

describe('CreditBalanceView', () => {
  it('shows the combined free + paid balance', () => {
    renderView({ freeBalance: 120, paidBalance: 300, freeGrant: 150 });
    // 120 + 300; not either half, and not a placeholder.
    expect(screen.getByText('420')).toBeInTheDocument();
  });

  it('breaks the total down into free and purchased under their own labels', () => {
    renderView({ freeBalance: 120, paidBalance: 300, freeGrant: 150 });
    const freeBlock = screen.getByText('Free this month').closest('div') as HTMLElement;
    expect(within(freeBlock).getByText('120')).toBeInTheDocument();
    const paidBlock = screen.getByText('Purchased').closest('div') as HTMLElement;
    expect(within(paidBlock).getByText('300')).toBeInTheDocument();
  });

  it('names the monthly free grant in the reset copy', () => {
    renderView({ freeBalance: 120, paidBalance: 300, freeGrant: 150 });
    expect(screen.getByText(/150 free credits/i)).toBeInTheDocument();
  });

  it('warns when the balance cannot cover a monthly plan', () => {
    // 10 total, below the 50-credit monthly plan cost.
    renderView({ freeBalance: 10, paidBalance: 0, freeGrant: 150 });
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent(/monthly plan/i);
  });

  it('does not warn when the balance comfortably covers a monthly plan', () => {
    // 150 total, above the monthly plan cost.
    renderView({ freeBalance: 150, paidBalance: 0, freeGrant: 150 });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not warn on the exact boundary (total equals the monthly plan cost)', () => {
    // 50 total === CREDIT_COSTS['plan.monthly']; `>=` must not flag it.
    renderView({ freeBalance: 50, paidBalance: 0, freeGrant: 150 });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders the low-balance warning natively in Arabic', () => {
    renderView({ freeBalance: 10, paidBalance: 0, freeGrant: 150 }, 'ar');
    const status = screen.getByRole('status');
    // Arabic string, not the English fallback.
    expect(status).toHaveTextContent('لن يكفي');
    expect(status.textContent ?? '').not.toMatch(/monthly plan/i);
  });
});

// ---------------------------------------------------------------------------
// CreditBalance — container asks the getCredits route and maps its answer.
// ---------------------------------------------------------------------------

describe('CreditBalance', () => {
  beforeEach(() => {
    call.mockReset();
  });

  it('reads the balance from the getCredits route and maps free/paid correctly', async () => {
    call.mockResolvedValue(balance({ freeBalance: 90, paidBalance: 60 }));
    renderBalance();

    // The total proves both halves flowed through the query and were summed.
    expect(await screen.findByText('150')).toBeInTheDocument();
    const freeBlock = screen.getByText('Free this month').closest('div') as HTMLElement;
    expect(within(freeBlock).getByText('90')).toBeInTheDocument();
    const paidBlock = screen.getByText('Purchased').closest('div') as HTMLElement;
    expect(within(paidBlock).getByText('60')).toBeInTheDocument();

    // The hook must ask for exactly the getCredits route.
    expect(call).toHaveBeenCalledWith('getCredits');
  });

  it('shows a loading state until the balance resolves', () => {
    call.mockReturnValue(new Promise<CreditBalanceData>(() => {}));
    renderBalance();
    expect(screen.getByText('Loading your balance…')).toBeInTheDocument();
    // The real balance is never shown while the query is pending.
    expect(screen.queryByText('Free this month')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// MSW resolvers — exercised through the node server the whole web suite uses.
// ---------------------------------------------------------------------------

describe('credits MSW resolvers', () => {
  it('getCredits returns the seeded balance and satisfies the contract', async () => {
    const res = await fetch(`${API_URL}/credits`);
    expect(res.status).toBe(200);
    const parsed = creditBalanceSchema.parse(await res.json());
    expect(parsed.freeBalance).toBe(150);
    expect(parsed.paidBalance).toBe(0);
    expect(parsed.freeGrant).toBe(150);
    expect(parsed.householdId).toBe(DEFAULT_HOUSEHOLD_ID);
  });

  it('an intent can be created and confirmed, crediting the purchased balance', async () => {
    const pack = CREDIT_PACKS[0]!;

    const intentRes = await fetch(`${API_URL}/credits/intents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: pack.productId }),
    });
    expect(intentRes.status).toBe(200);
    const intent = purchaseIntentSchema.parse(await intentRes.json());
    expect(intent.credits).toBe(pack.credits);

    const confirmRes = await fetch(`${API_URL}/credits/purchases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        intentId: intent.intentId,
        storeTransactionId: 'txn-1',
        store: 'apple',
      }),
    });
    expect(confirmRes.status).toBe(200);
    const after = creditBalanceSchema.parse(await confirmRes.json());
    // The confirmed pack lands in the paid balance, leaving the free grant alone.
    expect(after.paidBalance).toBe(pack.credits);
    expect(after.freeBalance).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// Mock seed — the balance the web app boots with in mock mode.
// ---------------------------------------------------------------------------

describe('credits mock seed', () => {
  it('seeds a full monthly grant with nothing purchased yet', () => {
    seed();
    expect(db.credits.freeBalance).toBe(150);
    expect(db.credits.paidBalance).toBe(0);
    expect(db.credits.freeGrant).toBe(150);
    expect(db.credits.grantPeriod).toBe(new Date().toISOString().slice(0, 7));
    expect(db.credits.householdId).toBe(db.household.id);
  });
});
