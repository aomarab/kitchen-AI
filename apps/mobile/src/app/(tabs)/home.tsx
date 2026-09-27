import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { InventoryItem } from '@kitchen/contracts';
import type { MessageKey, Translator } from '@kitchen/i18n';
import {
  AppText,
  Bento,
  Button,
  DirectionalIcon,
  FoodIcon,
  Icon,
  OrbMascot,
  RoundButton,
  Screen,
  TabHeader,
  Tile,
} from '../../components';
import { useCredits } from '../../hooks/credits';
import { useFormat } from '../../hooks/useFormat';
import { useInventory, useInventorySnapshot } from '../../hooks/inventory';
import { usePlans } from '../../hooks/plans';
import { useMe } from '../../hooks/profile';
import { useRecipe } from '../../hooks/recipe';
import { expiryStatus, todayISODate } from '../../lib/expiry';
import {
  formatExpiryLabel,
  formatMinutes,
  formatQty,
  formatWeekday,
  itemName,
} from '../../lib/format';
import {
  dayPart,
  firstName,
  pantryLine,
  tonightLabel,
  tonightEntry,
  useSoonLabel,
  useSoonPreview,
  weekProgress,
} from '../../lib/home';
import { totalCredits } from '../../lib/credits';
import { hitSlop, radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

function dayPartMessageKey(part: ReturnType<typeof dayPart>): MessageKey {
  switch (part) {
    case 'morning':
      return 'mobile.home.dayPart.morning';
    case 'afternoon':
      return 'mobile.home.dayPart.afternoon';
    case 'evening':
      return 'mobile.home.dayPart.evening';
    case 'night':
      return 'mobile.home.dayPart.night';
  }
}

function countMessage(
  t: Translator,
  key: MessageKey,
  count: number,
  formattedCount: string,
): string {
  const raw = t(key, { count });
  return raw.replace(String(count), formattedCount);
}

function minuteMessage(t: Translator, minutes: number, formattedMinutes: string): string {
  return t('mobile.plans.minutesValue', { minutes }).replace(String(minutes), formattedMinutes);
}

function TonightChip({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View
      accessible={false}
      style={{
        minHeight: 32,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors.surface,
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: colors.primary,
        }}
      />
      <AppText variant="label">{label}</AppText>
    </View>
  );
}

function TopUpChip({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={hitSlop}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 32,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primarySoft,
        opacity: pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <AppText variant="label" color="primaryText">
        {label}
      </AppText>
    </Pressable>
  );
}

function IconCircle({ icon }: { icon: 'receipt' | 'calendar' }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface,
      }}
    >
      <Icon name={icon} size={22} color={colors.text} />
    </View>
  );
}

function WeekProgressBar({ ratio }: { ratio: number }) {
  const { colors } = useTheme();
  const clamped = Math.min(1, Math.max(0, ratio));
  return (
    <View
      style={{
        height: 8,
        borderRadius: radius.pill,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          height: 8,
          borderRadius: radius.pill,
          backgroundColor: colors.primary,
          width: `${Math.round(clamped * 100)}%`,
        }}
      />
    </View>
  );
}

function expiryToneColor(item: Pick<InventoryItem, 'expiresAt'>): 'danger' | 'warn' | 'textMuted' {
  const status = expiryStatus(item.expiresAt);
  if (status === 'expired' || status === 'today') return 'danger';
  if (status === 'soon') return 'warn';
  return 'textMuted';
}

function miniItemIcon(item: InventoryItem) {
  return {
    label: item.label,
    nameEn: item.ingredient.canonicalNameEn,
    nameAr: item.ingredient.canonicalNameAr,
    category: item.ingredient.category,
  };
}

export default function Home() {
  const { colors } = useTheme();
  const { t, locale, prefs } = useFormat();
  const router = useRouter();
  const plansQuery = usePlans();
  const expiringQuery = useInventory({ expiringWithinDays: 3, sort: 'expiry' });
  const snapshotQuery = useInventorySnapshot();
  const creditsQuery = useCredits();
  const meQuery = useMe();

  const today = todayISODate();
  const now = new Date();
  const plan = plansQuery.data?.[0];
  const tonight = useMemo(
    () => (plan ? tonightEntry(plan.entries, today) : undefined),
    [plan, today],
  );
  const recipeQuery = useRecipe(tonight?.recipe.id ?? null, locale);
  const pantry = pantryLine(recipeQuery.data, tonight?.fullyCovered ?? false);
  const week = weekProgress(plan);

  const stockCount = snapshotQuery.data?.items.length ?? 0;
  const stockCountText = formatQty(locale, stockCount, prefs);
  const credits = creditsQuery.data ? totalCredits(creditsQuery.data) : 0;
  const creditsText = formatQty(locale, credits, prefs);
  const greetingName =
    !meQuery.isLoading && !meQuery.isError ? firstName(meQuery.data?.displayName) : null;
  const weekday = formatWeekday(locale, now);
  const dayPartCaption = t(dayPartMessageKey(dayPart(now)), { weekday });
  const expiring = expiringQuery.data?.items ?? [];
  const expiringPreview = useSoonPreview(expiring);
  const expiringCountLabel = countMessage(
    t,
    'mobile.home.itemCount',
    expiring.length,
    formatQty(locale, expiring.length, prefs),
  );
  const useSoonItems = expiringPreview.map((item) => ({
    name: itemName(locale, item),
    expiryLabel: formatExpiryLabel(t, locale, item.expiresAt, prefs),
  }));
  const useSoonAccessibilityLabel = useSoonLabel({
    heading: t('mobile.home.statExpiring'),
    countLabel: expiringCountLabel,
    emptyLabel: t('mobile.home.expiringNone'),
    items: useSoonItems,
  });
  const kitchenLabel = `${stockCountText} ${t('mobile.home.itemsAtHome')}`;
  const creditsLeft = t('mobile.home.creditsLeft');
  const mamaLabel = countMessage(t, 'mobile.home.askMamaLabel', credits, creditsText);
  const cook = () => {
    if (tonight) router.push(`/recipe/${tonight.recipe.id}/cook`);
  };
  const topUp = () => router.push('/buy-credits');
  const generatePlan = () => router.push('/generate-plan');
  const tonightMinutes =
    tonight !== undefined ? tonight.recipe.prepMinutes + tonight.recipe.cookMinutes : 0;
  const tonightMinutesLabel =
    tonight !== undefined
      ? minuteMessage(t, tonightMinutes, formatMinutes(locale, tonightMinutes, prefs))
      : null;
  const tonightPantryLabel =
    pantry?.key === 'usesYourItems'
      ? countMessage(
          t,
          'mobile.home.usesYourItems',
          pantry.count,
          formatQty(locale, pantry.count, prefs),
        )
      : pantry?.key === 'allInKitchen'
        ? t('mobile.home.allInKitchen')
        : null;
  const tonightAccessibilityLabel =
    tonight && tonightMinutesLabel
      ? tonightLabel({
          chip: t('mobile.home.tonightTitle'),
          title: tonight.recipe.title,
          minutes: tonightMinutesLabel,
          pantryLine: tonightPantryLabel,
        })
      : null;
  const weekProgressText = week
    ? t('mobile.home.weekProgress', { cooked: week.cooked, total: week.total })
        .replace(String(week.cooked), formatQty(locale, week.cooked, prefs))
        .replace(String(week.total), formatQty(locale, week.total, prefs))
    : null;

  return (
    <Screen
      scroll
      tabBar
      refreshing={plansQuery.isRefetching}
      onRefresh={() => void plansQuery.refetch()}
    >
      <TabHeader
        caption={dayPartCaption}
        title={greetingName ? t('mobile.home.greetingLead') : t('mobile.home.greeting')}
        titleAccent={greetingName ?? undefined}
      />

      <Bento>
        {tonight ? (
          <Tile
            span={2}
            tint="photo"
            height={220}
            image={tonight.recipe.heroImageUrl ? { uri: tonight.recipe.heroImageUrl } : undefined}
            leading={<TonightChip label={t('mobile.home.tonightTitle')} />}
            accessibilityLabel={tonightAccessibilityLabel ?? tonight.recipe.title}
            actions={[{ name: 'cook', label: t('mobile.home.cook'), onPress: cook }]}
            onPress={() => router.push(`/recipe/${tonight.recipe.id}`)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md }}>
              <View style={{ flex: 1, gap: spacing.xs }}>
                <AppText variant="title" color="textInverse" numberOfLines={2}>
                  {tonight.recipe.title}
                </AppText>
                <AppText variant="caption" color="textInverseMuted">
                  {tonightMinutesLabel}
                  {tonightPantryLabel ? ' · ' : ''}
                  {tonightPantryLabel}
                </AppText>
              </View>
              <RoundButton
                size={48}
                tone="primary"
                icon="play"
                accessibilityLabel={t('mobile.home.cook')}
                onPress={cook}
              />
            </View>
          </Tile>
        ) : (
          <Tile
            span={2}
            tint="apricot"
            height={220}
            accessibilityLabel={t('mobile.home.tonightEmpty')}
            actions={[{ name: 'generatePlan', label: t('plans.generate'), onPress: generatePlan }]}
          >
            <View style={{ gap: spacing.md }}>
              <AppText variant="heading">{t('mobile.home.tonightEmpty')}</AppText>
              <Button title={t('plans.generate')} onPress={generatePlan} />
            </View>
          </Tile>
        )}

        <Tile
          span={1}
          tint="butter"
          height={150}
          icon="kitchen"
          corner={<DirectionalIcon name="arrowForward" size={22} color={colors.textMuted} />}
          count={stockCountText}
          caption={t('mobile.home.itemsAtHome')}
          accessibilityLabel={kitchenLabel}
          onPress={() => router.push('/kitchen')}
        />

        <Tile
          span={1}
          tint="plain"
          height={150}
          leading={<OrbMascot size={44} />}
          corner={<TopUpChip label={t('mobile.home.topUp')} onPress={topUp} />}
          count={creditsText}
          caption={creditsLeft}
          accessibilityLabel={mamaLabel}
          actions={[{ name: 'topUp', label: t('mobile.home.topUp'), onPress: topUp }]}
          onPress={() => router.push('/assistant')}
        />

        <Tile
          span={2}
          tint="plain"
          leading={<AppText variant="heading">{t('mobile.home.statExpiring')}</AppText>}
          corner={
            expiring.length > 0 ? (
              <AppText variant="caption" muted>
                {expiringCountLabel}
              </AppText>
            ) : null
          }
          accessibilityLabel={useSoonAccessibilityLabel}
          onPress={() => router.push('/kitchen?sort=expiry')}
        >
          {expiring.length === 0 ? (
            <AppText variant="caption" muted>
              {t('mobile.home.expiringNone')}
            </AppText>
          ) : (
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {expiringPreview.map((item) => {
                const name = itemName(locale, item);
                const label = formatExpiryLabel(t, locale, item.expiresAt, prefs);
                const tone = expiryToneColor(item);
                return (
                  <View
                    key={item.id}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      borderRadius: radius.pill,
                      paddingVertical: spacing.sm,
                      paddingHorizontal: spacing.sm,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.sm,
                      backgroundColor: colors.surfaceAlt,
                    }}
                  >
                    <FoodIcon item={miniItemIcon(item)} size={32} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText variant="label" numberOfLines={1}>
                        {name}
                      </AppText>
                      {label ? (
                        <AppText variant="caption" color={tone} numberOfLines={1}>
                          {label}
                        </AppText>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </Tile>

        <Tile
          span={1}
          tint="apricot"
          height={104}
          accessibilityLabel={t('mobile.home.scanReceipt')}
          onPress={() => router.push('/capture?method=receipt')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <IconCircle icon="receipt" />
            <AppText variant="bodyStrong" style={{ flex: 1 }}>
              {t('mobile.home.scanReceipt')}
            </AppText>
          </View>
        </Tile>

        <Tile
          span={1}
          tint="sage"
          height={104}
          accessibilityLabel={weekProgressText ?? t('mobile.home.planWeek')}
          onPress={() => router.push(week ? '/plans' : '/generate-plan')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <IconCircle icon="calendar" />
            <View style={{ flex: 1, gap: spacing.xs }}>
              <AppText variant="bodyStrong">
                {weekProgressText ?? t('mobile.home.planWeek')}
              </AppText>
              {week ? <WeekProgressBar ratio={week.cooked / week.total} /> : null}
            </View>
          </View>
        </Tile>
      </Bento>
    </Screen>
  );
}
