import type { ReactNode } from 'react';
import { ScrollView, View, type ViewStyle, RefreshControl } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: readonly Edge[];
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: ReactNode;
}

/**
 * Page container: applies safe-area insets, the app background, and optional
 * scrolling with pull-to-refresh. Keeps every screen visually consistent.
 */
export function Screen({
  children,
  scroll,
  padded = true,
  edges = ['top', 'bottom'],
  style,
  contentStyle,
  refreshing,
  onRefresh,
  footer,
}: ScreenProps) {
  const pad: ViewStyle = padded ? { padding: spacing.lg, gap: spacing.md } : {};
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[pad, { flexGrow: 1 }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad, contentStyle]}>{children}</View>
      )}
      {footer ? <View style={{ padding: spacing.lg, paddingTop: spacing.sm }}>{footer}</View> : null}
    </SafeAreaView>
  );
}
