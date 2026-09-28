import { describe, expect, it } from 'vitest';
import { fieldBorder } from './field-tones';

describe('field border tones', () => {
  it('uses the quiet border at rest', () => {
    expect(fieldBorder({ focused: false })).toEqual({ width: 1, colorToken: 'border' });
  });

  it('uses a 2pt primary ring when focused', () => {
    expect(fieldBorder({ focused: true })).toEqual({ width: 2, colorToken: 'primary' });
  });

  it('uses danger for errors', () => {
    expect(fieldBorder({ focused: false, error: 'Required' })).toEqual({
      width: 1,
      colorToken: 'danger',
    });
  });

  it('lets error colour win over focus while keeping the focused ring weight', () => {
    expect(fieldBorder({ focused: true, error: 'Required' })).toEqual({
      width: 2,
      colorToken: 'danger',
    });
  });
});
