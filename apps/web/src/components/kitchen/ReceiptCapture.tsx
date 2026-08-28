'use client';

import { useEffect, useRef, useState } from 'react';
import type { Job } from '@kitchen/contracts';
import { uploadPhotos } from '@kitchen/api-client';
import { useLocale } from '../../lib/locale';
import { usePresignUpload, useParseReceipt } from '../../hooks/capture';
import { webPhotoUploader } from '../../lib/photo-uploader';
import { encodeResized, type EncodeSource } from '../../lib/image-encode';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { LoadingState, ErrorState } from '../ui/states';
import { ReceiptIcon } from '../ui/icons';

// Receipt parsing bills per image just like vision recognition, so the strip is
// capped. This mirrors the contract's `parseReceiptRequestSchema.max(5)` and
// mobile's `MAX_RECEIPT_PHOTOS`; the server rejects a longer list either way.
const MAX_RECEIPT_PHOTOS = 5;

type Shot = { id: string; blob: Blob; url: string };

export function ReceiptCapture({
  job,
  onStart,
  pending,
  encode = encodeResized,
}: {
  job: Job | undefined;
  onStart: (jobId: string) => void;
  pending: boolean;
  encode?: (source: EncodeSource) => Promise<Blob>;
}) {
  const { t } = useLocale();
  const presign = usePresignUpload();
  const parse = useParseReceipt();

  const [shots, setShots] = useState<Shot[]>([]);
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);
  const idRef = useRef(0);
  const submittingRef = useRef(false);

  const busy = pending || parse.isPending || uploading;

  // Revoke object URLs only on unmount. `removeShot` already revokes a URL the
  // instant its thumbnail leaves the strip, so this must NOT depend on `shots`:
  // a `[shots]` dependency runs the *previous* render's cleanup on every add and
  // would revoke URLs still shown by the surviving thumbnails. A ref holds the
  // live list so the unmount cleanup sees the final set without re-subscribing.
  const shotsRef = useRef<Shot[]>([]);
  shotsRef.current = shots;
  useEffect(
    () => () => {
      shotsRef.current.forEach((shot) => URL.revokeObjectURL(shot.url));
    },
    [],
  );

  const addBlob = (blob: Blob) =>
    setShots((prev) =>
      prev.length >= MAX_RECEIPT_PHOTOS
        ? prev
        : [...prev, { id: `s${idRef.current++}`, blob, url: URL.createObjectURL(blob) }],
    );

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const room = MAX_RECEIPT_PHOTOS - shots.length;
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
    // `busy` is derived from render state, which a second synchronous click sees
    // stale (React has not committed `setUploading(true)` yet). A ref guards the
    // pipeline synchronously so a double-click presigns and parses exactly once.
    if (submittingRef.current || shots.length === 0) return;
    submittingRef.current = true;
    setFailed(false);
    setUploading(true);
    try {
      let keys: string[];
      try {
        keys = await uploadPhotos(
          shots.map((s) => s.blob),
          (contentLength) =>
            presign.mutateAsync({
              contentType: 'image/jpeg',
              contentLength,
              purpose: 'receipt',
            }),
          webPhotoUploader,
        );
      } catch {
        // Any upload-phase failure shows the upload error: an unreadable blob or
        // a non-2xx PUT arrives as PhotoUploadError, but a rejected presign is a
        // raw API/network error, so catch everything here rather than narrowing.
        setFailed(true);
        return;
      }
      const started = await parse.mutateAsync(keys);
      onStart(started.id);
    } catch {
      // A parse-enqueue failure is surfaced by `parse.isError` in the render
      // (and a later job failure by the job's `failed` status in the container).
      // Swallow it here so a floating `void submit()` never becomes an unhandled
      // rejection.
    } finally {
      submittingRef.current = false;
      setUploading(false);
    }
  };

  if (busy) {
    return (
      <Card className="flex flex-col items-center gap-4 py-10 text-center">
        <LoadingState label={t('capture.parsingReceipt')} />
      </Card>
    );
  }

  return (
    <Card className="flex flex-col items-center gap-4 border-dashed py-10 text-center">
      <ReceiptIcon className="h-10 w-10 text-muted-foreground" />
      <p className="font-medium">{t('web.capture.receiptCta')}</p>

      {/* `capture` opens the camera on mobile browsers; on desktop it is a file
          picker. A receipt is a flat document, so no live preview is needed. */}
      <label className="cursor-pointer text-sm text-primary-text underline">
        {t('web.capture.receiptPick')}
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
                alt={`receipt ${i + 1}`}
                className="h-16 w-16 rounded-lg object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}

      {failed ? (
        <p role="alert" className="text-sm text-danger">
          {t('web.capture.uploadFailed')}
        </p>
      ) : null}
      {parse.isError ? <ErrorState error={parse.error} /> : null}
      {job?.status === 'failed' ? (
        <ErrorState error={{ code: 'JOB_FAILED', messageKey: 'errors.JOB_FAILED' }} />
      ) : null}

      <Button onClick={() => void submit()} disabled={shots.length === 0}>
        {t('web.capture.readReceipt')}
      </Button>
    </Card>
  );
}
