import { Animated, Pressable, View } from 'react-native';
import { AppText, Icon, type IconName } from '../../components';
import { usePressFeedback } from '../../components/press-feedback';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export interface RecipeMetaItem {
  value: string;
  label: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  trailingIcon?: IconName;
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
        <RecipeMetaCell key={`${item.label}:${item.value}`} item={item} />
      ))}
    </View>
  );
}

function RecipeMetaCell({ item }: { item: RecipeMetaItem }) {
  const { colors } = useTheme();
  const pressFeedback = usePressFeedback();
  const content = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {item.value}
        </AppText>
        {item.trailingIcon ? (
          <Icon name={item.trailingIcon} size={12} color={colors.control} />
        ) : null}
      </View>
      <AppText variant="caption" muted numberOfLines={1}>
        {item.label}
      </AppText>
    </>
  );

  const style = { flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center', gap: 2 } as const;

  if (!item.onPress) {
    return <View style={style}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.accessibilityLabel ?? `${item.label} ${item.value}`}
      accessibilityHint={item.accessibilityHint}
      onPress={item.onPress}
      {...pressFeedback.pressHandlers}
      style={style}
    >
      <Animated.View style={pressFeedback.animatedStyle}>{content}</Animated.View>
    </Pressable>
  );
}
