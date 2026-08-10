/**
 * Count-dependent messages.
 *
 * English needs two forms; Arabic needs up to six — `يومين` (exactly two) is a
 * different word, not a different number — so a catalog entry cannot always be
 * one string with the count spliced in. That shortcut is how `Expires in 1 days`
 * reaches a user.
 *
 * These live apart from `index.ts` because the catalogs themselves call
 * `plural()`, and `index.ts` imports the catalogs: same module, and the import
 * graph closes into a cycle.
 */

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/** `other` is required: every language has one, so a message always renders. */
export type PluralForms = { other: string } & Partial<Record<PluralCategory, string>>;

export interface PluralMessage {
  /** Name of the interpolation whose value selects the form. */
  readonly count: string;
  readonly forms: PluralForms;
}

/**
 * Declare a count-dependent message. The form is chosen from an interpolation
 * the caller already passes, named by `count`, so call sites need no change:
 * `t('inventory.expiresIn', { days: 1 })` selects `one` because the entry
 * declares `days` as its driving value.
 *
 * The return type is deliberately the wide `PluralMessage` so Arabic may supply
 * `zero`/`two`/`few`/`many` for a key where English supplies only `one`/`other`.
 * The catalogs stay structurally equal — `ar: Messages` is still enforced, so a
 * missing Arabic translation is still a build error — without forcing English
 * grammar onto Arabic.
 */
export function plural(count: string, forms: PluralForms): PluralMessage {
  return { count, forms };
}

export function isPluralMessage(value: unknown): value is PluralMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PluralMessage).count === 'string' &&
    typeof (value as PluralMessage).forms === 'object' &&
    (value as PluralMessage).forms !== null
  );
}
