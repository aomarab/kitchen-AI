import { describe, expect, it } from 'vitest';
import { MAX_PANTRY_LINES, pantryBrief } from './pantry-brief.js';
import { buildSnapshot, type InventoryRow } from '../planner/pantry-snapshot.js';

/**
 * The pantry context the live assistant is grounded in (kitchen companion spec
 * — Feature 5). Built from the planner's Stage-A snapshot, so these tests go
 * through `buildSnapshot` rather than hand-building the map.
 */

function row(over: Partial<InventoryRow> = {}): InventoryRow {
  return {
    ingredientId: 'i1',
    nameEn: 'Tomato',
    nameAr: 'طماطم',
    defaultUnit: 'piece',
    isStaple: false,
    quantity: 3,
    unit: 'piece',
    expiresOn: null,
    ...over,
  };
}

describe('pantryBrief', () => {
  it('lists items soonest-to-expire first', () => {
    const brief = pantryBrief(
      buildSnapshot([
        row({ ingredientId: 'a', nameEn: 'Rice', expiresOn: '2026-12-01' }),
        row({ ingredientId: 'b', nameEn: 'Milk', expiresOn: '2026-08-30' }),
        row({ ingredientId: 'c', nameEn: 'Eggs', expiresOn: '2026-09-15' }),
      ]),
      'en',
    );
    // What is about to spoil is what a cooking assistant should reach for, and
    // it is also what survives the cap below.
    expect(brief.indexOf('Milk')).toBeLessThan(brief.indexOf('Eggs'));
    expect(brief.indexOf('Eggs')).toBeLessThan(brief.indexOf('Rice'));
  });

  it('reports quantities in the display unit, not the base unit', () => {
    const brief = pantryBrief(
      buildSnapshot([row({ defaultUnit: 'l', unit: 'l', quantity: 2, nameEn: 'Milk' })]),
      'en',
    );
    // Stage A stores millilitres. "2000 l" or "2000 ml" both read as a
    // different amount of milk to a language model than "2 l".
    expect(brief).toContain('Milk: 2 l');
    expect(brief).not.toContain('2000');
  });

  it('sums duplicate lines of the same ingredient', () => {
    const brief = pantryBrief(
      buildSnapshot([
        row({ ingredientId: 'a', nameEn: 'Rice', defaultUnit: 'kg', unit: 'kg', quantity: 1 }),
        row({ ingredientId: 'a', nameEn: 'Rice', defaultUnit: 'kg', unit: 'kg', quantity: 0.5 }),
      ]),
      'en',
    );
    expect(brief).toContain('Rice: 1.5 kg');
  });

  it('uses Arabic names in an Arabic session', () => {
    const brief = pantryBrief(buildSnapshot([row()]), 'ar');
    // The session is spoken in Arabic; an English pantry would make the
    // assistant translate item names on the fly, which is how "طماطم" becomes
    // "tomato paste".
    expect(brief).toContain('طماطم');
    expect(brief).not.toContain('Tomato');
  });

  it('caps the list and says how many items it left out', () => {
    const rows = Array.from({ length: MAX_PANTRY_LINES + 7 }, (_, i) =>
      row({ ingredientId: `i${i}`, nameEn: `Item${i}` }),
    );
    const brief = pantryBrief(buildSnapshot(rows), 'en');

    const listed = brief.split('\n').filter((line) => line.startsWith('- '));
    expect(listed).toHaveLength(MAX_PANTRY_LINES);
    // Silently truncating is the failure this guards: the model would read the
    // partial list as complete and tell the user they are out of something.
    expect(brief).toContain('7 more tracked items');
    expect(brief).toContain('partial');
  });

  it('says nothing about truncation when nothing was truncated', () => {
    const brief = pantryBrief(buildSnapshot([row()]), 'en');
    expect(brief).not.toContain('partial');
  });

  it('warns that the list is only what is tracked, in both languages', () => {
    // Absence of an item is not evidence of absence — the user may simply not
    // track it. Without this the assistant refuses to cook things the user is
    // looking at.
    expect(pantryBrief(buildSnapshot([row()]), 'en')).toContain('not everything the user owns');
    expect(pantryBrief(buildSnapshot([row()]), 'ar')).toContain('وليست كل ما يملكه المستخدم');
  });

  it('tells the assistant to ask rather than assume when the pantry is empty', () => {
    expect(pantryBrief(buildSnapshot([]), 'en')).toContain('Do not assume');
    expect(pantryBrief(buildSnapshot([]), 'ar')).toContain('لا تفترضي');
  });

  it('marks expiry dates on the lines that have them', () => {
    const brief = pantryBrief(buildSnapshot([row({ expiresOn: '2026-08-30' })]), 'en');
    expect(brief).toContain('(expires 2026-08-30)');
  });
});
