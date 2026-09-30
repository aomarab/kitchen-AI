import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PRESS_FEEDBACK_DIM_OPACITY,
  PRESS_FEEDBACK_MS,
  pressFeedbackDuration,
} from './press-feedback-tokens';

const read = (relative: string) => readFileSync(join(__dirname, relative), 'utf8');

describe('press feedback tokens', () => {
  it('animates presses to 0.85 over 80ms and disables duration under Reduce Motion', () => {
    expect(PRESS_FEEDBACK_DIM_OPACITY).toBe(0.85);
    expect(PRESS_FEEDBACK_MS).toBe(80);
    expect(pressFeedbackDuration(false)).toBe(80);
    expect(pressFeedbackDuration(true)).toBe(0);
  });
});

describe('press feedback source guards', () => {
  it.each(['Button.tsx', 'IconButton.tsx', 'OAuthButtons.tsx', 'Chip.tsx'])(
    '%s uses the shared animated press feedback',
    (file) => {
      const source = read(`./${file}`);
      expect(source).toContain('usePressFeedback');
      expect(source).toContain('pressFeedback.pressHandlers');
      expect(source).toContain('pressFeedback.animatedStyle');
      expect(source).not.toMatch(/pressed \? 0\.85/);
    },
  );

  it.each(['QuantityStepper.tsx', 'Checkbox.tsx', 'SegmentedControl.tsx', 'Toggle.tsx'])(
    '%s does not use immediate pressed opacity for C3 controls',
    (file) => {
      const source = read(`./${file}`);
      expect(source).not.toMatch(/pressed \? 0\.85/);
    },
  );
});
