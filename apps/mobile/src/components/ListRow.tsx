import type { ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { DirectionalIcon } from './DirectionalIcon';
import { colors, radius, spacing, type ColorToken } from '../theme';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  accessibilityLabel?: string;
  /** Tints the title; used for destructive rows. Defaults to the text colour. */
  titleColor?: ColorToken;
  style?: ViewStyle;
}

/**
 * Standard tappable row. `flexDirection: 'row'` mirrors automatically under RTL,
 * and the trailing chevron flips via <DirectionalIcon>, so a single component
 * works for both directions.
 */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  showChevron,
  accessibilityLabel,
  titleColor,
  style,
}: ListRowProps) {
  const content = (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
        },
        style,
      ]}
    >
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
      {trailing}
      {showChevron ? <DirectionalIcon name="chevron" size={20} color={colors.textMuted} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      {content}
    </Pressable>
  );
}
