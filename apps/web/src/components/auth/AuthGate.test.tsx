import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocaleProvider } from '../../lib/locale';
import { useSession } from '../../stores/session';
import { AuthGate } from './AuthGate';

const { replace, tokenGet, call } = vi.hoisted(() => ({
  replace: vi.fn(),
  tokenGet: vi.fn(),
  call: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));
vi.mock('../../mocks/provider', () => ({ useMocksReady: () => true }));
vi.mock('../../lib/api', () => ({
  api: { tokenStore: { get: () => tokenGet(), set: vi.fn() }, call },
}));

function renderGate() {
  return render(
    <LocaleProvider locale="en">
      <AuthGate>
        <p>protected content</p>
      </AuthGate>
    </LocaleProvider>,
  );
}

describe('AuthGate', () => {
  beforeEach(() => {
    replace.mockClear();
    tokenGet.mockReset();
    call.mockReset();
    useSession.setState({ status: 'loading', user: null, householdId: null, householdIds: [] });
  });

  it('redirects an unauthenticated visitor to sign-in and never renders protected content', async () => {
    tokenGet.mockResolvedValue(null);
    renderGate();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/sign-in'));
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });

  it('redirects an authenticated user without a household to setup', async () => {
    tokenGet.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 });
    call.mockImplementation((name: string) =>
      name === 'getMe' ? Promise.resolve({ id: 'u1' }) : Promise.resolve([]),
    );
    renderGate();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/setup'));
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });

  it('renders the shell for an authenticated user with a household', async () => {
    tokenGet.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 });
    call.mockImplementation((name: string) =>
      name === 'getMe' ? Promise.resolve({ id: 'u1' }) : Promise.resolve([{ id: 'h1' }]),
    );
    renderGate();

    await waitFor(() => expect(screen.getByText('protected content')).toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
  });
});
