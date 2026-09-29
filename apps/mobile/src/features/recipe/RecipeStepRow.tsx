import type { RecipeStep } from '@kitchen/contracts';
import { View } from 'react-native';
import { AppText } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { formatQty } from '../../lib/format';
import { useTheme } from '../../theme/useTheme';

export const STEP_NUMBER_BOX_SIZE = 28;

export function RecipeStepRow({ step }: { step: RecipeStep }) {
  const { locale, prefs } = useFormat();
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 14,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.rowline,
      }}
    >
      <View
        style={{
          width: STEP_NUMBER_BOX_SIZE,
          height: STEP_NUMBER_BOX_SIZE,
          borderWidth: 1.5,
          borderColor: colors.text,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        <AppText variant="label">{formatQty(locale, step.index, prefs)}</AppText>
      </View>
      <AppText style={{ flex: 1 }}>{step.text}</AppText>
    </View>
  );
}
