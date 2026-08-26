import { View } from 'react-native';
import { AppText } from './AppText';
import { radius, spacing, type PaletteColors } from '../theme';
import { useTheme } from '../theme/useTheme';

export type BadgeTone = 'neutral' | 'success' | 'warn' | 'danger' | 'info' | 'inverse';

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
  // For the always-dark cook surface. Every other tone pairs a mode-following
  // soft tint with its own strong colour, and in dark mode those tints sit on
  // the same side of the lightness line as the cook ground.
  inverse: { bg: colors.surfaceInverseAlt, fg: colors.textInverse },
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
