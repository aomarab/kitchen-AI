import { useRouter } from 'expo-router';
import { Screen, Header, EmptyState, LoadingState, ErrorState } from '../../components';
import { ReviewList } from '../../features/capture/ReviewList';
import { useFormat } from '../../hooks/useFormat';
import { useLocations, useBulkCreateInventory } from '../../hooks/inventory';
import { useCaptureStore } from '../../stores/capture';

/**
 * AI review list. The recognition session is read from the capture store and
 * only committed to inventory when the user confirms — this screen is the single
 * place where reviewed rows become inventory (spec §5.1).
 */
export default function CaptureReview() {
  const { t } = useFormat();
  const router = useRouter();
  const session = useCaptureStore((state) => state.session);
  const source = useCaptureStore((state) => state.source);
  const reset = useCaptureStore((state) => state.reset);
  const locations = useLocations();
  const create = useBulkCreateInventory();

  if (!session) {
    return (
      <Screen>
        <Header title={t('capture.reviewTitle')} onBack={() => router.back()} />
        <EmptyState
          icon="camera"
          title={t('capture.nothingFound')}
          actionLabel={t('capture.title')}
          onAction={() => router.replace('/capture')}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Header title={t('capture.reviewTitle')} onBack={() => router.back()} />
      {locations.isLoading ? (
        <LoadingState />
      ) : locations.isError ? (
        <ErrorState error={locations.error} onRetry={() => void locations.refetch()} />
      ) : (
        <ReviewList
          session={session}
          source={source}
          locations={locations.data ?? []}
          submitting={create.isPending}
          onConfirm={(items) => {
            if (items.length === 0) return;
            create.mutate(
              { items },
              {
                onSuccess: () => {
                  reset();
                  router.replace('/kitchen');
                },
              },
            );
          }}
        />
      )}
    </Screen>
  );
}
