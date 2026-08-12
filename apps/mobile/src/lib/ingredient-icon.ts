import type { IngredientCategory } from '@kitchen/contracts';

/**
 * A glyph for every ingredient category.
 *
 * A shelf of identical text rows reads as a spreadsheet; a glyph makes it
 * scannable, and the category it comes from is already on the wire, so this
 * costs nothing at the API.
 *
 * Emoji rather than icon-font glyphs deliberately: they carry colour, need no
 * asset pipeline, and — the reason that matters here — they are direction
 * neutral, so nothing has to mirror under RTL.
 *
 * Every member of the enum is listed. `Record` rather than a partial map means
 * a category added to the contract is a type error here rather than a silent
 * blank in the list.
 */
const CATEGORY_EMOJI: Record<IngredientCategory, string> = {
  vegetable: '🥕',
  fruit: '🍎',
  meat: '🥩',
  poultry: '🍗',
  seafood: '🐟',
  dairy: '🧀',
  egg: '🥚',
  grain: '🌾',
  legume: '🫘',
  pasta: '🍝',
  bread: '🍞',
  spice: '🌶️',
  herb: '🌿',
  condiment: '🫙',
  oil: '🫒',
  sweetener: '🍯',
  nut: '🥜',
  beverage: '🥤',
  frozen: '🧊',
  canned: '🥫',
  baking: '🧁',
  other: '🍽️',
};

export function categoryEmoji(category: IngredientCategory): string {
  return CATEGORY_EMOJI[category] ?? CATEGORY_EMOJI.other;
}
