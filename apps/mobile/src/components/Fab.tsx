import { Pressable } from 'react-native';
import { Icon, type IconName } from './Icon';
import { colors, radius } from '../theme';

export interface FabProps {
  icon?: IconName;
  onPress: () => void;
  accessibilityLabel: string;
}

/**
 * Floating action button. Positioned by its parent; the camera FAB in the tab
 * bar centres it above the tabs (spec §6.1).
 */
export function Fab({ icon = 'camera', onPress, accessibilityLabel }: FabProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 60,
        height: 60,
        borderRadius: radius.pill,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <Icon name={icon} size={26} color={colors.textInverse} />
    </Pressable>
  );
}
