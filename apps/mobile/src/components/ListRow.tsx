import type { ReactNode } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityRole,
  type AccessibilityState,
  type ViewStyle,
} from 'react-native';
import { AppText } from './AppText';
import { DirectionalIcon } from './DirectionalIcon';
import { Icon, type IconName } from './Icon';
import { usePressFeedback } from './press-feedback';
import { spacing, type ColorToken } from '../theme';
import { useTheme } from '../theme/useTheme';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  icon?: IconName;
  trailing?: ReactNode;
  /** A short current value, such as a balance, shown muted before the chevron. */
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
  checked?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  /** Tints the title; used for destructive rows. Defaults to the text colour. */
  titleColor?: ColorToken;
  style?: ViewStyle;
}

export function ListRow({
  title,
  subtitle,
  leading,
  icon,
  trailing,
  value,
  onPress,
  showChevron,
  checked,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
  accessibilityState,
  titleColor,
  style,
}: ListRowProps) {
  const { colors } = useTheme();
  const pressFeedback = usePressFeedback();
  const row = (
    <Animated.View
      style={[
        {
          minHeight: 56,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingVertical: spacing.md,
          paddingHorizontal: 0,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.rowline,
          backgroundColor: colors.bg,
        },
        onPress ? pressFeedback.animatedStyle : null,
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={22} color={colors.text} /> : null}
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="body" color={titleColor}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" muted>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="caption" muted numberOfLines={1}>
          {value}
        </AppText>
      ) : null}
      {trailing}
      {checked ? <Icon name="check" size={18} color={colors.primary} /> : null}
      {showChevron ? <DirectionalIcon name="chevR" size={18} color={colors.control} /> : null}
    </Animated.View>
  );

  if (!onPress) return row;
  return (
    <Pressable
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState}
      accessibilityValue={value ? { text: value } : undefined}
      onPress={onPress}
      {...pressFeedback.pressHandlers}
    >
      {row}
    </Pressable>
  );
}
