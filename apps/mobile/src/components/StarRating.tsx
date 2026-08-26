import { Pressable, View } from 'react-native';
import { Icon } from './Icon';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

export interface StarRatingProps {
  value: number;
  onChange: (value: number) => void;
  /** Returns the accessibility label for the nth star, e.g. "Rate 3 of 5". */
  labelFor: (value: number) => string;
  disabled?: boolean;
}

const STARS = [1, 2, 3, 4, 5];

/**
 * Five independent buttons rather than one slider: each is separately
 * focusable and separately labelled, which is what a screen reader needs.
 *
 * `flexDirection: 'row'` mirrors under RTL automatically, so in Arabic the
 * one-star sits on the right — the direction the eye scans from.
 */
export function StarRating({ value, onChange, labelFor, disabled }: StarRatingProps) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs }} accessibilityRole="radiogroup">
      {STARS.map((star) => (
        <Pressable
          key={star}
          onPress={() => onChange(star)}
          disabled={disabled}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === star, disabled: Boolean(disabled) }}
          accessibilityLabel={labelFor(star)}
          // 44x44 is Apple's minimum target and Android's 48dp rounds into it.
          style={{
            minWidth: 44,
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon
            name={star <= value ? 'star' : 'starOutline'}
            size={30}
            color={star <= value ? colors.primaryText : colors.textMuted}
          />
        </Pressable>
      ))}
    </View>
  );
}
