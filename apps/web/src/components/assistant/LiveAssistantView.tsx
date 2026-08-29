'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { MAX_ASSISTANT_SESSION_MS, type RecognizedItem } from '@kitchen/contracts';
import { formatNumber } from '@kitchen/i18n';
import { useLocale } from '../../lib/locale';
import { cn } from '../../lib/cn';
import { localizedName } from '../../lib/name';
import { useLiveMedia, type LiveMediaKind } from '../../lib/useLiveMedia';
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
 * The kitchen assistant (design spec §5, Feature 5), client half, offline.
 *
 * It offers the three ChatGPT-voice interaction modes over one transport port
 * (driven by the **Mock** adapter offline, the OpenAI-Realtime adapter behind
 * `AI_MOCK`):
 *
 * - **Text** — type and send; no camera or microphone touched.
 * - **Voice** — talk with the microphone only; the webcam light never comes on.
 * - **Live** — camera + voice, the vision session that can spot ingredients and
 *   add them to inventory through the confirm-before-write `ReviewList` path.
 *
 * Camera is therefore optional: two of the three modes need no camera, and a
 * device is only ever acquired by an explicit tap, never on mount. Honesty is
 * unchanged — while the provider `isMock`, a persistent "Demo" badge sits beside
 * the "Live" indicator and detections are a labelled sample, never boxes on the
 * feed. Nothing reaches inventory without the confirm step.
 *
 * `createClient` is an injection seam (default: the real adapter, which hands
 * off to the mock when the API mints a mock session) so tests drive a
 * deterministic session.
 */
export type AssistantMode = 'text' | 'voice' | 'live';

const MODES: AssistantMode[] = ['text', 'voice', 'live'];

/** The media a mode needs before it can converse; `null` = nothing (text). */
function requiredKind(mode: AssistantMode): LiveMediaKind | null {
  return mode === 'live' ? 'camera' : mode === 'voice' ? 'mic' : null;
}

function defaultClient(): RealtimeAssistantClient {
  return new OpenAiRealtimeAssistantClient({
    createSession: (locale) =>
      api.call('createRealtimeSession', { body: { locale: locale as 'en' | 'ar' } }),
  });
}

export function LiveAssistantView({
  createClient = defaultClient,
  initialMode = 'live',
  /** Locks the mode (used by the cook-along voice assistant, which is voice-only). */
  lockMode = false,
  /** Where "exit" returns to. Defaults to the dashboard for the standalone page. */
  onExit,
}: {
  createClient?: () => RealtimeAssistantClient;
  initialMode?: AssistantMode;
  lockMode?: boolean;
  onExit?: () => void;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const media = useLiveMedia();
  const locationsQuery = useLocations();

  const [mode, setMode] = useState<AssistantMode>(initialMode);
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [detections, setDetections] = useState<DetectedItem[]>([]);
  const [status, setStatus] = useState<AssistantStatus>('connecting');
  const [speaking, setSpeaking] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [addedCount, setAddedCount] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [capReached, setCapReached] = useState(false);
  const [sessionNonce, setSessionNonce] = useState(0);

  const clientRef = useRef<RealtimeAssistantClient | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Keep the latest factory in a ref so the start effect depends only on
  // conversation readiness, not on a fresh function each render.
  const createClientRef = useRef(createClient);
  createClientRef.current = createClient;

  const {
    state: mediaState,
    stream: mediaStream,
    kind: mediaKind,
    micMuted,
    start: startMedia,
    stop: stopMedia,
    toggleMic,
  } = media;

  const need = requiredKind(mode);
  const hasCamera = mediaState === 'ready' && mediaKind === 'camera';
  // A mode can converse once it holds the media it needs. Text needs nothing,
  // so it is ready the instant it is selected.
  const conversationReady = need === null || (mediaState === 'ready' && mediaKind === need);

  // Bind the live camera to the <video> element whenever one is showing.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    try {
      el.srcObject = hasCamera ? mediaStream : null;
    } catch {
      // Some environments (jsdom, older browsers) don't support srcObject.
    }
  }, [hasCamera, mediaStream]);

  // Leaving for text mode releases any camera/microphone still running, so the
  // webcam light goes out the moment vision is no longer in use.
  useEffect(() => {
    if (mode === 'text' && (mediaState === 'ready' || mediaState === 'requesting')) {
      stopMedia();
    }
  }, [mode, mediaState, stopMedia]);

  // Start the realtime session once the current mode holds its media, and tear
  // it down when the mode leaves or the stream changes.
  useEffect(() => {
    if (!conversationReady) return;
    const stream = need ? mediaStream : null;
    const client = createClientRef.current();
    clientRef.current = client;
    setStatus('connecting');
    setSpeaking(false);
    setTurns([]);
    setDetections([]);
    setCapReached(false);
    void client.start({
      locale,
      stream,
      onEvent: (event) => {
        if (event.type === 'status') {
          setStatus(event.status);
          if (event.status === 'ended') setSpeaking(false);
        } else if (event.type === 'speaking') setSpeaking(event.speaking);
        else if (event.type === 'transcript') setTurns((prev) => [...prev, event.turn]);
        else if (event.type === 'detections') setDetections(event.items);
      },
    });
    return () => {
      void client.stop();
      clientRef.current = null;
    };
    // `need` is derived from `mode`; restarting on a mode change is intended.
    // `sessionNonce` restarts the same session on demand (used by resume).
  }, [conversationReady, mediaStream, locale, mode, need, sessionNonce]);

  // Keep the transcript pinned to the newest turn.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, speaking]);

  // Client-side cost guard. A real session left open keeps running the
  // provider's per-minute meter, which the server cannot bound once the peer
  // connection is up (see MAX_ASSISTANT_SESSION_MS). Auto-hang up at the ceiling
  // and offer to resume. Scripted (mock) sessions are free, so they are exempt.
  useEffect(() => {
    if (status !== 'live' || clientRef.current?.isMock !== false) return;
    const id = setTimeout(() => {
      void clientRef.current?.stop();
      setSpeaking(false);
      setStatus('ended');
      setCapReached(true);
    }, MAX_ASSISTANT_SESSION_MS);
    return () => clearTimeout(id);
  }, [status]);

  const isMock = clientRef.current?.isMock ?? true;

  const endSession = () => {
    void clientRef.current?.stop();
    media.stop();
    if (onExit) onExit();
    else router.push('/');
  };

  const resume = () => {
    setCapReached(false);
    setSessionNonce((n) => n + 1);
  };

  const submitDraft = (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    clientRef.current?.sendText(text);
    setDraft('');
  };

  const lastAssistant = useMemo(
    () => [...turns].reverse().find((turn) => turn.role === 'assistant'),
    [turns],
  );

  /* -------------------- Consent / acquisition gate -------------------- */
  // Only voice and live need a device; text is never gated. When the needed
  // media is not yet held, show the gate for this mode with a switcher so the
  // user can drop to text instead of hitting a wall.
  if (need !== null && !conversationReady) {
    return (
      <Gate>
        <div className="flex w-full max-w-md flex-col gap-4">
          {!lockMode ? <ModeSwitch mode={mode} onChange={setMode} t={t} /> : null}
          {mediaState === 'denied' ? (
            <GateCard
              title={t('web.assistant.deniedTitle')}
              body={
                need === 'camera' ? t('web.assistant.deniedBody') : t('web.assistant.micNeededBody')
              }
              action={
                <Button onClick={() => void startMedia(need)}>{t('web.assistant.retry')}</Button>
              }
            />
          ) : mediaState === 'unavailable' ? (
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
              title={
                need === 'camera'
                  ? t('web.assistant.consentTitle')
                  : t('web.assistant.voiceConsentTitle')
              }
              body={
                need === 'camera'
                  ? t('web.assistant.consentBody')
                  : t('web.assistant.voiceConsentBody')
              }
              note={t('web.assistant.consentPrivacy')}
              action={
                <Button
                  onClick={() => void startMedia(need)}
                  disabled={mediaState === 'requesting'}
                >
                  {mediaState === 'requesting'
                    ? t('web.assistant.requesting')
                    : need === 'camera'
                      ? t('web.assistant.consentStart')
                      : t('web.assistant.voiceConsentStart')}
                </Button>
              }
            />
          )}
          {!lockMode ? (
            <button
              type="button"
              onClick={() => setMode('text')}
              className="text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              {t('web.assistant.switchToText')}
            </button>
          ) : onExit ? (
            <button
              type="button"
              onClick={endSession}
              className="text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              {t('web.assistant.cookClose')}
            </button>
          ) : null}
        </div>
      </Gate>
    );
  }

  /* ------------------------- Conversation view ------------------------- */
  const showComposer = mode !== 'live';
  const showMic = mode !== 'text';

  return (
    <div
      data-testid="assistant-live"
      className="relative flex h-screen w-full flex-col overflow-hidden bg-inverse text-inverse-foreground"
    >
      {hasCamera ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-inverse/50" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-inverse/60" />
        </>
      ) : (
        // A calm backdrop for the camera-less modes so text/voice do not sit on
        // a black void.
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-inverse to-primary/25" />
      )}

      {/* Top bar: real LIVE + honest DEMO badge, then the mode switcher. */}
      <header className="relative z-10 flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {mode !== 'text' ? (
              <span
                data-testid="assistant-live-badge"
                className="inline-flex items-center gap-2 rounded-full bg-danger px-3 py-1 text-xs font-extrabold text-danger-foreground"
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-danger-foreground" />
                {t('web.assistant.liveBadge')}
              </span>
            ) : null}
            {isMock ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-inverse-foreground px-3 py-1 text-xs font-extrabold text-inverse">
                {t('web.assistant.demoBadge')}
                <span className="font-semibold text-inverse/70">
                  · {t('web.assistant.demoNote')}
                </span>
              </span>
            ) : null}
            {speaking ? (
              <span
                data-testid="assistant-speaking"
                role="status"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-xs font-extrabold text-primary-foreground"
              >
                <SpeakingBars />
                {t('web.assistant.speaking')}
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
        </div>
        {!lockMode ? <ModeSwitch mode={mode} onChange={setMode} t={t} /> : null}
      </header>

      {/* Transcript — the scrollable chat log, shared by every mode. */}
      <div
        ref={scrollRef}
        className="relative z-10 flex-1 space-y-2 overflow-y-auto px-4 py-2"
        data-testid="assistant-transcript"
      >
        {turns.length === 0 && status !== 'connecting' ? (
          <p className="mt-6 text-center text-sm text-inverse-muted">
            {t('web.assistant.emptyTranscript')}
          </p>
        ) : null}
        {turns.map((turn) => (
          <div
            key={turn.id}
            className={cn(
              'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm font-semibold',
              turn.role === 'user'
                ? 'ms-auto rounded-ee-sm bg-inverse-foreground text-inverse'
                : 'me-auto rounded-es-sm bg-inverse/70 text-inverse-foreground backdrop-blur',
            )}
          >
            {turn.text}
          </div>
        ))}
        {status === 'connecting' ? (
          <p className="mt-6 text-center text-sm text-inverse-muted">
            {t('web.assistant.connecting')}
          </p>
        ) : null}
      </div>

      {/* Cost guard: the live session auto-paused at the duration ceiling. */}
      {capReached ? (
        <div
          role="status"
          data-testid="assistant-cap"
          className="relative z-10 mx-4 mb-3 rounded-2xl bg-inverse/60 p-4 text-center backdrop-blur"
        >
          <p className="text-sm font-extrabold text-inverse-foreground">
            {t('web.assistant.capTitle')}
          </p>
          <p className="mt-1 text-xs text-inverse-muted">
            {t('web.assistant.capBody', {
              minutes: formatNumber(locale, MAX_ASSISTANT_SESSION_MS / 60_000),
            })}
          </p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <Button size="sm" onClick={resume}>
              {t('web.assistant.resume')}
            </Button>
            <Button size="sm" variant="outlineInverse" onClick={endSession}>
              {t('web.assistant.exit')}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Spotted panel (live/camera only) — a labelled sample, not boxes. */}
      {hasCamera && detections.length > 0 ? (
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

      {/* Voice hint under the caption in voice mode. */}
      {mode === 'voice' && !speaking ? (
        <p className="relative z-10 px-6 pb-1 text-center text-xs text-inverse-muted">
          {micMuted ? t('web.assistant.micMuted') : t('web.assistant.voiceHint')}
        </p>
      ) : null}

      {/* Composer (text + voice). */}
      {showComposer ? (
        <form
          onSubmit={submitDraft}
          className="relative z-10 flex items-center gap-2 px-4 pb-3 pt-1"
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t('web.assistant.composerPlaceholder')}
            aria-label={t('web.assistant.composerPlaceholder')}
            className="min-w-0 flex-1 rounded-full bg-inverse-foreground px-4 py-3 text-sm font-semibold text-inverse placeholder:text-inverse/40 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {showMic ? (
            <button
              type="button"
              onClick={toggleMic}
              aria-label={micMuted ? t('web.assistant.micMuted') : t('web.assistant.mic')}
              aria-pressed={micMuted}
              className={cn(
                'grid h-12 w-12 shrink-0 place-items-center rounded-full backdrop-blur',
                micMuted ? 'bg-inverse/40' : 'bg-inverse-foreground text-inverse',
              )}
            >
              {micMuted ? <MicOffIcon /> : <MicIcon />}
            </button>
          ) : null}
          <button
            type="submit"
            aria-label={t('web.assistant.send')}
            disabled={draft.trim().length === 0}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
          >
            <SendIcon />
          </button>
        </form>
      ) : null}

      {/* Live controls (camera mode) — hands-free, plus add-to-inventory. */}
      {mode === 'live' ? (
        <nav className="relative z-10 flex items-end justify-between gap-2 px-6 pb-7 pt-2">
          <ControlButton
            label={micMuted ? t('web.assistant.micMuted') : t('web.assistant.mic')}
            active={micMuted}
            onClick={toggleMic}
          >
            {micMuted ? <MicOffIcon /> : <MicIcon />}
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
      ) : null}

      {/* Live caption card (camera mode, when captions on). */}
      {mode === 'live' && captionsOn && lastAssistant ? (
        <div className="pointer-events-none absolute inset-x-4 bottom-28 z-10 rounded-2xl bg-inverse/70 px-4 py-3 backdrop-blur">
          <div className="text-[10px] font-bold uppercase tracking-heading-sm text-inverse-muted">
            {speaking ? t('web.assistant.speaking') : t('web.assistant.assistantLabel')}
          </div>
          <p className="mt-1 text-sm font-semibold leading-snug">{lastAssistant.text}</p>
        </div>
      ) : null}

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

/** The Text / Voice / Live segmented control. */
function ModeSwitch({
  mode,
  onChange,
  t,
}: {
  mode: AssistantMode;
  onChange: (mode: AssistantMode) => void;
  t: (
    key: 'web.assistant.modeText' | 'web.assistant.modeVoice' | 'web.assistant.modeLive',
  ) => string;
}) {
  const label: Record<
    AssistantMode,
    'web.assistant.modeText' | 'web.assistant.modeVoice' | 'web.assistant.modeLive'
  > = {
    text: 'web.assistant.modeText',
    voice: 'web.assistant.modeVoice',
    live: 'web.assistant.modeLive',
  };
  return (
    <div
      role="tablist"
      aria-label="mode"
      className="inline-flex w-fit gap-1 rounded-full bg-inverse/40 p-1 backdrop-blur"
    >
      {MODES.map((value) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={mode === value}
          onClick={() => onChange(value)}
          className={cn(
            'rounded-full px-4 py-1.5 text-xs font-extrabold transition-colors',
            mode === value
              ? 'bg-inverse-foreground text-inverse'
              : 'text-inverse-foreground/80 hover:text-inverse-foreground',
          )}
        >
          {t(label[value])}
        </button>
      ))}
    </div>
  );
}

/** Maps the assistant's detections onto the recognition shape `ReviewList` eats. */
function toRecognized(items: DetectedItem[]): RecognizedItem[] {
  return items.map((item) => ({
    tempId: item.id,
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
}: {
  title: string;
  body: string;
  note?: string;
  action: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-4 rounded-3xl border border-border bg-background p-8 text-center shadow-card">
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-primary-soft text-primary-text">
        <CameraGlyph />
      </span>
      <h1 className="text-xl font-bold tracking-heading-sm">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
      {note ? (
        <p className="rounded-xl bg-canvas px-3 py-2 text-xs text-muted-foreground">{note}</p>
      ) : null}
      <div className="mt-2 w-full">{action}</div>
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
/**
 * Three bars that rise and fall while the assistant talks. Deliberately not an
 * audio-reactive visualiser: they say only "the voice is playing", which is the
 * one thing the transport tells us. `motion-reduce` drops the animation.
 */
function SpeakingBars() {
  return (
    <span aria-hidden="true" className="flex h-3 items-end gap-0.5">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          style={{ animationDelay: `${delay}ms` }}
          className="h-3 w-0.5 animate-pulse rounded-full bg-primary-foreground motion-reduce:animate-none"
        />
      ))}
    </span>
  );
}

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

/** A paper-plane send glyph; mirrors under RTL via the `.dir-flip` rule. */
function SendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="dir-flip h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12l16-8-6 16-3-6-7-2z" />
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
