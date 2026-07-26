import type { NameResolveContext, TranslateRecipeContext } from './prompt.types.js';
import {
  type BuiltPrompt,
  localeDirective,
  numbered,
  untrusted,
  untrustedList,
  UNTRUSTED_DATA_DIRECTIVE,
} from './prompt.shared.js';

/**
 * Cheap-model name resolution (spec §5.1 step 4 / §5.6). Given free-text names
 * and catalog candidates, the model maps each name onto a canonical catalog
 * name when possible. Deterministic exact/alias matching runs first in code;
 * this only handles the residue.
 */
export const NAME_RESOLVE_PROMPT_VERSION = 'name-resolve/v1';
export const RECIPE_TRANSLATE_PROMPT_VERSION = 'recipe-translate/v1';

export function buildNameResolvePrompt(ctx: NameResolveContext): BuiltPrompt {
  const system = [
    'You map free-text ingredient names onto a fixed bilingual catalog.',
    'Return JSON {"matches":[{"rawName","canonicalName","confidence"}]}, one per input name in ' +
      'order. Prefer a provided candidate; if none fits, echo a cleaned generic name with low ' +
      'confidence. Never invent a catalog entry that was not offered.',
    localeDirective(ctx.locale),
    UNTRUSTED_DATA_DIRECTIVE,
  ].join('\n\n');

  const user = [
    `Names to resolve:\n${untrustedList(ctx.names)}`,
    `Catalog candidates:\n${numbered(ctx.candidateNames)}`,
  ].join('\n\n');

  return { system, user, version: NAME_RESOLVE_PROMPT_VERSION };
}

/**
 * Lazy translation of a stored recipe into the other language (spec §4.3). The
 * `recipe.translate` job uses this so an Arabic user reading an English recipe
 * gets native Arabic text rather than machine translation on the client.
 */
export function buildRecipeTranslatePrompt(ctx: TranslateRecipeContext): BuiltPrompt {
  const system = [
    `You are a culinary translator producing native ${ctx.toLocale === 'ar' ? 'Arabic' : 'English'} recipe text.`,
    localeDirective(ctx.toLocale),
    'Return JSON {"title","description","steps":[...]} preserving the number and order of steps.',
    UNTRUSTED_DATA_DIRECTIVE,
  ].join('\n\n');

  const user = [
    `Title: ${untrusted(ctx.title)}`,
    `Description: ${untrusted(ctx.description)}`,
    `Steps:\n${untrustedList(ctx.steps)}`,
  ].join('\n\n');

  return { system, user, version: RECIPE_TRANSLATE_PROMPT_VERSION };
}
