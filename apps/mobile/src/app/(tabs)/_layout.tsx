import { Tabs, useRouter } from 'expo-router';
import { Icon, TabBar } from '../../components';
import { useFormat } from '../../hooks/useFormat';

/**
 * Bottom navigation (spec §4.1): Home · Kitchen · [camera] · Plan · Shop. The
 * camera in the centre opens the photo flow. Household, credits, the kitchen
 * tools and settings live on Account, behind the avatar in every tab header.
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
          tabBarIcon: ({ color }) => <Icon name="fridge" color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: t('mobile.tabs.plan'),
          tabBarIcon: ({ color }) => <Icon name="calendar" color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="shopping"
        options={{
          title: t('mobile.tabs.shop'),
          tabBarIcon: ({ color }) => <Icon name="bag" color={color} size={22} />,
        }}
      />
    </Tabs>
  );
}
