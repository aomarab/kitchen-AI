import {
  Animated,
  Pressable,
  View,
  type AccessibilityRole,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { usePressFeedback } from './press-feedback';
import { spacing, type ColorToken } from '../theme';
import { useTheme } from '../theme/useTheme';

export interface BannerProps {
  icon: IconName;
  message: string;
  iconColor?: ColorToken;
  actionLabel?: string;
  onAction?: () => void;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  topInset?: number;
  style?: StyleProp<ViewStyle>;
}

export function Banner({
  icon,
  message,
  iconColor = 'text',
  actionLabel,
  onAction,
  accessibilityRole,
  accessibilityLabel,
  topInset = 0,
  style,
}: BannerProps) {
  const { colors } = useTheme();
  const pressFeedback = usePressFeedback();
  return (
    <View
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: colors.surfaceAlt,
          paddingVertical: 10,
          paddingTop: 10 + topInset,
          paddingBottom: 10,
          paddingHorizontal: 14,
        },
        style,
      ]}
    >
      <Icon name={icon} size={18} color={colors[iconColor]} />
      <AppText variant="label" style={{ flex: 1 }}>
        {message}
      </AppText>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          {...pressFeedback.pressHandlers}
          style={{ minHeight: 44, justifyContent: 'center', marginVertical: -spacing.sm }}
        >
          <Animated.View style={pressFeedback.animatedStyle}>
            <AppText variant="buttonSmall" color="primaryText">
              {actionLabel}
            </AppText>
          </Animated.View>
        </Pressable>
      ) : null}
    </View>
  );
}
