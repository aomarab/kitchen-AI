import { describe, expect, it } from 'vitest';
import { CREDIT_COSTS, CREDIT_PACKS } from '@kitchen/contracts';
import {
  ASSISTANT_SESSION_SHAPE,
  CREDIT_COST_BASIS_USD,
  REALTIME_AUDIO_TOKENS_PER_MIN,
  REALTIME_AUDIO_USD_PER_MTOK,
  assistantBreakEvenMinutes,
  creditRevenueUsd,
  estimateAssistantSessionUsd,
} from './realtime-cost.js';

/**
 * `assistant.session` is priced from an estimate, because realtime audio is
 * billed over a connection the server never sees. These tests are what turn
 * that estimate into a claim that can be wrong: they assert the *conclusions*
 * drawn from the rates, so that a rate change fails the conclusion it breaks
 * rather than silently shifting the margin.
 */
describe('live assistant session cost', () => {
  it('charges four times as much for the assistant talking as for the user', () => {
    const assistantMinute =
      REALTIME_AUDIO_TOKENS_PER_MIN.output * REALTIME_AUDIO_USD_PER_MTOK.output;
    const userMinute = REALTIME_AUDIO_TOKENS_PER_MIN.input * REALTIME_AUDIO_USD_PER_MTOK.input;

    // Twice the tokens at twice the price. This is why the session shape is
    // written in terms of who is speaking rather than just a duration: an
    // estimate that ignored the split would be wrong by up to 2x either way.
    expect(assistantMinute / userMinute).toBeCloseTo(4, 6);
  });

  it('scales linearly, so a session has a well-defined per-minute cost', () => {
    // The break-even maths reads the slope from a single evaluation. If the
    // estimate ever gains a non-linear term (a fixed connection fee, a cache
    // that stops being replayed) that shortcut silently becomes wrong.
    const one = estimateAssistantSessionUsd(1);
    expect(estimateAssistantSessionUsd(4)).toBeCloseTo(one * 4, 10);
    expect(estimateAssistantSessionUsd(0)).toBe(0);
  });

  it('costs about ten cents for the two-minute session it is priced for', () => {
    const usd = estimateAssistantSessionUsd(ASSISTANT_SESSION_SHAPE.minutes);
    expect(usd).toBeGreaterThan(0.09);
    expect(usd).toBeLessThan(0.11);
  });

  it('replayed context is a rounding error next to the audio', () => {
    // Stated so it stays true. If the cached rate ever rose to where context
    // mattered, the shape would need turn-level modelling rather than a flat
    // per-minute term, and this is the test that would say so.
    const withContext = estimateAssistantSessionUsd(2);
    const audioOnly =
      (1 * REALTIME_AUDIO_TOKENS_PER_MIN.output * REALTIME_AUDIO_USD_PER_MTOK.output +
        1 * REALTIME_AUDIO_TOKENS_PER_MIN.input * REALTIME_AUDIO_USD_PER_MTOK.input) /
      1_000_000;

    expect((withContext - audioOnly) / withContext).toBeLessThan(0.05);
  });

  it('the 25-credit price buys the ~2 minutes its comment claims', () => {
    // The comment in credits.ts says "~2 minutes of speech-to-speech". This is
    // the check that makes that sentence falsifiable: at the cost basis the
    // rest of the credit table was built on, 25 credits funds this long.
    const minutes = assistantBreakEvenMinutes('cost');
    expect(minutes).toBeGreaterThan(1.75);
    expect(minutes).toBeLessThan(2.75);
  });

  it('a session only loses money outright past roughly eight minutes', () => {
    // Session *duration* is unbounded by design — the client secret's TTL
    // bounds mints, not how long a connection lives (see assistant.ts). So the
    // real exposure is not "is 25 correct" but "how long before it is not",
    // and that number should not quietly shrink.
    const minutes = assistantBreakEvenMinutes('revenue');
    expect(minutes).toBeGreaterThan(6);
    expect(minutes).toBeLessThan(11);

    // The loss threshold must sit well beyond the priced-for session, or the
    // ordinary case would already be marginal.
    expect(minutes).toBeGreaterThan(assistantBreakEvenMinutes('cost') * 3);
  });

  it('sells credits for more than they cost', () => {
    // The entire table is denominated in CREDIT_COST_BASIS_USD; if a credit
    // ever sold below its own cost basis, every price in it would be a loss.
    expect(creditRevenueUsd()).toBeGreaterThan(CREDIT_COST_BASIS_USD);
    expect(creditRevenueUsd()).toBeCloseTo(
      CREDIT_PACKS[0]!.priceUsd / CREDIT_PACKS[0]!.credits,
      10,
    );
  });

  it('the price follows the cost model, with a stated margin rather than an arbitrary one', () => {
    // The link the whole file exists to create: 25 is not a number someone
    // liked, it is the modelled session cost converted at the table's own cost
    // basis and then rounded up. Both bounds matter — the lower one catches a
    // price that no longer covers the session, the upper one catches a price
    // padded far past what the model justifies.
    //
    // (An earlier version of this test claimed `assistant.session` was the
    // most expensive action in the table. It is not: `plan.monthly` is 50,
    // because a month of planning is thirty generations against one
    // conversation. The claim was deleted rather than loosened.)
    const derived =
      estimateAssistantSessionUsd(ASSISTANT_SESSION_SHAPE.minutes) / CREDIT_COST_BASIS_USD;

    expect(derived).toBeGreaterThan(20);
    expect(CREDIT_COSTS['assistant.session']).toBeGreaterThanOrEqual(derived);
    expect(CREDIT_COSTS['assistant.session']).toBeLessThanOrEqual(derived * 1.5);
  });
});
