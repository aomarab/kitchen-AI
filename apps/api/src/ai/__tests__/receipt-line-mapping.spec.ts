import { describe, expect, it } from 'vitest';
import { ReceiptService } from '../receipt/receipt.service.js';
import type { ReceiptMapping } from '../receipt/receipt.schemas.js';

/**
 * The mapping pass returns one entry per *food* line, but the extraction pass
 * emits every line it can read. The two lists are therefore not parallel, and
 * the model is under no obligation to preserve order. Pairing them by array
 * index puts the wrong ingredient on the wrong line — silently, and only in
 * production, because the mock provider returns a perfectly aligned fixture.
 */

const CATALOG: Record<string, { id: string; nameEn: string; category: string }> = {
  milk: { id: 'ing-milk', nameEn: 'Milk', category: 'dairy' },
  rice: { id: 'ing-rice', nameEn: 'Rice', category: 'grain' },
  chicken: { id: 'ing-chicken', nameEn: 'Chicken', category: 'meat' },
};

function build(extractionLines: string[], mapping: ReceiptMapping) {
  const gateway = {
    execute: async ({ operation }: { operation: string }) => {
      if (operation === 'receipt.extract') {
        return {
          merchant: null,
          purchasedOn: null,
          currency: null,
          lines: extractionLines.map((nameGuess) => ({
            rawText: nameGuess,
            nameGuess,
            quantity: 1,
            unit: null,
            priceMinor: null,
          })),
        };
      }
      return mapping;
    },
  };

  const catalog = {
    candidateNames: async () => ['Milk', 'Rice', 'Chicken'],
    candidateNamesFor: async () => ['Milk', 'Rice', 'Chicken'],
    resolve: async (inputs: { name: string }[]) =>
      inputs.map((input) => {
        const hit = CATALOG[input.name.toLowerCase()];
        return hit
          ? {
              rawName: input.name,
              ingredient: {
                id: hit.id,
                canonicalNameEn: hit.nameEn,
                canonicalNameAr: hit.nameEn,
                aliases: [],
                category: hit.category,
                defaultUnit: 'g',
                isStaple: false,
              },
              strategy: 'exact',
              confidence: 1,
            }
          : { rawName: input.name, ingredient: null, strategy: 'unresolved', confidence: 0 };
      }),
  };

  let stored: { items: { nameEn: string; match: { rawName: string } }[] } | null = null;
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ locale: 'en' }] }) }) }),
    insert: () => ({
      values: (v: typeof stored) => {
        stored = v;
        return { returning: async () => [{ id: 'sess-1' }] };
      },
    }),
  };

  const storage = { presignCaptureDownload: async () => 'https://example/photo.jpg' };

  const service = new ReceiptService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    catalog as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gateway as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    storage as any,
  );
  return { service, read: () => stored };
}

describe('receipt lines are paired with their mapping by name, not by position', () => {
  it('does not shift ingredients when the model drops a line it could not map', async () => {
    // Three food lines in, two mappings back — the model silently declined the
    // middle one. Positional pairing would label "RICE 5KG" as chicken.
    const { service, read } = build(
      ['MILK 2L', 'RICE 5KG', 'CHICKEN 1KG'],
      {
        items: [
          { rawName: 'MILK 2L', canonicalName: 'milk', confidence: 0.9 },
          { rawName: 'CHICKEN 1KG', canonicalName: 'chicken', confidence: 0.8 },
        ],
      },
    );

    await service.process({
      householdId: 'hh',
      userId: 'u',
      request: { photoKeys: ['hh/p1.jpg'] },
    });

    const items = read()!.items;
    const byLine = Object.fromEntries(items.map((i) => [i.match.rawName, i.nameEn]));
    expect(byLine['MILK 2L']).toBe('Milk');
    expect(byLine['CHICKEN 1KG']).toBe('Chicken');
    // Unmapped, so it keeps its raw text rather than borrowing a neighbour's.
    expect(byLine['RICE 5KG']).toBe('RICE 5KG');
  });

  it('does not swap ingredients when the model reorders its response', async () => {
    const { service, read } = build(
      ['MILK 2L', 'CHICKEN 1KG'],
      {
        items: [
          { rawName: 'CHICKEN 1KG', canonicalName: 'chicken', confidence: 0.8 },
          { rawName: 'MILK 2L', canonicalName: 'milk', confidence: 0.9 },
        ],
      },
    );

    await service.process({
      householdId: 'hh',
      userId: 'u',
      request: { photoKeys: ['hh/p1.jpg'] },
    });

    const byLine = Object.fromEntries(read()!.items.map((i) => [i.match.rawName, i.nameEn]));
    expect(byLine['MILK 2L']).toBe('Milk');
    expect(byLine['CHICKEN 1KG']).toBe('Chicken');
  });

  it('matches despite casing and whitespace differences in the echoed name', async () => {
    const { service, read } = build(
      ['MILK 2L'],
      { items: [{ rawName: '  milk  2l ', canonicalName: 'milk', confidence: 0.9 }] },
    );

    await service.process({
      householdId: 'hh',
      userId: 'u',
      request: { photoKeys: ['hh/p1.jpg'] },
    });

    expect(read()!.items[0]!.nameEn).toBe('Milk');
  });
});
