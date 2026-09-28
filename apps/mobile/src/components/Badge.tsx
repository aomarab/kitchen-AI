import { View } from 'react-native';
import { AppText } from './AppText';
import { badgeTone, type BadgeToneName } from './status-tones';
import { useTheme } from '../theme/useTheme';

export type BadgeTone = BadgeToneName;

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
}

export function Badge({ label, tone = 'muted' }: BadgeProps) {
  const { colors } = useTheme();
  const toneSpec = badgeTone(colors, tone);
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: toneSpec.fill,
      }}
    >
      <View
        style={{
          width: toneSpec.dotSize,
          height: toneSpec.dotSize,
          backgroundColor: toneSpec.dot,
        }}
      />
      <AppText variant="label" style={{ color: toneSpec.label }}>
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

export function CountBadge({ count, accessibilityLabel }: CountBadgeProps) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? String(count)}
      style={{
        minWidth: 20,
        minHeight: 20,
        paddingHorizontal: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
      }}
    >
      <AppText variant="eyebrow" style={{ color: colors.onFill, fontVariant: ['tabular-nums'] }}>
        {count}
      </AppText>
    </View>
  );
}
