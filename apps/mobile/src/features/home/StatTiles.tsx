import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Card, Icon, type IconName } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { formatQty } from '../../lib/format';
import { spacing, tintFor } from '../../theme';

interface Tile {
  readonly key: string;
  readonly value: number;
  readonly label: string;
  readonly icon: IconName;
  readonly href: string;
}

/**
 * Three numbers the household actually acts on, above the fold.
 *
 * Each tile is a shortcut as well as a readout — a count with nowhere to go is
 * a poster, not a dashboard — so the whole tile is the touch target rather
 * than a link buried inside it.
 */
export function StatTiles({
  items,
  expiring,
  shopping,
}: {
  items: number;
  expiring: number;
  shopping: number;
}) {
  const { t, locale, prefs } = useFormat();
  const router = useRouter();

  const tiles: Tile[] = [
    {
      key: 'items',
      value: items,
      label: t('mobile.home.statItems'),
      icon: 'kitchen',
      href: '/kitchen',
    },
    {
      key: 'expiring',
      value: expiring,
      label: t('mobile.home.statExpiring'),
      icon: 'clock',
      href: '/kitchen',
    },
    {
      key: 'shopping',
      value: shopping,
      label: t('mobile.home.statShopping'),
      icon: 'basket',
      href: '/shopping',
    },
  ];

  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      {tiles.map((tile, index) => {
        const tint = tintFor(index);
        return (
          <Card
            key={tile.key}
            tint={tint}
            onPress={() => router.push(tile.href)}
            accessibilityLabel={`${tile.label}: ${formatQty(locale, tile.value, prefs)}`}
            style={{
              flex: 1,
              minHeight: 44,
              padding: spacing.md,
              gap: spacing.xs,
            }}
          >
            <Icon name={tile.icon} size={18} color={tint.fg} />
            <AppText variant="heading" style={{ color: tint.fg }}>
              {formatQty(locale, tile.value, prefs)}
            </AppText>
            <AppText variant="caption" numberOfLines={2} style={{ color: tint.fg }}>
              {tile.label}
            </AppText>
          </Card>
        );
      })}
    </View>
  );
}
