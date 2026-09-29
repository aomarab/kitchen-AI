import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Difficulty } from '@kitchen/contracts';
import type { MessageKey } from '@kitchen/i18n';
import {
  AppText,
  Badge,
  Button,
  ErrorState,
  Header,
  IconButton,
  LoadingState,
  QuantityStepper,
  RecipeThumb,
  Screen,
  SegmentedControl,
  Sheet,
} from '../../../components';
import { RecipeCookedSheetContent } from '../../../features/recipe/RecipeCookedSheetContent';
import { RecipeIngredientRow } from '../../../features/recipe/RecipeIngredientRow';
import { RecipeMetaRow } from '../../../features/recipe/RecipeMetaRow';
import { RecipeStepRow } from '../../../features/recipe/RecipeStepRow';
import { RecipeVideoCard } from '../../../features/recipe/RecipeVideoCard';
import { useFormat } from '../../../hooks/useFormat';
import { useRecipe } from '../../../hooks/recipe';
import { formatMinutes, formatQty } from '../../../lib/format';
import { recipeStockCount, recipeTopBarBacked, recipeTopBarFadeRange } from '../../../lib/recipe';
import { spacing } from '../../../theme';
import { useTheme } from '../../../theme/useTheme';

const SHEET_OVERLAP = 0;
const MAX_SERVINGS = 12;
const HERO_HEIGHT = 280;
const TOP_BAR_ROW_HEIGHT = 44;
const RECIPE_FOOTER_ACTION_HEIGHT = 44;

type RecipeSegment = 'ingredients' | 'steps' | 'videos';

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
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const recipe = useRecipe(id ?? null, locale);
  const [confirm, setConfirm] = useState(false);
  const [cooked, setCooked] = useState(false);
  const [segment, setSegment] = useState<RecipeSegment>('ingredients');
  const [servings, setServings] = useState<number | null>(null);
  const [heroImageLoaded, setHeroImageLoaded] = useState(false);
  const [barBacked, setBarBacked] = useState(false);
  const barBackedRef = useRef(false);
  const scrollY = useRef(new Animated.Value(0)).current;
  const topBarHeight = insets.top + spacing.md + TOP_BAR_ROW_HEIGHT + spacing.sm;
  const topBarFade = useMemo(
    () =>
      recipeTopBarFadeRange({
        heroHeight: HERO_HEIGHT,
        sheetOverlap: SHEET_OVERLAP,
        barHeight: topBarHeight,
        fadeDistance: spacing.xl,
      }),
    [topBarHeight],
  );
  const handleRecipeScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextBarBacked = recipeTopBarBacked(event.nativeEvent.contentOffset.y, topBarFade);
      if (nextBarBacked !== barBackedRef.current) {
        barBackedRef.current = nextBarBacked;
        setBarBacked(nextBarBacked);
      }
    },
    [topBarFade],
  );
  const handleAnimatedRecipeScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
        listener: handleRecipeScroll,
      }),
    [handleRecipeScroll, scrollY],
  );

  useEffect(() => {
    setServings(null);
    setSegment('ingredients');
    setCooked(false);
    setHeroImageLoaded(false);
    setBarBacked(false);
    barBackedRef.current = false;
    scrollY.setValue(0);
  }, [id, scrollY]);

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
  const servingCount = servings ?? data.servings;
  const stock = recipeStockCount(data.ingredients);
  const cuisine = data.cuisine ? t(`mobile.cuisines.${data.cuisine}` as MessageKey) : null;
  const difficulty = t(DIFFICULTY_KEY[data.difficulty]);
  const metaLead = [cuisine, difficulty].filter(Boolean).join(' · ');
  const stockLine = t('mobile.recipe.inStockOf', {
    have: formatQty(locale, stock.have, prefs),
    total: formatQty(locale, stock.total, prefs),
  });
  const barOpacity = scrollY.interpolate({
    inputRange: [topBarFade.start, topBarFade.end],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const showLightStatusBar = isFocused && heroImageLoaded && !barBacked;
  const footer = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Button
        title={t('recipe.markCooked')}
        variant="secondary"
        size="L"
        fullWidth={false}
        style={{ minHeight: RECIPE_FOOTER_ACTION_HEIGHT, flexShrink: 0 }}
        onPress={() => setConfirm(true)}
      />
      <Button
        title={t('mobile.recipe.startCooking')}
        style={{ minHeight: RECIPE_FOOTER_ACTION_HEIGHT, flex: 1 }}
        onPress={() => {
          const query = servingCount === data.servings ? '' : `?servings=${servingCount}`;
          router.push(`/recipe/${data.id}/cook${query}`);
        }}
      />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {showLightStatusBar ? <StatusBar style="light" /> : null}
      <Screen
        scroll
        padded={false}
        edges={['bottom', 'left', 'right']}
        footer={footer}
        onScroll={handleAnimatedRecipeScroll}
        scrollEventThrottle={16}
      >
        <View style={{ height: HERO_HEIGHT, position: 'relative' }}>
          <RecipeThumb
            heroImageUrl={data.heroImageUrl}
            title={data.title}
            accessibilityLabel={t('mobile.recipe.imageLabel', { title: data.title })}
            onImageLoad={() => setHeroImageLoaded(true)}
            onImageError={() => setHeroImageLoaded(false)}
            style={{ width: '100%', height: '100%' }}
          />
          {data.heroImageUrl ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                start: 0,
                end: 0,
                height: insets.top + 64,
                backgroundColor: colors.mediaButton,
              }}
            />
          ) : null}
        </View>

        <View style={{ padding: spacing.gutter, gap: spacing.xl }}>
          <View style={{ gap: spacing.md }}>
            {metaLead ? (
              <AppText variant="eyebrow" color="primaryText">
                {metaLead}
              </AppText>
            ) : null}
            <AppText variant="display" accessibilityRole="header">
              {data.title}
            </AppText>
            <AppText muted>{data.description}</AppText>
          </View>

          <RecipeMetaRow
            items={[
              {
                value: t('mobile.recipe.minutesValue', {
                  minutes: formatMinutes(locale, data.prepMinutes, prefs),
                }),
                label: t('mobile.recipe.prepLabel'),
              },
              {
                value: t('mobile.recipe.minutesValue', {
                  minutes: formatMinutes(locale, data.cookMinutes, prefs),
                }),
                label: t('mobile.recipe.cookLabel'),
              },
              {
                value: formatQty(locale, servingCount, prefs),
                label: t('mobile.recipe.servingsLabel'),
              },
              {
                value: stockLine,
                label: t('mobile.recipe.inStockLabel'),
              },
            ]}
          />

          <View style={{ gap: spacing.sm }}>
            <QuantityStepper
              value={servingCount}
              min={1}
              max={MAX_SERVINGS}
              onChange={setServings}
              label={formatQty(locale, servingCount, prefs)}
              unit={t('mobile.recipe.servingsLabel')}
              accessibilityLabel={t('mobile.recipe.servingsLabel')}
              decrementLabel={t('mobile.common.decrease')}
              incrementLabel={t('mobile.common.increase')}
            />
          </View>

          <SegmentedControl
            value={segment}
            onChange={setSegment}
            options={[
              { value: 'ingredients', label: t('recipe.ingredients') },
              { value: 'steps', label: t('recipe.steps') },
              { value: 'videos', label: t('recipe.videos') },
            ]}
          />

          {segment === 'ingredients' ? (
            <View>
              {data.ingredients.map((ingredient) => (
                <RecipeIngredientRow
                  key={ingredient.ingredient.id}
                  ingredient={ingredient}
                  servings={servingCount}
                  baseServings={data.servings}
                />
              ))}
            </View>
          ) : segment === 'steps' ? (
            <View>
              {data.steps.map((step) => (
                <RecipeStepRow key={step.index} step={step} />
              ))}
            </View>
          ) : segment === 'videos' ? (
            <View style={{ gap: spacing.xl }}>
              {data.videos.length === 0 ? (
                <AppText muted variant="caption">
                  {t('recipe.noVideos')}
                </AppText>
              ) : (
                data.videos.map((video) => <RecipeVideoCard key={video.youtubeId} video={video} />)
              )}
            </View>
          ) : null}

          {cooked ? <Badge tone="success" label={t('recipe.cookedDone')} /> : null}
        </View>

        <Sheet visible={confirm} onClose={() => setConfirm(false)} title={t('recipe.markCooked')}>
          <RecipeCookedSheetContent
            recipeId={data.id}
            ingredients={data.ingredients}
            servingCount={servingCount}
            baseServings={data.servings}
            onCancel={() => setConfirm(false)}
            onDone={() => {
              setConfirm(false);
              setCooked(true);
            }}
          />
        </Sheet>
      </Screen>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          start: 0,
          end: 0,
          height: topBarHeight,
          opacity: barOpacity,
          backgroundColor: colors.bg,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          zIndex: 1,
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingBottom: spacing.sm,
          paddingHorizontal: topBarHeight,
        }}
      >
        <AppText variant="bodyStrong" numberOfLines={1} center>
          {data.title}
        </AppText>
      </Animated.View>
      <View
        style={{
          position: 'absolute',
          top: insets.top + spacing.md,
          start: spacing.gutter,
          zIndex: 2,
        }}
      >
        <IconButton
          icon="back"
          directional
          tone={barBacked ? 'plain' : 'media'}
          accessibilityLabel={t('common.back')}
          onPress={() => router.back()}
        />
      </View>
    </View>
  );
}
