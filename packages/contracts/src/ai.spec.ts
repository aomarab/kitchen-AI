import { describe, expect, it } from 'vitest';
import { normalizedBoxSchema, recognizedItemSchema, visionIngredientSchema } from './ai.js';

const ingredient = {
  nameEn: 'Tomato',
  nameAr: 'طماطم',
  category: 'vegetable',
  estimatedQuantity: 200,
  unit: 'g',
  confidence: 0.9,
};

const item = {
  tempId: 't1',
  match: { ingredientId: null, strategy: 'unresolved', confidence: 0, rawName: 'Tomato' },
  nameEn: 'Tomato',
  nameAr: 'طماطم',
  category: 'vegetable',
  quantity: 200,
  unit: 'g',
  confidence: 0.9,
  suggestedExpiresAt: null,
  suggestedLocationType: 'fridge',
  photoKey: 'h/photo.jpg',
};

describe('normalizedBoxSchema', () => {
  it('accepts a box that touches the right and bottom edges', () => {
    expect(normalizedBoxSchema.safeParse({ x: 0.6, y: 0.5, w: 0.4, h: 0.5 }).success).toBe(true);
  });

  it('rejects a box that runs off the image', () => {
    expect(normalizedBoxSchema.safeParse({ x: 0.7, y: 0.1, w: 0.4, h: 0.2 }).success).toBe(false);
    expect(normalizedBoxSchema.safeParse({ x: 0.1, y: 0.9, w: 0.2, h: 0.2 }).success).toBe(false);
  });

  it('rejects a zero-sized box', () => {
    expect(normalizedBoxSchema.safeParse({ x: 0.1, y: 0.1, w: 0, h: 0.2 }).success).toBe(false);
  });
});

describe('visionIngredientSchema box', () => {
  it('reads an omitted box as null, the way a v1 prompt answers', () => {
    const parsed = visionIngredientSchema.parse(ingredient);
    expect(parsed.box).toBeNull();
  });

  it('keeps a raw box as written, out-of-range values included, for the API to sanitise', () => {
    const parsed = visionIngredientSchema.parse({
      ...ingredient,
      box: { x: -0.01, y: 0.2, w: 0.3, h: 1.02 },
    });
    expect(parsed.box).toEqual({ x: -0.01, y: 0.2, w: 0.3, h: 1.02 });
  });

  it('drops a malformed box instead of failing the whole scan', () => {
    const parsed = visionIngredientSchema.safeParse({ ...ingredient, box: { x: '0.1', y: 0.2 } });
    expect(parsed.success).toBe(true);
    expect(parsed.data!.box).toBeNull();
  });
});

describe('recognizedItemSchema box', () => {
  it('parses an item from a server that predates boxes', () => {
    const parsed = recognizedItemSchema.safeParse(item);
    expect(parsed.success).toBe(true);
    expect(parsed.data!.box).toBeUndefined();
  });

  it('carries a normalised box through', () => {
    const box = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    expect(recognizedItemSchema.parse({ ...item, box }).box).toEqual(box);
  });

  it('refuses an unsanitised box on the client contract', () => {
    expect(
      recognizedItemSchema.safeParse({ ...item, box: { x: 0.9, y: 0, w: 0.5, h: 0.1 } }).success,
    ).toBe(false);
  });
});
