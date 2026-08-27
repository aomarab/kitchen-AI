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
 * fires. `stretchEnabled` shipped as a switch that defaulted to on and changed
 * nothing, so every household was told stretch reminders were running.
 *
 * The earlier version of this file looked for the *name* of every unscheduled
 * type in the source. Two things killed that check. Every type is scheduled
 * today, so the list it swept was empty and it asserted nothing; and the
 * screen now carries an exhaustive `Record<ReminderType, …>` of labels, so
 * every type name appears in the source whether or not it is offered — it
 * would have passed for a hand-added stretch row.
 *
 * What replaces it is structural, and it is the property that actually
 * matters: the screen renders **one** `ToggleRow`, inside a map over
 * `SCHEDULED_REMINDER_TYPES`. A screen shaped that way cannot offer a switch
 * the engine will ignore, whatever the contract's list becomes.
 */
const source = (relative: string) =>
  readFileSync(join(__dirname, '..', ...relative.split('/')), 'utf8');

const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('mobile reminder surfaces', () => {
  const screen = source('app/settings/reminders.tsx');

  it('reads the toggle list from the contract instead of hand-listing it', () => {
    expect(screen).toContain('SCHEDULED_REMINDER_TYPES.map');
  });

  it('renders exactly one ToggleRow, so no nudge can be offered off-list', () => {
    // A hand-added row for a type the engine ignores is the defect this file
    // exists for, and it shows up here as a second `<ToggleRow`.
    expect(occurrences(screen, '<ToggleRow')).toBe(1);
  });

  it('labels every reminder type, so the derived list can never render blank', () => {
    // The map above only produces rows for types `toggleCopy` can describe.
    // TypeScript enforces exhaustiveness; this states the consequence.
    for (const type of reminderTypeSchema.options) {
      expect(screen).toContain(`${type}Enabled`);
    }
  });

  it('offers a cadence control for every setting that has one', () => {
    // Break and stretch each run on their own clock. A cadence setting with no
    // control is a setting the household cannot reach.
    expect(screen).toContain('breakCadenceMinutes');
    expect(screen).toContain('stretchCadenceMinutes');
    expect(SCHEDULED_REMINDER_TYPES).toContain('stretch');
  });
});
