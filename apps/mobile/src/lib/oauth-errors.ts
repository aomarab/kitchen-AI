import type { OAuthProvider } from '@kitchen/contracts';
import type { MessageKey } from '@kitchen/i18n';

/**
 * Deliberately separate from `oauth.ts`: that module pulls in
 * `expo-apple-authentication` and `expo-auth-session`, which cannot load under
 * the node-only vitest environment. `errors.ts` maps this error to a message
 * key, so it has to be importable without dragging the native modules along.
 */
export class OAuthUnavailableError extends Error {
  readonly messageKey: MessageKey = 'mobile.auth.oauthUnavailable';

  constructor(readonly provider: OAuthProvider, reason: string) {
    super(`${provider} sign-in is unavailable: ${reason}`);
    this.name = 'OAuthUnavailableError';
  }
}
