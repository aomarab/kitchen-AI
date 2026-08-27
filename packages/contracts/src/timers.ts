import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common.js';

/* ------------------------------------------------------------------ */
/* Cooking timers (kitchen companion spec — Feature 3)                 */
/* ------------------------------------------------------------------ */

export const timerStatusSchema = z.enum(['running', 'paused', 'done']);
export type TimerStatus = z.infer<typeof timerStatusSchema>;

/** Longest timer we accept: 12 hours. Longer than any braise, short of a bug. */
export const MAX_TIMER_DURATION_SEC = 12 * 60 * 60;
/** How much `extend` adds when the client does not say. The "+1 min" button. */
export const DEFAULT_EXTEND_SEC = 60;
export const MAX_EXTEND_SEC = 60 * 60;
export const MAX_TIMER_LABEL_LENGTH = 60;

/**
 * A timer as the server stores it.
 *
 * Timers count down client-side for smoothness but are persisted server-side so
 * the kiosk and a phone show the same countdown and it survives a reload
 * (spec Feature 3). That split is why two fields carry the clock:
 *
 * - `endsAt` is authoritative while `running` — the client derives its own
 *   countdown from it and never trusts its own elapsed time.
 * - `remainingSec` is authoritative while `paused` or `done`, and is a snapshot
 *   taken at response time while `running`.
 *
 * The invariant `running ⇔ endsAt !== null` is enforced below rather than left
 * to each caller, because a running timer without a deadline would silently
 * count down from a stale snapshot on every client.
 */
export const cookingTimerSchema = z
  .object({
    id: uuidSchema,
    householdId: uuidSchema,
    label: z.string().min(1).max(MAX_TIMER_LABEL_LENGTH),
    /** What the timer was set to, including any extensions. */
    durationSec: z.number().int().min(1).max(MAX_TIMER_DURATION_SEC),
    status: timerStatusSchema,
    endsAt: isoDateTimeSchema.nullable(),
    remainingSec: z.number().int().nonnegative(),
    createdAt: isoDateTimeSchema,
  })
  .superRefine((timer, ctx) => {
    if (timer.status === 'running' && timer.endsAt === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'A running timer must carry endsAt',
      });
    }
    if (timer.status !== 'running' && timer.endsAt !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'Only a running timer may carry endsAt',
      });
    }
    if (timer.status === 'done' && timer.remainingSec !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['remainingSec'],
        message: 'A finished timer has no time left',
      });
    }
  });
export type CookingTimer = z.infer<typeof cookingTimerSchema>;

export const createTimerRequestSchema = z.object({
  label: z.string().trim().min(1).max(MAX_TIMER_LABEL_LENGTH),
  durationSec: z.number().int().min(1).max(MAX_TIMER_DURATION_SEC),
});
export type CreateTimerRequest = z.infer<typeof createTimerRequestSchema>;

/**
 * Every mutation is an action, not a field patch. A timer's state is a small
 * machine (running/paused/done) and letting a client PATCH `endsAt` directly
 * would let it write a state the machine cannot reach.
 */
export const updateTimerRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('pause') }),
  z.object({ action: z.literal('resume') }),
  z.object({ action: z.literal('stop') }),
  z.object({
    action: z.literal('extend'),
    seconds: z.number().int().min(1).max(MAX_EXTEND_SEC).default(DEFAULT_EXTEND_SEC),
  }),
]);
export type UpdateTimerRequest = z.infer<typeof updateTimerRequestSchema>;

export const timerListSchema = z.object({ items: z.array(cookingTimerSchema) });
export type TimerList = z.infer<typeof timerListSchema>;

/* ------------------------------------------------------------------ */
/* Shared derivation                                                   */
/* ------------------------------------------------------------------ */

/**
 * Seconds left on `timer` at `now`, rounded up so a timer reads "1" for the
 * whole final second instead of flicking to "0" half a second early.
 *
 * Lives in the contract because the server derives it on read and the client
 * re-derives it every tick while counting down; two implementations would drift.
 */
export function remainingSecAt(
  timer: Pick<CookingTimer, 'status' | 'endsAt' | 'remainingSec'>,
  now: Date,
): number {
  if (timer.status !== 'running' || timer.endsAt === null) return timer.remainingSec;
  const msLeft = new Date(timer.endsAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(msLeft / 1000));
}

/**
 * A running timer whose deadline has passed is finished, whether or not anything
 * has looked at it since. Nothing sweeps the table on a schedule in this phase,
 * so expiry is a projection applied on read — a timer is never reported as
 * "running" with zero seconds left.
 */
export function projectTimer(timer: CookingTimer, now: Date): CookingTimer {
  const remainingSec = remainingSecAt(timer, now);
  if (timer.status === 'running' && remainingSec === 0) {
    return { ...timer, status: 'done', endsAt: null, remainingSec: 0 };
  }
  return { ...timer, remainingSec };
}

/** `mm:ss`, or `h:mm:ss` past an hour. Digits are localized by the caller. */
export function formatRemaining(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
