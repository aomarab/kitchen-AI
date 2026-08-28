'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RecognizedItem } from '@kitchen/contracts';
import { useLocale } from '../../lib/locale';
import { uuid } from '../../lib/uuid';
import { useCamera } from '../../hooks/camera';
import { useLookupBarcode } from '../../hooks/capture';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input, Field } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { ErrorState } from '../ui/states';

/**
 * A decoded barcode. The browser `BarcodeDetector` returns richer objects, but
 * the scanner only ever needs the raw value, so the port is the smallest shape
 * both a real detector and the test stub can satisfy.
 */
export interface BarcodeScanner {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeScanner;

// WHATWG format ids mirroring mobile's `BarcodeCapture`
// (ean13/ean8/upc_e/code128/qr). `upc_a` is added because a UPC-A is the common
// US product code and browsers may report it distinctly from `ean_13`; every
// decode is still filtered to a numeric EAN/UPC by BARCODE_RE below, so a `qr`
// payload only proceeds when it happens to be a numeric barcode.
const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'];
const SCAN_INTERVAL_MS = 400;
const BARCODE_RE = /^\d{6,20}$/;

/**
 * Real scanner factory. `BarcodeDetector` is a native browser API (Chromium /
 * Android Chrome, not Safari or Firefox today), so this returns `null` when it
 * is absent — the caller then shows the typed field alone. Construction is
 * wrapped because a browser may expose the constructor yet reject our formats.
 */
const defaultCreateScanner = (): BarcodeScanner | null => {
  const Ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: BARCODE_FORMATS });
  } catch {
    return null;
  }
};

export function BarcodeCapture({
  onItems,
  createScanner = defaultCreateScanner,
}: {
  onItems: (items: RecognizedItem[]) => void;
  createScanner?: () => BarcodeScanner | null;
}) {
  const { t } = useLocale();
  const camera = useCamera();
  const lookup = useLookupBarcode();
  const [code, setCode] = useState('');

  // Built once: `null` means the browser has no detector, which collapses the UI
  // to the typed field. Constructing a detector opens no camera, so it is cheap.
  const scanner = useMemo(() => createScanner(), [createScanner]);

  const notFound = lookup.data && !lookup.data.found;

  // A scan fires the lookup exactly once: `pendingRef` blocks a second decode
  // `pendingRef` blocks a second submission while one is in flight; `haltRef`
  // stops the *scanner* for good once any lookup has settled — matching mobile,
  // where a result ends scanning and the typed field is the retry path. Only the
  // scan loop consults `haltRef` (below); the typed button never does, so a
  // manual retry always runs even after the camera has halted.
  const pendingRef = useRef(false);
  const haltRef = useRef(false);

  // `value` is an already-validated numeric barcode — both call sites guard it,
  // so the mutation never re-checks and stays the single lookup choke-point.
  const submit = (value: string) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setCode(value);
    lookup.mutate(value, {
      onSuccess: (res) => {
        if (!res.found || !res.match) return;
        const row: RecognizedItem = {
          tempId: uuid(),
          match: res.match,
          nameEn: res.productName ?? res.match.rawName,
          // Carry the Arabic name and real category so an unresolved scan
          // commits bilingually (ReviewList maps nameAr/category to
          // rawNameAr/rawCategory on unresolved rows). Falling back to English
          // or a hardcoded `canned` files Arabic products under English and
          // miscategorises them.
          nameAr: res.productNameAr ?? res.productName ?? res.match.rawName,
          category: res.category ?? 'other',
          quantity: res.suggestedQuantity ?? 1,
          unit: res.suggestedUnit ?? 'piece',
          confidence: res.match.confidence,
          suggestedExpiresAt: null,
          suggestedLocationType: 'pantry',
          photoKey: null,
        };
        onItems([row]);
      },
      onSettled: () => {
        pendingRef.current = false;
        haltRef.current = true;
      },
    });
  };

  // The typed field must present an already-numeric code — like mobile it
  // rejects (never rewrites) anything that is not 6–20 digits.
  const typedValid = BARCODE_RE.test(code);
  const submitTyped = () => {
    if (typedValid) submit(code);
  };

  // The interval closes over the first `submit` created after the camera turned
  // ready; that closure reads the guards through refs and calls `mutate` (a
  // stable identity), so it never goes stale. Re-subscribing on every render
  // would tear the timer down mid-decode.
  const submitRef = useRef(submit);
  submitRef.current = submit;

  useEffect(() => {
    if (camera.state !== 'ready' || !scanner) return;
    const id = setInterval(() => {
      void (async () => {
        const video = camera.videoRef.current;
        if (!video) return;
        let results: { rawValue: string }[];
        try {
          results = await scanner.detect(video);
        } catch {
          // Frames between barcodes decode to nothing; that rejection is normal.
          return;
        }
        // The camera keeps decoding frames (like mobile's continuous scanner),
        // but a lookup in flight or a settled result ends submission.
        if (pendingRef.current || haltRef.current) return;
        // Only a fully numeric EAN/UPC is looked up; an alphanumeric Code 128 or
        // QR payload is not a product barcode and is left for the typed field.
        const hit = results.map((r) => r.rawValue).find((v) => BARCODE_RE.test(v));
        if (hit) submitRef.current(hit);
      })();
    }, SCAN_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera.state, scanner]);

  // The camera is offered only when a detector exists and acquisition has not
  // failed outright; a denied camera shows a hint, an unavailable one shows
  // nothing — either way the typed field below is the working path.
  const showScanUi = scanner !== null && camera.state !== 'unavailable';

  return (
    <Card className="flex flex-col gap-4">
      {showScanUi ? (
        camera.state === 'ready' ? (
          <div className="flex flex-col items-center gap-2">
            <video
              ref={camera.videoRef}
              autoPlay
              muted
              playsInline
              className="w-full max-w-md rounded-2xl"
            />
            <p className="text-sm text-muted-foreground">{t('web.capture.scanHint')}</p>
          </div>
        ) : camera.state === 'denied' ? (
          <p className="text-sm text-muted-foreground">{t('web.capture.denied')}</p>
        ) : (
          <Button
            variant="secondary"
            onClick={() => void camera.start()}
            disabled={camera.state === 'requesting'}
          >
            {t('web.capture.scanCta')}
          </Button>
        )
      ) : null}

      <Field label={t('capture.barcode')} htmlFor="barcode">
        <Input
          id="barcode"
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('web.capture.barcodePlaceholder')}
        />
      </Field>

      {notFound ? <Badge tone="warning">{t('capture.barcodeNotFound')}</Badge> : null}
      {lookup.isError ? <ErrorState error={lookup.error} /> : null}

      <Button onClick={submitTyped} disabled={lookup.isPending || !typedValid}>
        {t('web.capture.lookup')}
      </Button>
    </Card>
  );
}
