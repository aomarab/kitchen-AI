import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { CameraView } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import type { MessageKey } from '@kitchen/i18n';
import type { RecognizedItem } from '@kitchen/contracts';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { AppText, Button, Chip, Icon, RoundButton, Sheet } from '../../components';
import { CameraGate, useCameraAccess } from './CameraGate';
import { CaptureChrome, type CaptureMediaMethod } from './CaptureChrome';
import { MamaBubble } from './MamaBubble';
import { Shutter } from './Shutter';
import { ArPins } from './ArPins';
import { useFormat } from '../../hooks/useFormat';
import { usePresignUpload, useRecognizePhotos, useParseReceipt } from '../../hooks/capture';
import { useBulkCreateInventory, useLocations } from '../../hooks/inventory';
import { useJob, isTerminal } from '../../hooks/job';
import { api } from '../../lib/api';
import { expoPhotoUploader } from '../../lib/photo-uploader';
import { uploadPhotos } from '../../lib/upload';
import { captureErrorKey, isNothingFound } from '../../lib/capture-error';
import { errorMessageKey } from '../../lib/errors';
import {
  buildInventoryInputs,
  canAddAll,
  initialReviewRows,
  isLowConfidence,
  photoForItem,
  zipPhotos,
  type CapturedPhoto,
  type LocalPhoto,
} from '../../lib/capture';
import { buildArPinLabel } from '../../lib/ar-pin-labels';
import { deriveCaptureFlowState } from '../../lib/capture-flow';
import { layoutPins, type PinFrame } from '../../lib/ar-pins';
import { formatMeasure, localizedName } from '../../lib/format';
import { resizeForUpload } from '../../lib/image';
import { useToastStore } from '../../stores/toast';
import { useCaptureStore, type CaptureSource } from '../../stores/capture';
import { maxPhotosFor } from './limits';
import { radius, spacing } from '../../theme';
import { scrimGradient } from '../../theme/scrim';
import { useTheme } from '../../theme/useTheme';

interface PhotoCaptureProps {
  mode: CaptureSource;
  method: CaptureMediaMethod;
  onMethodChange: (method: CaptureMediaMethod) => void;
  onClose: () => void;
}

interface ViewSize {
  width: number;
  height: number;
}

function sizeFrom(event: LayoutChangeEvent): ViewSize {
  const { width, height } = event.nativeEvent.layout;
  return { width, height };
}

function safeSize(size: ViewSize | null): size is ViewSize {
  return !!size && size.width > 0 && size.height > 0;
}

/**
 * Photo / receipt capture. Take one or more shots (or pick from the library),
 * upload them for a presigned key, then run recognition. Results stay on this
 * surface for photo review affordances, and receipt still routes to review.
 */
export function PhotoCapture({ mode, method, onMethodChange, onClose }: PhotoCaptureProps) {
  const { t, locale, dir, prefs } = useFormat();
  const { colors, scrim } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const router = useRouter();
  const setSession = useCaptureStore((state) => state.setSession);
  const session = useCaptureStore((state) => state.session);
  const storePhotos = useCaptureStore((state) => state.photos);
  const resetCapture = useCaptureStore((state) => state.reset);
  const toast = useToastStore((state) => state.show);
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraAccess();
  const cameraGranted = !!cameraPermission?.granted;
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [torch, setTorch] = useState(false);
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [captureError, setCaptureError] = useState(false);
  const [lastError, setLastError] = useState<unknown>(null);
  const [mediaSize, setMediaSize] = useState<ViewSize | null>(null);
  const [topHeight, setTopHeight] = useState(0);
  const [bottomHeight, setBottomHeight] = useState(0);
  const [bubbleHeight, setBubbleHeight] = useState(0);
  const [trayOpen, setTrayOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [addAllError, setAddAllError] = useState<MessageKey | null>(null);
  const maxPhotos = maxPhotosFor(mode);
  const atLimit = photos.length >= maxPhotos;

  const presign = usePresignUpload();
  const recognize = useRecognizePhotos();
  const parseReceipt = useParseReceipt();
  const locations = useLocations();
  const create = useBulkCreateInventory();
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const job = useJob(jobId);

  const jobPending = !!jobId && !isTerminal(job.data);
  /**
   * The bytes going to object storage happen between the presign mutation and
   * the recognise mutation, so no mutation's `isPending` covers them. Without
   * this the spinner drops back to the full camera UI for the whole upload —
   * seconds, on a slow connection — with the submit button live again, and a
   * second tap starts a second presign, upload and recognition: duplicate AI
   * spend and two racing navigations.
   */
  const [uploading, setUploading] = useState(false);
  const busy =
    presign.isPending || uploading || recognize.isPending || parseReceipt.isPending || jobPending;

  const flow = deriveCaptureFlowState({
    mode,
    photoCount: photos.length,
    busy,
    session,
    lastError,
  });

  useEffect(() => {
    if (mode !== 'receipt' || job.data?.status !== 'done' || !job.data.resultRef) return;
    const id = job.data.resultRef.id;
    void api.call('getRecognitionSession', { params: { id } }).then((session) => {
      setSession(session, 'receipt');
      router.replace('/capture/review');
    });
  }, [job.data, mode, router, setSession]);

  const displayPhotos: CapturedPhoto[] = useMemo(
    () =>
      storePhotos.length > 0
        ? storePhotos
        : photos.map((photo, index) => ({ ...photo, photoKey: `local-${index}` })),
    [photos, storePhotos],
  );

  useEffect(() => {
    if (pageIndex >= displayPhotos.length) setPageIndex(0);
  }, [displayPhotos.length, pageIndex]);

  const addPhoto = (photo: LocalPhoto) =>
    setPhotos((prev) => {
      if (prev.length >= maxPhotos) return prev;
      setLastError(null);
      setError(null);
      setCaptureError(false);
      return [...prev, photo];
    });

  const takePhoto = async () => {
    if (!cameraGranted || atLimit || flow === 'result') return;
    setCaptureError(false);
    try {
      const shot = await cameraRef.current?.takePictureAsync({ quality: 0.6 });
      if (shot?.uri) addPhoto(await resizeForUpload(shot.uri, shot.width, shot.height));
    } catch {
      // takePictureAsync rejects when the camera is still warming up, the
      // session was interrupted (a call, another app) or storage is full.
      // Unhandled, the button just looks dead.
      setCaptureError(true);
    }
  };

  const pickLibrary = async () => {
    if (atLimit || flow === 'result') return;
    setCaptureError(false);
    const remaining = maxPhotos - photos.length;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.6,
        allowsMultipleSelection: mode === 'photo' && remaining > 1,
        selectionLimit: remaining,
      });
      // `selectionLimit` is advisory on some Android pickers, so still trim.
      if (!result.canceled) {
        const resized = await Promise.all(
          result.assets
            .slice(0, remaining)
            .map((asset) => resizeForUpload(asset.uri, asset.width, asset.height)),
        );
        resized.forEach(addPhoto);
      }
    } catch {
      setCaptureError(true);
    }
  };

  const removePhoto = (uri: string) => {
    setPhotos((prev) => prev.filter((item) => item.uri !== uri));
    setLastError(null);
    setError(null);
  };

  const retake = () => {
    setPhotos([]);
    setTrayOpen(false);
    setPageIndex(0);
    setJobId(null);
    setLastError(null);
    setError(null);
    setAddAllError(null);
    setCaptureError(false);
    resetCapture();
  };

  const uploadKeys = () =>
    uploadPhotos(
      photos.map((photo) => photo.uri),
      (contentLength) =>
        presign.mutateAsync({
          contentType: 'image/jpeg',
          contentLength,
          purpose: mode === 'receipt' ? 'receipt' : 'inventory_photo',
        }),
      expoPhotoUploader,
    );

  const submit = async () => {
    if (busy || photos.length === 0) return;
    setError(null);
    setLastError(null);
    setAddAllError(null);
    setUploading(true);
    try {
      const keys = await uploadKeys();
      if (mode === 'receipt') {
        const started = await parseReceipt.mutateAsync({ photoKeys: keys });
        setJobId(started.id);
        return;
      }
      const session = await recognize.mutateAsync({ photoKeys: keys });
      setSession(session, 'photo', zipPhotos(photos, keys));
    } catch (error) {
      if (isNothingFound(error)) {
        setLastError(error);
        return;
      }
      // Only `uploadPhotos` can fail to send bytes. Everything after it —
      // recognition refusing for want of credits, the model erroring, the call
      // running past its budget — reached the server, so blaming the upload
      // ("check your connection") points the user at the wrong problem and
      // invites a retry that spends another AI credit.
      setLastError(error);
      setError(captureErrorKey(error));
    } finally {
      setUploading(false);
    }
  };

  const pinFrameFor = (photo: CapturedPhoto): PinFrame | null => {
    if (!safeSize(mediaSize)) return null;
    return {
      width: mediaSize.width,
      height: mediaSize.height,
      imageWidth: photo.width,
      imageHeight: photo.height,
      safeTop: topHeight,
      safeBottom: bottomHeight + bubbleHeight,
    };
  };

  const labelFor = (item: RecognizedItem) => {
    const name = localizedName(locale, item.nameEn, item.nameAr);
    const quantity = formatMeasure(t, locale, item.quantity, item.unit, prefs);
    return buildArPinLabel({
      name,
      quantity,
      lowConfidence: isLowConfidence(item.confidence),
      locale,
      t,
    });
  };

  const itemsForPhoto = (photo: CapturedPhoto) =>
    session?.items.filter(
      (item) => photoForItem(displayPhotos, item)?.photoKey === photo.photoKey,
    ) ?? [];

  const unmappedItems = () =>
    session?.items.filter((item) => photoForItem(displayPhotos, item) === null) ?? [];

  const activePhoto = displayPhotos[pageIndex] ?? displayPhotos[0] ?? null;
  const activePageItems = activePhoto ? itemsForPhoto(activePhoto) : [];
  const activeFrame = activePhoto ? pinFrameFor(activePhoto) : null;
  const trayIds = activeFrame
    ? layoutPins(
        activePageItems.map((item) => ({
          id: item.tempId,
          box: item.box,
          confidence: item.confidence,
          chipWidth: labelFor(item).width,
        })),
        activeFrame,
        dir,
      ).tray
    : activePageItems.map((item) => item.tempId);
  const traySet = new Set([...trayIds, ...unmappedItems().map((item) => item.tempId)]);
  const trayItems = session?.items.filter((item) => traySet.has(item.tempId)) ?? [];
  const addAllAllowed = session ? canAddAll(session, locations.data ?? []) : false;
  const unsureCount = session?.items.filter((item) => isLowConfidence(item.confidence)).length ?? 0;

  const handleAddAll = async () => {
    if (!session || create.isPending || !addAllAllowed) return;
    setAddAllError(null);
    const inputs = buildInventoryInputs(initialReviewRows(session, locations.data ?? []), 'photo');
    try {
      await create.mutateAsync({ items: inputs });
      const count = inputs.length;
      retake();
      router.replace('/kitchen');
      toast({
        message: t('mobile.capture.addedToast', { count }),
        actionLabel: t('mobile.capture.reviewAdded'),
        onAction: () => router.navigate('/kitchen?section=justAdded'),
      });
    } catch (error) {
      setAddAllError(errorMessageKey(error));
    }
  };

  const focusReview = (tempId: string) => {
    router.push(`/capture/review?focus=${encodeURIComponent(tempId)}`);
  };

  const renderGuide = () => {
    if (mode !== 'receipt' || flow !== 'framing') return null;
    return (
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: '80%',
          aspectRatio: 3 / 4,
          maxHeight: '62%',
          alignSelf: 'center',
          top: '19%',
          borderWidth: 2,
          borderColor: colors.textInverse,
          borderRadius: radius.lg,
          opacity: 0.8,
        }}
      />
    );
  };

  const lastLocalPhoto = photos[photos.length - 1] ?? null;

  const renderLiveCamera = () => (
    <View style={{ flex: 1 }} onLayout={(event) => setMediaSize(sizeFrom(event))}>
      <CameraGate
        permission={cameraPermission}
        requestPermission={requestCameraPermission}
        promptStyle={{ paddingTop: topHeight, paddingBottom: bottomHeight }}
      >
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing={facing} enableTorch={torch} />
        {renderGuide()}
      </CameraGate>
    </View>
  );

  const renderStill = (photo: LocalPhoto | null) => (
    <View style={{ flex: 1 }} onLayout={(event) => setMediaSize(sizeFrom(event))}>
      {photo ? <Image source={{ uri: photo.uri }} style={{ flex: 1 }} resizeMode="cover" /> : null}
    </View>
  );

  const renderResultStill = () => {
    if (!session || displayPhotos.length === 0) return renderStill(lastLocalPhoto);
    if (displayPhotos.length === 1) {
      const [photo] = displayPhotos;
      return (
        <View style={{ flex: 1 }} onLayout={(event) => setMediaSize(sizeFrom(event))}>
          <Image source={{ uri: photo!.uri }} style={{ flex: 1 }} resizeMode="cover" />
          <ArPins items={itemsForPhoto(photo!)} frame={pinFrameFor(photo!)} onPress={focusReview} />
        </View>
      );
    }

    return (
      <View style={{ flex: 1 }} onLayout={(event) => setMediaSize(sizeFrom(event))}>
        <ScrollView
          style={{ flex: 1 }}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => {
            const pageWidth = mediaSize?.width ?? windowWidth;
            const page = Math.round(event.nativeEvent.contentOffset.x / Math.max(pageWidth, 1));
            setPageIndex(Math.max(0, Math.min(displayPhotos.length - 1, page)));
          }}
        >
          {displayPhotos.map((photo) => (
            <View
              key={photo.photoKey}
              style={{
                width: mediaSize?.width ?? windowWidth,
                height: mediaSize?.height ?? '100%',
              }}
            >
              <Image source={{ uri: photo.uri }} style={{ flex: 1 }} resizeMode="cover" />
              <ArPins
                items={itemsForPhoto(photo)}
                frame={pinFrameFor(photo)}
                onPress={focusReview}
              />
            </View>
          ))}
        </ScrollView>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: bottomHeight + bubbleHeight + spacing.xxl + spacing.xl,
            start: 0,
            end: 0,
            flexDirection: 'row',
            justifyContent: 'center',
            gap: spacing.xs,
          }}
        >
          {displayPhotos.map((photo, index) => (
            <View
              key={photo.photoKey}
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: index === pageIndex ? colors.textInverse : colors.textInverseMuted,
              }}
            />
          ))}
        </View>
      </View>
    );
  };

  const renderMedia = () => {
    if (flow === 'looking' || flow === 'nothingFound') return renderStill(lastLocalPhoto);
    if (flow === 'result') return renderResultStill();
    return renderLiveCamera();
  };

  const renderHintScrim = () => {
    if ((flow !== 'framing' || !cameraGranted) && flow !== 'result') return null;
    return (
      <LinearGradient
        pointerEvents="none"
        {...scrimGradient(scrim)}
        style={StyleSheet.absoluteFill}
      />
    );
  };

  const renderHint = () => {
    if (flow !== 'framing' || !cameraGranted) return null;
    return (
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          start: spacing.lg,
          end: spacing.lg,
          bottom: bottomHeight + spacing.md,
          alignItems: 'center',
          gap: spacing.xs,
        }}
      >
        <AppText variant="caption" center style={{ color: colors.textInverse }}>
          {mode === 'receipt' ? t('mobile.capture.receiptHint') : t('mobile.capture.captureHint')}
        </AppText>
        {captureError ? (
          <AppText variant="caption" center style={{ color: colors.textInverse }}>
            {t('mobile.capture.captureFailed')}
          </AppText>
        ) : null}
      </View>
    );
  };

  const renderTray = () => {
    if (flow !== 'result' || trayItems.length === 0) return null;
    return (
      <View
        style={{
          position: 'absolute',
          start: spacing.lg,
          end: spacing.lg,
          bottom: bottomHeight + bubbleHeight + spacing.xl,
          gap: spacing.xs,
        }}
      >
        <AppText variant="caption" style={{ color: colors.textInverse }}>
          {t('mobile.capture.alsoSpotted')}
        </AppText>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm }}
        >
          {trayItems.map((item) => {
            const label = labelFor(item);
            return (
              <Chip
                key={item.tempId}
                label={label.text}
                accessibilityLabel={label.accessibilityLabel}
                onPress={() => focusReview(item.tempId)}
              />
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const bubbleMessage = () => {
    if (flow === 'looking') {
      return mode === 'receipt' ? t('capture.parsingReceipt') : t('mobile.capture.recognizing');
    }
    if (flow === 'nothingFound') return t('capture.nothingFound');
    if (flow === 'result' && session) {
      const count = session.items.length;
      const lead = t('mobile.capture.seeCount', { count });
      if (addAllAllowed) return `${lead} ${t('mobile.capture.addThemAll')}`;
      if (unsureCount > 0)
        return `${lead} ${t('mobile.capture.unsureCount', { count: unsureCount })}`;
      return lead;
    }
    return t('mobile.capture.anotherOrLook');
  };

  const renderBubbleActions = () => {
    if (flow === 'looking') return null;
    if (flow === 'nothingFound') {
      return <Button title={t('mobile.capture.retake')} fullWidth={false} onPress={retake} />;
    }
    if (flow === 'result') {
      if (!session) return null;
      if (addAllAllowed) {
        return (
          <>
            <Button
              title={t('mobile.capture.addAll', { count: session.items.length })}
              fullWidth={false}
              loading={create.isPending}
              onPress={() => void handleAddAll()}
            />
            <Button
              title={t('mobile.capture.reviewFirst')}
              variant="soft"
              fullWidth={false}
              onPress={() => router.push('/capture/review')}
            />
          </>
        );
      }
      return (
        <Button
          title={t('mobile.capture.review')}
          fullWidth={false}
          onPress={() => router.push('/capture/review')}
        />
      );
    }
    return (
      <Button title={t('mobile.capture.lookNow')} fullWidth={false} onPress={() => void submit()} />
    );
  };

  const renderBubble = () => {
    if (flow === 'framing') return null;
    const bubbleError =
      error ?? addAllError ?? (captureError ? 'mobile.capture.captureFailed' : null);
    return (
      <View
        onLayout={(event) => setBubbleHeight(event.nativeEvent.layout.height)}
        style={{
          position: 'absolute',
          start: spacing.lg,
          end: spacing.lg,
          bottom: bottomHeight + spacing.md,
        }}
      >
        <MamaBubble
          state={flow === 'looking' ? 'looking' : 'idle'}
          message={bubbleMessage()}
          error={bubbleError ? t(bubbleError) : null}
          actions={renderBubbleActions()}
        />
      </View>
    );
  };

  const renderPhotoTray = () => (
    <Sheet
      visible={trayOpen}
      onClose={() => setTrayOpen(false)}
      title={t('mobile.capture.photosCount', { count: photos.length })}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.md }}
      >
        {photos.map((photo) => (
          <View key={photo.uri} style={{ width: 88, height: 88 }}>
            <Image
              source={{ uri: photo.uri }}
              style={{ width: 88, height: 88, borderRadius: radius.md }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('mobile.capture.removePhoto')}
              onPress={() => removePhoto(photo.uri)}
              style={{
                position: 'absolute',
                top: -spacing.sm,
                end: -spacing.sm,
                width: 44,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.surfaceInverse,
                }}
              >
                <Icon name="close" size={16} color={colors.textInverse} />
              </View>
            </Pressable>
          </View>
        ))}
      </ScrollView>
      <AppText variant="caption" muted>
        {t('mobile.capture.photoLimit', { count: maxPhotos })}
      </AppText>
    </Sheet>
  );

  const trailing =
    flow === 'result' ? (
      <RoundButton
        icon="sync"
        size={40}
        tone="media"
        accessibilityLabel={t('mobile.capture.retake')}
        onPress={retake}
      />
    ) : cameraGranted ? (
      <RoundButton
        icon="flash"
        size={40}
        tone="media"
        accessibilityLabel={torch ? t('mobile.capture.flashOff') : t('mobile.capture.flashOn')}
        accessibilityState={{ checked: torch }}
        onPress={() => setTorch((value) => !value)}
      />
    ) : null;

  const bottom = (
    <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('mobile.capture.fromLibrary')}
          disabled={atLimit || flow === 'result'}
          onPress={() => void pickLibrary()}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: colors.borderInverse,
            backgroundColor: colors.surfaceInverseAlt,
            opacity: atLimit || flow === 'result' ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          {lastLocalPhoto ? (
            <Image source={{ uri: lastLocalPhoto.uri }} style={{ width: 44, height: 44 }} />
          ) : (
            <Icon name="images" size={22} color={colors.textInverse} />
          )}
        </Pressable>
        <Shutter
          count={photos.length}
          accessibilityLabel={t('mobile.capture.shutter')}
          countAccessibilityLabel={t('mobile.capture.openTray', { count: photos.length })}
          disabled={
            !cameraGranted ||
            atLimit ||
            flow === 'result' ||
            flow === 'looking' ||
            flow === 'nothingFound'
          }
          onPress={() => void takePhoto()}
          onOpenTray={() => setTrayOpen(true)}
        />
        <RoundButton
          icon="cameraReverse"
          size={40}
          tone="media"
          accessibilityLabel={t('mobile.capture.flip')}
          disabled={
            !cameraGranted || flow === 'result' || flow === 'looking' || flow === 'nothingFound'
          }
          onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
        />
      </View>
      {atLimit && flow === 'shot' ? (
        <AppText variant="caption" center style={{ color: colors.textInverseMuted }}>
          {t('mobile.capture.photoLimitReached', { count: maxPhotos })}
        </AppText>
      ) : null}
    </View>
  );

  return (
    <CaptureChrome
      method={method}
      onMethodChange={onMethodChange}
      onClose={onClose}
      trailing={trailing}
      bottom={bottom}
      onTopLayout={setTopHeight}
      onBottomLayout={setBottomHeight}
    >
      {renderMedia()}
      {renderHintScrim()}
      {renderHint()}
      {renderTray()}
      {renderBubble()}
      {renderPhotoTray()}
    </CaptureChrome>
  );
}
