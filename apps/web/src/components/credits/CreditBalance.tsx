'use client';

import { useLocale } from '../../lib/locale';
import { useCredits } from '../../hooks/credits';
import { Card } from '../ui/Card';
import { CreditBalanceView } from './CreditBalanceView';

/**
 * Data container for the credit balance. Reads the household's balance through
 * `useCredits` and hands it to the presentational view. Surfaced in Settings.
 */
export function CreditBalance() {
  const { t } = useLocale();
  const { data, isLoading } = useCredits();

  if (isLoading || !data) {
    return (
      <Card>
        <p role="status" className="text-sm text-muted-foreground">
          {t('web.credits.loading')}
        </p>
      </Card>
    );
  }

  return (
    <CreditBalanceView
      freeBalance={data.freeBalance}
      paidBalance={data.paidBalance}
      freeGrant={data.freeGrant}
    />
  );
}
