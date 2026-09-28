import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner } from './Banner';
import { useLocale } from '../lib/locale';
import { useConnectivity } from '../stores/connectivity';
import { useOfflineQueue } from '../stores/offline-queue';
import { useOwnedQueue } from '../hooks/owned-queue';

export function SyncFailuresBanner() {
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const online = useConnectivity((state) => state.online);
  const rejected = useOwnedQueue(useOfflineQueue((state) => state.rejected));
  const dismissRejected = useOfflineQueue((state) => state.dismissRejected);
  if (rejected.length === 0) return null;

  const dismissAll = () => {
    for (const item of rejected) dismissRejected(item.event.clientEventId);
  };

  const reasonKeys = rejected.map((item) => t(`mobile.sync.reasons.${item.reason}`));

  return (
    <Banner
      accessibilityRole="alert"
      accessibilityLabel={reasonKeys.join(' ')}
      icon="alert"
      iconColor="danger"
      message={t('mobile.sync.failedBanner', { count: rejected.length })}
      actionLabel={t('mobile.sync.dismiss')}
      onAction={dismissAll}
      topInset={online ? insets.top : 0}
    />
  );
}
