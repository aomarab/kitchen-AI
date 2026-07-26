import { Tabs, useRouter } from 'expo-router';
import { View } from 'react-native';
import { Icon, Fab } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { colors } from '../../theme';

/**
 * Dashboard-first bottom navigation (spec §6.1): Home · Kitchen · Plans · More,
 * with a floating camera FAB that opens the capture flow. Shopping, household
 * and settings live under More.
 */
export default function TabsLayout() {
  const { t } = useFormat();
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: t('mobile.tabs.home'),
            tabBarIcon: ({ color }) => <Icon name="home" color={color} size={22} />,
          }}
        />
        <Tabs.Screen
          name="kitchen"
          options={{
            title: t('mobile.tabs.kitchen'),
            tabBarIcon: ({ color }) => <Icon name="kitchen" color={color} size={22} />,
          }}
        />
        <Tabs.Screen
          name="plans"
          options={{
            title: t('mobile.tabs.plans'),
            tabBarIcon: ({ color }) => <Icon name="plans" color={color} size={22} />,
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: t('mobile.tabs.more'),
            tabBarIcon: ({ color }) => <Icon name="more" color={color} size={22} />,
          }}
        />
      </Tabs>

      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', bottom: 34, start: 0, end: 0, alignItems: 'center' }}
      >
        <Fab
          icon="camera"
          accessibilityLabel={t('capture.title')}
          onPress={() => router.push('/capture')}
        />
      </View>
    </View>
  );
}
