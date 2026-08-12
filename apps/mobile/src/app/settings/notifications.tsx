import { useRouter } from 'expo-router';
import { Screen, Header } from '../../components';
import { useLocale } from '../../lib/locale';
import { NotificationSettings } from '../../features/settings/NotificationSettings';

/**
 * Reminders have a screen of their own, reached from More.
 *
 * They were a card buried under Settings, below language and appearance,
 * which is a long way to scroll for the one feature people go looking for
 * when the app buzzes — or when it doesn't.
 */
export default function NotificationsScreen() {
  const { t } = useLocale();
  const router = useRouter();

  return (
    <Screen scroll>
      <Header title={t('mobile.settings.notifications')} onBack={() => router.back()} />
      <NotificationSettings />
    </Screen>
  );
}
