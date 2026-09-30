import { View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { Card } from './Card';
import { spacing } from '../theme';

export interface StatProps {
  value: string;
  label: string;
  accessibilityLabel?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function Stat({ value, label, accessibilityLabel, onPress, style }: StatProps) {
  const content = (
    <Card
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={{
        minHeight: 86,
        padding: spacing.lg,
        justifyContent: 'center',
        gap: spacing.xs,
      }}
    >
      <AppText variant="numeralSmall">{value}</AppText>
      <AppText variant="caption" muted>
        {label}
      </AppText>
    </Card>
  );

  return <View style={[{ flex: 1 }, style]}>{content}</View>;
}
