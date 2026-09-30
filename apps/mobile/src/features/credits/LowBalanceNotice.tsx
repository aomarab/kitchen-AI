import { View } from 'react-native';
import { AppText } from '../../components/AppText';
import { canAfford, costOf, type BalanceLike } from '../../lib/credits';
import { formatQty } from '../../lib/format';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { useFormat } from '../../hooks/useFormat';

export interface LowBalanceNoticeProps {
  balance: BalanceLike;
}

/** Shared monthly-plan low-balance warning restored from the old credit balance card. */
export function LowBalanceNotice({ balance }: LowBalanceNoticeProps) {
  const { colors } = useTheme();
  const { t, locale, prefs } = useFormat();

  if (canAfford(balance, 'plan.monthly')) return null;

  return (
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
  );
}
