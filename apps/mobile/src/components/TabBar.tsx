import { useEffect, useState } from 'react';
import {
  Animated,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { usePressFeedback } from './press-feedback';
import {
  TAB_BAR_HEIGHT,
  TAB_BAR_HORIZONTAL_PADDING,
  TAB_BAR_SIDE_INSET,
  TAB_BAR_TOP_PADDING,
  splitTabs,
  tabBarBottom,
  tabBarClearance,
} from '../lib/tab-bar';
import { contentMaxWidth } from '../theme/layout';
import { useTheme } from '../theme/useTheme';

interface TabRoute {
  key: string;
  name: string;
}

interface TabDescriptor {
  options: {
    title?: string;
    tabBarIcon?: (props: { color: string; size: number; focused: boolean }) => React.ReactNode;
  };
}

export interface TabBarProps {
  state: { index: number; routes: TabRoute[] };
  descriptors: Record<string, TabDescriptor>;
  navigation: {
    navigate: (name: string) => void;
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
  };
  /** Fired by the centre action; routed by the caller, not by the tab state. */
  onCapture: () => void;
  captureLabel: string;
}

const SCAN_KEY_WIDTH = 52;
const SCAN_KEY_HEIGHT = 40;
const ACTIVE_MARKER_SIZE = 4;
const TABLET_LABEL_BREAKPOINT = 600;

/** The bottom padding a tab screen's scroll content needs to clear the bar. */
export function useTabBarClearance(): number {
  return tabBarClearance(useSafeAreaInsets().bottom);
}

function useAndroidKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

interface TabBarSlotProps {
  route: TabRoute;
  focused: boolean;
  descriptor: TabDescriptor;
  navigation: TabBarProps['navigation'];
  showLabel: boolean;
}

function TabBarSlot({ route, focused, descriptor, navigation, showLabel }: TabBarSlotProps) {
  const { colors } = useTheme();
  const pressFeedback = usePressFeedback();
  const color = focused ? colors.primary : colors.text;
  const { options } = descriptor;

  const onPress = () => {
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
  };

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={options.title}
      onPress={onPress}
      {...pressFeedback.pressHandlers}
      style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View style={[{ alignItems: 'center', gap: 5 }, pressFeedback.animatedStyle]}>
        {options.tabBarIcon?.({ color, size: 24, focused })}
        {focused ? (
          <View
            style={{
              width: ACTIVE_MARKER_SIZE,
              height: ACTIVE_MARKER_SIZE,
              backgroundColor: colors.primary,
            }}
          />
        ) : showLabel ? (
          <View style={{ height: ACTIVE_MARKER_SIZE }} />
        ) : null}
        {showLabel ? (
          <AppText variant="tab" style={{ color }}>
            {options.title}
          </AppText>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

function CaptureSlot({ onCapture, captureLabel }: { onCapture: () => void; captureLabel: string }) {
  const { colors } = useTheme();
  const pressFeedback = usePressFeedback();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={captureLabel}
      onPress={onCapture}
      {...pressFeedback.pressHandlers}
      style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View
        style={[
          {
            width: SCAN_KEY_WIDTH,
            height: SCAN_KEY_HEIGHT,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          },
          pressFeedback.animatedStyle,
        ]}
      >
        <Icon name="scan" size={22} color={colors.onFill} />
      </Animated.View>
    </Pressable>
  );
}

export function TabBar({ state, descriptors, navigation, onCapture, captureLabel }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const keyboardVisible = useAndroidKeyboardVisible();
  const showLabel = width >= TABLET_LABEL_BREAKPOINT;

  if (keyboardVisible) return null;
  const tabs = state.routes.map((route, index) => (
    <TabBarSlot
      key={route.key}
      route={route}
      focused={state.index === index}
      descriptor={descriptors[route.key]!}
      navigation={navigation}
      showLabel={showLabel}
    />
  ));
  const { leading, trailing } = splitTabs(tabs);

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        bottom: tabBarBottom(insets.bottom),
        start: TAB_BAR_SIDE_INSET,
        end: TAB_BAR_SIDE_INSET,
        backgroundColor: colors.bg,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: contentMaxWidth(width),
          minHeight: TAB_BAR_HEIGHT + insets.bottom,
          flexDirection: 'row',
          alignItems: 'flex-start',
          paddingTop: TAB_BAR_TOP_PADDING,
          paddingHorizontal: TAB_BAR_HORIZONTAL_PADDING,
          paddingBottom: insets.bottom,
        }}
      >
        {leading}
        <CaptureSlot captureLabel={captureLabel} onCapture={onCapture} />
        {trailing}
      </View>
    </View>
  );
}
