import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from '../../components';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

const SHEET_PADDING = 20;
const MESSAGE_MAX_WIDTH = 290;
const MESSAGE_PADDING_VERTICAL = 10;
const MESSAGE_PADDING_HORIZONTAL = 14;
const ACTION_GAP = 10;

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
          padding: SHEET_PADDING,
          backgroundColor: colors.surface,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View
          style={{
            maxWidth: MESSAGE_MAX_WIDTH,
            flexShrink: 1,
            backgroundColor: colors.surfaceAlt,
            paddingVertical: MESSAGE_PADDING_VERTICAL,
            paddingHorizontal: MESSAGE_PADDING_HORIZONTAL,
          }}
        >
          <AppText variant="body">{message}</AppText>
          {error ? (
            <AppText variant="caption" color="danger" style={{ marginTop: spacing.xs }}>
              {error}
            </AppText>
          ) : null}
        </View>
        {accessory ? <View style={{ flexShrink: 0 }}>{accessory}</View> : null}
      </View>
      {actions ? <View style={{ flexDirection: 'row', gap: ACTION_GAP }}>{actions}</View> : null}
    </View>
  );
}
