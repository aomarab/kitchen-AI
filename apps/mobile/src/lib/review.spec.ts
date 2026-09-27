import { describe, expect, it } from 'vitest';
import type { Ingredient, StorageLocation } from '@kitchen/contracts';
import {
  applyIngredient,
  expiryPhrase,
  focusIndex,
  needsAnswer,
  newReviewRow,
  reviewHeadlineCount,
  unansweredCount,
} from './review';
import { LOW_CONFIDENCE, type ReviewRow as CaptureReviewRow } from './capture';

const NOW = new Date(2026, 6, 26);

const LOCATIONS: StorageLocation[] = [
  { id: 'loc-fridge', householdId: 'hh', name: 'Fridge', type: 'fridge' },
  { id: 'loc-pantry', householdId: 'hh', name: 'Pantry', type: 'pantry' },
];

const TOMATO: Ingredient = {
  id: '11111111-1111-4111-8111-111111111111',
  canonicalNameEn: 'Vine tomatoes',
  canonicalNameAr: 'طماطم كرزية',
  category: 'vegetable',
  defaultUnit: 'piece',
  aliases: [],
  isStaple: false,
  createdAt: '2026-07-26T10:00:00.000Z',
};

const OIL: Ingredient = {
  ...TOMATO,
  id: '22222222-2222-4222-8222-222222222222',
  canonicalNameEn: 'Olive oil',
  canonicalNameAr: 'زيت زيتون',
  category: 'oil',
  defaultUnit: 'ml',
};

function row(overrides: Partial<CaptureReviewRow> = {}): CaptureReviewRow {
  return {
    tempId: 'tmp-1',
    nameEn: 'Tomato',
    nameAr: 'طماطم',
    ingredientId: 'ing-1',
    rawName: 'Tomato',
    quantity: 2,
    unit: 'piece',
    locationId: 'loc-fridge',
    expiresAt: '2026-07-29',
    confidence: 0.9,
    photoKey: 'photo-1',
    category: 'vegetable',
    include: true,
    ...overrides,
  };
}

describe('review questions', () => {
  it('needs an answer only for low-confidence rows not in the answered set', () => {
    const unsure = row({ confidence: LOW_CONFIDENCE - 0.01 });

    expect(needsAnswer(unsure, new Set())).toBe(true);
    expect(needsAnswer(unsure, new Set([unsure.tempId]))).toBe(false);
    expect(needsAnswer(row({ confidence: LOW_CONFIDENCE }), new Set())).toBe(false);
  });

  it('counts only included unanswered rows', () => {
    expect(
      unansweredCount(
        [
          row({ tempId: 'a', confidence: LOW_CONFIDENCE - 0.01 }),
          row({ tempId: 'b', confidence: LOW_CONFIDENCE - 0.01, include: false }),
          row({ tempId: 'c', confidence: 0.99 }),
          row({ tempId: 'd', confidence: LOW_CONFIDENCE - 0.01 }),
        ],
        new Set(['d']),
      ),
    ).toBe(1);
  });
});

describe('applyIngredient', () => {
  it('patches the catalog fields and default unit when the unit was not touched', () => {
    expect(applyIngredient(row({ unit: 'g' }), OIL, { unitTouched: false })).toMatchObject({
      ingredientId: OIL.id,
      nameEn: OIL.canonicalNameEn,
      nameAr: OIL.canonicalNameAr,
      category: OIL.category,
      rawName: OIL.canonicalNameEn,
      unit: OIL.defaultUnit,
    });
  });

  it('preserves a touched unit on existing rows', () => {
    expect(applyIngredient(row({ unit: 'kg' }), OIL, { unitTouched: true }).unit).toBe('kg');
  });

  it('uses the ingredient default unit for a new blank row even if the unit chips were touched', () => {
    const blank = newReviewRow(LOCATIONS);

    expect(applyIngredient(blank, OIL, { unitTouched: true }).unit).toBe('ml');
  });
});

describe('newReviewRow', () => {
  it('creates an included blank draft at the first location', () => {
    const draft = newReviewRow(LOCATIONS);

    expect(draft).toMatchObject({
      nameEn: '',
      nameAr: '',
      ingredientId: null,
      rawName: '',
      quantity: 1,
      unit: 'piece',
      locationId: 'loc-fridge',
      expiresAt: null,
      confidence: 1,
      photoKey: null,
      category: 'other',
      include: true,
    });
    expect(draft.tempId).toMatch(/^review-/);
  });

  it('uses an empty location when no locations are loaded', () => {
    expect(newReviewRow([]).locationId).toBe('');
  });
});

describe('expiryPhrase', () => {
  it('uses days through day 13 and weeks from day 14', () => {
    expect(expiryPhrase('2026-08-08', NOW)).toEqual({
      key: 'mobile.review.goodForDays',
      count: 13,
      tone: 'success',
    });
    expect(expiryPhrase('2026-08-09', NOW)).toEqual({
      key: 'mobile.review.goodForWeeks',
      count: 2,
      tone: 'success',
    });
  });

  it('returns the status tone for today, soon, expired and no date', () => {
    expect(expiryPhrase('2026-07-26', NOW).tone).toBe('warn');
    expect(expiryPhrase('2026-07-28', NOW).tone).toBe('warn');
    expect(expiryPhrase('2026-07-25', NOW).tone).toBe('danger');
    expect(expiryPhrase(null, NOW)).toEqual({ key: 'mobile.capture.noExpiry', tone: 'muted' });
  });
});

describe('review counts and focus', () => {
  it('counts included rows for the headline', () => {
    expect(reviewHeadlineCount([row(), row({ include: false }), row({ tempId: 'three' })])).toBe(2);
  });

  it('returns the focus index among included rows only', () => {
    const rows = [row({ tempId: 'a' }), row({ tempId: 'b', include: false }), row({ tempId: 'c' })];

    expect(focusIndex(rows, 'a')).toBe(0);
    expect(focusIndex(rows, 'b')).toBe(-1);
    expect(focusIndex(rows, 'c')).toBe(1);
    expect(focusIndex(rows, undefined)).toBe(-1);
  });
});
