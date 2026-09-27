import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText, OrbMascot } from '../../components';
import type { OrbState } from '../../components/OrbMascot';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export interface MamaBubbleProps {
  state?: OrbState;
  message: string;
  actions?: ReactNode;
  error?: string | null;
  style?: StyleProp<ViewStyle>;
}

/** Floating Mama prompt used by capture shot, looking, result and empty states. */
export function MamaBubble({ state = 'idle', message, actions, error, style }: MamaBubbleProps) {
  const { colors, shadow } = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.md,
          borderRadius: radius.lg,
          backgroundColor: colors.surface,
          ...shadow.raised,
        },
        style,
      ]}
    >
      <OrbMascot size={44} state={state} />
      <View style={{ flex: 1, gap: spacing.sm }}>
        <AppText variant="bodyStrong">{message}</AppText>
        {error ? (
          <AppText variant="caption" style={{ color: colors.danger }}>
            {error}
          </AppText>
        ) : null}
        {actions ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{actions}</View>
        ) : null}
      </View>
    </View>
  );
}
