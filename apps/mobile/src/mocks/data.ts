import type {
  AiUsageSummary,
  Household,
  Ingredient,
  InventoryItem,
  Locale,
  MealPlan,
  MealPlanEntry,
  Profile,
  Recipe,
  RecipeSummary,
  RecipeVideo,
  RecognitionSession,
  Session,
  ShoppingListItem,
  StorageLocation,
  Unit,
  User,
} from '@kitchen/contracts';

/* ------------------------------------------------------------------ */
/* id + date helpers                                                   */
/* ------------------------------------------------------------------ */

/** Deterministic, contract-valid UUID (v4 shape) from a short suffix. */
export function mockId(suffix: string): string {
  const tail = suffix.replace(/[^0-9a-f]/gi, '').padStart(12, '0').slice(-12);
  return `00000000-0000-4000-8000-${tail}`;
}

const NOW = new Date();

function isoDate(offsetDays: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
function isoDateTime(offsetDays = 0): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
}

const HOUSEHOLD_ID = mockId('a1');
const USER_ID = mockId('u1');

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

export const mockUser: User = {
  id: USER_ID,
  email: 'chef@kitchen.ai',
  displayName: 'Chef',
  locale: 'en',
  hasPassword: true,
  createdAt: isoDateTime(-120),
};

export const mockHousehold: Household = {
  id: HOUSEHOLD_ID,
  name: 'Home Kitchen',
  inviteCode: 'K1TCHN',
  createdBy: USER_ID,
  createdAt: isoDateTime(-120),
  members: [
    {
      userId: USER_ID,
      displayName: 'Chef',
      email: 'chef@kitchen.ai',
      role: 'owner',
      joinedAt: isoDateTime(-120),
    },
    {
      userId: mockId('u2'),
      displayName: 'Layla',
      email: 'layla@kitchen.ai',
      role: 'member',
      joinedAt: isoDateTime(-60),
    },
  ],
};

export const mockProfile: Profile = {
  userId: USER_ID,
  dietaryPrefs: ['high_protein'],
  allergies: [],
  halal: true,
  cuisinePrefs: ['levantine', 'mediterranean'],
  householdSize: 4,
  healthGoals: ['maintenance'],
};

export function makeSession(user: User = mockUser): Session {
  return {
    user,
    tokens: {
      accessToken: 'mock.access.token',
      refreshToken: 'mock.refresh.token',
      expiresIn: 900,
    },
    householdIds: [HOUSEHOLD_ID],
  };
}

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

interface IngredientSeed {
  key: string;
  en: string;
  ar: string;
  category: Ingredient['category'];
  unit: Unit;
  staple?: boolean;
  aliases?: string[];
}

const INGREDIENT_SEEDS: IngredientSeed[] = [
  { key: 'onion', en: 'Onion', ar: 'بصل', category: 'vegetable', unit: 'piece', aliases: ['بصلة'] },
  { key: 'garlic', en: 'Garlic', ar: 'ثوم', category: 'vegetable', unit: 'clove' },
  { key: 'chicken', en: 'Chicken breast', ar: 'صدر دجاج', category: 'poultry', unit: 'kg', aliases: ['دجاج'] },
  { key: 'tomato', en: 'Tomato', ar: 'طماطم', category: 'vegetable', unit: 'piece', aliases: ['بندورة'] },
  { key: 'rice', en: 'White rice', ar: 'أرز أبيض', category: 'grain', unit: 'kg', aliases: ['رز'] },
  { key: 'oliveoil', en: 'Olive oil', ar: 'زيت زيتون', category: 'oil', unit: 'ml', staple: true },
  { key: 'salt', en: 'Salt', ar: 'ملح', category: 'spice', unit: 'g', staple: true },
  { key: 'pepper', en: 'Black pepper', ar: 'فلفل أسود', category: 'spice', unit: 'g', staple: true },
  { key: 'cumin', en: 'Cumin', ar: 'كمون', category: 'spice', unit: 'g' },
  { key: 'yogurt', en: 'Yogurt', ar: 'لبن زبادي', category: 'dairy', unit: 'ml' },
  { key: 'eggs', en: 'Eggs', ar: 'بيض', category: 'egg', unit: 'piece' },
  { key: 'parsley', en: 'Parsley', ar: 'بقدونس', category: 'herb', unit: 'bunch' },
  { key: 'potato', en: 'Potato', ar: 'بطاطس', category: 'vegetable', unit: 'kg' },
  { key: 'lemon', en: 'Lemon', ar: 'ليمون', category: 'fruit', unit: 'piece' },
  { key: 'flour', en: 'Flour', ar: 'دقيق', category: 'baking', unit: 'kg', staple: true },
];

export const ingredients: Ingredient[] = INGREDIENT_SEEDS.map((seed) => ({
  id: mockId(`c${hashKey(seed.key)}`),
  canonicalNameEn: seed.en,
  canonicalNameAr: seed.ar,
  category: seed.category,
  defaultUnit: seed.unit,
  aliases: seed.aliases ?? [],
  isStaple: seed.staple ?? false,
  createdAt: isoDateTime(-120),
}));

function hashKey(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % 1_000_000_000;
  return String(h);
}

export function ingredientByKey(key: string): Ingredient {
  const seedIndex = INGREDIENT_SEEDS.findIndex((s) => s.key === key);
  const found = ingredients[seedIndex];
  if (!found) throw new Error(`Unknown ingredient key: ${key}`);
  return found;
}

/* ------------------------------------------------------------------ */
/* Storage locations                                                   */
/* ------------------------------------------------------------------ */

export const locations: StorageLocation[] = [
  { id: mockId('10c1'), householdId: HOUSEHOLD_ID, name: 'Fridge', type: 'fridge' },
  { id: mockId('10c2'), householdId: HOUSEHOLD_ID, name: 'Freezer', type: 'freezer' },
  { id: mockId('10c3'), householdId: HOUSEHOLD_ID, name: 'Pantry', type: 'pantry' },
  { id: mockId('10c4'), householdId: HOUSEHOLD_ID, name: 'Spice rack', type: 'spice_rack' },
];

const FRIDGE = locations[0]!.id;
const PANTRY = locations[2]!.id;
const SPICE = locations[3]!.id;

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

interface ItemSeed {
  key: string;
  quantity: number;
  unit: Unit;
  location: string;
  expiresInDays: number | null;
  source: InventoryItem['source'];
  confidence?: number | null;
}

const ITEM_SEEDS: ItemSeed[] = [
  { key: 'chicken', quantity: 0.8, unit: 'kg', location: FRIDGE, expiresInDays: 1, source: 'photo', confidence: 0.82 },
  { key: 'yogurt', quantity: 500, unit: 'ml', location: FRIDGE, expiresInDays: 2, source: 'barcode' },
  { key: 'parsley', quantity: 1, unit: 'bunch', location: FRIDGE, expiresInDays: 0, source: 'photo', confidence: 0.55 },
  { key: 'tomato', quantity: 6, unit: 'piece', location: FRIDGE, expiresInDays: 4, source: 'photo', confidence: 0.9 },
  { key: 'eggs', quantity: 10, unit: 'piece', location: FRIDGE, expiresInDays: 12, source: 'manual' },
  { key: 'lemon', quantity: 4, unit: 'piece', location: FRIDGE, expiresInDays: 6, source: 'photo', confidence: 0.88 },
  { key: 'onion', quantity: 5, unit: 'piece', location: PANTRY, expiresInDays: null, source: 'manual' },
  { key: 'potato', quantity: 2, unit: 'kg', location: PANTRY, expiresInDays: 20, source: 'receipt' },
  { key: 'rice', quantity: 1.5, unit: 'kg', location: PANTRY, expiresInDays: null, source: 'manual' },
  { key: 'oliveoil', quantity: 750, unit: 'ml', location: PANTRY, expiresInDays: null, source: 'manual' },
  { key: 'garlic', quantity: 8, unit: 'clove', location: PANTRY, expiresInDays: 30, source: 'manual' },
  { key: 'salt', quantity: 500, unit: 'g', location: SPICE, expiresInDays: null, source: 'manual' },
  { key: 'cumin', quantity: 100, unit: 'g', location: SPICE, expiresInDays: null, source: 'manual' },
];

export function buildInventory(): InventoryItem[] {
  return ITEM_SEEDS.map((seed, index) => {
    const ingredient = ingredientByKey(seed.key);
    return {
      id: mockId(`17e${index}`),
      householdId: HOUSEHOLD_ID,
      ingredient,
      locationId: seed.location,
      quantity: seed.quantity,
      unit: seed.unit,
      expiresAt: seed.expiresInDays === null ? null : isoDate(seed.expiresInDays),
      source: seed.source,
      confidence: seed.confidence ?? null,
      photoKey: null,
      createdAt: isoDateTime(-3),
      updatedAt: isoDateTime(-1),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Recipes (bilingual)                                                 */
/* ------------------------------------------------------------------ */

interface LocalizedRecipeIngredient {
  key: string;
  quantity: number;
  unit: Unit;
  optional?: boolean;
  inStock: boolean;
  shortfall?: number;
  note?: { en: string; ar: string } | null;
}

interface RecipeDef {
  id: string;
  cuisine: Recipe['cuisine'];
  difficulty: Recipe['difficulty'];
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  heroImageUrl: string;
  nutrition: Recipe['nutrition'];
  title: { en: string; ar: string };
  description: { en: string; ar: string };
  steps: { en: string[]; ar: string[] };
  stepDurations?: (number | null)[];
  ingredients: LocalizedRecipeIngredient[];
  videos: RecipeVideo[];
}

const RECIPE_DEFS: RecipeDef[] = [
  {
    id: mockId('4ec1'),
    cuisine: 'levantine',
    difficulty: 'easy',
    prepMinutes: 15,
    cookMinutes: 35,
    servings: 4,
    heroImageUrl: 'https://images.kitchenai.dev/recipes/chicken-rice.jpg',
    nutrition: { calories: 540, proteinG: 38, carbsG: 60, fatG: 14, fiberG: 3 },
    title: { en: 'Chicken & Rice', ar: 'دجاج بالأرز' },
    description: {
      en: 'A one-pot chicken and rice dinner, spiced simply and ready in under an hour.',
      ar: 'دجاج بالأرز في قدر واحد، متبّل ببساطة وجاهز في أقل من ساعة.',
    },
    steps: {
      en: [
        'Season the chicken with salt and pepper.',
        'Brown the chicken in olive oil, then set aside.',
        'Soften the onion and garlic in the same pan.',
        'Add rice and toast for two minutes.',
        'Return the chicken, add water, cover and simmer 25 minutes.',
        'Rest for five minutes, then fluff and serve.',
      ],
      ar: [
        'تبّل الدجاج بالملح والفلفل.',
        'حمّر الدجاج في زيت الزيتون ثم ارفعه جانباً.',
        'سوِّ البصل والثوم في نفس المقلاة.',
        'أضف الأرز وحمّصه دقيقتين.',
        'أعد الدجاج وأضف الماء وغطّ واترك على نار هادئة ٢٥ دقيقة.',
        'اترك القدر خمس دقائق ثم قلّب وقدّم.',
      ],
    },
    stepDurations: [null, 8, 5, 2, 25, 5],
    ingredients: [
      { key: 'chicken', quantity: 0.8, unit: 'kg', inStock: true },
      { key: 'rice', quantity: 400, unit: 'g', inStock: true },
      { key: 'onion', quantity: 1, unit: 'piece', inStock: true },
      { key: 'garlic', quantity: 3, unit: 'clove', inStock: true },
      { key: 'oliveoil', quantity: 30, unit: 'ml', inStock: true },
      { key: 'salt', quantity: 5, unit: 'g', inStock: true },
      { key: 'pepper', quantity: 2, unit: 'g', inStock: true },
    ],
    videos: [
      {
        youtubeId: 'dQw4w9WgXcQ',
        title: 'One-Pot Chicken and Rice',
        channel: 'Kitchen Basics',
        thumbnailUrl: 'https://images.kitchenai.dev/videos/chicken-rice-1.jpg',
        durationSeconds: 612,
        locale: 'en',
      },
      {
        youtubeId: 'ar12345chx',
        title: 'دجاج بالأرز سهل',
        channel: 'مطبخ سهل',
        thumbnailUrl: 'https://images.kitchenai.dev/videos/chicken-rice-2.jpg',
        durationSeconds: 540,
        locale: 'ar',
      },
    ],
  },
  {
    id: mockId('4ec2'),
    cuisine: 'levantine',
    difficulty: 'easy',
    prepMinutes: 10,
    cookMinutes: 20,
    servings: 3,
    heroImageUrl: 'https://images.kitchenai.dev/recipes/shakshuka.jpg',
    nutrition: { calories: 320, proteinG: 18, carbsG: 16, fatG: 20, fiberG: 4 },
    title: { en: 'Shakshuka', ar: 'شكشوكة' },
    description: {
      en: 'Eggs poached in a spiced tomato and onion sauce — a fast, satisfying skillet meal.',
      ar: 'بيض مطهو في صلصة طماطم وبصل متبّلة — وجبة سريعة ومشبعة في مقلاة واحدة.',
    },
    steps: {
      en: [
        'Sauté onion in olive oil until soft.',
        'Add chopped tomato and cumin, simmer 10 minutes.',
        'Make wells and crack in the eggs.',
        'Cover and cook until the whites set.',
        'Scatter parsley and serve from the pan.',
      ],
      ar: [
        'سوِّ البصل في زيت الزيتون حتى يلين.',
        'أضف الطماطم المفرومة والكمون واترك ١٠ دقائق.',
        'اعمل حفراً واكسر البيض فيها.',
        'غطّ واطهُ حتى يتماسك البياض.',
        'انثر البقدونس وقدّم من المقلاة.',
      ],
    },
    stepDurations: [6, 10, null, 6, null],
    ingredients: [
      { key: 'eggs', quantity: 4, unit: 'piece', inStock: true },
      { key: 'tomato', quantity: 4, unit: 'piece', inStock: true },
      { key: 'onion', quantity: 1, unit: 'piece', inStock: true },
      { key: 'cumin', quantity: 3, unit: 'g', inStock: true },
      { key: 'oliveoil', quantity: 20, unit: 'ml', inStock: true },
      { key: 'parsley', quantity: 1, unit: 'bunch', optional: true, inStock: true },
    ],
    videos: [
      {
        youtubeId: 'shk123video',
        title: 'Perfect Shakshuka',
        channel: 'Brunch Club',
        thumbnailUrl: 'https://images.kitchenai.dev/videos/shakshuka-1.jpg',
        durationSeconds: 388,
        locale: 'en',
      },
    ],
  },
  {
    id: mockId('4ec3'),
    cuisine: 'mediterranean',
    difficulty: 'medium',
    prepMinutes: 15,
    cookMinutes: 40,
    servings: 4,
    heroImageUrl: 'https://images.kitchenai.dev/recipes/lemon-potatoes.jpg',
    nutrition: { calories: 280, proteinG: 6, carbsG: 44, fatG: 10, fiberG: 5 },
    title: { en: 'Lemon Herb Potatoes', ar: 'بطاطس بالليمون والأعشاب' },
    description: {
      en: 'Oven-roasted potatoes with lemon, garlic and parsley. Needs a fresh lemon or two.',
      ar: 'بطاطس مشوية بالفرن مع الليمون والثوم والبقدونس. تحتاج ليمونة أو اثنتين طازجة.',
    },
    steps: {
      en: [
        'Heat the oven to 200°C.',
        'Cut potatoes into wedges and toss with olive oil, garlic and salt.',
        'Roast 30 minutes, turning once.',
        'Squeeze over lemon, scatter parsley and roast five more minutes.',
      ],
      ar: [
        'سخّن الفرن إلى ٢٠٠ درجة.',
        'قطّع البطاطس إلى أصابع واخلطها بزيت الزيتون والثوم والملح.',
        'اشوِها ٣٠ دقيقة مع تقليبها مرة.',
        'اعصر الليمون وانثر البقدونس واشوِ خمس دقائق إضافية.',
      ],
    },
    stepDurations: [null, null, 30, 5],
    ingredients: [
      { key: 'potato', quantity: 1, unit: 'kg', inStock: true },
      { key: 'lemon', quantity: 2, unit: 'piece', inStock: true },
      { key: 'garlic', quantity: 4, unit: 'clove', inStock: true },
      { key: 'parsley', quantity: 1, unit: 'bunch', inStock: true },
      { key: 'oliveoil', quantity: 40, unit: 'ml', inStock: true },
      { key: 'salt', quantity: 6, unit: 'g', inStock: true },
    ],
    videos: [],
  },
];

export function recipeDefById(id: string): RecipeDef | undefined {
  return RECIPE_DEFS.find((r) => r.id === id);
}

export function toRecipe(def: RecipeDef, locale: Locale): Recipe {
  return {
    id: def.id,
    householdId: null,
    title: def.title[locale],
    description: def.description[locale],
    locale,
    steps: def.steps[locale].map((text, i) => ({
      index: i + 1,
      text,
      durationMinutes: def.stepDurations?.[i] ?? null,
    })),
    ingredients: def.ingredients.map((ri) => ({
      ingredient: ingredientByKey(ri.key),
      quantity: ri.quantity,
      unit: ri.unit,
      optional: ri.optional ?? false,
      note: ri.note ? ri.note[locale] : null,
      inStock: ri.inStock,
      shortfall: ri.shortfall,
    })),
    prepMinutes: def.prepMinutes,
    cookMinutes: def.cookMinutes,
    servings: def.servings,
    difficulty: def.difficulty,
    cuisine: def.cuisine,
    nutrition: def.nutrition,
    heroImageUrl: def.heroImageUrl,
    videos: def.videos,
    generatedBy: 'ai',
    createdAt: isoDateTime(-2),
  };
}

export function toSummary(def: RecipeDef, locale: Locale): RecipeSummary {
  return {
    id: def.id,
    title: def.title[locale],
    locale,
    prepMinutes: def.prepMinutes,
    cookMinutes: def.cookMinutes,
    servings: def.servings,
    difficulty: def.difficulty,
    cuisine: def.cuisine,
    heroImageUrl: def.heroImageUrl,
  };
}

export function recipeVideos(id: string): RecipeVideo[] {
  return recipeDefById(id)?.videos ?? [];
}

/* ------------------------------------------------------------------ */
/* Meal plan (current week)                                            */
/* ------------------------------------------------------------------ */

const PLAN_ID = mockId('91a1');

function weekStartOffset(): number {
  // Monday of the current week, relative to today.
  const day = NOW.getDay(); // 0 = Sun
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return diffToMonday;
}

export function buildWeeklyPlan(locale: Locale): MealPlan {
  const start = weekStartOffset();
  const entries: MealPlanEntry[] = [];
  const slots: MealPlanEntry['slot'][] = ['breakfast', 'lunch', 'dinner'];
  for (let d = 0; d < 7; d += 1) {
    const dayOffset = start + d;
    slots.forEach((slot, sIndex) => {
      const def = RECIPE_DEFS[(d + sIndex) % RECIPE_DEFS.length]!;
      const isPast = dayOffset < 0;
      entries.push({
        id: mockId(`e${d}${sIndex}`),
        planId: PLAN_ID,
        date: isoDate(dayOffset),
        slot,
        recipe: toSummary(def, locale),
        servings: 4,
        state: isPast ? 'cooked' : 'planned',
        fullyCovered: def.id !== RECIPE_DEFS[2]!.id,
      });
    });
  }
  return {
    id: PLAN_ID,
    householdId: HOUSEHOLD_ID,
    scope: 'weekly',
    startsOn: isoDate(start),
    endsOn: isoDate(start + 6),
    status: 'ready',
    locale,
    entries,
    createdAt: isoDateTime(-1),
  };
}

/** Tonight's dinner entry, used by the Home dashboard. */
export function tonightEntry(plan: MealPlan): MealPlanEntry | undefined {
  const today = isoDate(0);
  return plan.entries.find((e) => e.date === today && e.slot === 'dinner');
}

export const PLAN_IDS = { weekly: PLAN_ID };

/* ------------------------------------------------------------------ */
/* Shopping list                                                       */
/* ------------------------------------------------------------------ */

export function buildShoppingList(): ShoppingListItem[] {
  const lemon = ingredientByKey('lemon');
  const flour = ingredientByKey('flour');
  return [
    {
      id: mockId('5001'),
      planId: PLAN_ID,
      ingredientId: lemon.id,
      nameEn: lemon.canonicalNameEn,
      nameAr: lemon.canonicalNameAr,
      quantity: 3,
      unit: 'piece',
      purchased: false,
      purchasedAt: null,
    },
    {
      id: mockId('5002'),
      planId: PLAN_ID,
      ingredientId: flour.id,
      nameEn: flour.canonicalNameEn,
      nameAr: flour.canonicalNameAr,
      quantity: 1,
      unit: 'kg',
      purchased: false,
      purchasedAt: null,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Recognition session (capture review)                                */
/* ------------------------------------------------------------------ */

export function buildRecognitionSession(photoKeys: string[]): RecognitionSession {
  const pick = (
    key: string,
    quantity: number,
    unit: Unit,
    confidence: number,
    suggestedLocationType: RecognitionSession['items'][number]['suggestedLocationType'],
    suggestedExpiresAt: string | null,
  ) => {
    const ing = ingredientByKey(key);
    return {
      tempId: `tmp-${key}`,
      match: {
        ingredientId: ing.id,
        strategy: 'exact' as const,
        confidence,
        rawName: ing.canonicalNameEn,
      },
      nameEn: ing.canonicalNameEn,
      nameAr: ing.canonicalNameAr,
      category: ing.category,
      quantity,
      unit,
      confidence,
      suggestedExpiresAt,
      suggestedLocationType,
      photoKey: photoKeys[0] ?? null,
    };
  };

  return {
    id: mockId('5e51'),
    items: [
      pick('tomato', 5, 'piece', 0.92, 'fridge', isoDate(5)),
      pick('onion', 3, 'piece', 0.87, 'pantry', null),
      pick('parsley', 1, 'bunch', 0.48, 'fridge', isoDate(3)),
      pick('eggs', 6, 'piece', 0.71, 'fridge', isoDate(14)),
    ],
    emptyPhotoKeys: photoKeys.length > 2 ? [photoKeys[photoKeys.length - 1]!] : [],
    createdAt: isoDateTime(0),
  };
}

/* ------------------------------------------------------------------ */
/* AI usage                                                            */
/* ------------------------------------------------------------------ */

export const mockAiUsage: AiUsageSummary = {
  householdId: HOUSEHOLD_ID,
  day: isoDate(0),
  spentUsd: 0.42,
  budgetUsd: 2,
  callCount: 7,
};

export { HOUSEHOLD_ID, USER_ID, isoDate, isoDateTime };
