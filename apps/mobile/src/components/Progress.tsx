import { View, type StyleProp, type ViewStyle } from 'react-native';
import { progressTone, type ProgressToneName } from './status-tones';
import { useTheme } from '../theme/useTheme';

export interface ProgressProps {
  value: number;
  tone?: ProgressToneName;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function Progress({ value, tone = 'active', accessibilityLabel, style }: ProgressProps) {
  const { colors } = useTheme();
  const progress = clampProgress(value);
  const resolved = progressTone(colors, tone);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
      style={[{ height: 4, backgroundColor: resolved.track, overflow: 'hidden' }, style]}
    >
      <View style={{ height: 4, width: `${progress * 100}%`, backgroundColor: resolved.fill }} />
    </View>
  );
}
