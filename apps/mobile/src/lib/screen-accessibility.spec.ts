import { describe, expect, it } from 'vitest';
import {
  kioskCardAccessibilityLabel,
  timerCardAccessibilityLabel,
  visibleTextAccessibilityLabel,
  wellnessNudgeAccessibilityLabel,
} from './screen-accessibility';

describe('C15 screen accessibility labels', () => {
  it('speaks only visible text in on-screen order', () => {
    expect(visibleTextAccessibilityLabel(['12:40', null, 'Rice · 18 min', undefined])).toBe(
      '12:40, Rice · 18 min',
    );
  });

  it('keeps timer card labels in visual order', () => {
    expect(
      timerCardAccessibilityLabel({
        primary: 'Time is up',
        caption: 'Tomato sauce · 15 min',
        action: 'Remove',
      }),
    ).toBe('Time is up, Tomato sauce · 15 min, Remove');
  });

  it('keeps wellness nudge row labels in visual order', () => {
    expect(
      wellnessNudgeAccessibilityLabel({
        body: 'How about two minutes of stretching?',
        status: 'Answered · 12 min ago',
      }),
    ).toBe('How about two minutes of stretching?, Answered · 12 min ago');
  });

  it('keeps kiosk card labels in visual order', () => {
    expect(kioskCardAccessibilityLabel(['Water goal today', '5 of 8 cups'])).toBe(
      'Water goal today, 5 of 8 cups',
    );
  });
});
