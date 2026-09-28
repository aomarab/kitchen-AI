import type { ReactNode } from 'react';
import {
  Pressable,
  View,
  type AccessibilityRole,
  type AccessibilityState,
  type ViewStyle,
} from 'react-native';
import { AppText } from './AppText';
import { DirectionalIcon } from './DirectionalIcon';
import { Icon, type IconName } from './Icon';
import { radius, spacing, type ColorToken } from '../theme';
import { useTheme } from '../theme/useTheme';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  /** Drawn in a 36pt `surfaceAlt` circle in the leading slot (spec §9.7). */
  icon?: IconName;
  trailing?: ReactNode;
  /** A short current value, such as a balance, shown muted before the chevron. */
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  /**
   * A row inside a `ListGroup`: the group card owns the fill, edge and corners,
   * so the row drops its own and grows to 56pt.
   */
  grouped?: boolean;
  /** Tints the title; used for destructive rows. Defaults to the text colour. */
  titleColor?: ColorToken;
  style?: ViewStyle;
}

/**
 * Standard tappable row. `flexDirection: 'row'` mirrors automatically under RTL,
 * and the trailing chevron flips via <DirectionalIcon>, so a single component
 * works for both directions. Standalone rows carry their own card; `grouped`
 * rows sit inside a `ListGroup`.
 */
export function ListRow({
  title,
  subtitle,
  leading,
  icon,
  trailing,
  value,
  onPress,
  showChevron,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
  accessibilityState,
  grouped,
  titleColor,
  style,
}: ListRowProps) {
  const { colors } = useTheme();
  const content = (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
        },
        grouped
          ? { minHeight: 56, paddingVertical: spacing.sm }
          : {
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
            },
        style,
      ]}
    >
      {icon ? (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={icon} size={20} color={colors.text} />
        </View>
      ) : null}
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong" color={titleColor}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" muted>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="body" muted numberOfLines={1}>
          {value}
        </AppText>
      ) : null}
      {trailing}
      {showChevron ? <DirectionalIcon name="chevron" size={20} color={colors.textMuted} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState}
      accessibilityValue={value ? { text: value } : undefined}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      {content}
    </Pressable>
  );
}
