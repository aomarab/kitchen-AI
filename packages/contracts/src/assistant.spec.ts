import { describe, expect, it } from 'vitest';
import {
  CREDIT_COSTS,
  REALTIME_SECRET_TTL_MAX_SEC,
  REALTIME_SECRET_TTL_MIN_SEC,
  REALTIME_SECRET_TTL_SEC,
  realtimeSessionSchema,
  createRealtimeSessionRequestSchema,
  routes,
} from './index.js';

/**
 * The live assistant's contract (kitchen companion spec — Feature 5, Phase B).
 *
 * These assert the two properties the design actually rests on: that the
 * secret's TTL is a real cost bound the provider will accept, and that a
 * session cannot describe itself without saying whether it is scripted.
 */
describe('realtime session contract', () => {
  it('pins the secret TTL to the provider floor, which is what bounds a mint', () => {
    // Not merely "within range": at the floor, on purpose. One secret can start
    // unlimited sessions until it expires, so a longer TTL sells more than the
    // single connection the user asked for. Raising this is a pricing decision.
    expect(REALTIME_SECRET_TTL_SEC).toBe(REALTIME_SECRET_TTL_MIN_SEC);
    expect(REALTIME_SECRET_TTL_SEC).toBeGreaterThanOrEqual(REALTIME_SECRET_TTL_MIN_SEC);
    expect(REALTIME_SECRET_TTL_SEC).toBeLessThanOrEqual(REALTIME_SECRET_TTL_MAX_SEC);
  });

  it('states the provider range the API reference documents', () => {
    expect([REALTIME_SECRET_TTL_MIN_SEC, REALTIME_SECRET_TTL_MAX_SEC]).toEqual([10, 7200]);
  });

  it('requires isMock — a session cannot omit whether it is scripted', () => {
    const real = {
      clientSecret: 'ek_test',
      expiresAt: new Date().toISOString(),
      model: 'gpt-realtime',
      callsUrl: 'https://api.openai.com/v1/realtime/calls',
    };
    expect(realtimeSessionSchema.safeParse(real).success).toBe(false);
    expect(realtimeSessionSchema.safeParse({ ...real, isMock: false }).success).toBe(true);
  });

  it('rejects a callsUrl that is not a URL, since the client POSTs to it', () => {
    const session = {
      clientSecret: 'ek_test',
      expiresAt: new Date().toISOString(),
      model: 'gpt-realtime',
      callsUrl: 'not-a-url',
      isMock: false,
    };
    expect(realtimeSessionSchema.safeParse(session).success).toBe(false);
  });

  it('requires a locale so the assistant speaks natively rather than translating', () => {
    expect(createRealtimeSessionRequestSchema.safeParse({}).success).toBe(false);
    expect(createRealtimeSessionRequestSchema.safeParse({ locale: 'ar' }).success).toBe(true);
    expect(createRealtimeSessionRequestSchema.safeParse({ locale: 'fr' }).success).toBe(false);
  });

  it('registers the mint as an authenticated household route', () => {
    const route = routes.createRealtimeSession;
    // Household, not just auth: the spend comes out of a household's balance.
    expect(route.method).toBe('POST');
    expect(route.auth).toBe(true);
    expect(route.household).toBe(true);
  });

  it('prices an assistant session, since the mint spends credits', () => {
    expect(CREDIT_COSTS['assistant.session']).toBeGreaterThan(0);
  });
});
