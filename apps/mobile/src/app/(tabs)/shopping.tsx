import { useMemo, useState } from 'react';
import { Share, View } from 'react-native';
import type { Ingredient, ShoppingListItem } from '@kitchen/contracts';
import type { MessageKey } from '@kitchen/i18n';
import {
  AppText,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  Screen,
  TabHeader,
} from '../../components';
import { AddItemField } from '../../features/shop/AddItemField';
import { ShoppingFooter } from '../../features/shop/ShoppingFooter';
import { ShoppingRow } from '../../features/shop/ShoppingRow';
import { useDebounced } from '../../hooks/useDebounced';
import { useFormat } from '../../hooks/useFormat';
import { useLocations } from '../../hooks/inventory';
import { useSearchIngredients } from '../../hooks/profile';
import {
  useAddShoppingItems,
  useCheckoutShopping,
  useShoppingList,
  useToggleShoppingItem,
} from '../../hooks/shopping';
import { errorMessageKey } from '../../lib/errors';
import { formatMeasure, formatQty, localizedName } from '../../lib/format';
import { addFieldAction, formatShoppingListForShare } from '../../lib/shopping-share';
import { useToastStore } from '../../stores/toast';
import { spacing } from '../../theme';

const ADD_DEBOUNCE_MS = 250;
const MAX_SUGGESTIONS = 5;

function countMessage(raw: string, count: number, formattedCount: string): string {
  return raw.replace(String(count), formattedCount);
}

function itemSentence(name: string, measure: string, purchased: boolean, purchasedLabel: string) {
  return purchased ? `${name}, ${measure}, ${purchasedLabel}` : `${name}, ${measure}`;
}

export default function Shopping() {
  const { t, locale, prefs } = useFormat();
  const list = useShoppingList();
  const toggle = useToggleShoppingItem();
  const checkout = useCheckoutShopping();
  const addItems = useAddShoppingItems();
  const locations = useLocations();
  const [term, setTerm] = useState('');
  const debouncedTerm = useDebounced(term, ADD_DEBOUNCE_MS);
  const ingredientSearch = useSearchIngredients(debouncedTerm);

  const items = list.data ?? [];
  const unpurchasedItems = useMemo(() => items.filter((item) => !item.purchased), [items]);
  const purchasedItems = useMemo(() => items.filter((item) => item.purchased), [items]);
  const purchasedIds = useMemo(() => purchasedItems.map((item) => item.id), [purchasedItems]);
  const targetLocation = locations.data?.[0]?.id;
  const normalizedTerm = term.trim();
  const normalizedDebouncedTerm = debouncedTerm.trim();
  const hasActiveAddTerm = normalizedTerm.length > 0 && normalizedTerm === normalizedDebouncedTerm;
  const allSearchResults = hasActiveAddTerm ? (ingredientSearch.data?.items ?? []) : [];
  const suggestions = allSearchResults.slice(0, MAX_SUGGESTIONS);
  const addAction = addFieldAction(debouncedTerm, allSearchResults);
  const showNoMatch =
    hasActiveAddTerm && ingredientSearch.isSuccess && allSearchResults.length === 0;

  const shareMessage = useMemo(
    () =>
      formatShoppingListForShare(items, locale, (quantity, unit) =>
        formatMeasure(t, locale, quantity, unit, prefs),
      ),
    [items, locale, prefs, t],
  );
  const showShopError = (key: MessageKey, error: unknown) => {
    useToastStore.getState().show({
      message: t(key, { reason: t(errorMessageKey(error)) }),
    });
  };
  const shareList = () => {
    if (!shareMessage) return;
    void Share.share({ message: shareMessage })
      .then((result) => {
        if (result.action === Share.dismissedAction) return;
      })
      .catch((error: unknown) => showShopError('mobile.shop.shareFailed', error));
  };

  const addIngredient = (ingredient: Ingredient) => {
    addItems.mutate(
      {
        planId: null,
        items: [{ ingredientId: ingredient.id, quantity: 1, unit: ingredient.defaultUnit }],
      },
      {
        onSuccess: () => setTerm(''),
        onError: (error) => showShopError('mobile.shop.addFailed', error),
      },
    );
  };
  const addExactMatch = () => {
    if (!addAction.ingredient) return;
    addIngredient(addAction.ingredient);
  };

  const moveToKitchen = () => {
    const count = purchasedIds.length;
    if (count === 0 || !targetLocation) return;
    checkout.mutate(
      { itemIds: purchasedIds, locationId: targetLocation },
      {
        onSuccess: () => {
          useToastStore.getState().show({ message: t('shopping.movedCount', { count }) });
        },
        onError: (error) => showShopError('mobile.shop.moveFailed', error),
      },
    );
  };

  const purchasedCountText = formatQty(locale, purchasedIds.length, prefs);
  const moveTitle =
    purchasedIds.length > 0
      ? countMessage(
          t('mobile.shop.moveCount', { count: purchasedIds.length }),
          purchasedIds.length,
          purchasedCountText,
        )
      : t('shopping.moveToKitchen');
  const renderRows = (rows: readonly ShoppingListItem[]) =>
    rows.map((item) => {
      const name = localizedName(locale, item.nameEn, item.nameAr);
      const measure = formatMeasure(t, locale, item.quantity, item.unit, prefs);
      const accessibilityLabel = itemSentence(
        name,
        measure,
        item.purchased,
        t('shopping.purchased'),
      );
      return (
        <ShoppingRow
          key={item.id}
          name={name}
          measure={measure}
          purchased={item.purchased}
          accessibilityLabel={accessibilityLabel}
          onToggle={() =>
            toggle.mutate(
              { id: item.id, purchased: !item.purchased },
              { onError: (error) => showShopError('mobile.shop.updateFailed', error) },
            )
          }
        />
      );
    });

  return (
    <Screen
      scroll
      padded={false}
      tabBar
      refreshing={list.isRefetching}
      onRefresh={() => void list.refetch()}
      footer={
        <ShoppingFooter
          title={moveTitle}
          disabled={purchasedIds.length === 0 || !targetLocation}
          loading={checkout.isPending}
          onPress={moveToKitchen}
        />
      }
    >
      <TabHeader
        title={t('shopping.title')}
        action={
          shareMessage ? (
            <IconButton
              icon="share"
              tone="plain"
              size={44}
              accessibilityLabel={t('mobile.shop.share')}
              onPress={shareList}
            />
          ) : undefined
        }
      />

      <View
        style={{
          paddingHorizontal: spacing.gutter,
          paddingBottom: spacing.gutter,
          gap: spacing.xl,
        }}
      >
        <AddItemField
          term={term}
          locale={locale}
          suggestions={suggestions}
          placeholder={t('mobile.shop.addPlaceholder')}
          addLabel={t('mobile.shop.add')}
          noMatchLabel={t('mobile.shop.noMatch')}
          showNoMatch={showNoMatch}
          actionEnabled={addAction.enabled}
          submitting={addItems.isPending}
          onTermChange={setTerm}
          onAddAction={addExactMatch}
          onChoose={addIngredient}
        />

        {list.isLoading ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState illustration="bag" title={t('shopping.empty')} />
        ) : (
          <View style={{ gap: spacing.xl }}>
            {unpurchasedItems.length > 0 ? <View>{renderRows(unpurchasedItems)}</View> : null}

            {purchasedItems.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                <AppText variant="heading" accessibilityRole="header">
                  {t('shopping.purchased')}
                </AppText>
                <View>{renderRows(purchasedItems)}</View>
              </View>
            ) : null}
          </View>
        )}
      </View>
    </Screen>
  );
}
