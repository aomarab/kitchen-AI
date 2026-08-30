import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  useWindowDimensions,
  type ViewStyle,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { spacing } from '../theme';
import { contentMaxWidth } from '../theme/layout';
import { useTheme } from '../theme/useTheme';

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
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const maxWidth = contentMaxWidth(width);
  // `lg` between top-level blocks against the `sm` most screens use inside a
  // section gives a real 2:1 rhythm tier. At the previous `md` the gap between
  // two sections was 12 and the gap inside one was 8, so nothing grouped and
  // every screen read as one undifferentiated stack.
  const pad: ViewStyle = padded ? { padding: spacing.lg, gap: spacing.lg } : {};
  // `undefined` below the breakpoint leaves the phone layout untouched. Above
  // it the content is capped and centred — but the centring is applied to a
  // *wrapper* (`alignItems: 'center'`) around a max-width child, not to the
  // child itself. Under the root view's `direction: 'rtl'` (Arabic tablets),
  // `alignSelf: 'center'`, auto margins and numeric margins on a ScrollView
  // content container all collapse the block to one edge; wrapper centring is
  // the only form that stays centred in both directions (spec §4.3).
  const centering: ViewStyle = maxWidth ? { alignItems: 'center' } : {};
  const block: ViewStyle = maxWidth ? { width: '100%', maxWidth } : { width: '100%' };
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        // Expo sets Android's softwareKeyboardLayoutMode to "resize", so Android
        // already shrinks the window for the keyboard. Adding a behavior on top
        // of that double-adjusts and pushes content off-screen.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scroll ? (
          <ScrollView
            contentContainerStyle={[{ flexGrow: 1 }, centering]}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              onRefresh ? (
                <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} />
              ) : undefined
            }
          >
            <View style={[{ flexGrow: 1 }, pad, block, contentStyle]}>{children}</View>
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, centering]}>
            <View style={[{ flex: 1 }, pad, block, contentStyle]}>{children}</View>
          </View>
        )}
        {footer ? (
          <View style={centering}>
            <View style={[{ padding: spacing.lg, paddingTop: spacing.sm }, block]}>{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
