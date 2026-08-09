import type { ReceiptMapContext } from '../prompts/prompt.types.js';

/**
 * Recorded receipt output for the two-pass parse (spec §5.3). The extraction
 * pass returns raw line items; the mapping pass resolves each raw line to a
 * catalog name, constrained by the candidates supplied in-prompt.
 */

export const RECEIPT_EXTRACTION_RAW: unknown = {
  merchant: 'Carrefour',
  purchasedOn: '2026-07-25',
  currency: 'AED',
  lines: [
    { rawText: 'TOMATO ROMA 1KG', nameGuess: 'Roma tomato', quantity: 1000, unit: 'g', priceMinor: 650 },
    { rawText: 'CHKN BREAST 500G', nameGuess: 'chicken breast', quantity: 500, unit: 'g', priceMinor: 1450 },
    { rawText: 'BASMATI RICE 2KG', nameGuess: 'basmati rice', quantity: 2000, unit: 'g', priceMinor: 2200 },
    { rawText: 'OLIVE OIL 750ML', nameGuess: 'olive oil', quantity: 750, unit: 'ml', priceMinor: 3900 },
    { rawText: 'ONIONS 1KG', nameGuess: 'onion', quantity: 1000, unit: 'g', priceMinor: 500 },
    { rawText: 'VISA DEBIT ****1234', nameGuess: '', quantity: null, unit: null, priceMinor: null },
  ],
};

export const INVALID_RECEIPT_RAW: unknown = { lines: 'not-an-array' };

/** Maps each raw line to a catalog candidate when one is offered. */
export function buildMockReceiptMapping(ctx: ReceiptMapContext): unknown {
  const candidates = ctx.candidateNames;
  const matches = ctx.rawLines.map((raw) => {
    const low = raw.toLowerCase();
    const hit = candidates.find(
      (c) => low.includes(c.toLowerCase()) || c.toLowerCase().includes(low),
    );
    return {
      rawName: raw,
      canonicalName: hit ?? raw,
      confidence: hit ? 0.86 : 0.3,
    };
  });
  return { items: matches };
}
