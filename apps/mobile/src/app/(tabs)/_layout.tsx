import { Tabs, useRouter } from 'expo-router';
import { Icon, TabBar } from '../../components';
import { useFormat } from '../../hooks/useFormat';

/**
 * Dashboard-first bottom navigation (spec §6.1): Home · Kitchen · Plans · More,
 * with a capture action in the centre that opens the photo flow. Shopping,
 * household and settings live under More.
 *
 * The bar is rendered by `TabBar` rather than React Navigation's default so the
 * capture action can hold a column of its own. As an overlay it sat on the seam
 * between the two middle tabs and covered part of both of their touch targets.
 */
export default function TabsLayout() {
  const { t } = useFormat();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <TabBar
          {...props}
          captureLabel={t('mobile.tabs.capture')}
          onCapture={() => router.push('/capture')}
        />
      )}
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
  );
}
