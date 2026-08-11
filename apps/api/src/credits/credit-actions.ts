import type { CreditAction, PlanScope } from '@kitchen/contracts';

/** A plan's price depends on how many recipes it generates. See spec §3. */
export function creditActionForScope(scope: PlanScope): CreditAction {
  switch (scope) {
    case 'daily':
      return 'plan.daily';
    case 'weekly':
      return 'plan.weekly';
    case 'monthly':
      return 'plan.monthly';
  }
}
