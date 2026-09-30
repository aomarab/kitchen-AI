import { useState } from 'react';
import { MAX_TIMER_DURATION_SEC } from '@kitchen/contracts';
import { Button, Field, Sheet } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { useCreateTimer } from '../../hooks/timers';
import { parseQuantityFieldValue } from '../../lib/capture-quantity';

const MAX_TIMER_MINUTES = MAX_TIMER_DURATION_SEC / 60;

export function NewTimerSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useFormat();
  const create = useCreateTimer();
  const [label, setLabel] = useState('');
  const [minutes, setMinutes] = useState<number>(5);
  const [minutesText, setMinutesText] = useState('5');

  const canSubmit = label.trim().length > 0 && !create.isPending;
  const updateMinutes = (text: string) => {
    setMinutesText(text);
    setMinutes(
      Math.round(
        parseQuantityFieldValue(text, minutes, { min: 1, max: MAX_TIMER_MINUTES, step: 1 }),
      ),
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('mobile.timers.newTimer')}>
      <Field
        label={t('mobile.timers.label')}
        value={label}
        placeholder={t('mobile.timers.labelPlaceholder')}
        maxLength={60}
        onChangeText={setLabel}
      />

      <Field
        label={t('mobile.timers.minutes')}
        value={minutesText}
        keyboardType="number-pad"
        inputMode="numeric"
        onChangeText={updateMinutes}
        onBlur={() => setMinutesText(String(minutes))}
      />

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
