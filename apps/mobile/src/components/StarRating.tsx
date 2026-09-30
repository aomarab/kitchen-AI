import { Pressable, View } from 'react-native';
import { Icon } from './Icon';
import { starTone } from './control-tones';
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
    <View style={{ flexDirection: 'row', gap: 4 }} accessibilityRole="radiogroup">
      {STARS.map((star) => {
        const tone = starTone(colors, star <= value);
        return (
          <Pressable
            key={star}
            onPress={() => onChange(star)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === star, disabled: Boolean(disabled) }}
            accessibilityLabel={labelFor(star)}
            style={{
              minWidth: 44,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={tone.icon} size={20} color={tone.glyph} filled={tone.filled} />
          </Pressable>
        );
      })}
    </View>
  );
}
