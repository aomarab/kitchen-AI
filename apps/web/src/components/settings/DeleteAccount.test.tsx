import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@kitchen/api-client';
import type { Household, HouseholdMember, User } from '@kitchen/contracts';
import { LocaleProvider } from '../../lib/locale';
import { useSession } from '../../stores/session';
import { DeleteAccount, successorFor } from './DeleteAccount';

const { call, replace, clearStoredTokens } = vi.hoisted(() => ({
  call: vi.fn(),
  replace: vi.fn(),
  clearStoredTokens: vi.fn(),
}));

vi.mock('../../lib/api', () => ({ api: { call }, clearStoredTokens }));
vi.mock('../../mocks/provider', () => ({ useMocksReady: () => true }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

const USER_ID = '22222222-2222-4222-8222-222222222222';
const SARA_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date().toISOString();

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    email: 'chef@example.com',
    displayName: 'Amira',
    locale: 'en',
    hasPassword: true,
    createdAt: NOW,
    ...overrides,
  };
}

function soloHousehold(): Household {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Al-Rashid Home',
    inviteCode: 'KTCHN1',
    createdBy: USER_ID,
    createdAt: NOW,
    members: [
      { userId: USER_ID, displayName: 'Amira', email: 'chef@example.com', role: 'owner', joinedAt: NOW },
    ],
  };
}

/** Sara joined earliest, so the seniority rule makes her the successor. */
function sharedHousehold(): Household {
  return {
    ...soloHousehold(),
    members: [
      {
        userId: SARA_ID,
        displayName: 'Sara',
        email: 'sara@example.com',
        role: 'owner',
        joinedAt: new Date('2023-01-01T00:00:00.000Z').toISOString(),
      },
      {
        userId: USER_ID,
        displayName: 'Amira',
        email: 'chef@example.com',
        role: 'member',
        joinedAt: new Date('2024-06-01T00:00:00.000Z').toISOString(),
      },
    ],
  };
}

interface PrimeOptions {
  user?: User;
  households?: Household[];
  deleteError?: ApiError;
}

function primeApi({ user = makeUser(), households = [soloHousehold()], deleteError }: PrimeOptions = {}): void {
  call.mockImplementation((name: string) => {
    if (name === 'getMe') return Promise.resolve(user);
    if (name === 'listHouseholds') return Promise.resolve(households);
    if (name === 'deleteMe') return deleteError ? Promise.reject(deleteError) : Promise.resolve({ ok: true });
    return Promise.reject(new Error(`unexpected route ${name}`));
  });
}

function renderDeleteAccount(locale: 'en' | 'ar' = 'en') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider locale={locale}>
        <DeleteAccount />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe('DeleteAccount', () => {
  /**
   * Block body, not an implicit-return arrow: `mockReset()` returns the mock,
   * and a function returned from `beforeEach` is treated by Vitest as a
   * teardown callback.
   */
  beforeEach(() => {
    call.mockReset();
    replace.mockClear();
    clearStoredTokens.mockClear();
    useSession.setState({ status: 'loading', user: null, householdId: null, householdIds: [] });
  });

  it('keeps submit disabled until the confirmation word is typed', async () => {
    primeApi({ user: makeUser({ hasPassword: false }) });
    renderDeleteAccount();
    const submit = await screen.findByRole('button', { name: /delete my account/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
      target: { value: 'DELETE' },
    });
    expect(submit).toBeEnabled();
  });

  it('keeps submit disabled until a password account also enters its password', async () => {
    // The contract types password as .min(1), so submitting a blank one is
    // rejected as VALIDATION_FAILED before the server's friendly
    // auth.passwordRequired branch can run — the user would see the generic
    // "some details are not quite right" while deleting their account. Gating
    // the button keeps the irreversible action behind a complete form instead.
    primeApi();
    renderDeleteAccount();
    const submit = await screen.findByRole('button', { name: /delete my account/i });

    fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
      target: { value: 'DELETE' },
    });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/your password/i), { target: { value: 'pw' } });
    expect(submit).toBeEnabled();
  });

  it('shows the password field only for an account that has one', async () => {
    primeApi();
    renderDeleteAccount();
    expect(await screen.findByLabelText(/your password/i)).toBeInTheDocument();
  });

  it('hides the password field for an OAuth-only account', async () => {
    primeApi({ user: makeUser({ hasPassword: false }) });
    renderDeleteAccount();
    await screen.findByRole('button', { name: /delete my account/i });
    expect(screen.queryByLabelText(/your password/i)).not.toBeInTheDocument();
  });

  it('names the successor for a shared kitchen', async () => {
    primeApi({ households: [sharedHousehold()] }); // two members, the other joined earliest
    renderDeleteAccount();
    expect(await screen.findByText(/handed over to Sara/i)).toBeInTheDocument();
  });

  it('warns that a solo kitchen is destroyed', async () => {
    primeApi();
    renderDeleteAccount();
    expect(await screen.findByText(/will be deleted/i)).toBeInTheDocument();
  });

  it('renders the server error envelope', async () => {
    // A real ApiError, so `resolveErrorKey`'s `instanceof` check keeps the key
    // and the user sees translated prose, never the raw `auth.*` string.
    primeApi({
      deleteError: new ApiError(401, { code: 'UNAUTHENTICATED', messageKey: 'auth.invalidCredentials' }),
    });
    renderDeleteAccount();
    fireEvent.change(await screen.findByLabelText(/type delete to confirm/i), { target: { value: 'DELETE' } });
    fireEvent.change(screen.getByLabelText(/your password/i), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toContain('auth.');
    expect(alert.textContent).toMatch(/email or password/i);

    // A failed deletion must not wipe credentials — the account still exists, so
    // clearing its tokens would sign out a user who is still valid.
    expect(clearStoredTokens).not.toHaveBeenCalled();
  });

  it('sends the password and, on success, clears the session and redirects to sign-in', async () => {
    useSession.setState({
      status: 'authenticated',
      user: makeUser(),
      householdId: '11111111-1111-4111-8111-111111111111',
      householdIds: ['11111111-1111-4111-8111-111111111111'],
    });
    primeApi();
    renderDeleteAccount();
    fireEvent.change(await screen.findByLabelText(/type delete to confirm/i), {
      target: { value: 'DELETE' },
    });
    fireEvent.change(screen.getByLabelText(/your password/i), { target: { value: 'correct-horse' } });
    fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/sign-in');
    });

    const deleteCall = call.mock.calls.find(([name]) => name === 'deleteMe');
    expect(deleteCall?.[1]?.body).toEqual({ password: 'correct-horse' });

    // The session store carries no token property (the token lives in
    // localStorage); a cleared session is signalled by `user` returning to null.
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().status).toBe('unauthenticated');

    // The persisted token pair lives in localStorage, not the session store, so
    // deletion must wipe it explicitly or a deleted account's credentials
    // survive in the browser (App Store 5.1.1(v) / Play data-deletion policy).
    expect(clearStoredTokens).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// successorFor — pure unit tests (no render needed)
// ---------------------------------------------------------------------------

const CURRENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeMember(userId: string, role: 'owner' | 'member', joinedAt: string): HouseholdMember {
  return { userId, displayName: 'X', email: 'x@x.com', role, joinedAt };
}

describe('successorFor', () => {
  it('owner precedence: earlier member loses to later owner', () => {
    const members = [
      makeMember(CURRENT_ID, 'owner', '2023-01-01T00:00:00Z'),
      makeMember('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'member', '2023-02-01T00:00:00Z'),
      makeMember('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'owner', '2023-03-01T00:00:00Z'),
    ];
    const result = successorFor(members, CURRENT_ID);
    expect(result?.userId).toBe('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  });

  it('fallback preserved: all non-owners → earliest survivor wins', () => {
    const members = [
      makeMember(CURRENT_ID, 'owner', '2023-01-01T00:00:00Z'),
      makeMember('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'member', '2023-02-01T00:00:00Z'),
      makeMember('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'member', '2023-05-01T00:00:00Z'),
    ];
    const result = successorFor(members, CURRENT_ID);
    expect(result?.userId).toBe('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  });

  it('tie-break preserved: two owners same joinedAt → lower userId wins', () => {
    const sameDate = '2023-06-01T00:00:00Z';
    const members = [
      makeMember(CURRENT_ID, 'owner', '2023-01-01T00:00:00Z'),
      makeMember('ffffffff-ffff-4fff-8fff-ffffffffffff', 'owner', sameDate),
      makeMember('11111111-1111-4111-8111-111111111111', 'owner', sameDate),
    ];
    const result = successorFor(members, CURRENT_ID);
    expect(result?.userId).toBe('11111111-1111-4111-8111-111111111111');
  });
});
