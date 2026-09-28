import { View } from 'react-native';
import type { IngredientCategory } from '@kitchen/contracts';
import { FOOD_ILLUSTRATION } from '../lib/food-illustration';
import { foodIconKey } from '../lib/food-icon';
import { Illustration } from './Illustration';
import { radius } from '../theme';
import { useTheme } from '../theme/useTheme';

interface FoodIconProps {
  item: {
    label?: string | null;
    nameEn?: string | null;
    nameAr?: string | null;
    category: IngredientCategory;
  };
  size?: number;
}

/**
 * The picture beside an item on the shelf.
 *
 * Decorative: the name sits next to it and already says what the item is, so
 * this is hidden from screen readers rather than read out twice. The artwork is
 * square and symmetrical in intent, so nothing needs mirroring under RTL.
 */
export function FoodIcon({ item, size = 40 }: FoodIconProps) {
  const { colors } = useTheme();
  const illustration = FOOD_ILLUSTRATION[foodIconKey(item)];
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: radius.none,
        backgroundColor: colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Illustration name={illustration} size={size * 0.72} />
    </View>
  );
}
