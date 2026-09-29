import { View } from 'react-native';
import { AppText } from '../../components';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export interface RecipeMetaItem {
  value: string;
  label: string;
}

export function RecipeMetaRow({ items }: { items: readonly RecipeMetaItem[] }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: colors.rowline,
        borderBottomWidth: 1,
        borderBottomColor: colors.rowline,
        paddingVertical: spacing.md,
        gap: spacing.md,
      }}
    >
      {items.map((item) => (
        <View key={`${item.label}:${item.value}`} style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {item.value}
          </AppText>
          <AppText variant="caption" muted numberOfLines={1}>
            {item.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}
