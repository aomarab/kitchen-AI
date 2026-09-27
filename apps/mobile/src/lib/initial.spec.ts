import { describe, expect, it } from 'vitest';
import { initialOf } from './initial';

describe('initialOf', () => {
  it.each([
    ['Layla', 'L'],
    ['  layla ahmed ', 'L'],
    ['ليلى', 'ل'],
    // A surrogate pair must come out whole, not as half a character.
    ['😀 Sam', '😀'],
  ])('takes the first character of %j', (name, expected) => {
    expect(initialOf(name)).toBe(expected);
  });

  it.each([[''], ['   '], [null], [undefined]])('has no initial for %j', (name) => {
    expect(initialOf(name)).toBeNull();
  });
});
