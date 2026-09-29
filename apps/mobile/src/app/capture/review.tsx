import { useCallback, useEffect, useRef } from 'react';
import { ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type {
  InventoryItemInput,
  InventorySource,
  RecognitionSession,
  StorageLocation,
} from '@kitchen/contracts';
import { Screen, Header, EmptyState, LoadingState, ErrorState, Button } from '../../components';
import { ReviewFooter, ReviewList, useReviewListState } from '../../features/capture/ReviewList';
import { useFormat } from '../../hooks/useFormat';
import { useLocations, useBulkCreateInventory } from '../../hooks/inventory';
import { useReduceMotion } from '../../hooks/motion';
import { spacing } from '../../theme';
import { useCaptureStore } from '../../stores/capture';
import { useToastStore } from '../../stores/toast';

function retakeMethod(source: InventorySource): 'photo' | 'receipt' {
  return source === 'receipt' ? 'receipt' : 'photo';
}

function ReviewReady({
  session,
  source,
  locations,
  submitting,
  onConfirm,
}: {
  session: RecognitionSession;
  source: InventorySource;
  locations: StorageLocation[];
  submitting?: boolean;
  onConfirm: (items: InventoryItemInput[]) => void;
}) {
  const params = useLocalSearchParams<{ focus?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const scrolledFocus = useRef<string | null>(null);
  const reduceMotion = useReduceMotion();
  const focus = typeof params.focus === 'string' ? params.focus : undefined;
  const review = useReviewListState({ session, source, locations, onConfirm });

  useEffect(() => {
    scrolledFocus.current = null;
  }, [focus]);

  const onTileLayout = useCallback(
    (tempId: string, _index: number, y: number) => {
      if (!focus || tempId !== focus || scrolledFocus.current === focus) return;
      scrolledFocus.current = focus;
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing.md), animated: !reduceMotion });
      });
    },
    [focus, reduceMotion],
  );

  return (
    <Screen footer={<ReviewFooter state={review} submitting={submitting} />}>
      <ReviewHeader source={source} />
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.lg }}
      >
        <ReviewList
          session={session}
          source={source}
          locations={locations}
          submitting={submitting}
          onConfirm={onConfirm}
          footer="none"
          editPresentation="sheet"
          state={review}
          focus={focus}
          onTileLayout={onTileLayout}
        />
      </ScrollView>
    </Screen>
  );
}

function ReviewHeader({ source }: { source: InventorySource }) {
  const { t } = useFormat();
  const router = useRouter();
  const reset = useCaptureStore((state) => state.reset);
  return (
    <Header
      title={t('capture.reviewTitle')}
      onBack={() => router.back()}
      trailing={
        <Button
          title={t('mobile.review.retake')}
          variant="ghost"
          fullWidth={false}
          onPress={() => {
            const method = retakeMethod(source);
            reset();
            router.replace({ pathname: '/capture', params: { method } });
          }}
        />
      }
    />
  );
}

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
          illustration="camera"
          title={t('capture.nothingFound')}
          actionLabel={t('capture.title')}
          onAction={() => router.replace('/capture')}
        />
      </Screen>
    );
  }

  if (locations.isLoading) {
    return (
      <Screen>
        <ReviewHeader source={source} />
        <LoadingState />
      </Screen>
    );
  }

  if (locations.isError) {
    return (
      <Screen>
        <ReviewHeader source={source} />
        <ErrorState error={locations.error} onRetry={() => void locations.refetch()} />
      </Screen>
    );
  }

  return (
    <ReviewReady
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
              const count = items.length;
              reset();
              router.replace('/kitchen');
              useToastStore.getState().show({
                message: t('mobile.capture.addedToast', { count }),
                actionLabel: t('mobile.capture.reviewAdded'),
                onAction: () =>
                  router.push({ pathname: '/kitchen', params: { section: 'justAdded' } }),
              });
            },
          },
        );
      }}
    />
  );
}
