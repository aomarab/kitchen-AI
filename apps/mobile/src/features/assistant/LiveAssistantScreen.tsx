import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { useIsFocused, useRouter } from 'expo-router';
import { AppText, Button, Card, Chip } from '../../components';
import { ReviewList } from '../capture/ReviewList';
import { Sheet } from '../../components/Sheet';
import { useFormat } from '../../hooks/useFormat';
import { useLocations, useBulkCreateInventory } from '../../hooks/inventory';
import { localizedName } from '../../lib/format';
import { api } from '../../lib/api';
import { OpenAiRealtimeAssistantClient } from '../../lib/assistant/openai-realtime';
import { detectionsToSession } from '../../lib/assistant/detections';
import { orbStateFor } from '../../lib/assistant/orb-state';
import { groupTurns } from '../../lib/assistant/transcript';
import type {
  AssistantStatus,
  DetectedItem,
  RealtimeAssistantClient,
  TranscriptTurn,
} from '../../lib/assistant/realtime-port';
import { MAX_ASSISTANT_SESSION_MS } from '@kitchen/contracts';
import { formatNumber } from '@kitchen/i18n';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import {
  AssistantHeader,
  DemoBadge,
  LiveTopBar,
  LockedVoiceOverlay,
  MediaControl,
} from './AssistantHeader';
import { Bubble, SpeakingBubble } from './Bubble';
import { Composer } from './Composer';
import { ModeSheet } from './ModeSheet';

/**
 * The assistant on mobile (spec §5, Feature 5; mobile surface
 * `2026-08-28-mobile-live-assistant-design.md`). Three ways to talk, mirroring
 * the web assistant:
 *
 * - **Text** — a typed chat. No camera, no microphone.
 * - **Voice** — talk hands-free. No camera; the microphone is live and the mic
 *   control mutes the outgoing audio track.
 * - **Live** — the camera + voice surface: point the phone at your food and the
 *   assistant reports what it "sees" as a labelled sample.
 *
 * The transport is a **port**. It defaults to the real
 * {@link OpenAiRealtimeAssistantClient}, which holds a WebRTC session straight
 * to the realtime model (audio phone↔provider; the API only mints the ephemeral
 * credential). That adapter hands off to the scripted mock when the API mints a
 * *mock* session — a deployment with no realtime key configured — so `isMock`
 * stays `true` and the persistent demo badge stays lit until a key is set: a
 * scripted answer over a real camera preview must never read as real vision.
 * Detections are shown as a labelled "Spotted (sample)" row, never as boxes on
 * the feed.
 *
 * Nothing the assistant reports is auto-written. "Add" opens the same
 * {@link ReviewList} the capture flows use, and only a confirm there reaches the
 * append-only ledger — with permanent `assistant` provenance.
 *
 * `initialMode`/`lockMode`/`onExit` let a caller embed a fixed mode (the cook
 * screen opens a locked **Voice** session). `createClient` is an injection seam
 * (default: the real adapter), the same port shape used across the app.
 */
export type AssistantMode = 'text' | 'voice' | 'live';

const MODES: AssistantMode[] = ['text', 'voice', 'live'];

/** Longer edge each sampled camera frame is downscaled to before it is sent as
 * realtime context. Small because it is context for the model, not a photo. */
const ASSISTANT_FRAME_EDGE_PX = 512;

export function LiveAssistantScreen({
  initialMode = 'live',
  lockMode = false,
  onExit,
  createClient,
}: {
  initialMode?: AssistantMode;
  lockMode?: boolean;
  onExit?: () => void;
  createClient?: () => RealtimeAssistantClient;
}) {
  useKeepAwake();
  const { t, locale } = useFormat();
  const router = useRouter();
  const { colors } = useTheme();
  const isFocused = useIsFocused();
  const locationsQuery = useLocations();
  const create = useBulkCreateInventory();
  const [permission, requestPermission] = useCameraPermissions();

  const [mode, setMode] = useState<AssistantMode>(initialMode);
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [detections, setDetections] = useState<DetectedItem[]>([]);
  const [status, setStatus] = useState<AssistantStatus>('connecting');
  const [speaking, setSpeaking] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [micMuted, setMicMuted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [modeSheetOpen, setModeSheetOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [capReached, setCapReached] = useState(false);
  const [sessionNonce, setSessionNonce] = useState(0);

  const clientRef = useRef<RealtimeAssistantClient | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  // The screen owns the camera, so it owns the frame source the real adapter
  // samples for vision. expo-camera has no silent frame API, so a downscaled
  // still stands in for the browser's canvas draw. A failure returns null (the
  // adapter skips that tick) rather than throwing into its interval.
  const captureFrame = useCallback(async (): Promise<string | null> => {
    const cam = cameraRef.current;
    if (!cam) return null;
    try {
      const shot = await cam.takePictureAsync({ quality: 0.4, skipProcessing: true });
      if (!shot?.uri) return null;
      const shrunk = await ImageManipulator.manipulateAsync(
        shot.uri,
        [{ resize: { width: ASSISTANT_FRAME_EDGE_PX } }],
        { compress: 0.5, base64: true, format: ImageManipulator.SaveFormat.JPEG },
      );
      return shrunk.base64 ? `data:image/jpeg;base64,${shrunk.base64}` : null;
    } catch {
      return null;
    }
  }, []);

  // Default to the real transport (mirrors web): it hands off to the scripted
  // mock when the API mints a mock session, so the demo badge stays honest until
  // a realtime key is configured. Tests inject `createClient` instead.
  const buildDefaultClient = useCallback(
    (): RealtimeAssistantClient =>
      new OpenAiRealtimeAssistantClient({
        createSession: (loc) =>
          api.call('createRealtimeSession', { body: { locale: loc as 'en' | 'ar' } }),
        captureFrame,
      }),
    [captureFrame],
  );

  const effectiveCreateClient = createClient ?? buildDefaultClient;
  const createClientRef = useRef(effectiveCreateClient);
  createClientRef.current = effectiveCreateClient;

  // Only the live (camera) mode needs a device permission; text and voice are
  // ready at once. Requesting the camera is an explicit tap on the gate card,
  // never on mount.
  const cameraReady = permission?.granted === true;
  const conversationReady = mode !== 'live' || cameraReady;
  const showCamera = mode === 'live' && cameraReady && !lockMode;

  // Start a session once the mode's requirements are met, and restart it when
  // the mode, locale, or camera readiness changes. stop() is the single point
  // that cancels every pending scripted beat, so leaving it out of cleanup would
  // let a caption fire after the screen is gone or the mode has changed.
  useEffect(() => {
    if (!conversationReady) return;
    setSpeaking(false);
    setCapReached(false);
    if (mode !== 'live') setDetections([]);
    const client = createClientRef.current();
    clientRef.current = client;
    void client.start({
      locale,
      camera: mode === 'live',
      audio: mode !== 'text',
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
  }, [locale, mode, conversationReady, sessionNonce]);

  // Client-side cost guard (mirrors web). A real session left open keeps the
  // provider's per-minute meter running; the server cannot bound duration once
  // the peer connection is up (see MAX_ASSISTANT_SESSION_MS). Auto-hang up at the
  // ceiling and offer to resume. Scripted (mock) sessions are free, so exempt.
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
    if (onExit) onExit();
    else router.back();
  };

  const resume = () => {
    setCapReached(false);
    setSessionNonce((n) => n + 1);
  };

  const sendMessage = useCallback((message: string) => {
    const text = message.trim();
    if (!text) return;
    clientRef.current?.sendText(text);
    setDraft('');
  }, []);

  const submitDraft = () => {
    sendMessage(draft);
  };

  // Muting must reach the real adapter's outgoing audio track, not just flip a
  // label — a "muted" mic that keeps sending audio would be lying. The scripted
  // mock treats it as a cosmetic no-op.
  const toggleMic = () => {
    setMicMuted((prev) => {
      const next = !prev;
      clientRef.current?.setMicMuted?.(next);
      return next;
    });
  };

  const lastAssistant = [...turns].reverse().find((turn) => turn.role === 'assistant');
  const lastUser = [...turns].reverse().find((turn) => turn.role === 'user');
  const orbState = orbStateFor({ status, mode, speaking });
  const groupedTurns = groupTurns(turns);
  const starterLabels = useMemo(
    () => [
      t('mobile.assistant.starter.tonight'),
      t('mobile.assistant.starter.expiring'),
      t('mobile.assistant.starter.plan'),
    ],
    [t],
  );
  const modeOptions = useMemo(
    () =>
      MODES.map((value) => ({
        value,
        label:
          value === 'text'
            ? t('mobile.assistant.modeText')
            : value === 'voice'
              ? t('mobile.assistant.modeVoice')
              : t('mobile.assistant.modeLive'),
      })),
    [t],
  );

  const captionLabel =
    status === 'connecting'
      ? t('mobile.assistant.connecting')
      : speaking
        ? t('mobile.assistant.speaking')
        : t('mobile.assistant.assistantLabel');

  const capBody = t('mobile.assistant.capBody', {
    minutes: formatNumber(locale, MAX_ASSISTANT_SESSION_MS / 60_000),
  });
  const isLiveSurface = mode === 'live' && !lockMode;
  const demoBadge = isMock ? (
    <DemoBadge label={t('mobile.assistant.demoBadge')} media={isLiveSurface} />
  ) : null;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: lockMode
          ? 'transparent'
          : isLiveSurface
            ? colors.surfaceInverse
            : colors.bg,
      }}
    >
      {isLiveSurface && isFocused ? <StatusBar style="light" /> : null}
      {showCamera ? (
        <>
          <CameraView
            ref={cameraRef}
            style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 }}
            facing="back"
          />
          <View
            style={{ position: 'absolute', top: 0, start: 0, end: 0, height: 160 }}
            pointerEvents="none"
          >
            <View style={{ flex: 1, backgroundColor: colors.overlay }} />
          </View>
        </>
      ) : null}

      {lockMode ? (
        <LockedVoiceOverlay
          orbState={orbState}
          speaking={speaking}
          demoBadge={demoBadge}
          caption={lastAssistant?.text ?? captionLabel}
          micMuted={micMuted}
          micLabel={micMuted ? t('mobile.assistant.micMuted') : t('mobile.assistant.mic')}
          closeLabel={t('mobile.assistant.cookClose')}
          capReached={capReached}
          capTitle={t('mobile.assistant.capTitle')}
          capBody={capBody}
          resumeLabel={t('mobile.assistant.resume')}
          onToggleMic={toggleMic}
          onClose={endSession}
          onResume={resume}
        />
      ) : (
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          {isLiveSurface ? (
            <LiveTopBar
              liveLabel={t('mobile.assistant.liveBadge')}
              exitLabel={t('mobile.assistant.exit')}
              moreLabel={t('mobile.assistant.moreOptions')}
              onExit={endSession}
              onMore={() => setModeSheetOpen(true)}
            />
          ) : (
            <AssistantHeader
              title={t('mobile.assistant.mamaName')}
              subtitle={t('mobile.assistant.subtitle')}
              connectedLabel={t('mobile.assistant.connected')}
              backLabel={t('common.back')}
              moreLabel={t('mobile.assistant.moreOptions')}
              live={status === 'live'}
              orbState={orbState}
              onBack={endSession}
              onMore={() => setModeSheetOpen(true)}
            />
          )}

          {demoBadge}

          {capReached ? (
            <Card
              style={{
                gap: spacing.sm,
                marginHorizontal: spacing.lg,
                marginBottom: spacing.sm,
              }}
            >
              <AppText variant="heading">{t('mobile.assistant.capTitle')}</AppText>
              <AppText muted>{capBody}</AppText>
              <Button title={t('mobile.assistant.resume')} onPress={resume} />
            </Card>
          ) : null}

          {mode === 'live' && !cameraReady ? (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Card style={{ gap: spacing.md, margin: spacing.lg }}>
                <AppText variant="heading">{t('mobile.assistant.cameraTitle')}</AppText>
                <AppText muted>{t('mobile.assistant.cameraHint')}</AppText>
                {permission && !permission.canAskAgain ? (
                  <AppText variant="caption" color="danger">
                    {t('mobile.permissions.denied')}
                  </AppText>
                ) : null}
                {!permission || permission.canAskAgain ? (
                  <Button
                    title={t('mobile.permissions.grant')}
                    onPress={() => void requestPermission()}
                  />
                ) : (
                  <Button
                    title={t('mobile.permissions.openSettings')}
                    onPress={() => void Linking.openSettings()}
                  />
                )}
              </Card>
            </View>
          ) : mode === 'live' ? (
            <>
              {isMock ? (
                <AppText
                  variant="caption"
                  center
                  style={{ color: colors.textInverseMuted, paddingHorizontal: spacing.lg }}
                >
                  {t('mobile.assistant.demoNote')}
                </AppText>
              ) : null}

              <View style={{ flex: 1 }} />

              {detections.length > 0 ? (
                <View
                  style={{
                    marginHorizontal: spacing.lg,
                    marginBottom: spacing.sm,
                    padding: spacing.md,
                    borderRadius: radius.lg,
                    backgroundColor: colors.overlay,
                    gap: spacing.sm,
                  }}
                >
                  <AppText variant="caption" style={{ color: colors.textInverseMuted }}>
                    {t('mobile.assistant.spottedLabel')}
                  </AppText>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: spacing.sm }}
                  >
                    {detections.map((item) => (
                      <View
                        key={item.id}
                        style={{
                          backgroundColor: colors.surfaceInverseAlt,
                          borderRadius: radius.pill,
                          paddingVertical: spacing.xs,
                          paddingHorizontal: spacing.md,
                        }}
                      >
                        <AppText variant="label" style={{ color: colors.textInverse }}>
                          {localizedName(locale, item.nameEn, item.nameAr)}
                        </AppText>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {captionsOn ? (
                <View
                  style={{
                    marginHorizontal: spacing.lg,
                    marginBottom: spacing.sm,
                    gap: spacing.sm,
                  }}
                >
                  {lastUser ? (
                    <View
                      style={{
                        alignSelf: 'flex-end',
                        maxWidth: '85%',
                        backgroundColor: colors.surfaceInverseAlt,
                        borderRadius: radius.lg,
                        paddingVertical: spacing.sm,
                        paddingHorizontal: spacing.md,
                      }}
                    >
                      <AppText variant="label" style={{ color: colors.textInverse }}>
                        {lastUser.text}
                      </AppText>
                    </View>
                  ) : null}
                  <View
                    style={{
                      backgroundColor: colors.overlay,
                      borderRadius: radius.lg,
                      padding: spacing.md,
                      gap: spacing.xs,
                    }}
                  >
                    <AppText variant="caption" style={{ color: colors.textInverseMuted }}>
                      {captionLabel}
                    </AppText>
                    <AppText variant="bodyStrong" style={{ color: colors.textInverse }}>
                      {lastAssistant ? lastAssistant.text : t('mobile.assistant.connecting')}
                    </AppText>
                  </View>
                </View>
              ) : null}

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-end',
                  justifyContent: 'space-between',
                  paddingHorizontal: spacing.xl,
                  paddingTop: spacing.sm,
                  paddingBottom: spacing.md,
                }}
              >
                <MediaControl
                  icon={micMuted ? 'micOff' : 'mic'}
                  label={micMuted ? t('mobile.assistant.micMuted') : t('mobile.assistant.mic')}
                  active={micMuted}
                  onPress={toggleMic}
                />
                <MediaControl
                  icon="plus"
                  tone="primary"
                  label={t('mobile.assistant.addToInventory')}
                  badge={detections.length > 0 ? detections.length : undefined}
                  onPress={() => setConfirmOpen(true)}
                />
                <MediaControl
                  icon="captions"
                  label={t('mobile.assistant.captions')}
                  active={captionsOn}
                  onPress={() => setCaptionsOn((prev) => !prev)}
                />
                <MediaControl icon="close" label={t('mobile.assistant.end')} onPress={endSession} />
              </View>
            </>
          ) : (
            <>
              <ScrollView
                ref={scrollRef}
                style={{ flex: 1 }}
                contentContainerStyle={{
                  paddingHorizontal: spacing.lg,
                  paddingTop: spacing.md,
                  paddingBottom: spacing.lg,
                  gap: spacing.sm,
                }}
                keyboardShouldPersistTaps="handled"
                onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
              >
                {turns.length === 0 && status !== 'connecting' ? (
                  <View
                    style={{ gap: spacing.sm, alignItems: 'flex-start', marginTop: spacing.xl }}
                  >
                    {starterLabels.map((label) => (
                      <Chip key={label} label={label} onPress={() => sendMessage(label)} />
                    ))}
                  </View>
                ) : null}
                {groupedTurns.map((turn) => (
                  <Bubble key={turn.id} turn={turn} />
                ))}
                {speaking ? (
                  <SpeakingBubble
                    label={t('mobile.assistant.speaking')}
                    firstInRun={turns.at(-1)?.role !== 'assistant'}
                  />
                ) : null}
                {status === 'connecting' ? (
                  <AppText
                    variant="caption"
                    center
                    style={{ color: colors.textMuted, marginTop: spacing.xl }}
                  >
                    {t('mobile.assistant.connecting')}
                  </AppText>
                ) : null}
              </ScrollView>

              <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
                <Composer
                  mode={mode}
                  draft={draft}
                  micMuted={micMuted}
                  placeholder={t('mobile.assistant.composerPlaceholderMama')}
                  liveLabel={t('mobile.assistant.modeLive')}
                  sendLabel={t('mobile.assistant.send')}
                  micLabel={t('mobile.assistant.mic')}
                  micMutedLabel={t('mobile.assistant.micMuted')}
                  onDraftChange={setDraft}
                  onSubmit={submitDraft}
                  onToggleMic={toggleMic}
                  onLivePress={() => setMode('live')}
                />
              </View>
            </>
          )}

          <ModeSheet
            visible={modeSheetOpen}
            mode={mode}
            captionsOn={captionsOn}
            title={t('mobile.assistant.modeTitle')}
            captionsLabel={t('mobile.assistant.captions')}
            options={modeOptions}
            onModeChange={(next) => {
              setMode(next);
              setModeSheetOpen(false);
            }}
            onCaptionsChange={setCaptionsOn}
            onClose={() => setModeSheetOpen(false)}
          />
        </SafeAreaView>
      )}

      <Sheet
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('mobile.assistant.confirmTitle')}
      >
        <AppText muted>{t('mobile.assistant.confirmBody')}</AppText>
        {detections.length === 0 ? (
          <AppText muted>{t('mobile.assistant.confirmEmpty')}</AppText>
        ) : (
          <ReviewList
            session={detectionsToSession(detections)}
            locations={locationsQuery.data ?? []}
            // Not "photo": nobody took one. The ledger is append-only, so this
            // provenance is permanent.
            source="assistant"
            submitting={create.isPending}
            onConfirm={(items) => {
              if (items.length === 0) return;
              create.mutate(
                { items },
                {
                  onSuccess: () => {
                    setConfirmOpen(false);
                    router.replace('/kitchen');
                  },
                },
              );
            }}
          />
        )}
      </Sheet>
    </View>
  );
}
