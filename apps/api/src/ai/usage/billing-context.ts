import { AsyncLocalStorage } from 'node:async_hooks';
import type { CreditAction } from '@kitchen/contracts';

/**
 * The credit action currently being paid for, and the spend group that paid.
 *
 * `spendGroupId` is the same id `CreditsService.spend` writes on the ledger
 * rows, so it is the join key between what a household was charged and what the
 * vendor charged us.
 */
export interface BillingContext {
  spendGroupId: string;
  action: CreditAction;
}

const storage = new AsyncLocalStorage<BillingContext>();

/**
 * Run `fn` with every AI call it makes — however deeply nested — attributed to
 * this credit action.
 *
 * Ambient rather than a parameter on purpose. One credit action is several
 * gateway calls, and the ones that are hardest to account for are the internal
 * steps the credits contract says are "absorbed by the action that triggered
 * them": `recipe.translate` and `name.resolve` are invoked from services well
 * below the one holding the spend group id. Threading a parameter would reach
 * the top-level call and quietly miss precisely those nested calls, producing a
 * cost per action that looks complete and is not.
 *
 * The cost of that choice is that a boundary can be forgotten, so each of the
 * four boundaries has a test that fails when its context is dropped.
 */
export function runInBillingContext<T>(
  context: BillingContext | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  // `undefined` runs unattributed rather than throwing: a job row persisted
  // before spend groups existed has no id to attribute to, and failing that
  // job would be a worse answer than an unattributed usage row.
  return context ? storage.run(context, fn) : fn();
}

/**
 * The action being paid for, or `undefined` when the call is not part of one.
 *
 * `undefined` is a legitimate answer, not a failure: warming a recipe's media
 * or a background translation is AI spend nobody was charged a credit for, and
 * an unattributed usage row states that honestly. What must never happen is a
 * row attributed to the *wrong* action, which is why the context is only ever
 * entered around work that is entirely within one action.
 */
export function currentBillingContext(): BillingContext | undefined {
  return storage.getStore();
}
