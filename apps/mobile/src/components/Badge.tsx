import { View } from 'react-native';
import { AppText } from './AppText';
import { countBadgeTone } from './control-tones';
import { radius, spacing, type PaletteColors } from '../theme';
import { useTheme } from '../theme/useTheme';

export type BadgeTone = 'neutral' | 'success' | 'warn' | 'danger' | 'info';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
}

const toneFor = (colors: PaletteColors): Record<BadgeTone, { bg: string; fg: string }> => ({
  neutral: { bg: colors.surfaceAlt, fg: colors.textMuted },
  success: { bg: colors.successSoft, fg: colors.success },
  warn: { bg: colors.warnSoft, fg: colors.warn },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  info: { bg: colors.primarySoft, fg: colors.primaryText },
});

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const { colors } = useTheme();
  const c = toneFor(colors)[tone];
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: c.bg,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
      }}
    >
      <AppText variant="caption" style={{ color: c.fg }}>
        {label}
      </AppText>
    </View>
  );
}

export interface CountBadgeProps {
  count: number;
  /** Spoken instead of the bare number, e.g. "3 photos". */
  accessibilityLabel?: string;
}

/** A 20pt count circle in `text` with a `bg` numeral (spec §8.4). */
export function CountBadge({ count, accessibilityLabel }: CountBadgeProps) {
  const { colors } = useTheme();
  const tone = countBadgeTone(colors);
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? String(count)}
      style={{
        minWidth: 20,
        minHeight: 20,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.xs,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tone.fill,
      }}
    >
      <AppText variant="caption" style={{ color: tone.label, fontVariant: ['tabular-nums'] }}>
        {count}
      </AppText>
    </View>
  );
}
