import { Animated, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import type { IngredientCategory } from '@kitchen/contracts';
import { AppText, Badge, FoodIcon } from '../../components';
import { usePressFeedback } from '../../components/press-feedback';
import type { InventoryRowBadgeTone } from '../../lib/inventory-row';
import { useTheme } from '../../theme/useTheme';

type InventoryItemRowArt = {
  label?: string | null;
  nameEn?: string | null;
  nameAr?: string | null;
  category: IngredientCategory;
};

export interface InventoryItemRowProps {
  item: InventoryItemRowArt;
  name: string;
  meta: string;
  badgeLabel?: string | null;
  badgeTone?: InventoryRowBadgeTone;
  when?: string | null;
  onPress?: () => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

function InventoryItemRowBody({
  item,
  name,
  meta,
  badgeLabel,
  badgeTone = 'muted',
  when,
}: Omit<InventoryItemRowProps, 'accessibilityLabel' | 'onPress' | 'style' | 'testID'>) {
  return (
    <>
      <FoodIcon item={item} size={56} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong">{name}</AppText>
        <AppText variant="caption" color="textMuted">
          {meta}
        </AppText>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {badgeLabel ? <Badge tone={badgeTone} label={badgeLabel} /> : null}
        {when ? (
          <AppText variant="small" color="textMuted">
            {when}
          </AppText>
        ) : null}
      </View>
    </>
  );
}

export function InventoryItemRow({
  item,
  name,
  meta,
  badgeLabel,
  badgeTone,
  when,
  onPress,
  accessibilityLabel,
  style,
  testID,
}: InventoryItemRowProps) {
  const { colors } = useTheme();
  const pressFeedback = usePressFeedback();
  const rowStyle: ViewStyle = {
    minHeight: 76,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.rowline,
  };
  const body = (
    <InventoryItemRowBody
      item={item}
      name={name}
      meta={meta}
      badgeLabel={badgeLabel}
      badgeTone={badgeTone}
      when={when}
    />
  );

  if (!onPress) {
    return (
      <View
        accessible
        accessibilityLabel={accessibilityLabel}
        style={[rowStyle, style]}
        testID={testID}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      {...pressFeedback.pressHandlers}
      testID={testID}
    >
      <Animated.View style={[rowStyle, pressFeedback.animatedStyle, style]}>{body}</Animated.View>
    </Pressable>
  );
}
