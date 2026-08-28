import type { AssistantPersona, Locale, RealtimeSession } from '@kitchen/contracts';
import { REALTIME_SECRET_TTL_SEC } from '@kitchen/contracts';
import type { RealtimeSessionProvider } from './realtime-provider.interface.js';

/**
 * Offline realtime provider, selected under `AI_MOCK`.
 *
 * It mints a syntactically valid but non-functional secret so the whole
 * assistant surface — permission prompts, camera preview, connect/disconnect,
 * the credit spend — runs with no key and no network, exactly as the rest of
 * the app does on mocks.
 *
 * `isMock` is `true`, which the contract carries to the client and the client
 * turns into a permanent demo badge. That flag is the honesty mechanism for
 * this feature: a real camera feed next to a scripted assistant must never be
 * able to read as real vision.
 */
export class MockRealtimeSessionProvider implements RealtimeSessionProvider {
  readonly isMock = true;

  async mint(
    _locale: Locale,
    _pantryBrief: string,
    _persona: AssistantPersona,
  ): Promise<RealtimeSession> {
    return {
      // Deliberately not a plausible `ek_…` token. If this ever reaches a real
      // provider the request should fail loudly rather than half-work.
      clientSecret: 'mock-realtime-secret',
      expiresAt: new Date(Date.now() + REALTIME_SECRET_TTL_SEC * 1000).toISOString(),
      model: 'mock-realtime',
      callsUrl: 'https://mock.invalid/realtime/calls',
      isMock: true,
    };
  }
}
