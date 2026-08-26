import type { IngredientCategory } from '@kitchen/contracts';

/**
 * Which picture to put beside an item on the shelf.
 *
 * Category alone is too coarse: a real shelf is mostly packaged food, and a
 * column of identical "other" boxes says nothing. So the item's own name is
 * consulted first and the category is only the fallback.
 *
 * Names are matched in both languages because the name shown is whatever the
 * household reads — a catalog name in Arabic, or a label they typed themselves.
 */
export type FoodIconKey =
  | 'apple'
  | 'banana'
  | 'basket'
  | 'beans'
  | 'bread'
  | 'butter'
  | 'cake'
  | 'candy'
  | 'canned'
  | 'carrot'
  | 'cereal'
  | 'cheese'
  | 'chicken'
  | 'chocolate'
  | 'coffee'
  | 'cookie'
  | 'croissant'
  | 'cucumber'
  | 'egg'
  | 'fish'
  | 'flour'
  | 'frozen'
  | 'garlic'
  | 'grapes'
  | 'herbs'
  | 'honey'
  | 'icecream'
  | 'juice'
  | 'lemon'
  | 'mango'
  | 'meat'
  | 'milk'
  | 'nuts'
  | 'oliveoil'
  | 'onion'
  | 'orange'
  | 'pasta'
  | 'peach'
  | 'pepper'
  | 'pizza'
  | 'potato'
  | 'pudding'
  | 'rice'
  | 'salad'
  | 'salt'
  | 'sandwich'
  | 'shrimp'
  | 'strawberry'
  | 'tea'
  | 'tomato'
  | 'water'
  | 'watermelon';

interface IconRule {
  readonly key: FoodIconKey;
  /** Lowercase fragments, English and Arabic. */
  readonly match: readonly string[];
}

/**
 * First match wins, so the more specific rule is listed first: a chocolate cake
 * should read as cake, not as a chocolate bar.
 */
const RULES: readonly IconRule[] = [
  { key: 'icecream', match: ['ice cream', 'gelato', 'ايس كريم', 'آيس كريم', 'مثلجات'] },
  { key: 'cake', match: ['cake', 'gateau', 'كيك', 'كعك', 'تورتة'] },
  { key: 'cookie', match: ['cookie', 'biscuit', 'wafer', 'بسكويت', 'كوكيز', 'ويفر'] },
  { key: 'croissant', match: ['croissant', 'pastry', 'donut', 'كرواسون', 'معجنات', 'دونات'] },
  { key: 'pudding', match: ['pudding', 'custard', 'dessert', 'بودينج', 'مهلبية', 'حلى', 'حلوى'] },
  { key: 'chocolate', match: ['chocolate', 'cocoa', 'شوكولا', 'شيكولاتة', 'كاكاو'] },
  { key: 'candy', match: ['candy', 'sweets', 'gum', 'حلويات', 'سكاكر', 'علكة'] },
  { key: 'pizza', match: ['pizza', 'بيتزا'] },
  { key: 'sandwich', match: ['sandwich', 'burger', 'wrap', 'ساندويتش', 'برجر'] },
  { key: 'salad', match: ['salad', 'سلطة'] },

  { key: 'cheese', match: ['cheese', 'labneh', 'جبن', 'جبنة', 'لبنة'] },
  { key: 'butter', match: ['butter', 'ghee', 'زبدة', 'سمن'] },
  { key: 'milk', match: ['yogurt', 'yoghurt', 'milk', 'cream', 'laban', 'حليب', 'لبن', 'زبادي', 'قشطة', 'كريمة'] },

  { key: 'egg', match: ['egg', 'بيض', 'بيضة'] },
  { key: 'chicken', match: ['chicken', 'turkey', 'poultry', 'دجاج', 'فراخ', 'ديك'] },
  { key: 'meat', match: ['beef', 'lamb', 'mutton', 'steak', 'mince', 'meat', 'لحم', 'لحمة', 'غنم', 'بقر'] },
  { key: 'shrimp', match: ['shrimp', 'prawn', 'جمبري', 'روبيان'] },
  { key: 'fish', match: ['fish', 'tuna', 'salmon', 'سمك', 'تونة', 'سلمون'] },

  { key: 'tomato', match: ['tomato', 'طماطم', 'بندورة'] },
  { key: 'potato', match: ['potato', 'بطاطس', 'بطاطا'] },
  { key: 'carrot', match: ['carrot', 'جزر'] },
  { key: 'cucumber', match: ['cucumber', 'zucchini', 'خيار', 'كوسة'] },
  { key: 'onion', match: ['onion', 'leek', 'بصل', 'كراث'] },
  { key: 'garlic', match: ['garlic', 'ثوم'] },
  { key: 'pepper', match: ['bell pepper', 'capsicum', 'chilli', 'chili', 'فلفل'] },
  { key: 'lemon', match: ['lemon', 'lime', 'ليمون'] },

  { key: 'strawberry', match: ['strawberry', 'berry', 'berries', 'فراولة', 'توت'] },
  { key: 'banana', match: ['banana', 'موز'] },
  { key: 'orange', match: ['orange', 'mandarin', 'tangerine', 'برتقال', 'يوسفي'] },
  { key: 'grapes', match: ['grape', 'raisin', 'sultana', 'عنب', 'زبيب'] },
  { key: 'watermelon', match: ['watermelon', 'melon', 'بطيخ', 'شمام'] },
  { key: 'mango', match: ['mango', 'مانجو', 'مانجا'] },
  { key: 'peach', match: ['peach', 'apricot', 'nectarine', 'خوخ', 'مشمش', 'دراق'] },
  { key: 'apple', match: ['apple', 'pear', 'fig', 'date', 'تفاح', 'كمثرى', 'تين', 'تمر', 'رطب'] },

  { key: 'bread', match: ['bread', 'toast', 'khubz', 'pita', 'خبز', 'توست', 'صمون'] },
  { key: 'cereal', match: ['cereal', 'corn flakes', 'cornflakes', 'oat', 'granola', 'كورن فليكس', 'شوفان', 'حبوب'] },
  { key: 'rice', match: ['rice', 'bulgur', 'freekeh', 'رز', 'أرز', 'برغل', 'فريكة'] },
  { key: 'pasta', match: ['pasta', 'spaghetti', 'noodle', 'macaroni', 'معكرونة', 'مكرونة', 'شعيرية'] },
  { key: 'flour', match: ['flour', 'yeast', 'baking powder', 'starch', 'دقيق', 'طحين', 'خميرة', 'نشا'] },

  { key: 'beans', match: ['bean', 'lentil', 'chickpea', 'hummus', 'pea', 'فول', 'عدس', 'حمص', 'بازيلا'] },
  { key: 'nuts', match: ['nut', 'almond', 'cashew', 'pistachio', 'peanut', 'مكسرات', 'لوز', 'كاجو', 'فستق', 'فول سوداني'] },

  { key: 'oliveoil', match: ['oil', 'olive', 'tahini', 'زيت', 'زيتون', 'طحينة'] },
  { key: 'salt', match: ['salt', 'spice', 'cumin', 'pepper corn', 'masala', 'ملح', 'بهار', 'كمون', 'توابل'] },
  { key: 'herbs', match: ['parsley', 'coriander', 'mint', 'thyme', 'oregano', 'basil', 'herb', 'بقدونس', 'كزبرة', 'نعناع', 'زعتر', 'ريحان'] },
  { key: 'honey', match: ['honey', 'syrup', 'molasses', 'sugar', 'عسل', 'دبس', 'سكر', 'شيرة'] },

  { key: 'canned', match: ['canned', 'tin ', 'paste', 'معلب', 'معجون'] },
  { key: 'frozen', match: ['frozen', 'ice', 'مجمد', 'مثلج'] },
  { key: 'coffee', match: ['coffee', 'espresso', 'قهوة', 'نسكافيه'] },
  { key: 'tea', match: ['tea', 'شاي'] },
  { key: 'juice', match: ['juice', 'soda', 'cola', 'drink', 'عصير', 'مشروب', 'كولا'] },
  { key: 'water', match: ['water', 'ماء', 'مياه'] },
];

/** Used when the name says nothing recognisable. */
const CATEGORY_FALLBACK: Record<IngredientCategory, FoodIconKey> = {
  vegetable: 'carrot',
  fruit: 'apple',
  meat: 'meat',
  poultry: 'chicken',
  seafood: 'fish',
  dairy: 'milk',
  egg: 'egg',
  grain: 'rice',
  pasta: 'pasta',
  bread: 'bread',
  legume: 'beans',
  nut: 'nuts',
  spice: 'salt',
  herb: 'herbs',
  oil: 'oliveoil',
  condiment: 'canned',
  canned: 'canned',
  frozen: 'frozen',
  beverage: 'juice',
  sweetener: 'honey',
  baking: 'flour',
  other: 'basket',
};

/**
 * Arabic is written with optional diacritics and several spellings of alef, so
 * a literal substring test would miss words a reader considers identical.
 */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u064b-\u0652\u0670]/g, '')
    .replace(/[\u0623\u0625\u0622]/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0649/g, '\u064a')
    .replace(/\s+/g, ' ')
    .trim();
}

export function foodIconKey(item: {
  label?: string | null;
  nameEn?: string | null;
  nameAr?: string | null;
  category: IngredientCategory;
}): FoodIconKey {
  const haystack = normalize(
    [item.label, item.nameEn, item.nameAr].filter(Boolean).join(' '),
  );
  if (haystack) {
    for (const rule of RULES) {
      if (rule.match.some((fragment) => haystack.includes(normalize(fragment)))) return rule.key;
    }
  }
  return CATEGORY_FALLBACK[item.category];
}

/** Every key a rule or fallback can produce — the asset map must cover all of them. */
export function allIconKeys(): FoodIconKey[] {
  return [...new Set([...RULES.map((r) => r.key), ...Object.values(CATEGORY_FALLBACK)])].sort();
}
