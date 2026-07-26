'use client';

import { useLocale } from '../../lib/locale';
import { usePlan } from '../../hooks/plans';
import { PlanningColumns } from '../shell/PlanningColumns';
import { PantryRail } from '../shell/PantryRail';
import { LoadingState, ErrorState } from '../ui/states';
import { LocalizedDate } from '../common/LocalizedDate';
import { scopeKey } from '../../lib/labels';
import { PlanDetail } from './PlanDetail';

export function PlanDetailContainer({ id }: { id: string }) {
  const { t } = useLocale();
  const planQuery = usePlan(id);

  if (planQuery.isLoading) return <LoadingState />;
  if (planQuery.isError) return <ErrorState error={planQuery.error} onRetry={() => void planQuery.refetch()} />;
  if (!planQuery.data) return <ErrorState error={{ code: 'NOT_FOUND', messageKey: 'errors.NOT_FOUND' }} />;

  const plan = planQuery.data;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold">{t(scopeKey(plan.scope))}</h2>
        <p className="text-sm text-muted-foreground">
          <LocalizedDate value={plan.startsOn} /> — <LocalizedDate value={plan.endsOn} />
        </p>
      </header>
      <PlanningColumns rail={<PantryRail planId={plan.id} />}>
        <PlanDetail plan={plan} />
      </PlanningColumns>
    </div>
  );
}
