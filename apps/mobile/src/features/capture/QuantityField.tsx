import { useEffect, useState } from 'react';
import { Field } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { parseQuantityFieldValue, type QuantityInputRules } from '../../lib/capture-quantity';

function quantityText(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

export function QuantityField({
  value,
  onChange,
  rules,
}: {
  value: number;
  onChange: (value: number) => void;
  rules?: QuantityInputRules;
}) {
  const { t } = useFormat();
  const [text, setText] = useState(() => quantityText(value));

  useEffect(() => {
    setText(quantityText(value));
  }, [value]);

  const commitText = (nextText: string) => {
    setText(nextText);
    const next = parseQuantityFieldValue(nextText, value, rules);
    if (next !== value) onChange(next);
  };

  return (
    <Field
      label={t('inventory.quantity')}
      value={text}
      keyboardType="decimal-pad"
      inputMode="decimal"
      onChangeText={commitText}
      onBlur={() => setText(quantityText(parseQuantityFieldValue(text, value, rules)))}
    />
  );
}
