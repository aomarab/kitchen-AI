import type { RecipeIngredient } from '@kitchen/contracts';
import { View } from 'react-native';
import { AppText, Icon, type IconName } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { formatMeasure, ingredientName } from '../../lib/format';
import { scaleQuantityForServings } from '../../lib/recipe';
import {
  recipeIngredientAccessibilityLabel,
  recipeIngredientStatusKey,
} from '../../lib/recipe-ingredient-row';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export const RECIPE_INGREDIENT_ROW_MIN_HEIGHT = 44;

export function RecipeIngredientRow({
  ingredient,
  servings,
  baseServings,
  signed = false,
}: {
  ingredient: RecipeIngredient;
  servings: number;
  baseServings: number;
  signed?: boolean;
}) {
  const { t, locale, prefs } = useFormat();
  const { colors } = useTheme();
  const scaledQuantity = scaleQuantityForServings(ingredient.quantity, baseServings, servings);
  const quantity = formatMeasure(t, locale, scaledQuantity, ingredient.unit, prefs);
  const visibleQuantity = signed ? `− ${quantity}` : quantity;
  const name = ingredientName(locale, ingredient.ingredient);
  const statusLabel = t(recipeIngredientStatusKey(ingredient));
  const accessibilityLabel = recipeIngredientAccessibilityLabel({
    quantity: visibleQuantity,
    name,
    statusLabel,
  });
  const statusIcon: IconName = ingredient.inStock ? 'check' : ingredient.shortfall ? 'alert' : 'x';
  const statusColor = ingredient.inStock
    ? colors.success
    : ingredient.shortfall
      ? colors.warn
      : colors.danger;

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={{
        minHeight: RECIPE_INGREDIENT_ROW_MIN_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.rowline,
      }}
    >
      <AppText variant="bodyStrong" style={{ width: 72 }} numberOfLines={1}>
        {visibleQuantity}
      </AppText>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <AppText numberOfLines={1}>{name}</AppText>
        {ingredient.optional ? (
          <AppText variant="caption" muted numberOfLines={1}>
            {t('recipe.optional')}
          </AppText>
        ) : null}
      </View>
      <Icon name={statusIcon} size={18} color={statusColor} />
    </View>
  );
}
