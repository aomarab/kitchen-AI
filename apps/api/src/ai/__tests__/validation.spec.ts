import { describe, expect, it } from 'vitest';
import { validateRecipe } from '../planner/validation.js';
import { findViolations } from '../planner/safety.js';
import { cat, ingredient, snapshotOf } from './helpers.js';

const EMPTY = snapshotOf([]);

describe('Stage C safety — allergies (spec §5.4)', () => {
  it('rejects a recipe containing an allergen (peanut → nut allergy)', () => {
    const peanut = cat({ canonicalNameEn: 'Peanut butter', category: 'nut', defaultUnit: 'g' });
    const result = validateRecipe(
      { title: 'Satay', ingredients: [ingredient(peanut, 50, 'g')] },
      snapshotOf([{ ref: peanut, quantity: 500, unit: 'g' }]),
      { allergies: ['nut'], halal: false },
    );
    expect(result.safe).toBe(false);
    expect(result.violations.some((v) => v.kind === 'allergy')).toBe(true);
  });

  it('rejects an allergen even when the ingredient is optional', () => {
    const milk = cat({ canonicalNameEn: 'Whole milk', category: 'dairy' });
    const result = validateRecipe(
      { title: 'Latte', ingredients: [ingredient(milk, 100, 'ml', true)] },
      EMPTY,
      { allergies: ['dairy'], halal: false },
    );
    expect(result.safe).toBe(false);
  });

  it('does not flag an unrelated ingredient', () => {
    const rice = cat({ canonicalNameEn: 'Basmati rice', category: 'grain' });
    const result = validateRecipe(
      { title: 'Rice', ingredients: [ingredient(rice, 200, 'g')] },
      snapshotOf([{ ref: rice, quantity: 1000, unit: 'g' }]),
      { allergies: ['nut', 'seafood'], halal: false },
    );
    expect(result.safe).toBe(true);
  });
});

describe('Stage C safety — halal (spec §5.4)', () => {
  it('rejects pork under halal', () => {
    const pork = cat({ canonicalNameEn: 'Pork loin', canonicalNameAr: 'لحم خنزير', category: 'meat' });
    const result = validateRecipe(
      { title: 'Roast', ingredients: [ingredient(pork, 300, 'g')] },
      EMPTY,
      { allergies: [], halal: true },
    );
    expect(result.safe).toBe(false);
    expect(result.violations[0]?.kind).toBe('halal');
  });

  it('rejects alcohol (white wine) under halal', () => {
    const wine = cat({ canonicalNameEn: 'White wine', canonicalNameAr: 'نبيذ أبيض', category: 'beverage' });
    const result = validateRecipe(
      { title: 'Risotto', ingredients: [ingredient(wine, 100, 'ml')] },
      EMPTY,
      { allergies: [], halal: true },
    );
    expect(result.safe).toBe(false);
    expect(result.violations[0]?.kind).toBe('halal');
  });

  it('rejects Arabic haram term (لحم خنزير) under halal', () => {
    const pork = cat({ canonicalNameEn: 'Sausage', canonicalNameAr: 'لحم خنزير', category: 'meat' });
    const violations = findViolations([ingredient(pork, 100, 'g')], { allergies: [], halal: true });
    expect(violations.some((v) => v.kind === 'halal')).toBe(true);
  });

  it('does NOT flag halal variants: "Beef bacon" and "turkey ham"', () => {
    const beefBacon = cat({ canonicalNameEn: 'Beef bacon', canonicalNameAr: 'بيكون بقري', category: 'meat' });
    const turkeyHam = cat({ canonicalNameEn: 'Turkey ham', canonicalNameAr: 'لحم ديك رومي', category: 'poultry' });
    const violations = findViolations(
      [ingredient(beefBacon, 50, 'g'), ingredient(turkeyHam, 50, 'g')],
      { allergies: [], halal: true },
    );
    expect(violations).toHaveLength(0);
  });

  it('does NOT flag "Hamour" (a fish) whose name merely contains "ham"', () => {
    const hamour = cat({ canonicalNameEn: 'Hamour', canonicalNameAr: 'هامور', category: 'seafood' });
    const violations = findViolations([ingredient(hamour, 200, 'g')], { allergies: [], halal: true });
    expect(violations).toHaveLength(0);
  });
});

describe('Stage C coverage math', () => {
  it('reports a shortfall when required exceeds stock', () => {
    const chicken = cat({ canonicalNameEn: 'Chicken breast', category: 'poultry' });
    const result = validateRecipe(
      { title: 'Grilled chicken', ingredients: [ingredient(chicken, 500, 'g')] },
      snapshotOf([{ ref: chicken, quantity: 200, unit: 'g' }]),
      { allergies: [], halal: false },
    );
    expect(result.fullyCovered).toBe(false);
    expect(result.shortfalls[0]?.shortfall).toBeCloseTo(300, 3);
  });

  it('treats an in-stock staple as always available', () => {
    const salt = cat({ canonicalNameEn: 'Salt', category: 'spice', isStaple: true });
    const result = validateRecipe(
      { title: 'Seasoned dish', ingredients: [ingredient(salt, 5, 'g')] },
      snapshotOf([]),
      { allergies: [], halal: false },
    );
    expect(result.fullyCovered).toBe(true);
  });

  it('counts an incompatible-dimension stock as uncovered', () => {
    const oil = cat({ canonicalNameEn: 'Olive oil', category: 'oil', defaultUnit: 'ml' });
    const result = validateRecipe(
      { title: 'Dressing', ingredients: [ingredient(oil, 30, 'ml')] },
      // stock recorded in grams (mass) cannot prove ml (volume) coverage
      snapshotOf([{ ref: { ...oil, defaultUnit: 'g' }, quantity: 100, unit: 'g' }]),
      { allergies: [], halal: false },
    );
    expect(result.fullyCovered).toBe(false);
  });
});
