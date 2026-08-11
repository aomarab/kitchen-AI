import { Pressable } from 'react-native';
import { Icon, type IconName } from './Icon';
import { colors, radius, shadow } from '../theme';

export interface FabProps {
  icon?: IconName;
  onPress: () => void;
  accessibilityLabel: string;
}

/**
 * The raised circular action, used as the capture button in the tab bar.
 *
 * It occupies a column of its own rather than floating over the seam between
 * two tabs: as an absolutely positioned overlay on a four-tab bar it covered
 * roughly a third of each neighbour's touch target, so taps near the circle
 * were ambiguous (spec §6.1).
 *
 * Depth comes from the shared `shadow.raised` token rather than a local black
 * shadow, so it sits in the same light as every other raised surface.
 */
export function Fab({ icon = 'camera', onPress, accessibilityLabel }: FabProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 56,
        height: 56,
        borderRadius: radius.pill,
        backgroundColor: pressed ? colors.primaryPressed : colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        ...shadow.raised,
        // Scale, not opacity: a 10% fade is imperceptible on a filled 56pt
        // circle, and press feedback only counts if it can be seen.
        transform: [{ scale: pressed ? 0.94 : 1 }],
      })}
    >
      <Icon name={icon} size={26} color={colors.textInverse} />
    </Pressable>
  );
}
