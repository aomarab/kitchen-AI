import { describe, expect, it } from 'vitest';
import { formatRecipeVideoDuration } from './recipe-video-duration';

describe('formatRecipeVideoDuration', () => {
  it('formats sub-hour videos as m:ss', () => {
    expect(formatRecipeVideoDuration('en', 65)).toBe('1:05');
    expect(formatRecipeVideoDuration('en', 12 * 60 + 48)).toBe('12:48');
  });

  it('formats hour-long videos as h:mm:ss', () => {
    expect(formatRecipeVideoDuration('en', 60 * 60 + 2 * 60 + 3)).toBe('1:02:03');
  });

  it('uses the active numeral preference', () => {
    expect(formatRecipeVideoDuration('ar', 12 * 60 + 48, { easternNumerals: true })).toBe('١٢:٤٨');
  });
});
