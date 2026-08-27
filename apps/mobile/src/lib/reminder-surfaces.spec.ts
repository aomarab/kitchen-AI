import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCHEDULED_REMINDER_TYPES, reminderTypeSchema } from '@kitchen/contracts';

/**
 * Mobile has no render harness, so the screens here cannot be asserted on the
 * way the web ones are. This sweeps their source instead — the same approach
 * `apps/web/src/lib/token-usage.test.ts` uses to police design tokens.
 *
 * What it protects: a toggle for a reminder type the firing engine never
 * fires. `stretchEnabled` shipped as a switch that defaulted to on and
 * changed nothing, so every household was told stretch reminders were
 * running. If a cadence is ever specified, adding `stretch` to
 * `SCHEDULED_REMINDER_TYPES` is what re-permits the toggle here.
 */
const source = (relative: string) =>
  readFileSync(join(__dirname, '..', ...relative.split('/')), 'utf8');

describe('mobile reminder surfaces', () => {
  const screen = source('app/settings/reminders.tsx');

  const unscheduled = reminderTypeSchema.options.filter(
    (type) => !(SCHEDULED_REMINDER_TYPES as readonly string[]).includes(type),
  );

  it('has at least one unscheduled type to police', () => {
    // Otherwise the sweep below would be vacuous.
    expect(unscheduled).toEqual(['stretch']);
  });

  it('offers no toggle for a reminder type the engine never fires', () => {
    for (const type of unscheduled) {
      expect(screen).not.toContain(`${type}Enabled`);
    }
  });

  it('still offers the types the engine does fire', () => {
    // Guards the sweep above from passing because the screen lost all its
    // toggles, or was renamed and now reads as an empty string.
    for (const type of SCHEDULED_REMINDER_TYPES) {
      expect(screen).toContain(`${type}Enabled`);
    }
  });
});
