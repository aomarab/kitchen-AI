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
import type { Difficulty, RecipeIngredient } from '@kitchen/contracts';
import type { MessageKey } from '@kitchen/i18n';
import {
  Screen,
  Header,
  AppText,
  Badge,
  Button,
  Sheet,
  LoadingState,
  ErrorState,
  RecipeThumb,
  YoutubePlayer,
  RoundButton,
  Tile,
  SegmentedControl,
  ListGroup,
  ListRow,
  FoodIcon,
  QuantityStepper,
  type IconName,
} from '../../../components';
import { useFormat } from '../../../hooks/useFormat';
import { useRecipe, useMarkCooked } from '../../../hooks/recipe';
import { ingredientName, formatMeasure, formatMinutes, formatQty } from '../../../lib/format';
import {
  recipeStockCount,
  recipeTopBarBacked,
  recipeTopBarFadeRange,
  scaleQuantityForServings,
} from '../../../lib/recipe';
import { radius, spacing } from '../../../theme';
import { useTheme } from '../../../theme/useTheme';

const SHEET_OVERLAP = 28;
const MAX_SERVINGS = 12;
const HERO_HEIGHT = 360;
const STAT_TILE_HEIGHT = 124;
const TOP_BAR_ROW_HEIGHT = 44;

type RecipeSegment = 'ingredients' | 'steps';

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
  const markCooked = useMarkCooked(id ?? '');
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
  const totalMinutes = data.prepMinutes + data.cookMinutes;
  const meta = [
    t('recipe.servings', { count: data.servings }),
    data.cuisine ? t(`mobile.cuisines.${data.cuisine}` as MessageKey) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const stockLine = t('mobile.recipe.inStockOf', {
    have: formatQty(locale, stock.have, prefs),
    total: formatQty(locale, stock.total, prefs),
  });
  const totalTimeValue = t('mobile.recipe.minutesValue', {
    minutes: formatMinutes(locale, totalMinutes, prefs),
  });
  const difficulty = t(DIFFICULTY_KEY[data.difficulty]);
  const barOpacity = scrollY.interpolate({
    inputRange: [topBarFade.start, topBarFade.end],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const showLightStatusBar = isFocused && heroImageLoaded && !barBacked;
  const footer = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
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
      <Button
        title={t('mobile.recipe.startCooking')}
        icon="play"
        style={{ flex: 1 }}
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
        <View style={{ height: 360, position: 'relative' }}>
          <RecipeThumb
            heroImageUrl={data.heroImageUrl}
            dishKey={`${data.locale}:${data.title}`}
            title={data.title}
            accessibilityLabel={t('mobile.recipe.imageLabel', { title: data.title })}
            onImageLoad={() => setHeroImageLoaded(true)}
            onImageError={() => setHeroImageLoaded(false)}
            style={{ width: '100%', height: '100%' }}
          />
        </View>

        <View
          style={{
            marginTop: -SHEET_OVERLAP,
            padding: spacing.lg,
            gap: spacing.lg,
            borderTopStartRadius: radius.xl,
            borderTopEndRadius: radius.xl,
            backgroundColor: colors.bg,
          }}
        >
          <View style={{ gap: spacing.xs }}>
            <AppText variant="display" accessibilityRole="header">
              {data.title}
            </AppText>
            {meta ? (
              <AppText variant="caption" muted>
                {meta}
              </AppText>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <MiniStatTile
              tint="apricot"
              icon="clock"
              value={totalTimeValue}
              caption={t('mobile.recipe.totalTimeLabel')}
              label={`${totalTimeValue} ${t('mobile.recipe.totalTimeLabel')}`}
            />
            <MiniStatTile
              tint="sage"
              icon="basket"
              value={stockLine}
              caption={t('mobile.recipe.inStockLabel')}
              label={`${stockLine} ${t('mobile.recipe.inStockLabel')}`}
            />
            <MiniStatTile
              tint="butter"
              icon="flame"
              value={difficulty}
              caption={t('mobile.recipe.difficultyLabel')}
              label={`${difficulty} ${t('mobile.recipe.difficultyLabel')}`}
            />
          </View>

          <SegmentedControl
            value={segment}
            onChange={setSegment}
            options={[
              { value: 'ingredients', label: t('recipe.ingredients') },
              { value: 'steps', label: t('recipe.steps') },
            ]}
          />

          {segment === 'ingredients' ? (
            <View style={{ gap: spacing.md }}>
              <ListGroup>
                {data.ingredients.map((ri) => (
                  <IngredientRow
                    key={ri.ingredient.id}
                    ingredient={ri}
                    servings={servingCount}
                    baseServings={data.servings}
                  />
                ))}
              </ListGroup>
              <Button
                title={t('recipe.markCooked')}
                variant="secondary"
                icon="check"
                onPress={() => setConfirm(true)}
              />
            </View>
          ) : segment === 'steps' ? (
            <View style={{ gap: spacing.lg }}>
              <View style={{ gap: spacing.md }}>
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
                      <AppText
                        variant="caption"
                        color="primaryText"
                        style={{ fontVariant: ['tabular-nums'] }}
                      >
                        {formatQty(locale, step.index, prefs)}
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
                        openLabel={t('mobile.recipe.openInYoutube')}
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
            </View>
          ) : null}

          {cooked ? <Badge tone="success" label={t('recipe.cookedDone')} /> : null}
        </View>

        <Sheet visible={confirm} onClose={() => setConfirm(false)} title={t('recipe.markCooked')}>
          <AppText muted>{t('recipe.cookedConfirm')}</AppText>
          <Button
            title={t('recipe.markCooked')}
            icon="check"
            loading={markCooked.isPending}
            onPress={() =>
              markCooked.mutate(
                { deductInventory: true, servings: servingCount },
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
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: insets.top + spacing.md,
          start: spacing.lg,
          zIndex: 2,
        }}
      >
        <RoundButton
          icon="back"
          directional
          tone={barBacked ? 'surface' : 'mediaLight'}
          size={40}
          accessibilityLabel={t('common.back')}
          onPress={() => router.back()}
        />
      </View>
    </View>
  );
}

function MiniStatTile({
  tint,
  icon,
  value,
  caption,
  label,
}: {
  tint: 'apricot' | 'sage' | 'butter';
  icon: IconName;
  value: string;
  caption: string;
  label: string;
}) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Tile
        tint={tint}
        height={STAT_TILE_HEIGHT}
        icon={icon}
        accessibilityLabel={label}
        style={{ flex: 1 }}
      >
        <View style={{ gap: spacing.xs }}>
          <AppText variant="bodyStrong">{value}</AppText>
          <AppText variant="caption" muted>
            {caption}
          </AppText>
        </View>
      </Tile>
    </View>
  );
}

function IngredientRow({
  ingredient,
  servings,
  baseServings,
}: {
  ingredient: RecipeIngredient;
  servings: number;
  baseServings: number;
}) {
  const { t, locale, prefs } = useFormat();
  const scaledQuantity = scaleQuantityForServings(ingredient.quantity, baseServings, servings);
  const name = ingredientName(locale, ingredient.ingredient);
  return (
    <ListRow
      grouped
      leading={
        <FoodIcon
          item={{
            category: ingredient.ingredient.category,
            nameEn: ingredient.ingredient.canonicalNameEn,
            nameAr: ingredient.ingredient.canonicalNameAr,
          }}
        />
      }
      title={`${name}${ingredient.optional ? ` · ${t('recipe.optional')}` : ''}`}
      subtitle={formatMeasure(t, locale, scaledQuantity, ingredient.unit, prefs)}
      trailing={
        <Badge
          tone={ingredient.inStock ? 'success' : 'warn'}
          label={ingredient.inStock ? t('recipe.inStock') : t('recipe.notInStock')}
        />
      }
    />
  );
}
