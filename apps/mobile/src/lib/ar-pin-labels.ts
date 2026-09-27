import { estimateChipWidth } from './ar-pins';

type PinLabelKey = 'mobile.capture.pinLabel' | 'mobile.capture.pinUnsure';

export interface ArPinLabelInput {
  name: string;
  quantity: string;
  lowConfidence: boolean;
  t: (key: PinLabelKey, params: Record<string, string>) => string;
}

export interface ArPinLabel {
  text: string;
  accessibilityLabel: string;
  width: number;
}

/** Builds the one visual label and spoken label the pin and tray share. */
export function buildArPinLabel({ name, quantity, lowConfidence, t }: ArPinLabelInput): ArPinLabel {
  const text = lowConfidence ? `${name}?` : `${name} · ${quantity}`;
  return {
    text,
    accessibilityLabel: lowConfidence
      ? t('mobile.capture.pinUnsure', { name })
      : t('mobile.capture.pinLabel', { name, quantity }),
    width: estimateChipWidth(text),
  };
}
