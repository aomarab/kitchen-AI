import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  AppText,
  Card,
  Button,
  Badge,
  ListRow,
  LoadingState,
  Icon,
} from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { usePlans } from '../../hooks/plans';
import { useInventory, useInventorySnapshot, useLocations } from '../../hooks/inventory';
import { useShoppingList } from '../../hooks/shopping';
import { StatTiles } from '../../features/home/StatTiles';
import { KitchenGlance } from '../../features/home/KitchenGlance';
import { WeekStrip } from '../../features/home/WeekStrip';
import { itemName, formatExpiryLabel, formatMinutes } from '../../lib/format';
import { isExpiringSoon, todayISODate } from '../../lib/expiry';
import { weekBars } from '../../lib/home-stats';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

function ProgressBar({ ratio }: { ratio: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        height: 8,
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceAlt,
      }}
    >
      <View
        style={{
          height: 8,
          borderRadius: radius.pill,
          // The week's cooked meals are a brand metric, not an informational
          // one. This was the only place in the app that painted `accent`, so a
          // blue bar sat alone on an otherwise violet screen.
          backgroundColor: colors.primary,
          width: `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`,
        }}
      />
    </View>
  );
}

export default function Home() {
  const { colors, tintFor } = useTheme();
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  const plansQuery = usePlans();
  const expiringQuery = useInventory({ expiringWithinDays: 3, sort: 'expiry' });
  const snapshotQuery = useInventorySnapshot();
  const locationsQuery = useLocations();
  const shoppingQuery = useShoppingList();

  const plan = plansQuery.data?.[0];
  const today = todayISODate();

  const tonight = useMemo(() => {
    if (!plan) return undefined;
    const todays = plan.entries.filter((entry) => entry.date === today);
    return todays.find((entry) => entry.slot === 'dinner') ?? todays[0];
  }, [plan, today]);

  // The bars and the "N of M cooked" line are both read off the same seven
  // days, so the card can never state a total its own chart contradicts.
  const week = useMemo(() => (plan ? weekBars(plan.entries, plan.startsOn) : null), [plan]);
  const weekProgress = useMemo(() => {
    if (!week) return null;
    const total = week.reduce((sum, bar) => sum + bar.planned, 0);
    if (total === 0) return null;
    return { cooked: week.reduce((sum, bar) => sum + bar.cooked, 0), total };
  }, [week]);

  const stock = useMemo(() => snapshotQuery.data?.items ?? [], [snapshotQuery.data]);
  const soonCount = useMemo(
    () => stock.filter((item) => isExpiringSoon(item.expiresAt)).length,
    [stock],
  );
  const toBuy = useMemo(
    () => (shoppingQuery.data ?? []).filter((entry) => !entry.purchased).length,
    [shoppingQuery.data],
  );

  const expiring = expiringQuery.data?.items ?? [];

  if (plansQuery.isLoading) return <LoadingState />;

  return (
    <Screen scroll refreshing={plansQuery.isRefetching} onRefresh={() => void plansQuery.refetch()}>
      <AppText variant="title">{t('mobile.home.greeting')}</AppText>

      <Card gradient>
        <AppText variant="label" color="primaryInverse">
          {t('mobile.home.tonightTitle')}
        </AppText>
        {tonight ? (
          <>
            <AppText variant="heading" color="textInverse">
              {tonight.recipe.title}
            </AppText>
            <AppText variant="caption" color="textInverseMuted">
              {t('recipe.cookTime', {
                minutes: formatMinutes(locale, tonight.recipe.cookMinutes, prefs),
              })}
              {'  ·  '}
              {t('recipe.servings', { count: tonight.servings })}
            </AppText>
            <View
              style={{
                flexDirection: 'row',
                gap: spacing.lg,
                marginTop: spacing.sm,
              }}
            >
              <Button
                title={t('mobile.home.viewRecipe')}
                variant="primaryInverse"
                onPress={() => router.push(`/recipe/${tonight.recipe.id}`)}
                fullWidth={false}
              />
              <Button
                title={t('mobile.home.cook')}
                variant="ghostInverse"
                onPress={() => router.push(`/recipe/${tonight.recipe.id}/cook`)}
                fullWidth={false}
              />
            </View>
          </>
        ) : (
          <AppText color="textInverseMuted">{t('mobile.home.tonightEmpty')}</AppText>
        )}
      </Card>

      <StatTiles items={stock.length} expiring={soonCount} shopping={toBuy} />

      <View style={{ gap: spacing.sm }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <AppText variant="heading">{t('mobile.home.expiringStrip')}</AppText>
          <Button
            title={t('mobile.home.seeAll')}
            variant="ghost"
            fullWidth={false}
            onPress={() => router.push('/kitchen')}
          />
        </View>
        {expiring.length === 0 ? (
          <AppText muted variant="caption">
            {t('mobile.home.expiringNone')}
          </AppText>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {expiring.slice(0, 8).map((item, index) => (
                <Card
                  key={item.id}
                  tint={tintFor(index)}
                  onPress={() => router.push(`/item/${item.id}`)}
                  style={{ width: 150 }}
                >
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {itemName(locale, item)}
                  </AppText>
                  <Badge
                    tone="warn"
                    label={formatExpiryLabel(t, locale, item.expiresAt, prefs) ?? ''}
                  />
                </Card>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      <KitchenGlance items={stock} locations={locationsQuery.data ?? []} />

      {weekProgress ? (
        <Card>
          <AppText variant="heading">{t('mobile.home.weekTitle')}</AppText>
          <AppText variant="caption" muted>
            {t('mobile.home.weekProgress', weekProgress)}
          </AppText>
          <ProgressBar ratio={weekProgress.cooked / weekProgress.total} />
          <WeekStrip bars={week ?? []} today={today} />
        </Card>
      ) : (
        <Card>
          <AppText variant="heading">{t('mobile.home.noPlanTitle')}</AppText>
          <AppText muted>{t('mobile.home.noPlanBody')}</AppText>
          <Button title={t('plans.generate')} onPress={() => router.push('/generate-plan')} />
        </Card>
      )}

      <View style={{ gap: spacing.sm }}>
        <AppText variant="heading">{t('mobile.assistant.entry')}</AppText>
        <ListRow
          title={t('mobile.assistant.title')}
          subtitle={t('mobile.assistant.entryHint')}
          leading={<Icon name="sparkles" size={22} color={colors.primary} />}
          onPress={() => router.push('/assistant')}
        />
      </View>

      <View style={{ gap: spacing.sm }}>
        <AppText variant="heading">{t('mobile.home.quickAdd')}</AppText>
        <ListRow
          title={t('capture.photo')}
          leading={<Icon name="camera" size={22} color={colors.primary} />}
          onPress={() => router.push('/capture?method=photo')}
        />
        <ListRow
          title={t('capture.barcode')}
          leading={<Icon name="barcode" size={22} color={colors.primary} />}
          onPress={() => router.push('/capture?method=barcode')}
        />
        <ListRow
          title={t('capture.receipt')}
          leading={<Icon name="receipt" size={22} color={colors.primary} />}
          onPress={() => router.push('/capture?method=receipt')}
        />
      </View>
    </Screen>
  );
}
