import { describe, expect, it, vi } from 'vitest';
import { REALTIME_SECRET_TTL_SEC } from '@kitchen/contracts';
import type { Locale, RealtimeSession } from '@kitchen/contracts';
import { AssistantService } from './assistant.service.js';
import { MockRealtimeSessionProvider } from './mock-realtime.provider.js';
import { OpenAiRealtimeSessionProvider } from './openai-realtime.provider.js';
import type { CreditsService } from '../../credits/credits.service.js';
import type { PantryPort } from '../planner/pantry-snapshot.js';
import { buildSnapshot } from '../planner/pantry-snapshot.js';
import type { RealtimeSessionProvider } from './realtime-provider.interface.js';

/**
 * The live assistant's server half (kitchen companion spec — Feature 5, Phase B).
 *
 * Pure unit tests: no database, because the behaviours worth pinning here are
 * ordering and failure handling, not persistence. `CreditsService` is a stub
 * that records the order it was called in.
 */

function creditsStub() {
  const calls: string[] = [];
  const stub = {
    spend: vi.fn(async () => {
      calls.push('spend');
      return 'group-1';
    }),
    refundSpendGroup: vi.fn(async () => {
      calls.push('refund');
    }),
  };
  return { calls, credits: stub as unknown as CreditsService, spy: stub };
}

function providerStub(
  mint: (locale: Locale, brief: string) => Promise<RealtimeSession>,
  calls: string[],
): RealtimeSessionProvider {
  return {
    isMock: false,
    mint: async (locale, brief) => {
      calls.push('mint');
      return mint(locale, brief);
    },
  };
}

function pantryStub(calls: string[], rows: Parameters<typeof buildSnapshot>[0] = []): PantryPort {
  return {
    snapshot: async () => {
      calls.push('pantry');
      return buildSnapshot(rows);
    },
  };
}

const SESSION: RealtimeSession = {
  clientSecret: 'ek_test',
  expiresAt: new Date().toISOString(),
  model: 'gpt-realtime',
  callsUrl: 'https://api.openai.com/v1/realtime/calls',
  isMock: false,
};

describe('AssistantService', () => {
  it('charges before minting, so an unaffordable session never reaches the provider', async () => {
    const { calls, credits } = creditsStub();
    const service = new AssistantService(
      credits,
      providerStub(async () => SESSION, calls),
      pantryStub(calls),
    );

    await service.createSession('household-1', 'en');

    // Minting first would make the credit check advisory: we would already have
    // been billed by the provider by the time we discovered we must refuse.
    expect(calls).toEqual(['pantry', 'spend', 'mint']);
  });

  it('refunds the spend group when the mint throws', async () => {
    const { calls, credits, spy } = creditsStub();
    const service = new AssistantService(
      credits,
      providerStub(async () => {
        throw new Error('provider down');
      }, calls),
      pantryStub(calls),
    );

    await expect(service.createSession('household-1', 'en')).rejects.toThrow('provider down');

    expect(calls).toEqual(['pantry', 'spend', 'mint', 'refund']);
    // The group id from the debit — refunding anything else would leave the
    // real debit standing and reverse someone's unrelated spend.
    expect(spy.refundSpendGroup).toHaveBeenCalledWith('household-1', 'group-1');
  });

  it('does not refund a session that was minted successfully', async () => {
    const { calls, credits } = creditsStub();
    const service = new AssistantService(
      credits,
      providerStub(async () => SESSION, calls),
      pantryStub(calls),
    );

    await service.createSession('household-1', 'en');

    expect(calls).not.toContain('refund');
  });

  it('rethrows so the client sees a failure rather than an unusable session', async () => {
    const { credits, calls } = creditsStub();
    const service = new AssistantService(
      credits,
      providerStub(async () => {
        throw new Error('provider down');
      }, calls),
      pantryStub(calls),
    );
    await expect(service.createSession('household-1', 'en')).rejects.toThrow();
  });

  it('grounds the session in the household pantry', async () => {
    const { calls, credits } = creditsStub();
    let received = '';
    const service = new AssistantService(
      credits,
      providerStub(async (_locale, brief) => {
        received = brief;
        return SESSION;
      }, calls),
      pantryStub(calls, [
        {
          ingredientId: 'a',
          nameEn: 'Rice',
          nameAr: 'أرز',
          defaultUnit: 'kg',
          isStaple: true,
          quantity: 2,
          unit: 'kg',
          expiresOn: null,
        },
      ]),
    );

    await service.createSession('household-1', 'en');
    // Without this the assistant can describe what it sees but not what the
    // user owns, which is the whole point of grounding it.
    expect(received).toContain('Rice: 2 kg');
  });

  it('does not charge when the pantry read fails', async () => {
    const { credits, spy } = creditsStub();
    const service = new AssistantService(
      credits,
      providerStub(async () => SESSION, []),
      {
        snapshot: async () => {
          throw new Error('db down');
        },
      },
    );

    await expect(service.createSession('household-1', 'en')).rejects.toThrow('db down');
    // Reading before charging is what makes this possible: there is no debit to
    // refund, so there is no refund path to get wrong.
    expect(spy.spend).not.toHaveBeenCalled();
    expect(spy.refundSpendGroup).not.toHaveBeenCalled();
  });

  it('does not charge when the household cannot afford the session', async () => {
    const calls: string[] = [];
    const credits = {
      spend: vi.fn(async () => {
        throw new Error('INSUFFICIENT_CREDITS');
      }),
      refundSpendGroup: vi.fn(),
    } as unknown as CreditsService;
    const service = new AssistantService(
      credits,
      providerStub(async () => SESSION, calls),
      pantryStub(calls),
    );

    await expect(service.createSession('household-1', 'en')).rejects.toThrow();
    // Nothing to refund, and crucially no mint: we were never billed.
    expect(calls).toEqual(['pantry']);
  });
});

describe('MockRealtimeSessionProvider', () => {
  it('declares itself mock — this flag is what lights the demo badge', async () => {
    const provider = new MockRealtimeSessionProvider();
    expect(provider.isMock).toBe(true);
    expect((await provider.mint('en', 'PANTRY')).isMock).toBe(true);
  });

  it('mints a secret no one could mistake for a real credential', async () => {
    const session = await new MockRealtimeSessionProvider().mint('en', 'PANTRY');
    // Real provider secrets start `ek_`. A mock one that looked plausible could
    // be pasted into a real request and fail somewhere far from here.
    expect(session.clientSecret).not.toMatch(/^ek_/);
    expect(session.clientSecret).toContain('mock');
  });
});

describe('OpenAiRealtimeSessionProvider', () => {
  const originalFetch = globalThis.fetch;

  function withFetch(impl: typeof globalThis.fetch) {
    globalThis.fetch = impl;
    return () => {
      globalThis.fetch = originalFetch;
    };
  }

  it('declares itself real, so the demo badge comes off only for a real vendor', () => {
    expect(new OpenAiRealtimeSessionProvider('sk-test', 'gpt-realtime').isMock).toBe(false);
  });

  it('throws rather than returning a session when the response carries no secret', async () => {
    const restore = withFetch(
      (async () =>
        new Response(JSON.stringify({ expires_at: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })) as typeof globalThis.fetch,
    );
    try {
      // The household has already been charged by this point. Returning an
      // empty clientSecret would hand the client a session it cannot connect
      // with and no error to explain why.
      await expect(
        new OpenAiRealtimeSessionProvider('sk-test', 'gpt-realtime').mint('en', 'PANTRY'),
      ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    } finally {
      restore();
    }
  });

  it('throws when the provider rejects the mint', async () => {
    const restore = withFetch(
      (async () => new Response('nope', { status: 401 })) as typeof globalThis.fetch,
    );
    try {
      await expect(
        new OpenAiRealtimeSessionProvider('sk-test', 'gpt-realtime').mint('en', 'PANTRY'),
      ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    } finally {
      restore();
    }
  });

  it('throws when the request itself fails, instead of surfacing a network error', async () => {
    const restore = withFetch((async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof globalThis.fetch);
    try {
      await expect(
        new OpenAiRealtimeSessionProvider('sk-test', 'gpt-realtime').mint('en', 'PANTRY'),
      ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    } finally {
      restore();
    }
  });

  it('never sends the provider key to the client, and asks for the pinned TTL', async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    const restore = withFetch((async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(
        JSON.stringify({ value: 'ek_live', expires_at: 1_700_000_010, session: { model: 'm' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof globalThis.fetch);

    try {
      const session = await new OpenAiRealtimeSessionProvider('sk-secret', 'gpt-realtime').mint(
        'ar',
        'PANTRY BRIEF',
      );
      const body = JSON.parse(String(sent!.init.body)) as {
        expires_after: { seconds: number };
        session: { instructions: string; tools: { name: string }[] };
      };

      expect(body.expires_after.seconds).toBe(REALTIME_SECRET_TTL_SEC);
      // The whole point of the route: our key stays here.
      expect(JSON.stringify(session)).not.toContain('sk-secret');
      expect(session.clientSecret).toBe('ek_live');
      expect(session.isMock).toBe(false);
      // Arabic session config must be written in Arabic, not translated later.
      expect(body.session.instructions).toMatch(/[\u0600-\u06FF]/);
      // Without the tool the model can only talk; detections would have to be
      // scraped out of a transcript.
      expect(body.session.tools.map((tool) => tool.name)).toContain('report_items');
      // The pantry is session context, so it has to survive into instructions —
      // a brief built and then dropped grounds nothing.
      expect(body.session.instructions).toContain('PANTRY BRIEF');
    } finally {
      restore();
    }
  });

  it('reports the model the provider bound, not the one we asked for', async () => {
    const restore = withFetch(
      (async () =>
        new Response(
          JSON.stringify({ value: 'ek_live', session: { model: 'gpt-realtime-2025-08-28' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )) as typeof globalThis.fetch,
    );
    try {
      const session = await new OpenAiRealtimeSessionProvider('sk-test', 'gpt-realtime').mint(
        'en',
        'PANTRY',
      );
      expect(session.model).toBe('gpt-realtime-2025-08-28');
    } finally {
      restore();
    }
  });
});
