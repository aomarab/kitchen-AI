'use client';

import { useLocale } from '../../lib/locale';
import { useHousehold } from '../../hooks/settings';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { LoadingState, ErrorState, EmptyState } from '../ui/states';
import { LocalizedDate } from '../common/LocalizedDate';

export function HouseholdView() {
  const { t } = useLocale();
  const householdQuery = useHousehold();

  if (householdQuery.isLoading) return <LoadingState />;
  if (householdQuery.isError) return <ErrorState error={householdQuery.error} onRetry={() => void householdQuery.refetch()} />;
  const household = householdQuery.data;
  if (!household) return <EmptyState title={t('household.title')} hint={t('household.create')} />;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{household.name}</CardTitle>
        </CardHeader>
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{t('household.shareInvite')}</p>
          <p className="w-fit rounded-lg bg-muted px-4 py-2 font-mono text-lg font-semibold tracking-[0.3em]">
            {household.inviteCode}
          </p>
        </div>
      </Card>

      <Card className="p-0">
        <CardHeader className="px-5 pt-5">
          <CardTitle className="text-base">{t('household.members')}</CardTitle>
        </CardHeader>
        <ul className="divide-y divide-border">
          {household.members.map((member) => (
            <li key={member.userId} className="flex items-center gap-3 px-5 py-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft font-semibold text-primary-text">
                {member.displayName.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{member.displayName}</p>
                <p className="truncate text-sm text-muted-foreground">{member.email}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge tone={member.role === 'owner' ? 'success' : 'neutral'}>
                  {member.role === 'owner' ? t('household.owner') : t('household.member')}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  <LocalizedDate value={member.joinedAt} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
