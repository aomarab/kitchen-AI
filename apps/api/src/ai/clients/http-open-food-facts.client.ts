import type { IngredientCategory, Unit } from '@kitchen/contracts';
import type { OpenFoodFactsClient, OpenFoodFactsProduct } from './clients.interface.js';

interface OffResponse {
  status?: number;
  product?: {
    product_name?: string;
    product_name_ar?: string;
    brands?: string;
    image_url?: string;
    image_front_url?: string;
    quantity?: string;
    categories_tags?: string[];
  };
}

/** The product fields we read. Requesting them keeps a ~150KB record down to a few hundred bytes. */
const FIELDS = [
  'product_name',
  'product_name_ar',
  'brands',
  'image_url',
  'image_front_url',
  'quantity',
  'categories_tags',
].join(',');

const UNIT_WORDS: Record<string, Unit> = {
  g: 'g',
  gr: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  ml: 'ml',
  cl: 'ml',
  l: 'l',
  ltr: 'l',
  liter: 'l',
  litre: 'l',
};

/** Best-effort parse of an Open Food Facts quantity string like "750 ml". */
export function parseOffQuantity(raw: string | undefined): {
  quantity: number | null;
  unit: Unit | null;
} {
  if (!raw) return { quantity: null, unit: null };
  const match = raw
    .trim()
    .toLowerCase()
    .match(/([\d.,]+)\s*([a-z]+)/);
  if (!match) return { quantity: null, unit: null };
  const value = Number(match[1]!.replace(',', '.'));
  const unitWord = match[2]!;
  const unit = UNIT_WORDS[unitWord] ?? null;
  if (!Number.isFinite(value) || unit == null) return { quantity: null, unit: null };
  const quantity = unitWord === 'cl' ? value * 10 : value;
  return { quantity, unit };
}

/**
 * Best-effort map from the Open Food Facts taxonomy onto our own, keyed by the
 * *head noun* of a category slug.
 *
 * OFF slugs are head-final compounds: `sweet-spreads` is a spread, `pasta-sauces`
 * is a sauce, and `breaded-cheeses` is a cheese. Matching anywhere in the slug
 * instead reads `breaded-cheeses` as bread — which is how a loaf and a cheese
 * end up in the same bucket. Only the last word is consulted.
 *
 * Deliberately incomplete. An unrecognised head yields `null`, which lands on
 * the existing `other` default, so this can only improve on today's behaviour:
 * it never moves a product that is already filed correctly. `frozen` and
 * `canned` are absent on purpose — they describe packaging, not kind, and OFF
 * spells them as modifiers (`frozen-vegetables`), where the head is the better
 * answer anyway.
 */
const CATEGORY_BY_HEAD: Readonly<Record<string, IngredientCategory>> = {
  vegetable: 'vegetable',
  fruit: 'fruit',
  meat: 'meat',
  beef: 'meat',
  lamb: 'meat',
  mutton: 'meat',
  veal: 'meat',
  pork: 'meat',
  poultry: 'poultry',
  chicken: 'poultry',
  turkey: 'poultry',
  duck: 'poultry',
  seafood: 'seafood',
  fish: 'seafood',
  shrimp: 'seafood',
  prawn: 'seafood',
  tuna: 'seafood',
  salmon: 'seafood',
  crab: 'seafood',
  dairy: 'dairy',
  milk: 'dairy',
  cheese: 'dairy',
  yogurt: 'dairy',
  yoghurt: 'dairy',
  cream: 'dairy',
  butter: 'dairy',
  egg: 'egg',
  grain: 'grain',
  cereal: 'grain',
  rice: 'grain',
  oat: 'grain',
  wheat: 'grain',
  corn: 'grain',
  legume: 'legume',
  pulse: 'legume',
  bean: 'legume',
  lentil: 'legume',
  chickpea: 'legume',
  pasta: 'pasta',
  noodle: 'pasta',
  spaghetti: 'pasta',
  macaroni: 'pasta',
  bread: 'bread',
  baguette: 'bread',
  pita: 'bread',
  loaf: 'bread',
  loaves: 'bread',
  spice: 'spice',
  herb: 'herb',
  sauce: 'condiment',
  condiment: 'condiment',
  ketchup: 'condiment',
  mayonnaise: 'condiment',
  mustard: 'condiment',
  vinegar: 'condiment',
  spread: 'condiment',
  oil: 'oil',
  sugar: 'sweetener',
  honey: 'sweetener',
  syrup: 'sweetener',
  sweetener: 'sweetener',
  nut: 'nut',
  almond: 'nut',
  peanut: 'nut',
  walnut: 'nut',
  cashew: 'nut',
  pistachio: 'nut',
  beverage: 'beverage',
  drink: 'beverage',
  juice: 'beverage',
  water: 'beverage',
  coffee: 'beverage',
  tea: 'beverage',
  soda: 'beverage',
  cola: 'beverage',
  flour: 'baking',
  yeast: 'baking',
};

/** `dairies` -> `dairy`, `cheeses` -> `cheese`. Enough for a slug taxonomy. */
function singular(word: string): string {
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

/**
 * Pick a category from an Open Food Facts `categories_tags` list.
 *
 * The list runs general to specific ("beverages" before "colas"), so it is read
 * backwards to prefer the most specific tag that maps.
 *
 * The array also carries the display-name translations, which arrive
 * `en:`-prefixed whatever the language. They are not filtered out: they are
 * translations of the same categories, so a head noun that matches at all
 * matches the same answer, and one that does not is skipped like any other
 * unknown tag. An earlier version screened them with a strict-slug regex, and
 * no record could be found — real or constructed — where the screen changed
 * the result, so it went rather than stay as an untested claim.
 *
 * A record whose tags contradict each other — they exist, since the taxonomy is
 * crowd-edited — will follow whichever contradiction is listed last. That is a
 * hint on a product the user is looking at before confirming, so a wrong guess
 * costs no more than the `other` it replaces.
 */
export function categoryFromOffTags(tags: string[] | undefined): IngredientCategory | null {
  if (!tags) return null;
  const english = tags.filter((tag) => tag.startsWith('en:'));
  for (let i = english.length - 1; i >= 0; i -= 1) {
    const words = english[i]!.slice('en:'.length).toLowerCase().split('-');
    const head = words[words.length - 1]!;
    const category = CATEGORY_BY_HEAD[head] ?? CATEGORY_BY_HEAD[singular(head)];
    if (category) return category;
  }
  return null;
}

/**
 * Real Open Food Facts client (free, no key; spec §5.2). A missing product or
 * any transport error resolves to `found:false` so the client falls back to
 * manual entry rather than erroring.
 */
export class HttpOpenFoodFactsClient implements OpenFoodFactsClient {
  constructor(private readonly baseUrl: string) {}

  async lookup(barcode: string): Promise<OpenFoodFactsProduct> {
    const notFound: OpenFoodFactsProduct = {
      found: false,
      productName: null,
      productNameAr: null,
      brand: null,
      imageUrl: null,
      quantity: null,
      unit: null,
      category: null,
    };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/v2/product/${barcode}.json?fields=${FIELDS}`);
    } catch {
      return notFound;
    }
    if (!response.ok) return notFound;

    const body = (await response.json().catch(() => ({}))) as OffResponse;
    if (body.status !== 1 || !body.product) return notFound;

    const { quantity, unit } = parseOffQuantity(body.product.quantity);
    return {
      found: true,
      productName: body.product.product_name ?? body.product.product_name_ar ?? null,
      productNameAr: body.product.product_name_ar ?? null,
      brand: body.product.brands ?? null,
      imageUrl: body.product.image_front_url ?? body.product.image_url ?? null,
      quantity,
      unit,
      category: categoryFromOffTags(body.product.categories_tags),
    };
  }
}
