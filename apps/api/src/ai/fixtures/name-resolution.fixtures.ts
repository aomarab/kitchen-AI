import type { NameResolveContext, TranslateRecipeContext } from '../prompts/prompt.types.js';

/**
 * Cheap-model fixtures. Name resolution maps each name to a supplied candidate
 * when one clearly fits; recipe translation returns native text in the target
 * locale. Deterministic so tests are reproducible.
 */

export function buildMockNameResolution(ctx: NameResolveContext): unknown {
  const matches = ctx.names.map((name) => {
    const low = name.toLowerCase();
    const hit = ctx.candidateNames.find(
      (c) => c.toLowerCase() === low || c.toLowerCase().includes(low) || low.includes(c.toLowerCase()),
    );
    return {
      rawName: name,
      canonicalName: hit ?? name,
      confidence: hit ? 0.8 : 0.25,
    };
  });
  return { matches };
}

export function buildMockTranslation(ctx: TranslateRecipeContext): unknown {
  // A stand-in translation good enough for the mock: it preserves the step
  // count and structure so the translation pipeline (not wording quality) is
  // exercised. The real provider produces genuinely native target-locale text.
  return {
    title: ctx.title,
    description: ctx.description,
    steps: ctx.steps.map((s) => s),
  };
}
