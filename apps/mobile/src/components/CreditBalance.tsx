import { Animated, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { DirectionalIcon } from './DirectionalIcon';
import { Icon } from './Icon';
import { usePressFeedback } from './press-feedback';
import { useFormat } from '../hooks/useFormat';
import { totalCredits, type BalanceLike } from '../lib/credits';
import { formatQty } from '../lib/format';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

export interface CreditBalanceProps {
  balance: BalanceLike & { freeGrant: number };
  onTopUp?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function CreditBalance({ balance, onTopUp, style }: CreditBalanceProps) {
  const { colors } = useTheme();
  const { t, locale, prefs } = useFormat();
  const pressFeedback = usePressFeedback();
  const total = formatQty(locale, totalCredits(balance), prefs);
  const label = `${total} ${t('mobile.home.creditsLeft')}`;
  const trailing = onTopUp ? (
    <>
      <AppText variant="label" color="primaryText">
        {t('mobile.home.topUp')}
      </AppText>
      <DirectionalIcon name="chevron" size={18} color={colors.control} />
    </>
  ) : null;
  const row = (
    <Animated.View
      style={[
        {
          minHeight: 56,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.rowline,
        },
        onTopUp ? pressFeedback.animatedStyle : null,
        style,
      ]}
    >
      <Icon name="coins" size={22} color={colors.text} />
      <AppText variant="body" style={{ flex: 1 }}>
        {label}
      </AppText>
      {trailing}
    </Animated.View>
  );

  if (!onTopUp) return <View accessibilityLabel={label}>{row}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${t('mobile.home.topUp')}`}
      onPress={onTopUp}
      {...pressFeedback.pressHandlers}
    >
      {row}
    </Pressable>
  );
}
