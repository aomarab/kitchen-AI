import type { RecipeIngredient } from '@kitchen/contracts';
import { View } from 'react-native';
import { AppText, Button } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { useMarkCooked } from '../../hooks/recipe';
import { spacing } from '../../theme';
import { RecipeIngredientRow } from './RecipeIngredientRow';

const COOKED_SHEET_PREVIEW_COUNT = 4;

export function RecipeCookedSheetContent({
  recipeId,
  ingredients,
  servingCount,
  baseServings,
  onCancel,
  onDone,
}: {
  recipeId: string;
  ingredients: readonly RecipeIngredient[];
  servingCount: number;
  baseServings: number;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { t } = useFormat();
  const markCooked = useMarkCooked(recipeId);
  const preview = ingredients.slice(0, COOKED_SHEET_PREVIEW_COUNT);
  const more = ingredients.length - preview.length;

  return (
    <View style={{ gap: spacing.lg }}>
      <AppText muted>{t('recipe.cookedConfirm')}</AppText>
      <View>
        {preview.map((ingredient) => (
          <RecipeIngredientRow
            key={ingredient.ingredient.id}
            ingredient={ingredient}
            servings={servingCount}
            baseServings={baseServings}
            signed
          />
        ))}
        {more > 0 ? (
          <AppText variant="caption" muted style={{ paddingTop: spacing.sm }}>
            {t('mobile.recipe.moreIngredients', { count: more })}
          </AppText>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Button
          title={t('common.cancel')}
          variant="ghost"
          fullWidth={false}
          onPress={onCancel}
          style={{ minWidth: 78 }}
        />
        <Button
          title={t('recipe.markCooked')}
          loading={markCooked.isPending}
          style={{ flex: 1 }}
          onPress={() =>
            markCooked.mutate(
              { deductInventory: true, servings: servingCount },
              {
                onSuccess: onDone,
              },
            )
          }
        />
      </View>
    </View>
  );
}
