import { useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import type { Unit } from '@kitchen/contracts';
import { AppText, Icon, ListRow, Sheet } from '../../components';
import { usePressFeedback } from '../../components/press-feedback';
import { useFormat } from '../../hooks/useFormat';
import { unitLabel } from '../../lib/format';
import { COMMON_UNITS } from '../../lib/units';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export function UnitSelectField({
  value,
  onChange,
}: {
  value: Unit;
  onChange: (unit: Unit) => void;
}) {
  const { t } = useFormat();
  const { colors } = useTheme();
  const pressFeedback = usePressFeedback();
  const [open, setOpen] = useState(false);
  const label = t('inventory.unit');
  const valueLabel = unitLabel(t, value);

  return (
    <View style={{ gap: 6 }}>
      <AppText variant="label">{label}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} ${valueLabel}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        {...pressFeedback.pressHandlers}
        style={{ minHeight: 48, justifyContent: 'center' }}
      >
        <Animated.View
          style={[
            {
              minHeight: 48,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.none,
              paddingHorizontal: 14,
              backgroundColor: colors.bg,
            },
            pressFeedback.animatedStyle,
          ]}
        >
          <AppText style={{ flex: 1 }}>{valueLabel}</AppText>
          <Icon name="chevD" size={18} color={colors.control} />
        </Animated.View>
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <View>
          {COMMON_UNITS.map((unit) => (
            <ListRow
              key={unit}
              title={unitLabel(t, unit)}
              checked={unit === value}
              accessibilityState={{ selected: unit === value }}
              onPress={() => {
                onChange(unit);
                setOpen(false);
              }}
            />
          ))}
        </View>
      </Sheet>
    </View>
  );
}
