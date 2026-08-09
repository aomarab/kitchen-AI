import { describe, it, expect } from 'vitest';
import { splitByScript } from '../catalog/drizzle-ingredient-resolver.js';
import { generatedRecipeSchema } from '@kitchen/contracts';
import { buildPlanningPrompt } from '../prompts/planning.prompt.js';
import type { PlanPromptContext } from '../prompts/prompt.types.js';

/**
 * A real Arabic weekly plan created 39 duplicate catalog rows out of 541 — one
 * per ingredient whose Arabic name missed the English-seeded catalog. Each
 * duplicate stored Arabic in `canonical_name_en`, so an English user saw
 * Arabic, and — worse — the household's own feta no longer matched the recipe
 * that called for feta, making coverage demand a shopping trip for food in the
 * fridge.
 */
describe('bilingual catalog names', () => {
  describe('splitByScript', () => {
    it('keeps an Arabic name out of the English column', () => {
      // The exact row the real run produced: "جبن فيتا" written to
      // canonical_name_en, duplicating the seeded "Feta cheese".
      expect(splitByScript({ name: 'جبن فيتا', nameEn: 'Feta cheese' })).toMatchObject({
        en: 'Feta cheese',
        ar: 'جبن فيتا',
        guessed: false,
      });
    });

    it('assigns by script even when the model swaps the two fields', () => {
      expect(splitByScript({ name: 'Feta cheese', nameEn: 'جبن فيتا' })).toMatchObject({
        en: 'Feta cheese',
        ar: 'جبن فيتا',
      });
    });

    it('prefers nameEn over an English name that is merely the display name', () => {
      expect(splitByScript({ name: 'Plain yogurt', nameEn: 'Yogurt', nameAr: 'لبن زبادي' })).toMatchObject(
        { en: 'Yogurt', ar: 'لبن زبادي' },
      );
    });

    it('reports guessed when no Latin-script name was supplied', () => {
      // We still keep the ingredient rather than dropping it from the recipe,
      // but the caller logs it — silent Arabic in the English column is how
      // this went unnoticed for 39 rows.
      const out = splitByScript({ name: 'شوفان رقائق' });
      expect(out.guessed).toBe(true);
      expect(out.en).toBe('شوفان رقائق');
      expect(out.ar).toBe('شوفان رقائق');
    });

    it('ignores blank and whitespace-only names', () => {
      expect(splitByScript({ name: 'زعتر', nameEn: '   ' })).toMatchObject({
        en: 'زعتر',
        guessed: true,
      });
    });

    it('does not treat a Latin name containing Arabic as English', () => {
      expect(splitByScript({ name: 'Zaatar زعتر', nameEn: 'Zaatar' }).en).toBe('Zaatar');
    });
  });

  describe('generated recipe contract', () => {
    const base = {
      title: 'شكشوكة',
      description: 'وصفة',
      cuisine: null,
      difficulty: 'easy',
      prepMinutes: 5,
      cookMinutes: 10,
      servings: 2,
      steps: ['اخفق البيض'],
      nutritionPerServing: null,
    };

    it('carries nameEn through', () => {
      const parsed = generatedRecipeSchema.parse({
        ...base,
        ingredients: [
          { name: 'جبن فيتا', nameEn: 'Feta cheese', quantity: 100, unit: 'g', optional: false },
        ],
      });
      expect(parsed.ingredients[0]!.nameEn).toBe('Feta cheese');
    });

    it('still parses when the model omits nameEn, rather than failing the plan', () => {
      // The standing lesson: a model told a field may be absent omits the key.
      // Losing the join hint is a degradation; losing the whole plan is an
      // outage.
      const parsed = generatedRecipeSchema.parse({
        ...base,
        ingredients: [{ name: 'جبن فيتا', quantity: 100, unit: 'g', optional: false }],
      });
      expect(parsed.ingredients[0]!.nameEn).toBeNull();
    });
  });

  describe('planning prompt', () => {
    const ctx: PlanPromptContext = {
      locale: 'ar',
      scope: 'weekly',
      servings: 2,
      dates: ['2026-08-10'],
      slots: ['breakfast'],
      pantry: [
        {
          name: 'جبن فيتا',
          nameEn: 'Feta cheese',
          nameAr: 'جبن فيتا',
          quantity: 200,
          unit: 'g',
          expiresOn: null,
          isStaple: false,
        },
      ],
      constraints: {
        dietaryPrefs: [],
        allergies: [],
        halal: true,
        cuisinePrefs: [],
        householdSize: 2,
        maxCookMinutes: null,
        excludeNames: [],
      },
      maxRepeatsPerWeek: 2,
      alreadyUsedTitles: [],
    };

    it('shows the English catalog name next to the Arabic pantry name', () => {
      // Otherwise "copy the English name" refers to something the model was
      // never shown — the same mistake as describing the recipe shape as {...}.
      const prompt = JSON.stringify(buildPlanningPrompt(ctx));
      expect(prompt).toContain('Feta cheese');
      expect(prompt).toMatch(/جبن فيتا».{0,3}\(«Feta cheese»\)/);
    });

    it('does not repeat the name when both locales agree', () => {
      const prompt = JSON.stringify(
        buildPlanningPrompt({
          ...ctx,
          locale: 'en',
          pantry: [{ ...ctx.pantry[0]!, name: 'Feta cheese' }],
        }),
      );
      expect(prompt).not.toMatch(/Feta cheese».{0,3}\(«Feta cheese/);
    });

    it('asks for nameEn in Latin script with a worked example', () => {
      const prompt = JSON.stringify(buildPlanningPrompt(ctx));
      expect(prompt).toContain('nameEn');
      expect(prompt).toMatch(/Latin script/i);
      expect(prompt).toMatch(/Feta cheese/);
    });

    it('tells the model to copy the catalog spelling exactly', () => {
      // Ranking candidates is pointless if the model paraphrases them: the
      // exact-match pass is what avoids a new row.
      const prompt = JSON.stringify(buildPlanningPrompt(ctx));
      expect(prompt).toMatch(/exactly/i);
    });
  });
});
