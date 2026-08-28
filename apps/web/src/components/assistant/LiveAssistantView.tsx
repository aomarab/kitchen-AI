'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { RecognizedItem } from '@kitchen/contracts';
import { formatNumber } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';
import { cn } from '../../lib/cn';
import { localizedName } from '../../lib/name';
import { useLiveMedia } from '../../lib/useLiveMedia';
import { useLocations } from '../../hooks/inventory';
import { OpenAiRealtimeAssistantClient } from '../../lib/assistant/openai-realtime';
import { api } from '../../lib/api';
import type {
  AssistantStatus,
  DetectedItem,
  RealtimeAssistantClient,
  TranscriptTurn,
} from '../../lib/assistant/realtime-port';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { ReviewList } from '../kitchen/ReviewList';

/**
 * The live camera + voice assistant (design spec §5, Feature 5), client half,
 * offline. Real camera + mic (consent-gated), a realtime **port** driven by the
 * **Mock** adapter, and a confirm-before-write step that reuses the existing
 * `ReviewList` → `bulkCreateInventory` ledger path.
 *
 * Honesty: while the provider `isMock`, a persistent "Demo" badge sits beside
 * the real "Live" indicator and detections are shown in a clearly labelled
 * "Spotted (sample)" panel — never as bounding boxes on the live feed, which
 * would imply real vision. Nothing reaches inventory without the confirm step.
 *
 * `createClient` is an injection seam (default: the mock) so tests drive a
 * deterministic session; it is the same port/adapter shape used across the app.
 */
/**
 * Builds the transport.
 *
 * There is one path, not two. The client cannot tell a scripted deployment from
 * a live one by looking at its own configuration, so it does not try: it mints,
 * and the session it gets back says whether it is real. Under MSW that mint is
 * answered by the mock handler with `isMock: true`, and the adapter hands over
 * to the scripted client with the demo badge still lit.
 */
function defaultClient(): RealtimeAssistantClient {
  return new OpenAiRealtimeAssistantClient({
    createSession: (locale) =>
      api.call('createRealtimeSession', { body: { locale: locale as 'en' | 'ar' } }),
  });
}

export function LiveAssistantView({
  createClient = defaultClient,
}: {
  createClient?: () => RealtimeAssistantClient;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const media = useLiveMedia();
  const locationsQuery = useLocations();

  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [detections, setDetections] = useState<DetectedItem[]>([]);
  const [status, setStatus] = useState<AssistantStatus>('connecting');
  const [captionsOn, setCaptionsOn] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [addedCount, setAddedCount] = useState<number | null>(null);

  const clientRef = useRef<RealtimeAssistantClient | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Keep the latest factory in a ref so the start effect below depends only on
  // camera readiness. The default `createClient` prop is a fresh function every
  // render; if it sat in the effect deps the session would restart on every
  // render — an infinite state-update loop. This is the "latest ref" pattern.
  const createClientRef = useRef(createClient);
  createClientRef.current = createClient;

  // Bind the live stream to the <video> element once it exists.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    try {
      el.srcObject = media.stream;
    } catch {
      // Some environments (jsdom, older browsers) don't support srcObject.
    }
  }, [media.stream]);

  // Start the realtime session exactly once the camera is live, and tear it
  // down when the view leaves or the stream ends.
  useEffect(() => {
    if (media.state !== 'ready' || !media.stream) return;
    const client = createClientRef.current();
    clientRef.current = client;
    setStatus('connecting');
    setTurns([]);
    setDetections([]);
    void client.start({
      locale,
      stream: media.stream,
      onEvent: (event) => {
        if (event.type === 'status') setStatus(event.status);
        else if (event.type === 'transcript') setTurns((prev) => [...prev, event.turn]);
        else if (event.type === 'detections') setDetections(event.items);
      },
    });
    return () => {
      void client.stop();
      clientRef.current = null;
    };
  }, [media.state, media.stream, locale]);

  const isMock = clientRef.current?.isMock ?? true;

  const endSession = () => {
    void clientRef.current?.stop();
    media.stop();
    router.push('/');
  };

  const lastAssistant = [...turns].reverse().find((turn) => turn.role === 'assistant');
  const lastUser = [...turns].reverse().find((turn) => turn.role === 'user');

  /* -------------------- Consent + failure gates -------------------- */
  if (media.state !== 'ready') {
    return (
      <Gate>
        {media.state === 'denied' ? (
          <GateCard
            title={t('web.assistant.deniedTitle')}
            body={t('web.assistant.deniedBody')}
            action={<Button onClick={() => void media.start()}>{t('web.assistant.retry')}</Button>}
            secondaryHref="/kitchen/capture"
            secondaryLabel={t('web.assistant.unavailableBody')}
          />
        ) : media.state === 'unavailable' ? (
          <GateCard
            title={t('web.assistant.unavailableTitle')}
            body={t('web.assistant.unavailableBody')}
            action={
              <Link
                href="/kitchen/capture"
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
              >
                {t('web.nav.kitchen')}
              </Link>
            }
          />
        ) : (
          <GateCard
            title={t('web.assistant.consentTitle')}
            body={t('web.assistant.consentBody')}
            note={t('web.assistant.consentPrivacy')}
            action={
              <Button onClick={() => void media.start()} disabled={media.state === 'requesting'}>
                {media.state === 'requesting'
                  ? t('web.assistant.requesting')
                  : t('web.assistant.consentStart')}
              </Button>
            }
            secondaryHref="/"
            secondaryLabel={t('web.assistant.consentCancel')}
          />
        )}
      </Gate>
    );
  }

  /* ------------------------- Live view ------------------------- */
  return (
    <div
      data-testid="assistant-live"
      className="relative flex h-screen w-full flex-col overflow-hidden bg-inverse text-inverse-foreground"
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* Scrims so overlaid controls stay legible over any camera scene. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-inverse/50" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-inverse/60" />

      {/* Top bar: real LIVE + honest DEMO badge. */}
      <header className="relative z-10 flex items-start justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-danger px-3 py-1 text-xs font-extrabold text-danger-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-danger-foreground" />
            {t('web.assistant.liveBadge')}
          </span>
          {isMock ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-inverse-foreground px-3 py-1 text-xs font-extrabold text-inverse">
              {t('web.assistant.demoBadge')}
              <span className="font-semibold text-inverse/70">· {t('web.assistant.demoNote')}</span>
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={endSession}
          className="rounded-full bg-inverse/40 px-4 py-1.5 text-sm font-bold text-inverse-foreground backdrop-blur"
        >
          {t('web.assistant.exit')}
        </button>
      </header>

      <div className="relative z-10 flex-1" />

      {/* Spotted panel — labelled sample, not bounding boxes on the feed. */}
      {detections.length > 0 ? (
        <div className="relative z-10 mx-4 mb-3 rounded-2xl bg-inverse/50 p-3 backdrop-blur">
          <div className="mb-2 text-xs font-bold uppercase tracking-heading-sm text-inverse-muted">
            {t('web.assistant.spottedLabel')}
          </div>
          <ul className="flex flex-wrap gap-2">
            {detections.map((item) => (
              <li
                key={item.id}
                className="rounded-full bg-inverse-foreground px-3 py-1 text-sm font-semibold text-inverse"
              >
                {localizedName(locale, { en: item.nameEn, ar: item.nameAr })}
                {item.quantity != null ? (
                  <span className="text-inverse/60"> · {formatNumber(locale, item.quantity)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Caption card. */}
      {captionsOn ? (
        <div className="relative z-10 mx-4 mb-3 flex flex-col gap-2">
          {lastUser ? (
            <div className="ms-auto max-w-[80%] rounded-2xl rounded-ee-sm bg-inverse-foreground px-3.5 py-2 text-sm font-semibold text-inverse">
              {lastUser.text}
            </div>
          ) : null}
          <div className="rounded-2xl bg-inverse/70 px-4 py-3 backdrop-blur">
            <div className="text-[10px] font-bold uppercase tracking-heading-sm text-inverse-muted">
              {status === 'connecting'
                ? t('web.assistant.connecting')
                : t('web.assistant.assistantLabel')}
            </div>
            <p className="mt-1 text-sm font-semibold leading-snug">
              {lastAssistant ? lastAssistant.text : t('web.assistant.connecting')}
            </p>
          </div>
        </div>
      ) : null}

      {/* Control bar. */}
      <nav className="relative z-10 flex items-end justify-between gap-2 px-6 pb-7 pt-2">
        <ControlButton
          label={media.micMuted ? t('web.assistant.micMuted') : t('web.assistant.mic')}
          active={media.micMuted}
          onClick={media.toggleMic}
        >
          {media.micMuted ? <MicOffIcon /> : <MicIcon />}
        </ControlButton>
        <ControlButton
          label={t('web.assistant.addToInventory')}
          tone="primary"
          badge={detections.length > 0 ? formatNumber(locale, detections.length) : undefined}
          onClick={() => setConfirmOpen(true)}
        >
          <PlusIcon />
        </ControlButton>
        <ControlButton
          label={t('web.assistant.captions')}
          active={captionsOn}
          onClick={() => setCaptionsOn((prev) => !prev)}
        >
          <CaptionsIcon />
        </ControlButton>
        <ControlButton label={t('web.assistant.end')} tone="danger" onClick={endSession}>
          <EndIcon />
        </ControlButton>
      </nav>

      {addedCount != null ? (
        <div
          role="status"
          className="absolute inset-x-0 bottom-24 z-20 mx-auto w-fit rounded-full bg-success px-4 py-2 text-sm font-bold text-inverse-foreground shadow-raised"
        >
          {t('web.assistant.addedToast', { count: formatNumber(locale, addedCount) })}
        </div>
      ) : null}

      <Sheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('web.assistant.confirmTitle')}
      >
        <p className="mb-4 text-sm text-muted-foreground">{t('web.assistant.confirmBody')}</p>
        {detections.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('web.assistant.confirmEmpty')}</p>
        ) : (
          <ReviewList
            items={toRecognized(detections)}
            locations={locationsQuery.data ?? []}
            // Not "photo": nobody took one. The ledger is append-only, so a
            // wrong provenance here is permanent.
            source="assistant"
            onDone={(count) => {
              setAddedCount(count);
              setConfirmOpen(false);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

/** Maps the assistant's detections onto the recognition shape `ReviewList` eats. */
function toRecognized(items: DetectedItem[]): RecognizedItem[] {
  return items.map((item) => ({
    tempId: item.id,
    // `created` + null id: the API resolves/creates the catalog row on confirm,
    // exactly as the photo-recognition path does.
    match: {
      ingredientId: null,
      strategy: 'created',
      confidence: item.confidence,
      rawName: item.nameEn,
    },
    nameEn: item.nameEn,
    nameAr: item.nameAr,
    category: item.category,
    quantity: item.quantity ?? 1,
    unit: item.unit,
    confidence: item.confidence,
    suggestedExpiresAt: null,
    suggestedLocationType: 'fridge',
    photoKey: null,
  }));
}

function Gate({ children }: { children: ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-canvas px-6">{children}</div>;
}

function GateCard({
  title,
  body,
  note,
  action,
  secondaryHref,
  secondaryLabel,
}: {
  title: string;
  body: string;
  note?: string;
  action: ReactNode;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl border border-border bg-background p-8 text-center shadow-card">
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-primary-soft text-primary-text">
        <CameraGlyph />
      </span>
      <h1 className="text-xl font-bold tracking-heading-sm">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
      {note ? (
        <p className="rounded-xl bg-canvas px-3 py-2 text-xs text-muted-foreground">{note}</p>
      ) : null}
      <div className="mt-2 w-full">{action}</div>
      {secondaryHref && secondaryLabel ? (
        <Link
          href={secondaryHref}
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          {secondaryLabel}
        </Link>
      ) : null}
    </div>
  );
}

function ControlButton({
  label,
  children,
  onClick,
  active = false,
  tone = 'neutral',
  badge,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  tone?: 'neutral' | 'primary' | 'danger';
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className="flex flex-col items-center gap-1.5 text-xs font-bold text-inverse-foreground"
    >
      <span
        className={cn(
          'relative grid h-14 w-14 place-items-center rounded-full backdrop-blur',
          tone === 'primary' && 'bg-primary text-primary-foreground',
          tone === 'danger' && 'bg-danger text-danger-foreground',
          tone === 'neutral' && (active ? 'bg-inverse-foreground text-inverse' : 'bg-inverse/40'),
        )}
      >
        {children}
        {badge ? (
          <span className="absolute -end-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-inverse-foreground px-1 text-[11px] font-extrabold text-inverse">
            {badge}
          </span>
        ) : null}
      </span>
      <span>{label}</span>
    </button>
  );
}

/* --------------------------- icons --------------------------- */
function MicIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10a7 7 0 0 1-14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="3" y1="3" x2="21" y2="21" />
      <path d="M9 9v2a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
      <path d="M19 10a7 7 0 0 1-.11 1.23M5 10a7 7 0 0 0 10.09 6.3" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function CaptionsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M7 12h3M14 12h3M7 15h6" />
    </svg>
  );
}

function EndIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
      <path
        d="M21 15.5c-1.2 0-2.4-.2-3.5-.6a1 1 0 0 0-1 .2l-1.5 1.5a15 15 0 0 1-6.6-6.6L9.4 8.5a1 1 0 0 0 .2-1C9.2 6.4 9 5.2 9 4a1 1 0 0 0-1-1H4.5A1.5 1.5 0 0 0 3 4.6 18 18 0 0 0 19.4 21 1.5 1.5 0 0 0 21 19.5V16a.5.5 0 0 0-.5-.5z"
        transform="rotate(135 12 12)"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CameraGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-7 w-7"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7h3l2-2h8l2 2h3v13H3z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
