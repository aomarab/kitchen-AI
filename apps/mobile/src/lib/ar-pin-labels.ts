import type { Locale } from '@kitchen/i18n';
import { estimateChipWidth } from './ar-pins';

type PinLabelKey = 'mobile.capture.pinLabel' | 'mobile.capture.pinUnsure';

export interface ArPinLabelInput {
  name: string;
  quantity: string;
  lowConfidence: boolean;
  locale: Locale;
  t: (key: PinLabelKey, params: Record<string, string>) => string;
}

export interface ArPinLabel {
  text: string;
  accessibilityLabel: string;
  width: number;
}

/** Builds the one visual label and spoken label the pin and tray share. */
export function buildArPinLabel({
  name,
  quantity,
  lowConfidence,
  locale,
  t,
}: ArPinLabelInput): ArPinLabel {
  const unsureMark = locale === 'ar' ? '؟' : '?';
  const text = lowConfidence ? `${name}${unsureMark}` : `${name} · ${quantity}`;
  return {
    text,
    accessibilityLabel: lowConfidence
      ? t('mobile.capture.pinUnsure', { name })
      : t('mobile.capture.pinLabel', { name, quantity }),
    width: estimateChipWidth(text),
  };
}
