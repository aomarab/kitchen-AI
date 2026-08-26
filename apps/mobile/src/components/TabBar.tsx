import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Fab } from './Fab';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

/**
 * The slice of React Navigation's tab bar props this bar actually uses.
 *
 * `@react-navigation/bottom-tabs` reaches us transitively through expo-router
 * and is not a declared dependency, so importing `BottomTabBarProps` from it
 * would bind us to a package we do not control the version of. Describing the
 * shape structurally keeps the contract explicit and the import graph honest.
 */
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

/**
 * Bottom navigation with a centre capture action (spec §6.1).
 *
 * The capture button gets a real column of its own. Previously it was an
 * absolutely positioned FAB laid over a four-tab bar, which put it exactly on
 * the seam between the two middle tabs and covered about a third of each of
 * their touch targets, so taps near the circle landed unpredictably.
 *
 * Direction is never hard-coded: the row mirrors itself under RTL, so the
 * capture action stays centred and the tabs reverse with the writing system.
 */
export function TabBar({ state, descriptors, navigation, onCapture, captureLabel }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const middle = Math.floor(state.routes.length / 2);

  const renderTab = (route: TabRoute, index: number) => {
    const { options } = descriptors[route.key]!;
    const focused = state.index === index;
    const color = focused ? colors.primaryText : colors.textMuted;

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
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={options.title}
        onPress={onPress}
        style={{
          flex: 1,
          minHeight: 44,
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xs,
        }}
      >
        {options.tabBarIcon?.({ color, size: 22, focused })}
        <AppText variant="caption" style={{ color }}>
          {options.title}
        </AppText>
      </Pressable>
    );
  };

  const tabs = state.routes.map(renderTab);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: spacing.md,
        // The gesture indicator is a device fact, not a constant. Falling back
        // to `sm` keeps the bar off the very edge on hardware with no inset.
        paddingBottom: Math.max(insets.bottom, spacing.sm),
      }}
    >
      {tabs.slice(0, middle)}

      <View style={{ flex: 1, alignItems: 'center' }}>
        <Fab icon="camera" accessibilityLabel={captureLabel} onPress={onCapture} />
      </View>

      {tabs.slice(middle)}
    </View>
  );
}
