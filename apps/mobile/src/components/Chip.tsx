import type { ReactNode } from 'react';
import {
  Animated,
  Pressable,
  type AccessibilityRole,
  type AccessibilityState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { AppText } from './AppText';
import { CountBadge } from './Badge';
import { chipTone, type ChipTone, type ChipVariant } from './control-tones';
import { Icon, type IconName } from './Icon';
import { usePressFeedback } from './press-feedback';
import { hitSlop, radius, spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

export type { ChipVariant } from './control-tones';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityState?: AccessibilityState;
  /** `tag` is the small location label inside a tile (spec §8.4). */
  variant?: ChipVariant;
  tone?: ChipTone;
  icon?: IconName;
  count?: number;
  countAccessibilityLabel?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** A 36pt square chip that reaches 44pt through theme hitSlop. */
export function Chip({
  label,
  selected = false,
  onPress,
  accessibilityRole,
  accessibilityLabel,
  accessibilityState,
  variant = 'pill',
  tone: toneName = 'default',
  icon,
  count,
  countAccessibilityLabel,
  children,
  style,
}: ChipProps) {
  const { colors } = useTheme();
  const tone = chipTone(colors, variant, selected, toneName);
  const tag = variant === 'tag';
  const pressFeedback = usePressFeedback();

  return (
    <Pressable
      accessibilityRole={accessibilityRole ?? (onPress ? 'button' : 'text')}
      accessibilityState={accessibilityState ?? (onPress ? { selected } : undefined)}
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={!onPress}
      hitSlop={hitSlop}
      onPress={onPress}
      {...pressFeedback.pressHandlers}
    >
      <Animated.View
        style={[
          {
            minHeight: 36,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingHorizontal: 14,
            borderRadius: radius.none,
            borderWidth: 1,
            borderColor: tone.border,
            backgroundColor: tone.fill,
          },
          onPress ? pressFeedback.animatedStyle : null,
          tag ? { minHeight: 24, paddingHorizontal: spacing.sm, borderRadius: radius.none } : null,
          style,
        ]}
      >
        {children ?? (
          <>
            {icon ? <Icon name={icon} size={18} color={tone.label} /> : null}
            <AppText variant={tag ? 'caption' : 'buttonSmall'} style={{ color: tone.label }}>
              {label}
            </AppText>
            {typeof count === 'number' ? (
              <CountBadge count={count} accessibilityLabel={countAccessibilityLabel} />
            ) : null}
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}
