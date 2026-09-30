export interface QuantityInputRules {
  min?: number;
  max?: number;
  step?: number;
}

export const CAPTURE_QUANTITY_RULES = {
  min: 0,
  step: 1,
} satisfies Required<Pick<QuantityInputRules, 'min' | 'step'>>;

export function clampQuantityToStepperRules(
  value: number,
  { min = CAPTURE_QUANTITY_RULES.min, max }: QuantityInputRules = CAPTURE_QUANTITY_RULES,
): number {
  const lowerBounded = Math.max(min, value);
  return max === undefined ? lowerBounded : Math.min(max, lowerBounded);
}

const EASTERN_ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function normalizeQuantityInput(text: string): string {
  return text
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(EASTERN_ARABIC_DIGITS.indexOf(digit)))
    .replace(/[٫,]/g, '.');
}

export function parseQuantityFieldValue(
  text: string,
  fallback: number,
  rules: QuantityInputRules = CAPTURE_QUANTITY_RULES,
): number {
  const normalized = normalizeQuantityInput(text);
  if (normalized.length === 0) return fallback;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return fallback;
  return clampQuantityToStepperRules(parsed, rules);
}
