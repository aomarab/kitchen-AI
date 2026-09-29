import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from '../../components';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export interface MamaBubbleProps {
  message: string;
  actions?: ReactNode;
  error?: string | null;
  style?: StyleProp<ViewStyle>;
}

/** Bottom capture prompt. J retires the orb here, keeping only the spoken prompt and actions. */
export function MamaBubble({ message, actions, error, style }: MamaBubbleProps) {
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
        <AppText variant="body">{message}</AppText>
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
