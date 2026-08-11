import { describe, expect, it } from 'vitest';
import { toneIndexFor } from './recipe-tone';
import { tints, tintFor } from '../theme/index';

// With four tints, collisions between two given dishes are expected by design.
// A test asserting that any two specific dishes always differ would be asserting
// something untrue — don't add one.
describe('RecipeThumb tone selection', () => {
  it('is stable for a dish', () => {
    expect(toneIndexFor('Chicken Kabsa')).toBe(toneIndexFor('Chicken Kabsa'));
  });

  it('always lands inside the tint tuple', () => {
    for (const key of ['chicken-kabsa', 'shakshuka', 'hummus', '', 'دجاج-كبسه']) {
      const index = toneIndexFor(key);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(tints.length);
      expect(tintFor(index)).toBeDefined();
    }
  });

  it('produces more than one distinct index across real recipe titles', () => {
    // 'Chicken Kabsa' -> 3, 'Hummus' -> 1, 'Moussaka' -> 0 — verified by measurement.
    const titles = ['Chicken Kabsa', 'Hummus', 'Moussaka'];
    const indices = titles.map(toneIndexFor);
    const unique = new Set(indices);
    expect(unique.size).toBeGreaterThan(1);
  });
});
