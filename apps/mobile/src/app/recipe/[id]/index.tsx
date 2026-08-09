import { useState } from 'react';
import { Image, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Difficulty } from '@kitchen/contracts';
import {
  Screen,
  Header,
  AppText,
  Badge,
  Button,
  Sheet,
  LoadingState,
  ErrorState,
  YoutubePlayer,
} from '../../../components';
import { useFormat } from '../../../hooks/useFormat';
import { useRecipe, useMarkCooked } from '../../../hooks/recipe';
import { ingredientName, formatMeasure, formatMinutes } from '../../../lib/format';
import { colors, radius, spacing } from '../../../theme';

const DIFFICULTY_KEY: Record<
  Difficulty,
  'recipe.difficulty.easy' | 'recipe.difficulty.medium' | 'recipe.difficulty.hard'
> = {
  easy: 'recipe.difficulty.easy',
  medium: 'recipe.difficulty.medium',
  hard: 'recipe.difficulty.hard',
};

export default function RecipeDetail() {
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipe = useRecipe(id ?? null, locale);
  const markCooked = useMarkCooked(id ?? '');
  const [confirm, setConfirm] = useState(false);
  const [cooked, setCooked] = useState(false);

  if (recipe.isLoading) {
    return (
      <Screen>
        <Header title={t('common.loading')} onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }
  if (recipe.isError || !recipe.data) {
    return (
      <Screen>
        <Header title={t('mobile.common.error')} onBack={() => router.back()} />
        <ErrorState error={recipe.error} onRetry={() => void recipe.refetch()} />
      </Screen>
    );
  }

  const data = recipe.data;

  return (
    <Screen scroll padded={false}>
      {data.heroImageUrl ? (
        <Image source={{ uri: data.heroImageUrl }} style={{ width: '100%', height: 220 }} />
      ) : null}

      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Header title={data.title} onBack={() => router.back()} />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Badge label={t('recipe.prepTime', { minutes: formatMinutes(locale, data.prepMinutes, prefs) })} />
          <Badge label={t('recipe.cookTime', { minutes: formatMinutes(locale, data.cookMinutes, prefs) })} />
          <Badge label={t('recipe.servings', { count: data.servings })} />
          <Badge tone="info" label={t(DIFFICULTY_KEY[data.difficulty])} />
        </View>

        {cooked ? <Badge tone="success" label={t('recipe.cookedDone')} /> : null}

        <View style={{ gap: spacing.sm }}>
          <AppText variant="heading">{t('recipe.ingredients')}</AppText>
          {data.ingredients.map((ri) => (
            <View
              key={ri.ingredient.id}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
            >
              <AppText style={{ flex: 1 }}>
                {ingredientName(locale, ri.ingredient)}
                {ri.optional ? ` · ${t('recipe.optional')}` : ''}
              </AppText>
              <AppText variant="caption" muted>
                {formatMeasure(t, locale, ri.quantity, ri.unit, prefs)}
              </AppText>
              <Badge
                tone={ri.inStock ? 'success' : 'warn'}
                label={ri.inStock ? t('recipe.inStock') : t('recipe.notInStock')}
              />
            </View>
          ))}
        </View>

        <View style={{ gap: spacing.sm }}>
          <AppText variant="heading">{t('recipe.steps')}</AppText>
          {data.steps.map((step) => (
            <View key={step.index} style={{ flexDirection: 'row', gap: spacing.md }}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: radius.pill,
                  backgroundColor: colors.primarySoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AppText variant="caption" color="primary">
                  {formatMinutes(locale, step.index, prefs)}
                </AppText>
              </View>
              <AppText style={{ flex: 1 }}>{step.text}</AppText>
            </View>
          ))}
        </View>

        <View style={{ gap: spacing.sm }}>
          <AppText variant="heading">{t('recipe.videos')}</AppText>
          {data.videos.length === 0 ? (
            <AppText muted variant="caption">
              {t('recipe.noVideos')}
            </AppText>
          ) : (
            data.videos.map((video) => (
              <View key={video.youtubeId} style={{ gap: spacing.xs }}>
                <YoutubePlayer
                  youtubeId={video.youtubeId}
                  thumbnailUrl={video.thumbnailUrl}
                  playLabel={t('mobile.recipe.watchOnYoutube')}
                  errorLabel={t('mobile.recipe.videoUnavailable')}
                />
                <AppText variant="bodyStrong" numberOfLines={2}>
                  {video.title}
                </AppText>
                <AppText variant="caption" muted>
                  {video.channel}
                </AppText>
              </View>
            ))
          )}
        </View>

        <View style={{ gap: spacing.sm }}>
          <Button
            title={t('mobile.recipe.startCooking')}
            icon="flame"
            onPress={() => router.push(`/recipe/${data.id}/cook`)}
          />
          <Button
            title={t('recipe.markCooked')}
            variant="secondary"
            icon="check"
            onPress={() => setConfirm(true)}
          />
        </View>
      </View>

      <Sheet visible={confirm} onClose={() => setConfirm(false)} title={t('recipe.markCooked')}>
        <AppText muted>{t('recipe.cookedConfirm')}</AppText>
        <Button
          title={t('recipe.markCooked')}
          icon="check"
          loading={markCooked.isPending}
          onPress={() =>
            markCooked.mutate(
              { deductInventory: true, servings: data.servings },
              {
                onSuccess: () => {
                  setConfirm(false);
                  setCooked(true);
                },
              },
            )
          }
        />
        <Button title={t('common.cancel')} variant="ghost" onPress={() => setConfirm(false)} />
      </Sheet>
    </Screen>
  );
}
