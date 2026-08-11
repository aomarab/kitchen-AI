import { View } from 'react-native';
import { Card } from './Card';
import { AppText } from './AppText';
import { useFormat } from '../hooks/useFormat';
import { canAfford, totalCredits, costOf, type BalanceLike } from '../lib/credits';
import { formatQty } from '../lib/format';
import { colors, radius, spacing } from '../theme';

export interface CreditBalanceProps {
  balance: BalanceLike & { freeGrant: number };
}

/**
 * Presentational credit balance (spec §7): the spendable total, the free/paid
 * split, when the free grant resets, and a low-balance warning when the total
 * cannot cover a monthly plan — the action most likely to run a household short.
 * The gating maths lives in `lib/credits` so it stays node-testable.
 */
export function CreditBalance({ balance }: CreditBalanceProps) {
  const { t, locale, prefs } = useFormat();
  const total = totalCredits(balance);
  const coversMonthly = canAfford(balance, 'plan.monthly');

  return (
    <Card tone="primary" style={{ gap: spacing.md }}>
      <AppText variant="label" color="primary">
        {t('mobile.credits.title')}
      </AppText>

      <View style={{ gap: 2 }}>
        <AppText variant="display">{formatQty(locale, total, prefs)}</AppText>
        <AppText variant="caption" muted>
          {t('mobile.credits.available')}
        </AppText>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View
          style={{
            flex: 1,
            gap: spacing.xs,
            padding: spacing.md,
            borderRadius: radius.md,
            backgroundColor: colors.surface,
          }}
        >
          <AppText variant="caption" muted>
            {t('mobile.credits.free')}
          </AppText>
          <AppText variant="heading">{formatQty(locale, balance.freeBalance, prefs)}</AppText>
        </View>
        <View
          style={{
            flex: 1,
            gap: spacing.xs,
            padding: spacing.md,
            borderRadius: radius.md,
            backgroundColor: colors.surface,
          }}
        >
          <AppText variant="caption" muted>
            {t('mobile.credits.paid')}
          </AppText>
          <AppText variant="heading">{formatQty(locale, balance.paidBalance, prefs)}</AppText>
        </View>
      </View>

      <AppText variant="caption" muted>
        {t('mobile.credits.resets', { grant: formatQty(locale, balance.freeGrant, prefs) })}
      </AppText>

      {coversMonthly ? null : (
        <View
          style={{
            padding: spacing.md,
            borderRadius: radius.md,
            backgroundColor: colors.warnSoft,
          }}
        >
          <AppText variant="caption" color="warn" accessibilityRole="alert">
            {t('mobile.credits.belowMonthly', {
              needed: formatQty(locale, costOf('plan.monthly'), prefs),
            })}
          </AppText>
        </View>
      )}
    </Card>
  );
}
