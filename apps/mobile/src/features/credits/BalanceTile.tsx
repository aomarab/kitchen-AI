import { View } from 'react-native';
import { AppText, Illustration } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { creditBalanceAccessibilityLabel, totalCredits, type BalanceLike } from '../../lib/credits';
import { formatQty } from '../../lib/format';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export const BALANCE_TILE_MIN_HEIGHT = 100;
export const BALANCE_ILLUSTRATION_SIZE = 56;

export interface BalanceTileProps {
  balance?: BalanceLike & { freeGrant: number };
  formattedTotal?: string | null;
  label?: string;
}

/** Flat Coral balance tile shared by the credit purchase and usage screens. */
export function BalanceTile({ balance, formattedTotal, label }: BalanceTileProps) {
  const { t, locale, prefs } = useFormat();
  const { colors } = useTheme();
  const total =
    formattedTotal ?? (balance ? formatQty(locale, totalCredits(balance), prefs) : null);
  if (!total) return null;
  const balanceLabel = label ?? t('mobile.credits.balanceLabel');
  const totalLine = t('mobile.credits.packCredits', { credits: total });
  const accessibilityLabel = creditBalanceAccessibilityLabel(balanceLabel, totalLine);

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={{
        minHeight: BALANCE_TILE_MIN_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xl,
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.lg,
        backgroundColor: colors.surfaceAlt,
      }}
    >
      <Illustration name="coins" size={BALANCE_ILLUSTRATION_SIZE} />
      <View style={{ gap: spacing.xs, flex: 1 }}>
        <AppText variant="numeral">{total}</AppText>
        <AppText variant="caption" muted>
          {balanceLabel}
        </AppText>
      </View>
    </View>
  );
}
