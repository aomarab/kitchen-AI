import type { ReactNode } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Avatar, Banner, Button, Card, IconButton, type IconName } from '../../components';
import { radius, spacing, type ColorToken } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { assistantHeaderAccessibilityLabel } from '../../lib/assistant/accessibility';
import { usePressFeedback } from '../../components/press-feedback';
import { Waveform } from './Waveform';

export interface AssistantHeaderProps {
  title: string;
  subtitle: string;
  connectedLabel: string;
  backLabel: string;
  moreLabel: string;
  live: boolean;
  demoLabel?: string | null;
  media?: boolean;
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
  demoLabel,
  media = false,
  hideMore = false,
  onBack,
  onMore,
}: AssistantHeaderProps) {
  const { colors } = useTheme();
  const captionLabel = assistantHeaderAccessibilityLabel({
    name: title,
    demoLabel,
    subtitle,
    status: connectedLabel,
  });
  const dotColor: ColorToken = live ? 'success' : 'control';
  const textColor = media ? colors.textInverse : colors.text;
  const mutedColor = media ? colors.textInverseMuted : colors.textMuted;
  const controlTone = media ? 'media' : 'plain';

  return (
    <View
      style={{
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.gutter,
        paddingTop: spacing.sm,
        paddingBottom: spacing.sm,
      }}
    >
      <IconButton
        icon="x"
        size={44}
        tone={controlTone}
        accessibilityLabel={backLabel}
        onPress={onBack}
      />
      <Avatar name={title} size={40} />
      <View accessible accessibilityLabel={captionLabel} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <AppText variant="bodyStrong" style={{ color: textColor }}>
            {title}
          </AppText>
          {demoLabel ? (
            <>
              <View style={{ width: 5, height: 5, backgroundColor: mutedColor }} />
              <AppText variant="caption" style={{ color: mutedColor }}>
                {demoLabel}
              </AppText>
            </>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <View
            style={{
              width: 6,
              height: 6,
              backgroundColor: colors[dotColor],
            }}
          />
          <AppText variant="caption" style={{ color: mutedColor }}>
            {subtitle} · {connectedLabel}
          </AppText>
        </View>
      </View>
      {!hideMore ? (
        <IconButton
          icon="more"
          size={44}
          tone={controlTone}
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
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignSelf: centered ? 'center' : 'flex-start',
        marginHorizontal: spacing.lg,
        marginBottom: spacing.sm,
        backgroundColor: media ? colors.surfaceInverseAlt : colors.surfaceAlt,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
      }}
    >
      <AppText variant="caption" style={{ color: media ? colors.textInverse : colors.primaryText }}>
        {label}
      </AppText>
    </View>
  );
}

export function DemoBanner({ label }: { label: string }) {
  return (
    <Banner
      icon="info"
      message={label}
      iconColor="textMuted"
      accessibilityLabel={label}
      style={{ marginHorizontal: spacing.gutter, marginBottom: spacing.xl }}
    />
  );
}

export function LiveTopBar({
  title,
  subtitle,
  connectedLabel,
  demoLabel,
  liveLabel,
  exitLabel,
  moreLabel,
  onExit,
  onMore,
}: {
  title: string;
  subtitle: string;
  connectedLabel: string;
  demoLabel?: string | null;
  liveLabel: string;
  exitLabel: string;
  moreLabel: string;
  onExit: () => void;
  onMore: () => void;
}) {
  return (
    <AssistantHeader
      title={title}
      subtitle={subtitle}
      connectedLabel={connectedLabel}
      backLabel={exitLabel}
      moreLabel={moreLabel}
      live
      demoLabel={demoLabel ?? liveLabel}
      media
      onBack={onExit}
      onMore={onMore}
    />
  );
}

export function MediaControl({
  icon,
  label,
  onPress,
  tone,
  active,
  badge,
  media = true,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: 'plain' | 'surface' | 'outline' | 'coral' | 'inverse' | 'media';
  active?: boolean;
  badge?: number;
  media?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: spacing.xs, opacity: active ? 1 : 0.96 }}>
      <View>
        <IconButton
          icon={icon}
          size={44}
          tone={tone ?? 'media'}
          accessibilityLabel={label}
          accessibilityState={active === undefined ? undefined : { selected: active }}
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
      <AppText
        variant="caption"
        style={{ color: media ? colors.textInverseMuted : colors.textMuted }}
      >
        {label}
      </AppText>
    </View>
  );
}

export function LockedVoiceOverlay({
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
  const scrimPressFeedback = usePressFeedback();
  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        onPress={onClose}
        {...scrimPressFeedback.pressHandlers}
        style={{ flex: 1 }}
      >
        <Animated.View
          style={[{ flex: 1, backgroundColor: colors.overlay }, scrimPressFeedback.animatedStyle]}
        />
      </Pressable>
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
          <Avatar name="Mama" size={80} />
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
              tone={micMuted ? 'surface' : 'coral'}
              onPress={onToggleMic}
            />
            <PanelControl icon="x" label={closeLabel} tone="surface" onPress={onClose} />
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
  tone: 'surface' | 'coral';
  onPress: () => void;
}) {
  return (
    <View style={{ alignItems: 'center', gap: spacing.xs }}>
      <IconButton icon={icon} size={48} tone={tone} accessibilityLabel={label} onPress={onPress} />
      <AppText variant="caption" muted center>
        {label}
      </AppText>
    </View>
  );
}
