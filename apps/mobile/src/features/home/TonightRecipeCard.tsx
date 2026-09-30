import { View } from 'react-native';
import type { MealPlanEntry } from '@kitchen/contracts';
import { AppText, Button, Card, RecipeThumb } from '../../components';
import { useFormat } from '../../hooks/useFormat';

const RECIPE_CARD_BODY_PADDING_TOP = 16;
const RECIPE_CARD_BODY_PADDING_HORIZONTAL = 16;
const RECIPE_CARD_BODY_PADDING_BOTTOM = 18;
const RECIPE_CARD_BODY_GAP = 6;
const RECIPE_CARD_ACTIONS_PADDING_TOP = 10;

export function TonightRecipeCard({
  entry,
  minutesLabel,
  pantryLabel,
  servingsLabel,
  accessibilityLabel,
  onOpenRecipe,
  onCookRecipe,
  onWatchRecipe,
}: {
  entry: MealPlanEntry;
  minutesLabel: string;
  pantryLabel: string | null;
  servingsLabel: string;
  accessibilityLabel: string;
  onOpenRecipe: () => void;
  onCookRecipe: () => void;
  onWatchRecipe: () => void;
}) {
  const { t } = useFormat();
  const meta = [pantryLabel, servingsLabel].filter(Boolean).join(' · ');

  return (
    <Card
      onPress={onOpenRecipe}
      accessibilityLabel={accessibilityLabel}
      style={{ padding: 0, overflow: 'hidden' }}
    >
      <RecipeThumb
        heroImageUrl={entry.recipe.heroImageUrl}
        title={entry.recipe.title}
        size={196}
        style={{ width: '100%', height: 196 }}
      />
      <View
        style={{
          paddingTop: RECIPE_CARD_BODY_PADDING_TOP,
          paddingHorizontal: RECIPE_CARD_BODY_PADDING_HORIZONTAL,
          paddingBottom: RECIPE_CARD_BODY_PADDING_BOTTOM,
          gap: RECIPE_CARD_BODY_GAP,
        }}
      >
        <AppText variant="eyebrow" color="primaryText">
          {t('mobile.home.tonightTitle')} · {minutesLabel}
        </AppText>
        <AppText variant="title">{entry.recipe.title}</AppText>
        {meta ? (
          <AppText variant="caption" color="textMuted">
            {meta}
          </AppText>
        ) : null}
        <View
          style={{ flexDirection: 'row', gap: 10, paddingTop: RECIPE_CARD_ACTIONS_PADDING_TOP }}
        >
          <Button title={t('mobile.home.cook')} size="S" fullWidth={false} onPress={onCookRecipe} />
          <Button
            title={t('mobile.home.watch')}
            variant="secondary"
            size="S"
            fullWidth={false}
            onPress={onWatchRecipe}
          />
        </View>
      </View>
    </Card>
  );
}
