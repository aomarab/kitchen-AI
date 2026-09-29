import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { useIsFocused, useRouter } from 'expo-router';
import { AppText, Button, Card, DirectionalIcon, Icon, type IconName } from '../../components';
import { ReviewList } from '../capture/ReviewList';
import { Sheet } from '../../components/Sheet';
import { useFormat } from '../../hooks/useFormat';
import { useLocations, useBulkCreateInventory } from '../../hooks/inventory';
import { formatMeasure, localizedName } from '../../lib/format';
import { api } from '../../lib/api';
import { OpenAiRealtimeAssistantClient } from '../../lib/assistant/openai-realtime';
import { detectionsToSession } from '../../lib/assistant/detections';
import {
  assistantConnectionLabelKey,
  assistantFailureMessageKey,
} from '../../lib/assistant/failure';
import { ASSISTANT_MODES, type AssistantMode } from '../../lib/assistant/mode';
import { appendTranscriptTurn, groupTurns, showStarters } from '../../lib/assistant/transcript';
import {
  assistantDetectionAccessibilityLabel,
  assistantPausedTextAccessibilityLabel,
} from '../../lib/assistant/accessibility';
import type {
  AssistantStatus,
  DetectedItem,
  RealtimeAssistantClient,
  TranscriptTurn,
} from '../../lib/assistant/realtime-port';
import { LOW_CONFIDENCE } from '../../lib/capture';
import { MAX_ASSISTANT_SESSION_MS } from '@kitchen/contracts';
import { formatNumber } from '@kitchen/i18n';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { usePressFeedback } from '../../components/press-feedback';
import {
  AssistantHeader,
  DemoBanner,
  DemoBadge,
  LiveTopBar,
  LockedVoiceOverlay,
  MediaControl,
} from './AssistantHeader';
import { Bubble, SpeakingBubble } from './Bubble';
import { Composer } from './Composer';
import { ModeSheet } from './ModeSheet';
import { Waveform } from './Waveform';

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
 * Detections are shown as labelled sample boxes and confirmation rows, never as
 * inventory writes.
 *
 * Nothing the assistant reports is auto-written. "Add" opens the same
 * {@link ReviewList} the capture flows use, and only a confirm there reaches the
 * append-only ledger — with permanent `assistant` provenance.
 *
 * `initialMode`/`lockMode`/`onExit` let a caller embed a fixed mode (the cook
 * screen opens a locked **Voice** session). `createClient` is an injection seam
 * (default: the real adapter), the same port shape used across the app.
 */
export type { AssistantMode };

const MODES = ASSISTANT_MODES;
export const ASSISTANT_PROMPT_MIN_HEIGHT = 48;
const DETECTION_CORNER_LENGTH = 18;
const DETECTION_CORNER_THICKNESS = 3;
const DETECTION_TAG_HEIGHT = 22;
const DETECTION_FRAMES = [
  { top: 92, start: 196, width: 132, height: 96 },
  { top: 242, start: 36, width: 132, height: 124 },
  { top: 324, start: 224, width: 132, height: 96 },
] as const;

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
  const { t, locale, prefs } = useFormat();
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
  /** The last adapter error code for this session; cleared when a new one starts. */
  const [failure, setFailure] = useState<string | null>(null);
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
    setFailure(null);
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
        else if (event.type === 'transcript')
          setTurns((prev) => appendTranscriptTurn(prev, event.turn, { isMock: client.isMock }));
        else if (event.type === 'detections') setDetections(event.items);
        else if (event.type === 'error') setFailure(event.code);
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
    // A lost reply is forgotten on the next attempt; a lost session is not.
    setFailure((prev) => (prev === 'assistant.providerError' ? null : prev));
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
  const groupedTurns = groupTurns(turns);
  const startersVisible = showStarters(turns, status);
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
        icon:
          value === 'text'
            ? ('text' as const)
            : value === 'voice'
              ? ('mic' as const)
              : ('video' as const),
        label:
          value === 'text'
            ? t('mobile.assistant.modeText')
            : value === 'voice'
              ? t('mobile.assistant.modeVoice')
              : t('mobile.assistant.modeLive'),
        subtitle:
          value === 'text'
            ? t('mobile.assistant.modeTextHint')
            : value === 'voice'
              ? t('mobile.assistant.voiceTitle')
              : t('mobile.assistant.cameraTitle'),
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
  const connectionLabel = t(assistantConnectionLabelKey(status));
  // Fatal errors are followed by `ended`; anything else lost one reply only.
  const sessionFailed = failure !== null && status === 'ended' && !capReached;
  const replyFailed = failure !== null && status === 'live';
  const failureMessage = failure ? t(assistantFailureMessageKey(failure)) : null;
  const demoLabel = isMock ? t('mobile.assistant.demoBadge') : t('mobile.assistant.liveBadge');
  const demoBanner =
    isMock && !isLiveSurface ? <DemoBanner label={t('mobile.assistant.demoNote')} /> : null;
  const lockedDemoBadge = isMock ? (
    <DemoBadge label={t('mobile.assistant.demoBadge')} media={isLiveSurface} centered={lockMode} />
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
          speaking={speaking}
          demoBadge={lockedDemoBadge}
          caption={lastAssistant?.text ?? captionLabel}
          micMuted={micMuted}
          micLabel={micMuted ? t('mobile.assistant.micMuted') : t('mobile.assistant.mic')}
          closeLabel={t('mobile.assistant.cookClose')}
          capReached={capReached || sessionFailed}
          capTitle={
            sessionFailed ? t('mobile.assistant.errorTitle') : t('mobile.assistant.capTitle')
          }
          capBody={sessionFailed && failureMessage ? failureMessage : capBody}
          resumeLabel={sessionFailed ? t('common.retry') : t('mobile.assistant.resume')}
          onToggleMic={toggleMic}
          onClose={endSession}
          onResume={resume}
        />
      ) : (
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          {isLiveSurface ? (
            <LiveTopBar
              title={t('mobile.assistant.mamaName')}
              subtitle={t('mobile.assistant.subtitle')}
              connectedLabel={connectionLabel}
              demoLabel={demoLabel}
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
              connectedLabel={connectionLabel}
              backLabel={t('common.back')}
              moreLabel={t('mobile.assistant.moreOptions')}
              live={status === 'live'}
              demoLabel={demoLabel}
              onBack={endSession}
              onMore={() => setModeSheetOpen(true)}
            />
          )}

          {demoBanner}

          {mode === 'live' && !cameraReady ? (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Card style={{ gap: spacing.md, margin: spacing.lg }}>
                <AppText variant="heading">{t('mobile.assistant.cameraTitle')}</AppText>
                <AppText muted>
                  {/* No session exists behind this gate yet, so it cannot know
                      whether one will be scripted: say "demo" only once one is. */}
                  {clientRef.current?.isMock
                    ? t('mobile.assistant.cameraHint')
                    : t('mobile.assistant.cameraHintLive')}
                </AppText>
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
              {detections.length > 0 || isMock ? (
                <SpottedSampleLabel
                  label={
                    isMock
                      ? t('mobile.assistant.spottedLabel')
                      : t('mobile.assistant.spottedLabelLive')
                  }
                />
              ) : null}
              <DetectionOverlay
                detections={detections}
                locale={locale}
                prefs={prefs}
                notSureLabel={t('mobile.review.notSure')}
              />
              <View style={{ flex: 1 }} />

              {captionsOn ? (
                <LiveCaptionPanel
                  captionLabel={captionLabel}
                  userText={lastUser?.text ?? null}
                  assistantText={
                    lastAssistant ? lastAssistant.text : t('mobile.assistant.connecting')
                  }
                />
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
                  icon="captions"
                  label={t('mobile.assistant.captions')}
                  active={captionsOn}
                  onPress={() => setCaptionsOn((prev) => !prev)}
                />
                <MediaControl
                  icon="plus"
                  label={t('mobile.assistant.addToInventory')}
                  onPress={() => setConfirmOpen(true)}
                />
                <MediaControl
                  icon="x"
                  tone="coral"
                  label={t('mobile.assistant.end')}
                  onPress={endSession}
                />
              </View>
            </>
          ) : mode === 'voice' ? (
            <VoiceAssistantPanel
              title={t('mobile.assistant.voiceTitle')}
              hint={isMock ? t('mobile.assistant.voiceHint') : t('mobile.assistant.voiceHintLive')}
              speakingLabel={t('mobile.assistant.speaking')}
              caption={lastAssistant?.text ?? t('mobile.assistant.connecting')}
              captionsOn={captionsOn}
              micMuted={micMuted}
              micLabel={micMuted ? t('mobile.assistant.micMuted') : t('mobile.assistant.mic')}
              captionsLabel={t('mobile.assistant.captions')}
              endLabel={t('mobile.assistant.end')}
              onToggleMic={toggleMic}
              onToggleCaptions={() => setCaptionsOn((prev) => !prev)}
              onEnd={endSession}
            />
          ) : (
            <>
              <ScrollView
                ref={scrollRef}
                style={{ flex: 1 }}
                contentContainerStyle={{
                  paddingHorizontal: spacing.gutter,
                  paddingTop: spacing.md,
                  paddingBottom: spacing.lg,
                  gap: spacing.sm,
                  flexGrow: 1,
                }}
                keyboardShouldPersistTaps="handled"
                onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
              >
                {groupedTurns.map((turn) => (
                  <Bubble key={turn.id} turn={turn} />
                ))}
                {groupedTurns.length === 0 && !speaking ? (
                  <EmptyTranscript label={t('mobile.assistant.emptyTranscript')} />
                ) : null}
                {startersVisible ? (
                  <View
                    style={{
                      gap: spacing.sm,
                      width: '100%',
                      marginTop: groupedTurns.length > 0 ? spacing.sm : spacing.xl,
                    }}
                  >
                    {starterLabels.map((label) => (
                      <AssistantStarterPrompt
                        key={label}
                        label={label}
                        onPress={() => sendMessage(label)}
                      />
                    ))}
                  </View>
                ) : null}
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
                {replyFailed && failureMessage ? (
                  <AppText
                    variant="caption"
                    center
                    color="danger"
                    accessibilityRole="alert"
                    style={{ marginTop: spacing.md }}
                  >
                    {failureMessage}
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
                  onModePress={() => setModeSheetOpen(true)}
                />
              </View>
            </>
          )}

          <ModeSheet
            visible={modeSheetOpen}
            mode={mode}
            title={t('mobile.assistant.modeTitle')}
            selectedLabel={t('mobile.assistant.personaSelected')}
            options={modeOptions}
            onModeChange={(next) => {
              setMode(next);
            }}
            onClose={() => setModeSheetOpen(false)}
          />
          {capReached ? (
            <SessionPausedOverlay
              title={t('mobile.assistant.capTitle')}
              body={capBody}
              resumeLabel={t('mobile.assistant.resume')}
              endLabel={t('mobile.assistant.end')}
              onResume={resume}
              onEnd={endSession}
            />
          ) : sessionFailed && failureMessage ? (
            <SessionPausedOverlay
              icon={failure === 'assistant.micDenied' ? 'micOff' : 'wifiOff'}
              title={t('mobile.assistant.errorTitle')}
              body={failureMessage}
              resumeLabel={t('common.retry')}
              endLabel={t('mobile.assistant.end')}
              onResume={resume}
              onEnd={endSession}
            />
          ) : null}
        </SafeAreaView>
      )}

      <Sheet
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('mobile.assistant.confirmTitle')}
      >
        <AppText muted>
          {isMock ? t('mobile.assistant.confirmBody') : t('mobile.assistant.confirmBodyLive')}
        </AppText>
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

function EmptyTranscript({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        minHeight: 260,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.md,
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: 'row', alignItems: 'flex-end' }}
      >
        <Icon name="chat" size={34} color={colors.text} />
        <Icon name="chat" size={34} color={colors.primary} />
      </View>
      <AppText variant="body" color="textMuted" center>
        {label}
      </AppText>
    </View>
  );
}

function AssistantStarterPrompt({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const pressFeedback = usePressFeedback();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      {...pressFeedback.pressHandlers}
      style={{ minHeight: ASSISTANT_PROMPT_MIN_HEIGHT }}
    >
      <Animated.View
        style={[
          {
            minHeight: ASSISTANT_PROMPT_MIN_HEIGHT,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
            backgroundColor: colors.bg,
          },
          pressFeedback.animatedStyle,
        ]}
      >
        <AppText variant="body" style={{ flex: 1 }}>
          {label}
        </AppText>
        <DirectionalIcon name="arrowR" size={18} color={colors.primary} />
      </Animated.View>
    </Pressable>
  );
}

function VoiceAssistantPanel({
  title,
  hint,
  speakingLabel,
  caption,
  captionsOn,
  micMuted,
  micLabel,
  captionsLabel,
  endLabel,
  onToggleMic,
  onToggleCaptions,
  onEnd,
}: {
  title: string;
  hint: string;
  speakingLabel: string;
  caption: string;
  captionsOn: boolean;
  micMuted: boolean;
  micLabel: string;
  captionsLabel: string;
  endLabel: string;
  onToggleMic: () => void;
  onToggleCaptions: () => void;
  onEnd: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, paddingHorizontal: spacing.gutter }}>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xl,
        }}
      >
        <View style={{ alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="title" center>
            {title}
          </AppText>
          <AppText variant="body" color="textMuted" center>
            {hint}
          </AppText>
        </View>
        <Waveform highlightTail />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={{ width: 8, height: 8, backgroundColor: colors.primary }} />
          <AppText variant="bodyStrong">{speakingLabel}</AppText>
        </View>
        {captionsOn ? (
          <View
            style={{
              width: '100%',
              backgroundColor: colors.surfaceAlt,
              paddingVertical: spacing.lg,
              paddingHorizontal: spacing.md,
            }}
          >
            <AppText variant="body" center>
              {caption}
            </AppText>
          </View>
        ) : null}
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          gap: spacing.xl,
          paddingBottom: spacing.xl,
        }}
      >
        <MediaControl
          icon={micMuted ? 'micOff' : 'mic'}
          label={micLabel}
          tone="outline"
          media={false}
          onPress={onToggleMic}
        />
        <MediaControl
          icon="captions"
          label={captionsLabel}
          tone="inverse"
          media={false}
          active={captionsOn}
          onPress={onToggleCaptions}
        />
        <MediaControl icon="x" label={endLabel} tone="coral" media={false} onPress={onEnd} />
      </View>
    </View>
  );
}

function SpottedSampleLabel({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        position: 'absolute',
        top: 128,
        start: spacing.gutter,
        zIndex: 2,
        minHeight: 28,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        backgroundColor: colors.overlay,
        paddingHorizontal: spacing.sm,
      }}
    >
      <View style={{ width: 6, height: 6, backgroundColor: colors.primary }} />
      <AppText variant="caption" style={{ color: colors.textInverse }}>
        {label}
      </AppText>
    </View>
  );
}

function detectionTag(
  item: DetectedItem,
  options: {
    locale: ReturnType<typeof useFormat>['locale'];
    prefs: ReturnType<typeof useFormat>['prefs'];
    t: ReturnType<typeof useFormat>['t'];
    lowConfidence: boolean;
    notSureLabel: string;
  },
) {
  const name = localizedName(options.locale, item.nameEn, item.nameAr);
  const measure =
    item.quantity == null
      ? null
      : formatMeasure(options.t, options.locale, item.quantity, item.unit, options.prefs);
  const itemLabel = measure ? `${name}, ${measure}` : name;
  return options.lowConfidence ? `${itemLabel}, ${options.notSureLabel}` : itemLabel;
}

function DetectionOverlay({
  detections,
  locale,
  prefs,
  notSureLabel,
}: {
  detections: DetectedItem[];
  locale: ReturnType<typeof useFormat>['locale'];
  prefs: ReturnType<typeof useFormat>['prefs'];
  notSureLabel: string;
}) {
  const { t } = useFormat();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {detections.slice(0, DETECTION_FRAMES.length).map((item, index) => {
        const frame = DETECTION_FRAMES[index]!;
        const lowConfidence = item.confidence < LOW_CONFIDENCE;
        const label = detectionTag(item, { locale, prefs, t, lowConfidence, notSureLabel });
        return (
          <DetectionBox
            key={item.id}
            label={label}
            lowConfidence={lowConfidence}
            style={frame}
            accessibilityLabel={assistantDetectionAccessibilityLabel({
              label,
              confidenceLabel: lowConfidence ? notSureLabel : null,
            })}
          />
        );
      })}
    </View>
  );
}

function DetectionBox({
  label,
  lowConfidence,
  style,
  accessibilityLabel,
}: {
  label: string;
  lowConfidence: boolean;
  style: (typeof DETECTION_FRAMES)[number];
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const bracketColor = lowConfidence ? colors.textInverseMuted : colors.primary;
  const tagFill = lowConfidence ? colors.surfaceInverseAlt : colors.primary;
  const tagText = lowConfidence ? colors.textInverse : colors.onFill;
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={{
        position: 'absolute',
        top: style.top,
        start: style.start,
        width: style.width,
        height: style.height,
        zIndex: 2,
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: -DETECTION_TAG_HEIGHT - spacing.xs,
          start: 0,
          minHeight: DETECTION_TAG_HEIGHT,
          justifyContent: 'center',
          backgroundColor: tagFill,
          paddingHorizontal: spacing.sm,
        }}
      >
        <AppText variant="eyebrow" style={{ color: tagText }} numberOfLines={1}>
          {label}
        </AppText>
      </View>
      <DetectionCorner edge="topStart" color={bracketColor} dashed={lowConfidence} />
      <DetectionCorner edge="topEnd" color={bracketColor} dashed={lowConfidence} />
      <DetectionCorner edge="bottomStart" color={bracketColor} dashed={lowConfidence} />
      <DetectionCorner edge="bottomEnd" color={bracketColor} dashed={lowConfidence} />
    </View>
  );
}

function DetectionCorner({
  edge,
  color,
  dashed,
}: {
  edge: 'topStart' | 'topEnd' | 'bottomStart' | 'bottomEnd';
  color: string;
  dashed: boolean;
}) {
  const verticalStart = edge.startsWith('top') ? { top: 0 } : { bottom: 0 };
  const horizontalStart = edge.endsWith('Start') ? { start: 0 } : { end: 0 };
  return (
    <View
      style={{
        position: 'absolute',
        width: DETECTION_CORNER_LENGTH,
        height: DETECTION_CORNER_LENGTH,
        borderColor: color,
        borderStyle: dashed ? 'dashed' : 'solid',
        borderTopWidth: edge.startsWith('top') ? DETECTION_CORNER_THICKNESS : 0,
        borderBottomWidth: edge.startsWith('bottom') ? DETECTION_CORNER_THICKNESS : 0,
        borderStartWidth: edge.endsWith('Start') ? DETECTION_CORNER_THICKNESS : 0,
        borderEndWidth: edge.endsWith('End') ? DETECTION_CORNER_THICKNESS : 0,
        ...verticalStart,
        ...horizontalStart,
      }}
    />
  );
}

function LiveCaptionPanel({
  captionLabel,
  userText,
  assistantText,
}: {
  captionLabel: string;
  userText: string | null;
  assistantText: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        marginHorizontal: spacing.gutter,
        marginBottom: spacing.sm,
        gap: spacing.sm,
      }}
    >
      {userText ? (
        <View
          style={{
            alignSelf: 'flex-end',
            maxWidth: 290,
            backgroundColor: colors.surfaceInverseAlt,
            paddingVertical: 10,
            paddingHorizontal: 14,
          }}
        >
          <AppText variant="label" style={{ color: colors.textInverse }}>
            {userText}
          </AppText>
        </View>
      ) : null}
      <View
        style={{
          backgroundColor: colors.overlay,
          padding: spacing.md,
          gap: spacing.xs,
        }}
      >
        <AppText variant="caption" style={{ color: colors.textInverseMuted }}>
          {captionLabel}
        </AppText>
        <AppText variant="bodyStrong" style={{ color: colors.textInverse }}>
          {assistantText}
        </AppText>
      </View>
    </View>
  );
}

function SessionPausedOverlay({
  icon = 'timer',
  title,
  body,
  resumeLabel,
  endLabel,
  onResume,
  onEnd,
}: {
  icon?: IconName;
  title: string;
  body: string;
  resumeLabel: string;
  endLabel: string;
  onResume: () => void;
  onEnd: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        start: 0,
        end: 0,
        justifyContent: 'center',
        paddingHorizontal: 30,
        backgroundColor: colors.overlay,
      }}
    >
      <View
        style={{
          backgroundColor: colors.surface,
          padding: spacing.xl,
          gap: spacing.lg,
        }}
      >
        <Icon name={icon} size={44} color={colors.text} />
        <View
          accessible
          accessibilityRole="alert"
          accessibilityLabel={assistantPausedTextAccessibilityLabel({ title, body })}
          style={{ gap: spacing.sm }}
        >
          <AppText variant="title" accessibilityRole="header">
            {title}
          </AppText>
          <AppText variant="body" color="textMuted">
            {body}
          </AppText>
        </View>
        <Button title={resumeLabel} onPress={onResume} />
        <Button title={endLabel} variant="ghost" onPress={onEnd} />
      </View>
    </View>
  );
}
