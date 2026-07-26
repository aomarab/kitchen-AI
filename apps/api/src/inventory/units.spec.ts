import { describe, it, expect } from 'vitest';
import { areCompatible, convertQuantity } from './units.js';

describe('unit conversion', () => {
  it('converts within the mass dimension', () => {
    expect(convertQuantity(1, 'kg', 'g')).toBe(1000);
    expect(convertQuantity(500, 'g', 'kg')).toBe(0.5);
  });

  it('converts within the volume dimension', () => {
    expect(convertQuantity(1, 'l', 'ml')).toBe(1000);
    expect(convertQuantity(1, 'cup', 'ml')).toBe(240);
  });

  it('is identity for the same unit', () => {
    expect(convertQuantity(3.5, 'piece', 'piece')).toBe(3.5);
  });

  it('treats count units as one 1:1 dimension', () => {
    expect(areCompatible('piece', 'clove')).toBe(true);
    expect(convertQuantity(4, 'piece', 'clove')).toBe(4);
  });

  it('reports incompatible dimensions and refuses to convert', () => {
    expect(areCompatible('kg', 'ml')).toBe(false);
    expect(areCompatible('kg', 'piece')).toBe(false);
    expect(convertQuantity(1, 'kg', 'ml')).toBeNull();
    expect(convertQuantity(1, 'l', 'g')).toBeNull();
  });
});
