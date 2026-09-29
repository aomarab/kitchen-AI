import type { RecipeIngredient } from '@kitchen/contracts';
import { View } from 'react-native';
import { AppText } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { formatMeasure, ingredientName } from '../../lib/format';
import { scaleQuantityForServings } from '../../lib/recipe';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export function CookIngredientChip({
  ingredient,
  servings,
  baseServings,
}: {
  ingredient: RecipeIngredient;
  servings: number;
  baseServings: number;
}) {
  const { t, locale, prefs } = useFormat();
  const { colors } = useTheme();
  const quantity = scaleQuantityForServings(ingredient.quantity, baseServings, servings);
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
      }}
    >
      <AppText variant="buttonSmall">
        {formatMeasure(t, locale, quantity, ingredient.unit, prefs)}{' '}
        {ingredientName(locale, ingredient.ingredient)}
      </AppText>
    </View>
  );
}
