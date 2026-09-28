import type { ReactNode } from 'react';
import { View } from 'react-native';
import { AppText, OrbMascot } from '../../components';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { Waveform } from './Waveform';
import type { GroupedTranscriptTurn } from '../../lib/assistant/transcript';

interface BubbleShellProps {
  mine: boolean;
  firstInRun?: boolean;
  children: ReactNode;
  accessibilityLabel?: string;
  liveRegion?: 'none' | 'polite' | 'assertive';
}

function BubbleShell({
  mine,
  firstInRun = false,
  children,
  accessibilityLabel,
  liveRegion,
}: BubbleShellProps) {
  const { colors } = useTheme();
  const showAvatar = !mine && firstInRun;
  const indentAssistant = !mine && !firstInRun;

  return (
    <View
      style={{
        width: '100%',
        flexDirection: 'row',
        justifyContent: mine ? 'flex-end' : 'flex-start',
        gap: spacing.sm,
      }}
    >
      {!mine ? (
        showAvatar ? (
          <OrbMascot size={28} />
        ) : (
          <View style={{ width: indentAssistant ? 28 : 0 }} />
        )
      ) : null}
      <View
        accessible={!!accessibilityLabel}
        accessibilityLabel={accessibilityLabel}
        accessibilityLiveRegion={liveRegion}
        style={{
          maxWidth: '80%',
          borderRadius: radius.lg,
          borderTopStartRadius: !mine ? radius.xs : radius.lg,
          borderBottomEndRadius: mine ? radius.xs : radius.lg,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          backgroundColor: mine ? colors.primary : colors.surface,
        }}
      >
        {children}
      </View>
    </View>
  );
}

export function Bubble({ turn }: { turn: GroupedTranscriptTurn }) {
  const { colors } = useTheme();
  const mine = turn.role === 'user';
  return (
    <BubbleShell mine={mine} firstInRun={turn.firstInRun}>
      <AppText variant="body" style={{ color: mine ? colors.onFill : colors.text }}>
        {turn.text}
      </AppText>
    </BubbleShell>
  );
}

export function SpeakingBubble({
  label,
  firstInRun = true,
}: {
  label: string;
  firstInRun?: boolean;
}) {
  return (
    <BubbleShell
      mine={false}
      firstInRun={firstInRun}
      accessibilityLabel={label}
      liveRegion="polite"
    >
      <Waveform />
    </BubbleShell>
  );
}
