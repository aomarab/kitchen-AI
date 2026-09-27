import { Pressable, View } from 'react-native';
import {
  Screen,
  TabHeader,
  Button,
  Icon,
  ListRow,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { useShoppingList, useToggleShoppingItem, useCheckoutShopping } from '../../hooks/shopping';
import { useLocations } from '../../hooks/inventory';
import { localizedName, formatMeasure } from '../../lib/format';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export default function Shopping() {
  const { t, locale, prefs } = useFormat();
  const { colors } = useTheme();
  const list = useShoppingList();
  const toggle = useToggleShoppingItem();
  const checkout = useCheckoutShopping();
  const locations = useLocations();

  const items = list.data ?? [];
  const purchasedIds = items.filter((item) => item.purchased).map((item) => item.id);
  const targetLocation = locations.data?.[0]?.id;

  const moveToKitchen = () => {
    if (purchasedIds.length === 0 || !targetLocation) return;
    checkout.mutate({ itemIds: purchasedIds, locationId: targetLocation });
  };

  return (
    <Screen scroll tabBar refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
      <TabHeader title={t('shopping.title')} />

      {list.isLoading ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon="basket" title={t('shopping.empty')} />
      ) : (
        <>
          <View style={{ gap: spacing.sm }}>
            {items.map((item) => {
              const itemLabel = localizedName(locale, item.nameEn, item.nameAr);
              return (
                <ListRow
                  key={item.id}
                  title={itemLabel}
                  subtitle={formatMeasure(t, locale, item.quantity, item.unit, prefs)}
                  accessibilityLabel={item.purchased ? t('shopping.purchased') : itemLabel}
                  leading={
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: item.purchased }}
                      accessibilityLabel={itemLabel}
                      onPress={() => toggle.mutate({ id: item.id, purchased: !item.purchased })}
                      style={{
                        width: 44,
                        height: 44,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <View
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: radius.sm,
                          borderWidth: 1,
                          borderColor: item.purchased ? colors.success : colors.border,
                          backgroundColor: item.purchased ? colors.successSoft : colors.surface,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {item.purchased ? (
                          <Icon name="check" size={16} color={colors.success} />
                        ) : null}
                      </View>
                    </Pressable>
                  }
                />
              );
            })}
          </View>

          <Button
            title={t('shopping.moveToKitchen')}
            icon="check"
            disabled={purchasedIds.length === 0 || !targetLocation}
            loading={checkout.isPending}
            onPress={moveToKitchen}
          />
        </>
      )}
    </Screen>
  );
}
