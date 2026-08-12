import { Image, View } from 'react-native';
import type { IngredientCategory } from '@kitchen/contracts';
import { foodIconKey } from '../lib/food-icon';
import { FOOD_ICON_ASSETS } from '../lib/food-icon-assets';
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
  const source = FOOD_ICON_ASSETS[foodIconKey(item)];
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: radius.sm,
        backgroundColor: colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Image
        source={source}
        accessibilityIgnoresInvertColors
        style={{ width: size * 0.62, height: size * 0.62 }}
        resizeMode="contain"
      />
    </View>
  );
}
