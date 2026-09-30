import { Banner } from '../../components/Banner';
import { canAfford, costOf, type BalanceLike } from '../../lib/credits';
import { formatQty } from '../../lib/format';
import { useFormat } from '../../hooks/useFormat';

export interface LowBalanceNoticeProps {
  balance: BalanceLike;
}

/** Shared monthly-plan low-balance warning restored from the old credit balance card. */
export function LowBalanceNotice({ balance }: LowBalanceNoticeProps) {
  const { t, locale, prefs } = useFormat();

  if (canAfford(balance, 'plan.monthly')) return null;

  return (
    <Banner
      accessibilityRole="alert"
      icon="alert"
      iconColor="warn"
      message={t('mobile.credits.belowMonthly', {
        needed: formatQty(locale, costOf('plan.monthly'), prefs),
      })}
    />
  );
}
