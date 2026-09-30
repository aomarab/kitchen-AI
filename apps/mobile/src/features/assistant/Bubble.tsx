import type { ReactNode } from 'react';
import { View } from 'react-native';
import { AppText } from '../../components';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';
import { Waveform } from './Waveform';
import type { GroupedTranscriptTurn } from '../../lib/assistant/transcript';

interface BubbleShellProps {
  mine: boolean;
  children: ReactNode;
  accessibilityLabel?: string;
  liveRegion?: 'none' | 'polite' | 'assertive';
}

function BubbleShell({ mine, children, accessibilityLabel, liveRegion }: BubbleShellProps) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        alignSelf: 'stretch',
        flexDirection: 'row',
        justifyContent: mine ? 'flex-end' : 'flex-start',
        gap: spacing.sm,
      }}
    >
      <View
        accessible={!!accessibilityLabel}
        accessibilityLabel={accessibilityLabel}
        accessibilityLiveRegion={liveRegion}
        style={{
          maxWidth: 290,
          paddingVertical: 10,
          paddingHorizontal: 14,
          backgroundColor: mine ? colors.inverse : colors.surfaceAlt,
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
    <BubbleShell mine={mine}>
      <AppText variant="body" style={{ color: mine ? colors.onInverse : colors.text }}>
        {turn.text}
      </AppText>
    </BubbleShell>
  );
}

export function SpeakingBubble({ label }: { label: string; firstInRun?: boolean }) {
  return (
    <BubbleShell mine={false} accessibilityLabel={label} liveRegion="polite">
      <Waveform />
    </BubbleShell>
  );
}
