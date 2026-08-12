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
import { useInventory } from '../../hooks/inventory';
import { itemName, formatExpiryLabel, formatMinutes } from '../../lib/format';
import { todayISODate } from '../../lib/expiry';
import { colors, radius, spacing, tintFor } from '../../theme';

function ProgressBar({ ratio }: { ratio: number }) {
  return (
    <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt }}>
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
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  const plansQuery = usePlans();
  const expiringQuery = useInventory({ expiringWithinDays: 3, sort: 'expiry' });

  const plan = plansQuery.data?.[0];
  const today = todayISODate();

  const tonight = useMemo(() => {
    if (!plan) return undefined;
    const todays = plan.entries.filter((entry) => entry.date === today);
    return todays.find((entry) => entry.slot === 'dinner') ?? todays[0];
  }, [plan, today]);

  const weekProgress = useMemo(() => {
    if (!plan || plan.entries.length === 0) return null;
    const cooked = plan.entries.filter((entry) => entry.state === 'cooked').length;
    return { cooked, total: plan.entries.length };
  }, [plan]);

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
            <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm }}>
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

      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
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

      {weekProgress ? (
        <Card>
          <AppText variant="heading">{t('mobile.home.weekTitle')}</AppText>
          <AppText variant="caption" muted>
            {t('mobile.home.weekProgress', weekProgress)}
          </AppText>
          <ProgressBar ratio={weekProgress.cooked / weekProgress.total} />
        </Card>
      ) : (
        <Card>
          <AppText variant="heading">{t('mobile.home.noPlanTitle')}</AppText>
          <AppText muted>{t('mobile.home.noPlanBody')}</AppText>
          <Button title={t('plans.generate')} onPress={() => router.push('/generate-plan')} />
        </Card>
      )}

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
