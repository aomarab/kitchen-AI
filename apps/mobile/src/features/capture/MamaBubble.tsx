import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from '../../components';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export interface MamaBubbleProps {
  message: string;
  actions?: ReactNode;
  accessory?: ReactNode;
  error?: string | null;
  style?: StyleProp<ViewStyle>;
}

/** Bottom capture prompt. J retires the orb here, keeping only the spoken prompt and actions. */
export function MamaBubble({ message, actions, accessory, error, style }: MamaBubbleProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          gap: spacing.lg,
          paddingHorizontal: spacing.gutter,
          paddingTop: spacing.lg,
          paddingBottom: spacing.gutter,
          backgroundColor: colors.surface,
        },
        style,
      ]}
    >
      <View style={{ backgroundColor: colors.surfaceAlt, padding: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <AppText variant="body" style={{ flex: 1 }}>
            {message}
          </AppText>
          {accessory}
        </View>
        {error ? (
          <AppText variant="caption" color="danger" style={{ marginTop: spacing.xs }}>
            {error}
          </AppText>
        ) : null}
      </View>
      {actions ? <View style={{ flexDirection: 'row', gap: spacing.md }}>{actions}</View> : null}
    </View>
  );
}
