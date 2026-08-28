'use client';

import { useEffect, useRef, useState } from 'react';
import type { RecognizedItem } from '@kitchen/contracts';
import { PhotoUploadError, uploadPhotos } from '@kitchen/api-client';
import { useLocale } from '../../lib/locale';
import { useCamera } from '../../hooks/camera';
import { usePresignUpload, useRecognize } from '../../hooks/capture';
import { webPhotoUploader } from '../../lib/photo-uploader';
import { encodeResized, type EncodeSource } from '../../lib/image-encode';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { ErrorState } from '../ui/states';
import { CameraIcon } from '../ui/icons';

type LocationHint = 'fridge' | 'freezer' | 'pantry' | 'spice_rack';
const LOCATIONS: { hint: LocationHint; key: 'fridge' | 'freezer' | 'pantry' | 'spiceRack' }[] = [
  { hint: 'fridge', key: 'fridge' },
  { hint: 'freezer', key: 'freezer' },
  { hint: 'pantry', key: 'pantry' },
  { hint: 'spice_rack', key: 'spiceRack' },
];

const MAX_PHOTOS = 10;

type Shot = { id: string; blob: Blob; url: string };

export function PhotoCapture({
  onItems,
  encode = encodeResized,
}: {
  onItems: (items: RecognizedItem[]) => void;
  encode?: (source: EncodeSource) => Promise<Blob>;
}) {
  const { t } = useLocale();
  const camera = useCamera();
  const presign = usePresignUpload();
  const recognize = useRecognize();

  const [location, setLocation] = useState<LocationHint | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [empty, setEmpty] = useState(false);
  const idRef = useRef(0);

  const busy = presign.isPending || uploading || recognize.isPending;

  // Revoke every object URL on unmount so retakes don't leak blobs.
  useEffect(
    () => () => {
      shots.forEach((shot) => URL.revokeObjectURL(shot.url));
    },
    [shots],
  );

  const addBlob = (blob: Blob) =>
    setShots((prev) =>
      prev.length >= MAX_PHOTOS
        ? prev
        : [...prev, { id: `s${idRef.current++}`, blob, url: URL.createObjectURL(blob) }],
    );

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const room = MAX_PHOTOS - shots.length;
    for (const file of Array.from(files).slice(0, room)) {
      addBlob(await encode(file));
    }
  };

  const removeShot = (id: string) =>
    setShots((prev) => {
      const gone = prev.find((s) => s.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((s) => s.id !== id);
    });

  const submit = async () => {
    if (busy || shots.length === 0) return;
    setFailed(false);
    setEmpty(false);
    setUploading(true);
    try {
      const keys = await uploadPhotos(
        shots.map((s) => s.blob),
        (contentLength) =>
          presign.mutateAsync({
            contentType: 'image/jpeg',
            contentLength,
            purpose: 'inventory_photo',
          }),
        webPhotoUploader,
      );
      const session = await recognize.mutateAsync({
        photoKeys: keys,
        locationHint: location ?? undefined,
      });
      if (session.items.length === 0) {
        setEmpty(true);
        return;
      }
      onItems(session.items);
    } catch (error) {
      setFailed(error instanceof PhotoUploadError);
      if (!(error instanceof PhotoUploadError)) throw error;
    } finally {
      setUploading(false);
    }
  };

  if (location === null) {
    return (
      <Card className="flex flex-col items-center gap-4 py-10 text-center">
        <CameraIcon className="h-10 w-10 text-muted-foreground" />
        <p className="font-medium">{t('web.capture.locationPrompt')}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {LOCATIONS.map(({ hint, key }) => (
            <Button
              key={hint}
              variant="secondary"
              onClick={() => {
                setLocation(hint);
                void camera.start();
              }}
            >
              {t(`web.capture.location.${key}`)}
            </Button>
          ))}
        </div>
      </Card>
    );
  }

  if (empty) {
    return (
      <Card className="flex flex-col items-center gap-4 py-10 text-center">
        <p className="font-medium">{t('web.capture.nothingRecognised')}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEmpty(false)}>
            {t('web.capture.retake')}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col items-center gap-4 py-6 text-center">
      {camera.state === 'ready' ? (
        <>
          <video
            ref={camera.videoRef}
            autoPlay
            muted
            playsInline
            className="w-full max-w-md rounded-2xl"
          />
          <Button
            variant="secondary"
            onClick={() =>
              void (async () => {
                const el = camera.videoRef.current;
                if (el) addBlob(await encode(el));
              })()
            }
          >
            {t('web.capture.shutter')}
          </Button>
        </>
      ) : null}

      {/* File input is always available and is the sole path when the camera is
          denied or unavailable. `capture` opens the camera on mobile browsers. */}
      <label className="cursor-pointer text-sm text-primary-text underline">
        {camera.state === 'denied' ? t('web.capture.denied') : t('web.capture.useFile')}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          onChange={(e) => void onFiles(e.target.files)}
        />
      </label>

      {shots.length > 0 ? (
        <>
          <div className="flex flex-wrap justify-center gap-2">
            {shots.map((shot, i) => (
              <button
                key={shot.id}
                type="button"
                onClick={() => removeShot(shot.id)}
                className="relative"
                aria-label={t('web.capture.retake')}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={shot.url}
                  alt={`photo ${i + 1}`}
                  className="h-16 w-16 rounded-lg object-cover"
                />
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {t('web.capture.photoCount', { count: shots.length })}
          </p>
        </>
      ) : null}

      {failed ? (
        <p role="alert" className="text-sm text-danger">
          {t('web.capture.uploadFailed')}
        </p>
      ) : null}
      {recognize.isError ? <ErrorState error={recognize.error} /> : null}

      <Button onClick={() => void submit()} disabled={busy || shots.length === 0}>
        {busy ? t('capture.scanning') : t('web.capture.analyze')}
      </Button>
    </Card>
  );
}
