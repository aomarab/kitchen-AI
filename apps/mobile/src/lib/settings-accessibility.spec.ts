import { describe, expect, it } from 'vitest';
import {
  accountProfileAccessibilityLabel,
  assistantPersonaAccessibilityLabel,
  visibleTextLabel,
} from './settings-accessibility';

describe('settings accessibility labels', () => {
  it('joins only visible text in on-screen order', () => {
    expect(visibleTextLabel(['Layla', 'Levantine Arabic', null, 'Selected'])).toBe(
      'Layla, Levantine Arabic, Selected',
    );
  });

  it('speaks every visible persona card field including the selected marker', () => {
    expect(
      assistantPersonaAccessibilityLabel({
        name: 'Layla',
        dialect: 'Levantine Arabic',
        description: 'Warm and unhurried, the way a friend talks you through a recipe.',
        selectedLabel: 'Selected',
      }),
    ).toBe(
      'Layla, Levantine Arabic, Warm and unhurried, the way a friend talks you through a recipe., Selected',
    );
  });

  it('speaks account profile rows without reducing the visible email to an icon', () => {
    expect(accountProfileAccessibilityLabel({ name: 'Chef', email: 'chef@kitchen.ai' })).toBe(
      'Chef, chef@kitchen.ai',
    );
  });
});
