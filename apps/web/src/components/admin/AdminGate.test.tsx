import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@kitchen/api-client';
import { LocaleProvider } from '../../lib/locale';
import { AdminGate } from './AdminGate';

const { replace, call } = vi.hoisted(() => ({ replace: vi.fn(), call: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock('../../mocks/provider', () => ({ useMocksReady: () => true }));
vi.mock('../../lib/api', () => ({ api: { call } }));

function renderGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider locale="en">
        <AdminGate>
          <p>console</p>
        </AdminGate>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe('AdminGate', () => {
  beforeEach(() => {
    replace.mockClear();
    call.mockReset();
  });

  it('renders the console for a staff account', async () => {
    call.mockResolvedValue({ total: 0, averageRating: null, byStatus: {}, byRating: {} });
    renderGate();

    await waitFor(() => expect(screen.getByText('console')).toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
  });

  it('redirects a non-staff account away and never renders the console', async () => {
    call.mockRejectedValue(new ApiError(403, { code: 'FORBIDDEN', messageKey: 'errors.FORBIDDEN' }));
    renderGate();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(screen.queryByText('console')).not.toBeInTheDocument();
  });

  it('sends an unauthenticated visitor to sign-in', async () => {
    call.mockRejectedValue(
      new ApiError(401, { code: 'UNAUTHENTICATED', messageKey: 'errors.UNAUTHENTICATED' }),
    );
    renderGate();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/sign-in'));
  });

  it('withholds the console while the check is still in flight', () => {
    call.mockReturnValue(new Promise(() => {}));
    renderGate();

    expect(screen.queryByText('console')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
