import { describe, expect, it } from 'vitest';
import { clampQuantityToStepperRules, parseQuantityFieldValue } from './capture-quantity';

describe('capture quantity field parsing', () => {
  it('uses the stepper minimum as the typed field lower bound', () => {
    expect(parseQuantityFieldValue('-3', 5)).toBe(0);
    expect(clampQuantityToStepperRules(-1)).toBe(0);
  });

  it('keeps finite decimal quantities and comma decimal input', () => {
    expect(parseQuantityFieldValue('0.75', 1)).toBe(0.75);
    expect(parseQuantityFieldValue('2,5', 1)).toBe(2.5);
  });

  it('falls back for non-numeric input and clamps an explicit maximum', () => {
    expect(parseQuantityFieldValue('', 4)).toBe(4);
    expect(parseQuantityFieldValue('many', 4)).toBe(4);
    expect(parseQuantityFieldValue('130', 4, { min: 1, max: 20, step: 1 })).toBe(20);
  });
});
