import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import type { OAuthProvider } from '@kitchen/contracts';
import { usingMocks } from './api';
import { OAuthUnavailableError } from './oauth-errors';

/**
 * Obtains a provider identity token natively, which is the only half of OAuth
 * the client is trusted with: the API re-verifies every token against Apple's
 * JWKS or Google's tokeninfo endpoint and pins the `aud` claim, so a token
 * forged here buys nothing.
 *
 * Google's endpoints are inlined rather than discovered at runtime so the first
 * tap does not pay for a discovery round trip. They are stable and versioned.
 */
const GOOGLE_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

const GOOGLE_SCOPES = ['openid', 'profile', 'email'];

/**
 * Google issues a separate client id per platform and rejects a token request
 * that does not come from the matching one.
 */
export function googleClientId(): string {
  const platformClientId = Platform.select({
    ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    default: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
  return platformClientId ?? '';
}

/**
 * Google only accepts a custom-scheme redirect that is the client id with its
 * dot-separated parts reversed, so it is derived rather than configured — a
 * hand-written second copy would silently break the flow whenever the client id
 * changed. `app.config.js` registers this same scheme in the Info.plist.
 */
export function googleRedirectUri(clientId: string): string {
  const suffix = '.apps.googleusercontent.com';
  if (!clientId.endsWith(suffix)) {
    throw new OAuthUnavailableError('google', `client id must end in "${suffix}"`);
  }
  return `com.googleusercontent.apps.${clientId.slice(0, -suffix.length)}:/oauthredirect`;
}

/** Apple reports a dismissed sheet as a thrown error rather than a result. */
export function isAppleCancellation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'ERR_REQUEST_CANCELED'
  );
}

async function requestAppleToken(): Promise<string | null> {
  if (!(await AppleAuthentication.isAvailableAsync())) {
    throw new OAuthUnavailableError('apple', 'not supported on this device');
  }

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (error) {
    if (isAppleCancellation(error)) return null;
    throw error;
  }

  if (!credential.identityToken) {
    throw new OAuthUnavailableError('apple', 'no identity token returned');
  }
  return credential.identityToken;
}

async function requestGoogleToken(): Promise<string | null> {
  const clientId = googleClientId();
  if (!clientId) {
    throw new OAuthUnavailableError('google', 'no client id configured for this platform');
  }

  const redirectUri = googleRedirectUri(clientId);
  // PKCE, not the implicit id_token flow: Google no longer issues id tokens
  // straight from the authorization endpoint to native clients.
  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    scopes: GOOGLE_SCOPES,
    usePKCE: true,
  });

  const result = await request.promptAsync(GOOGLE_DISCOVERY);
  if (result.type === 'error') {
    throw new OAuthUnavailableError('google', result.error?.message ?? 'authorization failed');
  }
  if (result.type !== 'success') return null;

  const tokens = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      redirectUri,
      code: result.params.code as string,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    GOOGLE_DISCOVERY,
  );

  if (!tokens.idToken) {
    throw new OAuthUnavailableError('google', 'no id token returned');
  }
  return tokens.idToken;
}

/**
 * Resolves to the provider's identity token, or to `null` when the person
 * backed out — a dismissed sheet is a normal outcome, not an error, so the UI
 * has nothing to report.
 *
 * Under mocks there is no real API to verify a token, and neither provider will
 * mint one for a simulator build with no signing team or OAuth client, so the
 * same fixture token the mock handlers expect is returned instead. This is the
 * `EXPO_PUBLIC_USE_MOCKS` switch every other network path already follows.
 */
export async function requestIdentityToken(provider: OAuthProvider): Promise<string | null> {
  if (usingMocks) return `mock-${provider}-token`;
  return provider === 'apple' ? requestAppleToken() : requestGoogleToken();
}
