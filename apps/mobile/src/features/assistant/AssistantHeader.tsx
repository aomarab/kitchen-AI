import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Card, OrbMascot, RoundButton, type IconName } from '../../components';
import { radius, spacing, type ColorToken } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import type { OrbState } from '../../lib/orb';
import { Waveform } from './Waveform';

export interface AssistantHeaderProps {
  title: string;
  subtitle: string;
  connectedLabel: string;
  backLabel: string;
  moreLabel: string;
  live: boolean;
  orbState: OrbState;
  hideMore?: boolean;
  onBack: () => void;
  onMore: () => void;
}

export function AssistantHeader({
  title,
  subtitle,
  connectedLabel,
  backLabel,
  moreLabel,
  live,
  orbState,
  hideMore = false,
  onBack,
  onMore,
}: AssistantHeaderProps) {
  const { colors } = useTheme();
  const captionLabel = live ? `${title}, ${subtitle}, ${connectedLabel}` : `${title}, ${subtitle}`;
  const dotColor: ColorToken = 'success';

  return (
    <View
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.sm,
        paddingBottom: spacing.sm,
      }}
    >
      <RoundButton
        icon="back"
        directional
        size={40}
        tone="surface"
        accessibilityLabel={backLabel}
        onPress={onBack}
      />
      <OrbMascot size={36} state={orbState} />
      <View accessible accessibilityLabel={captionLabel} style={{ flex: 1 }}>
        <AppText variant="bodyStrong">{title}</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          {live ? (
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 7,
                backgroundColor: colors[dotColor],
              }}
            />
          ) : null}
          <AppText variant="caption" muted>
            {subtitle}
          </AppText>
        </View>
      </View>
      {!hideMore ? (
        <RoundButton
          icon="more"
          size={40}
          tone="surface"
          accessibilityLabel={moreLabel}
          onPress={onMore}
        />
      ) : null}
    </View>
  );
}

export function DemoBadge({
  label,
  media,
  centered = false,
}: {
  label: string;
  media: boolean;
  centered?: boolean;
}) {
  const { tintNamed } = useTheme();
  const tint = tintNamed('apricot');
  return (
    <View
      style={{
        alignSelf: centered ? 'center' : 'flex-start',
        marginHorizontal: spacing.lg,
        marginBottom: spacing.sm,
        borderRadius: radius.pill,
        backgroundColor: tint.bg,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        opacity: media ? 0.96 : 1,
      }}
    >
      <AppText variant="caption" style={{ color: tint.fg }}>
        {label}
      </AppText>
    </View>
  );
}

export function LiveTopBar({
  liveLabel,
  exitLabel,
  moreLabel,
  onExit,
  onMore,
}: {
  liveLabel: string;
  exitLabel: string;
  moreLabel: string;
  onExit: () => void;
  onMore: () => void;
}) {
  return (
    <View
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.sm,
        paddingBottom: spacing.sm,
      }}
    >
      <RoundButton
        icon="close"
        size={40}
        tone="media"
        accessibilityLabel={exitLabel}
        onPress={onExit}
      />
      <LivePill label={liveLabel} />
      <View style={{ flex: 1 }} />
      <RoundButton
        icon="more"
        size={40}
        tone="media"
        accessibilityLabel={moreLabel}
        onPress={onMore}
      />
    </View>
  );
}

function LivePill({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        minHeight: 32,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        backgroundColor: colors.danger,
        borderRadius: radius.pill,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.md,
      }}
    >
      <View
        style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.onDanger }}
      />
      <AppText variant="caption" style={{ color: colors.onDanger }}>
        {label}
      </AppText>
    </View>
  );
}

export function MediaControl({
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
  tone?: 'primary';
  active?: boolean;
  badge?: number;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: spacing.xs, opacity: active ? 1 : 0.96 }}>
      <View>
        <RoundButton
          icon={icon}
          size={40}
          tone={tone === 'primary' ? 'primary' : 'media'}
          accessibilityLabel={label}
          onPress={onPress}
        />
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
    </View>
  );
}

export function LockedVoiceOverlay({
  orbState,
  speaking,
  demoBadge,
  caption,
  micMuted,
  micLabel,
  closeLabel,
  capReached,
  capTitle,
  capBody,
  resumeLabel,
  onToggleMic,
  onClose,
  onResume,
}: {
  orbState: OrbState;
  speaking: boolean;
  demoBadge: ReactNode;
  caption: string;
  micMuted: boolean;
  micLabel: string;
  closeLabel: string;
  capReached: boolean;
  capTitle: string;
  capBody: string;
  resumeLabel: string;
  onToggleMic: () => void;
  onClose: () => void;
  onResume: () => void;
}) {
  const { colors, shadow } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: colors.overlay }}
      />
      <SafeAreaView
        edges={['bottom']}
        style={{
          backgroundColor: colors.surface,
          borderTopStartRadius: radius.xl,
          borderTopEndRadius: radius.xl,
          ...shadow.raised,
        }}
      >
        <View style={{ alignItems: 'center', gap: spacing.md, padding: spacing.xl }}>
          <OrbMascot size={72} state={orbState} />
          {speaking ? <Waveform /> : null}
          {demoBadge}
          <AppText variant="bodyStrong" center>
            {caption}
          </AppText>
          {capReached ? (
            <Card style={{ width: '100%', gap: spacing.sm }}>
              <AppText variant="heading">{capTitle}</AppText>
              <AppText muted>{capBody}</AppText>
              <Button title={resumeLabel} onPress={onResume} />
            </Card>
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing.xl }}>
            <PanelControl
              icon={micMuted ? 'micOff' : 'mic'}
              label={micLabel}
              tone={micMuted ? 'sunk' : 'primary'}
              onPress={onToggleMic}
            />
            <PanelControl icon="close" label={closeLabel} tone="sunk" onPress={onClose} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function PanelControl({
  icon,
  label,
  tone,
  onPress,
}: {
  icon: IconName;
  label: string;
  tone: 'primary' | 'sunk';
  onPress: () => void;
}) {
  return (
    <View style={{ alignItems: 'center', gap: spacing.xs }}>
      <RoundButton icon={icon} size={48} tone={tone} accessibilityLabel={label} onPress={onPress} />
      <AppText variant="caption" muted center>
        {label}
      </AppText>
    </View>
  );
}
