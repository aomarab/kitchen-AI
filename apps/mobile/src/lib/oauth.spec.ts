import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { OAuthUnavailableError } from './oauth-errors';

// The real modules are native-only and cannot load under the node test
// environment; `vi.mock` is hoisted, so they are never required at all.
const signInAsync = vi.fn();
const isAvailableAsync = vi.fn();
const promptAsync = vi.fn();
const exchangeCodeAsync = vi.fn();

vi.mock('expo-apple-authentication', () => ({
  signInAsync: (...args: unknown[]) => signInAsync(...args),
  isAvailableAsync: () => isAvailableAsync(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

vi.mock('expo-auth-session', () => ({
  AuthRequest: class {
    codeVerifier = 'verifier';
    promptAsync = (...args: unknown[]) => promptAsync(...args);
  },
  exchangeCodeAsync: (...args: unknown[]) => exchangeCodeAsync(...args),
}));

vi.mock('react-native', () => ({
  Platform: { select: (options: Record<string, unknown>) => options.ios },
}));

const usingMocks = vi.hoisted(() => ({ value: false }));
vi.mock('./api', () => ({
  get usingMocks() {
    return usingMocks.value;
  },
}));

const { googleRedirectUri, isAppleCancellation, requestIdentityToken, googleClientId } =
  await import('./oauth');

const GOOGLE_ID = '1234-abc.apps.googleusercontent.com';

beforeEach(() => {
  usingMocks.value = false;
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = GOOGLE_ID;
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
});

describe('googleRedirectUri', () => {
  it('reverses the client id into the scheme Google requires', () => {
    expect(googleRedirectUri(GOOGLE_ID)).toBe(
      'com.googleusercontent.apps.1234-abc:/oauthredirect',
    );
  });

  it('refuses a client id that is not a Google one', () => {
    expect(() => googleRedirectUri('not-a-google-client')).toThrow(OAuthUnavailableError);
  });
});

describe('isAppleCancellation', () => {
  it('recognises the dismissal code Apple throws', () => {
    expect(isAppleCancellation({ code: 'ERR_REQUEST_CANCELED' })).toBe(true);
  });

  it('does not swallow other failures', () => {
    expect(isAppleCancellation({ code: 'ERR_INVALID_RESPONSE' })).toBe(false);
    expect(isAppleCancellation(new Error('boom'))).toBe(false);
    expect(isAppleCancellation(null)).toBe(false);
  });
});

describe('requestIdentityToken under mocks', () => {
  it('returns the fixture token the mock handlers expect, without touching the providers', async () => {
    usingMocks.value = true;

    await expect(requestIdentityToken('apple')).resolves.toEqual({ idToken: 'mock-apple-token' });
    await expect(requestIdentityToken('google')).resolves.toEqual({ idToken: 'mock-google-token' });
    expect(signInAsync).not.toHaveBeenCalled();
    expect(promptAsync).not.toHaveBeenCalled();
  });
});

describe('requestIdentityToken with Apple', () => {
  it('returns the identity token', async () => {
    isAvailableAsync.mockResolvedValue(true);
    signInAsync.mockResolvedValue({ identityToken: 'apple.id.token' });

    await expect(requestIdentityToken('apple')).resolves.toEqual({ idToken: 'apple.id.token' });
  });

  it('forwards the authorization code, which is what deletion later revokes', async () => {
    isAvailableAsync.mockResolvedValue(true);
    signInAsync.mockResolvedValue({
      identityToken: 'apple.id.token',
      authorizationCode: 'apple-auth-code',
    });

    await expect(requestIdentityToken('apple')).resolves.toEqual({
      idToken: 'apple.id.token',
      authorizationCode: 'apple-auth-code',
    });
  });

  it('resolves to null when the sheet is dismissed, so the UI reports nothing', async () => {
    isAvailableAsync.mockResolvedValue(true);
    signInAsync.mockRejectedValue(Object.assign(new Error('cancelled'), {
      code: 'ERR_REQUEST_CANCELED',
    }));

    await expect(requestIdentityToken('apple')).resolves.toBeNull();
  });

  it('rethrows a genuine failure rather than reporting a cancellation', async () => {
    isAvailableAsync.mockResolvedValue(true);
    signInAsync.mockRejectedValue(new Error('boom'));

    await expect(requestIdentityToken('apple')).rejects.toThrow('boom');
  });

  it('reports unavailability on a device without Sign in with Apple', async () => {
    isAvailableAsync.mockResolvedValue(false);

    await expect(requestIdentityToken('apple')).rejects.toBeInstanceOf(OAuthUnavailableError);
  });

  it('reports unavailability when Apple returns no token', async () => {
    isAvailableAsync.mockResolvedValue(true);
    signInAsync.mockResolvedValue({ identityToken: null });

    await expect(requestIdentityToken('apple')).rejects.toBeInstanceOf(OAuthUnavailableError);
  });
});

describe('requestIdentityToken with Google', () => {
  it('exchanges the authorization code for an id token', async () => {
    promptAsync.mockResolvedValue({ type: 'success', params: { code: 'auth-code' } });
    exchangeCodeAsync.mockResolvedValue({ idToken: 'google.id.token' });

    await expect(requestIdentityToken('google')).resolves.toEqual({ idToken: 'google.id.token' });
    expect(exchangeCodeAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'auth-code',
        // PKCE: without the verifier Google rejects the exchange.
        extraParams: { code_verifier: 'verifier' },
      }),
      expect.anything(),
    );
  });

  it('resolves to null when the browser is dismissed', async () => {
    promptAsync.mockResolvedValue({ type: 'dismiss' });

    await expect(requestIdentityToken('google')).resolves.toBeNull();
    expect(exchangeCodeAsync).not.toHaveBeenCalled();
  });

  it('reports an authorization error', async () => {
    promptAsync.mockResolvedValue({ type: 'error', error: { message: 'access_denied' } });

    await expect(requestIdentityToken('google')).rejects.toBeInstanceOf(OAuthUnavailableError);
  });

  it('reports unavailability when no client id is configured', async () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

    await expect(requestIdentityToken('google')).rejects.toBeInstanceOf(OAuthUnavailableError);
    expect(promptAsync).not.toHaveBeenCalled();
  });

  it('reads the client id for the running platform', () => {
    expect(googleClientId()).toBe(GOOGLE_ID);
  });
});
