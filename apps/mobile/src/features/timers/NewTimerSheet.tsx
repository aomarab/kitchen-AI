import { useState } from 'react';
import { View } from 'react-native';
import { MAX_TIMER_DURATION_SEC } from '@kitchen/contracts';
import { AppText, Button, Chip, Field, QuantityStepper, Sheet } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { useCreateTimer } from '../../hooks/timers';
import { spacing } from '../../theme';

const PRESET_MINUTES = [1, 3, 5, 10, 20, 45] as const;
const MAX_TIMER_MINUTES = MAX_TIMER_DURATION_SEC / 60;

export function NewTimerSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useFormat();
  const create = useCreateTimer();
  const [label, setLabel] = useState('');
  const [minutes, setMinutes] = useState<number>(5);

  const canSubmit = label.trim().length > 0 && !create.isPending;

  return (
    <Sheet visible={visible} onClose={onClose} title={t('mobile.timers.newTimer')}>
      <Field
        label={t('mobile.timers.label')}
        value={label}
        placeholder={t('mobile.timers.labelPlaceholder')}
        maxLength={60}
        onChangeText={setLabel}
      />

      <View style={{ gap: spacing.sm }}>
        <AppText variant="label" muted>
          {t('mobile.timers.minutes')}
        </AppText>
        <QuantityStepper
          value={minutes}
          min={1}
          max={MAX_TIMER_MINUTES}
          onChange={setMinutes}
          accessibilityLabel={t('mobile.timers.minutes')}
          decrementLabel={t('mobile.common.decrease')}
          incrementLabel={t('mobile.common.increase')}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {PRESET_MINUTES.map((preset) => (
            <Chip
              key={preset}
              label={String(preset)}
              selected={minutes === preset}
              onPress={() => setMinutes(preset)}
            />
          ))}
        </View>
      </View>

      <Button
        title={t('mobile.timers.start')}
        loading={create.isPending}
        disabled={!canSubmit}
        onPress={() => {
          if (!canSubmit) return;
          create.mutate(
            { label: label.trim(), durationSec: minutes * 60 },
            {
              onSuccess: () => {
                setLabel('');
                onClose();
              },
            },
          );
        }}
      />
      <Button title={t('mobile.timers.cancel')} variant="ghost" onPress={onClose} />
    </Sheet>
  );
}
