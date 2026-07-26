import type { CatalogIngredientRef, ResolvedRecipeIngredient, SafetyViolation } from './types.js';

/**
 * Halal and allergy matching. An allergy or halal violation surviving to the
 * client is the single worst bug in this system (spec §5.4), so this is
 * deliberately conservative and heavily tested.
 */

/** Single-word haram terms, matched on whole word tokens (Latin). */
const HARAM_WORDS_LATIN = [
  'pork',
  'ham',
  'bacon',
  'lard',
  'prosciutto',
  'pancetta',
  'pepperoni',
  'chorizo',
  'salami',
  'wine',
  'beer',
  'alcohol',
  'vodka',
  'rum',
  'gin',
  'whiskey',
  'whisky',
  'brandy',
  'liquor',
  'liqueur',
  'spirit',
  'spirits',
  'mirin',
  'sake',
  'cognac',
  'champagne',
  'rum',
];

/** Multi-word or Arabic haram terms, matched on substring of normalized text. */
const HARAM_PHRASES = [
  'pork',
  'خنزير',
  'لحم خنزير',
  'لحم الخنزير',
  'شحم الخنزير',
  'نبيذ',
  'خمر',
  'خمور',
  'كحول',
  'بيرة',
  'فودكا',
  'ويسكي',
  'مشروب كحولي',
];

/**
 * If any of these appear in the text, a haram word like "bacon" or "sausage" is
 * a halal variant (e.g. "beef bacon", "turkey ham") and is not flagged.
 */
const HALAL_QUALIFIERS_LATIN = ['beef', 'turkey', 'chicken', 'veal', 'lamb', 'duck', 'goat'];
const HALAL_QUALIFIERS_AR = ['بقري', 'ديك رومي', 'دجاج', 'عجل', 'خروف', 'بط', 'ماعز'];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Every searchable name for an ingredient: raw text plus catalog names/aliases. */
function namesFor(ing: ResolvedRecipeIngredient): { display: string; texts: string[] } {
  const texts = [ing.rawName];
  const cat = ing.ingredient;
  if (cat) {
    texts.push(cat.canonicalNameEn, cat.canonicalNameAr, ...cat.aliases);
  }
  return { display: cat?.canonicalNameEn ?? ing.rawName, texts };
}

function isHaramText(text: string): { haram: boolean; term?: string } {
  const lower = text.toLowerCase();
  const tokens = tokenize(text);
  const hasQualifier =
    tokens.some((t) => HALAL_QUALIFIERS_LATIN.includes(t)) ||
    HALAL_QUALIFIERS_AR.some((q) => lower.includes(q));

  for (const word of HARAM_WORDS_LATIN) {
    if (tokens.includes(word)) {
      if (hasQualifier) continue;
      return { haram: true, term: word };
    }
  }
  for (const phrase of HARAM_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      if (hasQualifier && !phrase.startsWith('لحم خنزير') && phrase !== 'خنزير' && phrase !== 'pork') {
        continue;
      }
      return { haram: true, term: phrase };
    }
  }
  return { haram: false };
}

/** Category-level allergen expansion so "dairy"/"egg"/"nuts" catch broadly. */
const ALLERGEN_CATEGORY: Record<string, CatalogIngredientRef['category'][]> = {
  dairy: ['dairy'],
  milk: ['dairy'],
  egg: ['egg'],
  eggs: ['egg'],
  nut: ['nut'],
  nuts: ['nut'],
  seafood: ['seafood'],
  shellfish: ['seafood'],
  fish: ['seafood'],
};

function matchesAllergen(ing: ResolvedRecipeIngredient, allergen: string): boolean {
  const needle = allergen.trim().toLowerCase();
  if (!needle) return false;
  const { texts } = namesFor(ing);

  const categories = ALLERGEN_CATEGORY[needle];
  if (categories && ing.ingredient && categories.includes(ing.ingredient.category)) {
    return true;
  }

  for (const text of texts) {
    const lower = text.toLowerCase();
    if (lower.includes(needle)) return true;
    const tokens = tokenize(text);
    if (tokens.includes(needle)) return true;
    // singular/plural tolerance for the allergen term
    if (needle.endsWith('s') && tokens.includes(needle.slice(0, -1))) return true;
  }
  return false;
}

/**
 * Returns every halal/allergy violation in a recipe. Optional ingredients are
 * still checked — an allergen you can "leave out" is not a safe suggestion.
 */
export function findViolations(
  ingredients: ResolvedRecipeIngredient[],
  constraints: { allergies: string[]; halal: boolean },
): SafetyViolation[] {
  const violations: SafetyViolation[] = [];

  for (const ing of ingredients) {
    const { display, texts } = namesFor(ing);

    if (constraints.halal) {
      for (const text of texts) {
        const res = isHaramText(text);
        if (res.haram) {
          violations.push({ kind: 'halal', ingredientName: display, detail: res.term ?? text });
          break;
        }
      }
    }

    for (const allergen of constraints.allergies) {
      if (matchesAllergen(ing, allergen)) {
        violations.push({ kind: 'allergy', ingredientName: display, detail: allergen });
      }
    }
  }

  return violations;
}
