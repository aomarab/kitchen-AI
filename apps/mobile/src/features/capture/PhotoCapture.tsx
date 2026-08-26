import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'react-native';
import { CameraView } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { AppText, Button, Icon } from '../../components';
import { CameraGate } from './CameraGate';
import { useFormat } from '../../hooks/useFormat';
import { usePresignUpload, useRecognizePhotos, useParseReceipt } from '../../hooks/capture';
import { useJob, isTerminal } from '../../hooks/job';
import { api } from '../../lib/api';
import { expoPhotoUploader } from '../../lib/photo-uploader';
import { uploadPhotos } from '../../lib/upload';
import { resizeForUpload } from '../../lib/image';
import { useCaptureStore, type CaptureSource } from '../../stores/capture';
import { colors, radius, spacing } from '../../theme';

/**
 * Photo / receipt capture. Take one or more shots (or pick from the library),
 * upload them for a presigned key, then run recognition. The result is stored
 * and the user is sent to the review screen — nothing is written to inventory
 * here.
 */
export function PhotoCapture({ mode }: { mode: CaptureSource }) {
  const { t } = useFormat();
  const router = useRouter();
  const setSession = useCaptureStore((state) => state.setSession);
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [photos, setPhotos] = useState<string[]>([]);

  const presign = usePresignUpload();
  const recognize = useRecognizePhotos();
  const parseReceipt = useParseReceipt();
  const [jobId, setJobId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
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

  useEffect(() => {
    if (mode !== 'receipt' || job.data?.status !== 'done' || !job.data.resultRef) return;
    const id = job.data.resultRef.id;
    void api.call('getRecognitionSession', { params: { id } }).then((session) => {
      setSession(session, 'receipt');
      router.replace('/capture/review');
    });
  }, [job.data, mode, router, setSession]);

  const addPhoto = (uri: string) => setPhotos((prev) => [...prev, uri]);

  const takePhoto = async () => {
    const shot = await cameraRef.current?.takePictureAsync({ quality: 0.6 });
    if (shot?.uri) addPhoto(await resizeForUpload(shot.uri, shot.width, shot.height));
  };

  const pickLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      allowsMultipleSelection: mode === 'photo',
    });
    if (result.canceled) return;
    const resized = await Promise.all(
      result.assets.map((asset) => resizeForUpload(asset.uri, asset.width, asset.height)),
    );
    resized.forEach(addPhoto);
  };

  const uploadKeys = () =>
    uploadPhotos(
      photos,
      (contentLength) =>
        presign.mutateAsync({
          contentType: 'image/jpeg',
          contentLength,
          purpose: mode === 'receipt' ? 'receipt' : 'inventory_photo',
        }),
      expoPhotoUploader,
    );

  const submit = async () => {
    if (busy) return;
    setFailed(false);
    setUploading(true);
    try {
      const keys = await uploadKeys();
      if (mode === 'receipt') {
        const started = await parseReceipt.mutateAsync({ photoKeys: keys.slice(0, 5) });
        setJobId(started.id);
        return;
      }
      const session = await recognize.mutateAsync({ photoKeys: keys.slice(0, 10) });
      setSession(session, 'photo');
      router.replace('/capture/review');
    } catch {
      // Uploading or recognising can fail for reasons the user can act on
      // (no signal, storage rejected the photo). Silently returning to the
      // camera looks like the button simply did nothing.
      setFailed(true);
    } finally {
      setUploading(false);
    }
  };

  if (busy) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md }}>
        <Icon name="camera" size={40} />
        <AppText muted>
          {mode === 'receipt' ? t('capture.parsingReceipt') : t('mobile.capture.recognizing')}
        </AppText>
      </View>
    );
  }

  return (
    <CameraGate>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, borderRadius: radius.lg, overflow: 'hidden', margin: spacing.lg }}>
          <CameraView ref={cameraRef} style={{ flex: 1 }} facing={facing} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('mobile.capture.flip')}
            onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
            style={{
              position: 'absolute',
              top: spacing.md,
              end: spacing.md,
              backgroundColor: colors.overlay,
              borderRadius: radius.pill,
              padding: spacing.sm,
            }}
          >
            <Icon name="camera" size={20} color={colors.textInverse} />
          </Pressable>
        </View>

        <AppText variant="caption" muted center>
          {mode === 'receipt' ? t('mobile.capture.receiptHint') : t('mobile.capture.captureHint')}
        </AppText>

        {failed ? (
          <AppText variant="caption" center style={{ color: colors.danger }}>
            {t('mobile.capture.uploadFailed')}
          </AppText>
        ) : null}

        {photos.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, padding: spacing.lg }}
          >
            {photos.map((uri) => (
              <Image
                key={uri}
                source={{ uri }}
                style={{ width: 64, height: 64, borderRadius: radius.md }}
              />
            ))}
          </ScrollView>
        ) : null}

        <View style={{ padding: spacing.lg, gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              title={t('capture.takePhoto')}
              icon="camera"
              onPress={() => void takePhoto()}
              style={{ flex: 1 }}
            />
            <Button
              title={t('mobile.capture.fromLibrary')}
              variant="secondary"
              onPress={() => void pickLibrary()}
              style={{ flex: 1 }}
            />
          </View>
          <Button
            title={
              photos.length > 0
                ? t('mobile.capture.photosCount', { count: photos.length })
                : t('mobile.capture.usePhoto')
            }
            icon="check"
            disabled={photos.length === 0 || busy}
            onPress={() => void submit()}
          />
        </View>
      </View>
    </CameraGate>
  );
}
