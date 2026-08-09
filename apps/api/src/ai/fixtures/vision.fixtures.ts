import type { VisionPromptContext } from '../prompts/prompt.types.js';

/**
 * Recorded vision output. Names are real catalog canonical names so resolution
 * behaves against the live catalog. The empty scenario drives the `AI_NO_RESULT`
 * degrade-to-manual path (spec §5.1 / §8); the invalid scenario drives the
 * schema-guard repair path.
 */

const FRIDGE = {
  ingredients: [
    { nameEn: 'Chicken eggs', nameAr: 'بيض دجاج', category: 'egg', estimatedQuantity: 8, unit: 'piece', confidence: 0.92 },
    { nameEn: 'Roma tomato', nameAr: 'طماطم روما', category: 'vegetable', estimatedQuantity: 400, unit: 'g', confidence: 0.81 },
    { nameEn: 'Labneh', nameAr: 'لبنة', category: 'dairy', estimatedQuantity: 250, unit: 'g', confidence: 0.7 },
    { nameEn: 'Cucumber', nameAr: 'خيار', category: 'vegetable', estimatedQuantity: 3, unit: 'piece', confidence: 0.66 },
    // Intentionally low confidence — must be flagged in the review list.
    { nameEn: 'Halloumi', nameAr: 'حلوم', category: 'dairy', estimatedQuantity: 200, unit: 'g', confidence: 0.34 },
  ],
};

const PANTRY = {
  ingredients: [
    { nameEn: 'Basmati rice', nameAr: 'أرز بسمتي', category: 'grain', estimatedQuantity: 1000, unit: 'g', confidence: 0.9 },
    { nameEn: 'Red lentils', nameAr: 'عدس أحمر', category: 'legume', estimatedQuantity: 500, unit: 'g', confidence: 0.85 },
    { nameEn: 'Extra virgin olive oil', nameAr: 'زيت زيتون بكر ممتاز', category: 'oil', estimatedQuantity: 750, unit: 'ml', confidence: 0.88 },
    { nameEn: 'Canned chickpeas', nameAr: 'حمص معلب', category: 'legume', estimatedQuantity: 2, unit: 'can', confidence: 0.6 },
  ],
};

const SPICE_RACK = {
  ingredients: [
    { nameEn: 'Ground cumin', nameAr: 'كمون مطحون', category: 'spice', estimatedQuantity: 60, unit: 'g', confidence: 0.75 },
    { nameEn: 'Turmeric', nameAr: 'كركم', category: 'spice', estimatedQuantity: 50, unit: 'g', confidence: 0.72 },
    { nameEn: 'Sumac', nameAr: 'سماق', category: 'spice', estimatedQuantity: 40, unit: 'g', confidence: 0.4 },
  ],
};

export const INVALID_VISION_RAW: unknown = {
  ingredients: [{ nameEn: '', category: 'unknown-category', confidence: 5 }],
};

export function buildMockVision(ctx: VisionPromptContext, scenario?: string): unknown {
  if (scenario === 'empty') return { ingredients: [] };
  switch (ctx.locationHint) {
    case 'pantry':
      return PANTRY;
    case 'spice_rack':
      return SPICE_RACK;
    default:
      return FRIDGE;
  }
}
