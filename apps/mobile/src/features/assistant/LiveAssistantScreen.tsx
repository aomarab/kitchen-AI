import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView } from 'expo-camera';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { AppText, Icon, type IconName } from '../../components';
import { CameraGate } from '../capture/CameraGate';
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
 * The live camera + voice assistant on mobile (spec §5, Feature 5; mobile
 * surface `2026-08-28-mobile-live-assistant-design.md`).
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
 * `createClient` is an injection seam (default: the mock), the same port shape
 * used across the app.
 */
export function LiveAssistantScreen({
  createClient = () => new MockRealtimeAssistantClient(),
}: {
  createClient?: () => RealtimeAssistantClient;
}) {
  useKeepAwake();
  const { t, locale } = useFormat();
  const router = useRouter();
  const { colors } = useTheme();
  const locationsQuery = useLocations();
  const create = useBulkCreateInventory();

  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [detections, setDetections] = useState<DetectedItem[]>([]);
  const [status, setStatus] = useState<AssistantStatus>('connecting');
  const [speaking, setSpeaking] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [micMuted, setMicMuted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const clientRef = useRef<RealtimeAssistantClient | null>(null);
  const createClientRef = useRef(createClient);
  createClientRef.current = createClient;

  // Start the scripted session once and tear it down on the way out. stop() is
  // the single point that cancels every pending scripted beat, so leaving it out
  // of cleanup would let a caption fire after the screen is gone.
  useEffect(() => {
    const client = createClientRef.current();
    clientRef.current = client;
    void client.start({
      locale,
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
  }, [locale]);

  const isMock = clientRef.current?.isMock ?? true;

  const endSession = () => {
    void clientRef.current?.stop();
    router.back();
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
    <CameraGate>
      <View style={{ flex: 1, backgroundColor: colors.surfaceInverse }}>
        <CameraView
          style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 }}
          facing="back"
        />
        {/* Scrims keep overlaid controls legible over any camera scene. */}
        <View
          style={{ position: 'absolute', top: 0, start: 0, end: 0, height: 160 }}
          pointerEvents="none"
        >
          <View style={{ flex: 1, backgroundColor: colors.overlay }} />
        </View>

        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          {/* Top bar: real LIVE indicator + honest DEMO badge + speaking. */}
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
              <Pill tone="danger" label={t('mobile.assistant.liveBadge')} dot />
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
    </CameraGate>
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
