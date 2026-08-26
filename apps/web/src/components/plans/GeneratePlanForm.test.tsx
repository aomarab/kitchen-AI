import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import { ApiError } from '@kitchen/api-client';
import { LocaleProvider } from '../../lib/locale';
import { GeneratePlanForm } from './GeneratePlanForm';

const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: { call } }));
vi.mock('../../mocks/provider', () => ({ useMocksReady: () => true }));

function harness() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider locale="en">
        <GeneratePlanForm onGenerated={() => {}} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

// The 402 travels client -> mutation -> ErrorState. Unit-testing ErrorState
// alone would not catch the wiring breaking at any point along that path.
describe('GeneratePlanForm — out of credits', () => {
  it('shows out-of-credits copy when generatePlan rejects with a 402 envelope', async () => {
    call.mockRejectedValue(
      new ApiError(402, {
        code: 'INSUFFICIENT_CREDITS',
        messageKey: 'errors.INSUFFICIENT_CREDITS',
      }),
    );

    harness();
    const button = screen.getByRole('button', { name: /generate/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Out of credits')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Get more credits' })).toBeInTheDocument();
  });
});
