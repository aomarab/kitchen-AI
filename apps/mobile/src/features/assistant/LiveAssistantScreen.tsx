import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { AppText, Button, Card, Icon, type IconName } from '../../components';
import { ReviewList } from '../capture/ReviewList';
import { Sheet } from '../../components/Sheet';
import { useFormat } from '../../hooks/useFormat';
import { useLocations, useBulkCreateInventory } from '../../hooks/inventory';
import { localizedName } from '../../lib/format';
import { MockRealtimeAssistantClient } from '../../lib/assistant/mock-realtime';
import { detectionsToSession } from '../../lib/assistant/detections';
import type {
  AssistantStatus,
  DetectedItem,
  RealtimeAssistantClient,
  TranscriptTurn,
} from '../../lib/assistant/realtime-port';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

/**
 * The assistant on mobile (spec §5, Feature 5; mobile surface
 * `2026-08-28-mobile-live-assistant-design.md`). Three ways to talk, mirroring
 * the web assistant:
 *
 * - **Text** — a typed chat. No camera, no microphone.
 * - **Voice** — talk hands-free. No camera. (The mic control is a demo mute;
 *   the scripted client reads no real audio, so nothing is recorded.)
 * - **Live** — the original camera + voice surface: point the phone at your
 *   food and the assistant reports what it "sees" as a labelled sample.
 *
 * The transport is a **port** driven today only by the scripted
 * {@link MockRealtimeAssistantClient} — React Native has no realtime WebRTC
 * without a native module, so the live model is a later slice behind the same
 * interface. Because the client is a mock, `isMock` is `true` and a persistent
 * demo badge is shown: a scripted answer over a real camera preview must never
 * read as real vision. Detections are shown as a labelled "Spotted (sample)"
 * row, never as boxes on the feed.
 *
 * Nothing the assistant reports is auto-written. "Add" opens the same
 * {@link ReviewList} the capture flows use, and only a confirm there reaches the
 * append-only ledger — with permanent `assistant` provenance.
 *
 * `initialMode`/`lockMode`/`onExit` let a caller embed a fixed mode (the cook
 * screen opens a locked **Voice** session). `createClient` is an injection seam
 * (default: the mock), the same port shape used across the app.
 */
export type AssistantMode = 'text' | 'voice' | 'live';

const MODES: AssistantMode[] = ['text', 'voice', 'live'];

export function LiveAssistantScreen({
  initialMode = 'live',
  lockMode = false,
  onExit,
  createClient = () => new MockRealtimeAssistantClient(),
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
  const [draft, setDraft] = useState('');

  const clientRef = useRef<RealtimeAssistantClient | null>(null);
  const createClientRef = useRef(createClient);
  createClientRef.current = createClient;

  // Only the live (camera) mode needs a device permission; text and voice are
  // ready at once. Requesting the camera is an explicit tap on the gate card,
  // never on mount.
  const cameraReady = permission?.granted === true;
  const conversationReady = mode !== 'live' || cameraReady;
  const showCamera = mode === 'live' && cameraReady;
  const scrollRef = useRef<ScrollView | null>(null);

  // Start a session once the mode's requirements are met, and restart it when
  // the mode, locale, or camera readiness changes. stop() is the single point
  // that cancels every pending scripted beat, so leaving it out of cleanup would
  // let a caption fire after the screen is gone or the mode has changed.
  useEffect(() => {
    if (!conversationReady) return;
    setSpeaking(false);
    if (mode !== 'live') setDetections([]);
    const client = createClientRef.current();
    clientRef.current = client;
    void client.start({
      locale,
      camera: mode === 'live',
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
  }, [locale, mode, conversationReady]);

  const isMock = clientRef.current?.isMock ?? true;

  const endSession = () => {
    void clientRef.current?.stop();
    if (onExit) onExit();
    else router.back();
  };

  const submitDraft = () => {
    const text = draft.trim();
    if (!text) return;
    clientRef.current?.sendText(text);
    setDraft('');
  };

  const lastAssistant = [...turns].reverse().find((turn) => turn.role === 'assistant');
  const lastUser = [...turns].reverse().find((turn) => turn.role === 'user');

  const captionLabel =
    status === 'connecting'
      ? t('mobile.assistant.connecting')
      : speaking
        ? t('mobile.assistant.speaking')
        : t('mobile.assistant.assistantLabel');

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceInverse }}>
      {showCamera ? (
        <>
          <CameraView
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

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Top bar: real LIVE indicator + honest DEMO badge + speaking + exit. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: spacing.sm,
            padding: spacing.lg,
          }}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, flex: 1 }}>
            {mode !== 'text' ? (
              <Pill tone="danger" label={t('mobile.assistant.liveBadge')} dot />
            ) : null}
            {isMock ? <Pill tone="light" label={t('mobile.assistant.demoBadge')} /> : null}
            {speaking ? (
              <Pill
                tone="primary"
                label={t('mobile.assistant.speaking')}
                accessibilityLabel={t('mobile.assistant.speaking')}
              />
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('mobile.assistant.exit')}
            onPress={endSession}
            style={{
              backgroundColor: colors.overlay,
              borderRadius: radius.pill,
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.md,
            }}
          >
            <AppText variant="label" style={{ color: colors.textInverse }}>
              {t('mobile.assistant.exit')}
            </AppText>
          </Pressable>
        </View>

        {!lockMode ? (
          <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
            <ModeSwitch mode={mode} onChange={setMode} t={t} />
          </View>
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

            {/* Spotted panel — a labelled sample, never boxes on the live feed. */}
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

            {/* Caption card. */}
            {captionsOn ? (
              <View
                style={{ marginHorizontal: spacing.lg, marginBottom: spacing.sm, gap: spacing.sm }}
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

            {/* Control bar. */}
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
              <Control
                icon={micMuted ? 'micOff' : 'mic'}
                label={micMuted ? t('mobile.assistant.micMuted') : t('mobile.assistant.mic')}
                active={micMuted}
                onPress={() => setMicMuted((prev) => !prev)}
              />
              <Control
                icon="plus"
                tone="primary"
                label={t('mobile.assistant.addToInventory')}
                badge={detections.length > 0 ? detections.length : undefined}
                onPress={() => setConfirmOpen(true)}
              />
              <Control
                icon="captions"
                label={t('mobile.assistant.captions')}
                active={captionsOn}
                onPress={() => setCaptionsOn((prev) => !prev)}
              />
              <Control
                icon="close"
                tone="danger"
                label={t('mobile.assistant.end')}
                onPress={endSession}
              />
            </View>
          </>
        ) : (
          /* Text and voice: a chat log plus a composer. */
          <ChatBody
            mode={mode}
            turns={turns}
            status={status}
            draft={draft}
            micMuted={micMuted}
            onDraftChange={setDraft}
            onSubmit={submitDraft}
            onToggleMic={() => setMicMuted((prev) => !prev)}
            scrollRef={scrollRef}
            t={t}
          />
        )}
      </SafeAreaView>

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

/** The Text / Voice / Live segmented control. */
function ModeSwitch({
  mode,
  onChange,
  t,
}: {
  mode: AssistantMode;
  onChange: (mode: AssistantMode) => void;
  t: ReturnType<typeof useFormat>['t'];
}) {
  const { colors } = useTheme();
  const label: Record<
    AssistantMode,
    'mobile.assistant.modeText' | 'mobile.assistant.modeVoice' | 'mobile.assistant.modeLive'
  > = {
    text: 'mobile.assistant.modeText',
    voice: 'mobile.assistant.modeVoice',
    live: 'mobile.assistant.modeLive',
  };
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        alignSelf: 'flex-start',
        gap: spacing.xs,
        padding: spacing.xs,
        borderRadius: radius.pill,
        backgroundColor: colors.overlay,
      }}
    >
      {MODES.map((value) => {
        const selected = mode === value;
        return (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={t(label[value])}
            onPress={() => onChange(value)}
            style={{
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.md,
              borderRadius: radius.pill,
              backgroundColor: selected ? colors.textInverse : 'transparent',
            }}
          >
            <AppText
              variant="label"
              style={{ color: selected ? colors.surfaceInverse : colors.textInverse }}
            >
              {t(label[value])}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The scrollable chat log + composer used by the text and voice modes. */
function ChatBody({
  mode,
  turns,
  status,
  draft,
  micMuted,
  onDraftChange,
  onSubmit,
  onToggleMic,
  scrollRef,
  t,
}: {
  mode: AssistantMode;
  turns: TranscriptTurn[];
  status: AssistantStatus;
  draft: string;
  micMuted: boolean;
  onDraftChange: (text: string) => void;
  onSubmit: () => void;
  onToggleMic: () => void;
  scrollRef: React.RefObject<ScrollView | null>;
  t: ReturnType<typeof useFormat>['t'];
}) {
  const { colors } = useTheme();
  const canSend = draft.trim().length > 0;
  return (
    <>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.md,
          gap: spacing.sm,
        }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {turns.length === 0 && status !== 'connecting' ? (
          <AppText
            variant="caption"
            center
            style={{ color: colors.textInverseMuted, marginTop: spacing.xl }}
          >
            {t('mobile.assistant.emptyTranscript')}
          </AppText>
        ) : null}
        {turns.map((turn) => {
          const mine = turn.role === 'user';
          return (
            <View
              key={turn.id}
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                backgroundColor: mine ? colors.textInverse : colors.overlay,
                borderRadius: radius.lg,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
              }}
            >
              <AppText
                variant="label"
                style={{ color: mine ? colors.surfaceInverse : colors.textInverse }}
              >
                {turn.text}
              </AppText>
            </View>
          );
        })}
        {status === 'connecting' ? (
          <AppText
            variant="caption"
            center
            style={{ color: colors.textInverseMuted, marginTop: spacing.xl }}
          >
            {t('mobile.assistant.connecting')}
          </AppText>
        ) : null}
      </ScrollView>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: spacing.md,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={onDraftChange}
          placeholder={t('mobile.assistant.composerPlaceholder')}
          placeholderTextColor={colors.textInverseMuted}
          onSubmitEditing={onSubmit}
          returnKeyType="send"
          style={{
            flex: 1,
            minHeight: 48,
            borderRadius: radius.pill,
            paddingHorizontal: spacing.lg,
            backgroundColor: colors.surfaceInverseAlt,
            color: colors.textInverse,
          }}
        />
        {mode === 'voice' ? (
          <RoundButton
            icon={micMuted ? 'micOff' : 'mic'}
            label={micMuted ? t('mobile.assistant.micMuted') : t('mobile.assistant.mic')}
            onPress={onToggleMic}
            background={micMuted ? colors.surfaceInverseAlt : colors.textInverse}
            foreground={micMuted ? colors.textInverse : colors.surfaceInverse}
          />
        ) : null}
        <RoundButton
          icon="send"
          label={t('mobile.assistant.send')}
          onPress={onSubmit}
          disabled={!canSend}
          background={colors.primary}
          foreground={colors.onFill}
        />
      </View>
    </>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
  disabled,
  background,
  foreground,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  background: string;
  foreground: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: 48,
        height: 48,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
        backgroundColor: background,
      }}
    >
      <Icon name={icon} size={22} color={foreground} />
    </Pressable>
  );
}

function Pill({
  tone,
  label,
  dot,
  accessibilityLabel,
}: {
  tone: 'danger' | 'primary' | 'light';
  label: string;
  dot?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const bg =
    tone === 'danger' ? colors.danger : tone === 'primary' ? colors.primary : colors.textInverse;
  const fg = tone === 'light' ? colors.surfaceInverse : colors.onFill;
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        backgroundColor: bg,
        borderRadius: radius.pill,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.md,
      }}
    >
      {dot ? (
        <View style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: fg }} />
      ) : null}
      <AppText variant="caption" style={{ color: fg }}>
        {label}
      </AppText>
    </View>
  );
}

function Control({
  icon,
  label,
  onPress,
  tone,
  active,
  badge,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'danger';
  active?: boolean;
  badge?: number;
}) {
  const { colors } = useTheme();
  const bg =
    tone === 'primary'
      ? colors.primary
      : tone === 'danger'
        ? colors.danger
        : active
          ? colors.textInverse
          : colors.surfaceInverseAlt;
  const fg =
    tone === 'primary' || tone === 'danger'
      ? colors.onFill
      : active
        ? colors.surfaceInverse
        : colors.textInverse;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ alignItems: 'center', gap: spacing.xs }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
        }}
      >
        <Icon name={icon} size={24} color={fg} />
        {badge != null ? (
          <View
            style={{
              position: 'absolute',
              top: -2,
              end: -2,
              minWidth: 20,
              height: 20,
              paddingHorizontal: spacing.xs,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.textInverse,
            }}
          >
            <AppText variant="caption" style={{ color: colors.surfaceInverse }}>
              {badge}
            </AppText>
          </View>
        ) : null}
      </View>
      <AppText variant="caption" style={{ color: colors.textInverseMuted }}>
        {label}
      </AppText>
    </Pressable>
  );
}
