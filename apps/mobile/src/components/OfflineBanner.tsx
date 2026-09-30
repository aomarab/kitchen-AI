import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner } from './Banner';
import { useLocale } from '../lib/locale';
import { useConnectivity } from '../stores/connectivity';
import { useOfflineQueue } from '../stores/offline-queue';
import { useOwnedQueue } from '../hooks/owned-queue';

export function OfflineBanner() {
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const online = useConnectivity((state) => state.online);
  const pending = useOwnedQueue(useOfflineQueue((state) => state.events)).length;
  if (online) return null;

  const message =
    pending > 0
      ? `${t('mobile.sync.offlineBanner')} · ${t('mobile.sync.pendingSync', { count: pending })}`
      : t('mobile.sync.offlineBanner');

  return (
    <Banner
      accessibilityRole="alert"
      icon="wifiOff"
      iconColor="danger"
      message={message}
      topInset={insets.top}
    />
  );
}
