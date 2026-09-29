import { describe, expect, it } from 'vitest';
import {
  assistantDetectionAccessibilityLabel,
  assistantHeaderAccessibilityLabel,
  assistantModeAccessibilityLabel,
  assistantPausedAccessibilityLabel,
} from './accessibility';

describe('assistant accessibility labels', () => {
  it('speaks the visible header text in order', () => {
    expect(
      assistantHeaderAccessibilityLabel({
        name: 'Mama',
        demoLabel: 'Demo',
        subtitle: 'Your kitchen buddy',
        status: 'connected',
      }),
    ).toBe('Mama, Demo, Your kitchen buddy · connected');
  });

  it('speaks selected mode rows after the row title and subtitle', () => {
    expect(
      assistantModeAccessibilityLabel({
        title: 'Text',
        subtitle: 'Type and read replies',
        selectedLabel: 'Selected',
      }),
    ).toBe('Text, Type and read replies, Selected');
  });

  it('speaks detection confidence after the visible tag', () => {
    expect(
      assistantDetectionAccessibilityLabel({
        label: 'Spinach',
        confidenceLabel: 'not sure',
      }),
    ).toBe('Spinach, not sure');
  });

  it('speaks the paused card title before its body', () => {
    expect(
      assistantPausedAccessibilityLabel({
        title: 'Session paused',
        body: 'Resume to keep talking.',
      }),
    ).toBe('Session paused, Resume to keep talking.');
  });
});
