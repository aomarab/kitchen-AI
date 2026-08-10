import type {
  FeedbackDetail,
  Household,
  Ingredient,
  InventoryItem,
  Locale,
  MealPlan,
  MealPlanEntry,
  MealSlot,
  PlanCoverage,
  Profile,
  Recipe,
  RecipeIngredient,
  RecipeSummary,
  RecipeVideo,
  ShoppingListItem,
  StorageLocation,
  StorageLocationType,
  User,
} from '@kitchen/contracts';
import { INGREDIENTS, RECIPES, type RecipeSeed } from './catalog';
import { uuid } from '../lib/uuid';

/**
 * The seeded household id. Confined to the mock layer as fixture data — app
 * code must never assume a household exists; it comes from the signed-in
 * session (spec §6.1).
 */
export const DEFAULT_HOUSEHOLD_ID = '11111111-1111-4111-8111-111111111111';

export { uuid };

const NOW = () => new Date();
const iso = (d: Date) => d.toISOString();
function dateFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const USER_ID = '22222222-2222-4222-8222-222222222222';

interface InternalEntry {
  id: string;
  date: string;
  slot: MealSlot;
  recipeKey: string;
  servings: number;
  state: 'planned' | 'cooked' | 'skipped';
}

interface InternalPlan {
  id: string;
  scope: 'daily' | 'weekly' | 'monthly';
  startsOn: string;
  endsOn: string;
  status: 'generating' | 'ready' | 'failed';
  locale: Locale;
  createdAt: string;
  entries: InternalEntry[];
}

interface InternalJob {
  id: string;
  type: 'receipt.parse' | 'plan.generate' | 'recipe.translate' | 'video.fetch';
  polls: number;
  createdAt: string;
  resultKind: 'meal_plan' | 'recognition_session' | 'recipe';
  resultId: string;
  fail?: boolean;
}

interface DbShape {
  user: User | null;
  household: Household;
  profile: Profile;
  ingredientsByKey: Map<string, Ingredient>;
  ingredientsById: Map<string, Ingredient>;
  ingredients: Ingredient[];
  recipeIdByKey: Map<string, string>;
  seedById: Map<string, RecipeSeed>;
  locations: StorageLocation[];
  inventory: InventoryItem[];
  plans: InternalPlan[];
  shopping: ShoppingListItem[];
  jobs: Map<string, InternalJob>;
  recognitions: Map<string, ReturnType<typeof buildRecognitionSession>>;
  /**
   * Stores the whole `FeedbackDetail` even though `POST /feedback` only returns
   * a receipt, because the admin handlers read this same array — that is what
   * makes feedback submitted in mock mode show up in the admin console.
   */
  feedback: FeedbackDetail[];
}

export const db = {} as DbShape;

function heroFor(seed: RecipeSeed): string {
  return `https://picsum.photos/seed/kitchen-${seed.heroSeed}/1200/800`;
}

function projectVideos(seed: RecipeSeed, locale: Locale): RecipeVideo[] {
  return seed.videos.map((v) => ({
    youtubeId: v.youtubeId,
    title: locale === 'ar' ? v.ar : v.en,
    channel: v.channel,
    thumbnailUrl: `https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg`,
    durationSeconds: v.durationSeconds,
    locale,
  }));
}

/** Available quantity of an ingredient across every location, by unit match. */
function availableQuantity(ingredientId: string, unit: string): number {
  return db.inventory
    .filter((i) => i.ingredient.id === ingredientId && i.unit === unit)
    .reduce((sum, i) => sum + i.quantity, 0);
}

export interface RecipeCoverage {
  ingredients: RecipeIngredient[];
  fullyCovered: boolean;
  shortfalls: PlanCoverage['shortfalls'];
}

/** Deterministic pantry check for one recipe (spec §5.4 Stage C, simplified). */
export function coverageForRecipe(seed: RecipeSeed): RecipeCoverage {
  const ingredients: RecipeIngredient[] = [];
  const shortfalls: PlanCoverage['shortfalls'] = [];
  let fullyCovered = true;

  for (const ri of seed.ingredients) {
    const ingredient = db.ingredientsByKey.get(ri.ref);
    if (!ingredient) continue;
    const available = ingredient.isStaple ? ri.quantity : availableQuantity(ingredient.id, ri.unit);
    const inStock = ingredient.isStaple || available >= ri.quantity;
    const shortfall = inStock ? 0 : ri.quantity - available;

    ingredients.push({
      ingredient,
      quantity: ri.quantity,
      unit: ri.unit,
      optional: ri.optional ?? false,
      note: ri.note ? ri.note.en : null,
      inStock,
      shortfall,
    });

    if (!inStock && !ri.optional) {
      fullyCovered = false;
      shortfalls.push({
        ingredientId: ingredient.id,
        nameEn: ingredient.canonicalNameEn,
        nameAr: ingredient.canonicalNameAr,
        required: ri.quantity,
        available,
        shortfall,
        unit: ri.unit,
      });
    }
  }

  return { ingredients, fullyCovered, shortfalls };
}

export function projectRecipe(seed: RecipeSeed, locale: Locale): Recipe {
  const coverage = coverageForRecipe(seed);
  const localeIngredients: RecipeIngredient[] = coverage.ingredients.map((ri, idx) => ({
    ...ri,
    note: seed.ingredients[idx]?.note ? seed.ingredients[idx]!.note![locale] : null,
  }));

  return {
    id: db.recipeIdByKey.get(seed.key)!,
    householdId: null,
    title: seed.title[locale],
    description: seed.description[locale],
    locale,
    steps: seed.steps[locale].map((text, i) => ({ index: i + 1, text, durationMinutes: null })),
    ingredients: localeIngredients,
    prepMinutes: seed.prepMinutes,
    cookMinutes: seed.cookMinutes,
    servings: seed.servings,
    difficulty: seed.difficulty,
    cuisine: seed.cuisine,
    nutrition: seed.nutrition,
    heroImageUrl: heroFor(seed),
    videos: projectVideos(seed, locale),
    generatedBy: 'ai',
    createdAt: iso(NOW()),
  };
}

export function recipeSummary(seed: RecipeSeed, locale: Locale): RecipeSummary {
  return {
    id: db.recipeIdByKey.get(seed.key)!,
    title: seed.title[locale],
    locale,
    prepMinutes: seed.prepMinutes,
    cookMinutes: seed.cookMinutes,
    servings: seed.servings,
    difficulty: seed.difficulty,
    cuisine: seed.cuisine,
    heroImageUrl: heroFor(seed),
  };
}

export function projectEntry(entry: InternalEntry, locale: Locale, planId: string): MealPlanEntry {
  const seed = db.seedById.get(db.recipeIdByKey.get(entry.recipeKey)!)!;
  return {
    id: entry.id,
    planId,
    date: entry.date,
    slot: entry.slot,
    recipe: recipeSummary(seed, locale),
    servings: entry.servings,
    state: entry.state,
    fullyCovered: coverageForRecipe(seed).fullyCovered,
  };
}

export function projectPlan(plan: InternalPlan, locale: Locale): MealPlan {
  return {
    id: plan.id,
    householdId: DEFAULT_HOUSEHOLD_ID,
    scope: plan.scope,
    startsOn: plan.startsOn,
    endsOn: plan.endsOn,
    status: plan.status,
    locale,
    entries: plan.entries.map((e) => projectEntry(e, locale, plan.id)),
    createdAt: plan.createdAt,
  };
}

export function computePlanCoverage(plan: InternalPlan): PlanCoverage {
  const covered: string[] = [];
  const uncovered: string[] = [];
  const shortfallMap = new Map<string, PlanCoverage['shortfalls'][number]>();

  for (const entry of plan.entries) {
    const seed = db.seedById.get(db.recipeIdByKey.get(entry.recipeKey)!)!;
    const cov = coverageForRecipe(seed);
    if (cov.fullyCovered) covered.push(entry.id);
    else uncovered.push(entry.id);
    for (const s of cov.shortfalls) {
      const existing = shortfallMap.get(s.ingredientId);
      if (existing) {
        existing.required += s.required;
        existing.shortfall += s.shortfall;
      } else {
        shortfallMap.set(s.ingredientId, { ...s });
      }
    }
  }

  const soonThreshold = dateFromNow(4);
  const expiring = db.inventory
    .filter((i) => i.expiresAt !== null && i.expiresAt <= soonThreshold)
    .map((i) => i.ingredient.id);

  return {
    planId: plan.id,
    coverageRatio: plan.entries.length ? covered.length / plan.entries.length : 1,
    coveredEntryIds: covered,
    uncoveredEntryIds: uncovered,
    shortfalls: [...shortfallMap.values()],
    expiringSoonIngredientIds: [...new Set(expiring)],
  };
}

interface InventorySeed {
  key: string;
  location: StorageLocationType;
  quantity: number;
  expiresInDays: number | null;
  source: InventoryItem['source'];
  confidence: number | null;
  brand?: string;
}

const INVENTORY_SEED: InventorySeed[] = [
  { key: 'chicken', location: 'freezer', quantity: 900, expiresInDays: 20, source: 'photo', confidence: 0.82 },
  { key: 'tomato', location: 'fridge', quantity: 5, expiresInDays: 2, source: 'photo', confidence: 0.71 },
  { key: 'onion', location: 'pantry', quantity: 6, expiresInDays: 40, source: 'manual', confidence: null },
  { key: 'garlic', location: 'pantry', quantity: 12, expiresInDays: null, source: 'manual', confidence: null },
  { key: 'eggs', location: 'fridge', quantity: 8, expiresInDays: 6, source: 'barcode', confidence: 0.95, brand: 'Al Marai' },
  { key: 'yogurt', location: 'fridge', quantity: 500, expiresInDays: 1, source: 'receipt', confidence: 0.58 },
  { key: 'rice', location: 'pantry', quantity: 1000, expiresInDays: null, source: 'manual', confidence: null },
  { key: 'oliveOil', location: 'pantry', quantity: 750, expiresInDays: null, source: 'manual', confidence: null },
  { key: 'salt', location: 'spice_rack', quantity: 500, expiresInDays: null, source: 'manual', confidence: null },
  { key: 'pepper', location: 'spice_rack', quantity: 100, expiresInDays: null, source: 'manual', confidence: null },
  { key: 'cumin', location: 'spice_rack', quantity: 80, expiresInDays: null, source: 'manual', confidence: null },
  { key: 'lentils', location: 'pantry', quantity: 400, expiresInDays: null, source: 'manual', confidence: null },
  { key: 'chickpeas', location: 'pantry', quantity: 400, expiresInDays: 90, source: 'receipt', confidence: 0.9 },
  { key: 'tahini', location: 'pantry', quantity: 300, expiresInDays: 30, source: 'barcode', confidence: 0.93, brand: 'Al Wadi' },
  { key: 'lemon', location: 'fridge', quantity: 4, expiresInDays: 8, source: 'photo', confidence: 0.77 },
  { key: 'parsley', location: 'fridge', quantity: 1, expiresInDays: 3, source: 'photo', confidence: 0.64 },
  { key: 'potato', location: 'pantry', quantity: 6, expiresInDays: 25, source: 'manual', confidence: null },
  { key: 'eggplant', location: 'fridge', quantity: 3, expiresInDays: 4, source: 'photo', confidence: 0.8 },
  { key: 'bellPepper', location: 'fridge', quantity: 2, expiresInDays: 5, source: 'photo', confidence: 0.76 },
];

export function buildRecognitionSession(locationHint?: StorageLocationType) {
  const suggested = locationHint ?? 'fridge';
  const rows = [
    { key: 'tomato', qty: 4, conf: 0.92 },
    { key: 'cucumber', qty: 3, conf: 0.88 },
    { key: 'bellPepper', qty: 2, conf: 0.84 },
    { key: 'yogurt', qty: 500, conf: 0.41 },
    { key: 'parsley', qty: 1, conf: 0.35 },
  ];
  return {
    id: uuid(),
    items: rows.map((r) => {
      const ingredient = db.ingredientsByKey.get(r.key)!;
      return {
        tempId: uuid(),
        match: {
          ingredientId: ingredient.id,
          strategy: 'exact' as const,
          confidence: r.conf,
          rawName: ingredient.canonicalNameEn,
        },
        nameEn: ingredient.canonicalNameEn,
        nameAr: ingredient.canonicalNameAr,
        category: ingredient.category,
        quantity: r.qty,
        unit: ingredient.defaultUnit,
        confidence: r.conf,
        suggestedExpiresAt: dateFromNow(6),
        suggestedLocationType: suggested,
        photoKey: 'mock/photo-1.jpg',
      };
    }),
    emptyPhotoKeys: [] as string[],
    createdAt: iso(NOW()),
  };
}

export function seed(): void {
  db.user = {
    id: USER_ID,
    email: 'chef@example.com',
    displayName: 'Amira',
    locale: 'en',
    hasPassword: true,
    createdAt: iso(NOW()),
  };

  db.household = {
    id: DEFAULT_HOUSEHOLD_ID,
    name: 'Al-Rashid Home',
    inviteCode: 'KTCHN1',
    createdBy: USER_ID,
    createdAt: iso(NOW()),
    members: [
      { userId: USER_ID, displayName: 'Amira', email: 'chef@example.com', role: 'owner', joinedAt: iso(NOW()) },
      {
        userId: '33333333-3333-4333-8333-333333333333',
        displayName: 'Yusuf',
        email: 'yusuf@example.com',
        role: 'member',
        joinedAt: iso(NOW()),
      },
    ],
  };

  db.profile = {
    userId: USER_ID,
    dietaryPrefs: ['high_protein'],
    allergies: ['peanut'],
    halal: true,
    cuisinePrefs: ['levantine', 'gulf'],
    householdSize: 4,
    healthGoals: ['maintenance'],
  };

  db.ingredientsByKey = new Map();
  db.ingredientsById = new Map();
  db.ingredients = [];
  for (const s of INGREDIENTS) {
    const ingredient: Ingredient = {
      id: uuid(),
      canonicalNameEn: s.en,
      canonicalNameAr: s.ar,
      category: s.category,
      defaultUnit: s.defaultUnit,
      aliases: s.aliases,
      isStaple: s.isStaple,
      createdAt: iso(NOW()),
    };
    db.ingredientsByKey.set(s.key, ingredient);
    db.ingredientsById.set(ingredient.id, ingredient);
    db.ingredients.push(ingredient);
  }

  db.recipeIdByKey = new Map();
  db.seedById = new Map();
  for (const r of RECIPES) {
    const id = uuid();
    db.recipeIdByKey.set(r.key, id);
    db.seedById.set(id, r);
  }

  const locTypes: { name: string; type: StorageLocationType }[] = [
    { name: 'Fridge', type: 'fridge' },
    { name: 'Freezer', type: 'freezer' },
    { name: 'Pantry', type: 'pantry' },
    { name: 'Spice rack', type: 'spice_rack' },
  ];
  db.locations = locTypes.map((l) => ({
    id: uuid(),
    householdId: DEFAULT_HOUSEHOLD_ID,
    name: l.name,
    type: l.type,
  }));
  const locByType = new Map(db.locations.map((l) => [l.type, l.id] as const));

  db.inventory = INVENTORY_SEED.map((s) => {
    const ingredient = db.ingredientsByKey.get(s.key)!;
    return {
      id: uuid(),
      householdId: DEFAULT_HOUSEHOLD_ID,
      ingredient,
      brand: s.brand ?? null,
      locationId: locByType.get(s.location)!,
      quantity: s.quantity,
      unit: ingredient.defaultUnit,
      expiresAt: s.expiresInDays === null ? null : dateFromNow(s.expiresInDays),
      source: s.source,
      confidence: s.confidence,
      photoKey: null,
      createdAt: iso(NOW()),
      updatedAt: iso(NOW()),
    } satisfies InventoryItem;
  });

  db.plans = [buildWeeklyPlan()];

  db.shopping = [];
  const weekly = db.plans[0]!;
  for (const s of computePlanCoverage(weekly).shortfalls) {
    db.shopping.push({
      id: uuid(),
      planId: weekly.id,
      ingredientId: s.ingredientId,
      nameEn: s.nameEn,
      nameAr: s.nameAr,
      quantity: s.shortfall,
      unit: s.unit,
      purchased: false,
      purchasedAt: null,
    });
  }

  db.jobs = new Map();
  db.recognitions = new Map();
  db.feedback = seedFeedback();
}

/**
 * The admin console is reachable by URL only and mock state does not survive a
 * reload, so an empty seed left it permanently empty in mock mode — every
 * filter, the detail view and the triage flow were unreachable without first
 * submitting in the same page session. This spread covers all four statuses,
 * both locales, all three platforms and the no-message case, so the list,
 * filters and stats all have something to show.
 */
function seedFeedback(): FeedbackDetail[] {
  const submitter = {
    id: USER_ID,
    email: 'chef@example.com',
    displayName: 'Amira',
    locale: 'en' as const,
    joinedAt: iso(NOW()),
  };
  const yusuf = {
    id: '33333333-3333-4333-8333-333333333333',
    email: 'yusuf@example.com',
    displayName: 'Yusuf',
    locale: 'ar' as const,
    joinedAt: iso(NOW()),
  };
  const ago = (hours: number) => iso(new Date(NOW().getTime() - hours * 3_600_000));

  return [
    {
      id: uuid(),
      rating: 5,
      message: 'Scanning a receipt and having the pantry fill itself is the whole app for me.',
      platform: 'ios',
      appVersion: '1.4.0',
      locale: 'en',
      status: 'new',
      createdAt: ago(3),
      adminNote: null,
      reviewedAt: null,
      submitter,
    },
    {
      id: uuid(),
      rating: 2,
      message: 'تواريخ الانتهاء صعبة التعديل على الهاتف، وأحتاج لتغييرها كثيرًا.',
      platform: 'android',
      appVersion: '1.4.0',
      locale: 'ar',
      status: 'triaged',
      createdAt: ago(28),
      adminNote: 'Reproduced on a small screen — the stepper targets are too tight.',
      reviewedAt: ago(20),
      submitter: yusuf,
    },
    {
      id: uuid(),
      rating: 4,
      message: 'Weekly plans are great. I would like to exclude a recipe I have just cooked.',
      platform: 'web',
      appVersion: '1.3.2',
      locale: 'en',
      status: 'resolved',
      createdAt: ago(74),
      adminNote: 'Shipped in 1.4 — recently-cooked recipes are now deprioritised.',
      reviewedAt: ago(50),
      submitter,
    },
    {
      id: uuid(),
      rating: 1,
      message: 'Please add a barcode scanner for every product sold in the world.',
      platform: 'ios',
      appVersion: '1.2.0',
      locale: 'en',
      status: 'wont_fix',
      createdAt: ago(120),
      adminNote: 'Out of scope — we cover Open Food Facts and fall back to manual entry.',
      reviewedAt: ago(96),
      submitter: yusuf,
    },
    {
      id: uuid(),
      rating: 3,
      message: null,
      platform: 'web',
      appVersion: '1.4.0',
      locale: 'en',
      status: 'new',
      createdAt: ago(9),
      adminNote: null,
      reviewedAt: null,
      submitter,
    },
  ];
}

function buildWeeklyPlan(): InternalPlan {
  const rotation = ['kabsa', 'shakshuka', 'lentilSoup', 'hummus', 'moussaka', 'potatoFrittata'];
  const breakfast = ['shakshuka', 'potatoFrittata'];
  const entries: InternalEntry[] = [];
  for (let day = 0; day < 7; day += 1) {
    const date = dateFromNow(day);
    entries.push({
      id: uuid(),
      date,
      slot: 'breakfast',
      recipeKey: breakfast[day % breakfast.length]!,
      servings: 4,
      state: day === 0 ? 'cooked' : 'planned',
    });
    entries.push({
      id: uuid(),
      date,
      slot: 'lunch',
      recipeKey: rotation[day % rotation.length]!,
      servings: 4,
      state: 'planned',
    });
    entries.push({
      id: uuid(),
      date,
      slot: 'dinner',
      recipeKey: rotation[(day + 3) % rotation.length]!,
      servings: 4,
      state: day === 0 ? 'cooked' : 'planned',
    });
  }
  return {
    id: uuid(),
    scope: 'weekly',
    startsOn: dateFromNow(0),
    endsOn: dateFromNow(6),
    status: 'ready',
    locale: 'en',
    createdAt: iso(NOW()),
    entries,
  };
}

seed();
