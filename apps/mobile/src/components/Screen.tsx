import type { ReactNode } from 'react';
import {
  ScrollView,
  View,
  useWindowDimensions,
  type ViewStyle,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';
import { contentMaxWidth } from '../theme/layout';

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
 * Page container: applies safe-area insets, the app background, optional
 * scrolling with pull-to-refresh, and — on screens wider than a phone — caps
 * and centres the content so an iPad does not stretch a phone layout across
 * thirteen inches. Keeps every screen visually consistent.
 */
export function Screen({
  children,
  scroll,
  padded = true,
  edges = ['top', 'bottom', 'left', 'right'],
  style,
  contentStyle,
  refreshing,
  onRefresh,
  footer,
}: ScreenProps) {
  const { width } = useWindowDimensions();
  const maxWidth = contentMaxWidth(width);
  const pad: ViewStyle = padded ? { padding: spacing.lg, gap: spacing.md } : {};
  // `undefined` below the breakpoint leaves the phone layout untouched.
  const constrain: ViewStyle = maxWidth ? { maxWidth, width: '100%', alignSelf: 'center' } : {};
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[pad, { flexGrow: 1 }, constrain, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad, constrain, contentStyle]}>{children}</View>
      )}
      {footer ? (
        <View style={[{ padding: spacing.lg, paddingTop: spacing.sm }, constrain]}>{footer}</View>
      ) : null}
    </SafeAreaView>
  );
}
