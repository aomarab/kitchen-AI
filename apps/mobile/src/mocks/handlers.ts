import { http, HttpResponse, type HttpResponseResolver } from 'msw';
import {
  routes,
  type Ingredient,
  type InventoryItem,
  type Locale,
  type MealPlan,
  type RouteName,
  type ShoppingListItem,
} from '@kitchen/contracts';
import {
  buildInventory,
  buildRecognitionSession,
  buildShoppingList,
  buildWeeklyPlan,
  ingredients as catalog,
  ingredientByKey,
  locations as seedLocations,
  makeSession,
  mockAiUsage,
  mockHousehold,
  mockId,
  mockProfile,
  mockUser,
  recipeDefById,
  recipeVideos,
  toRecipe,
  isoDate,
  isoDateTime,
} from './data';

/* ------------------------------------------------------------------ */
/* Mutable in-memory database                                          */
/* ------------------------------------------------------------------ */

interface JobRecord {
  id: string;
  type: 'receipt.parse' | 'plan.generate';
  createdAt: number;
  resultKind: 'meal_plan' | 'recognition_session' | 'recipe';
  resultId: string;
}

const db = {
  user: { ...mockUser },
  household: { ...mockHousehold },
  profile: { ...mockProfile },
  locations: [...seedLocations],
  inventory: buildInventory(),
  shopping: buildShoppingList(),
  catalog: [...catalog],
  plans: new Map<string, MealPlan>(),
  jobs: new Map<string, JobRecord>(),
};

let mockLocale: Locale = 'en';
export function setMockLocale(locale: Locale): void {
  mockLocale = locale;
}

let idCounter = 9000;
function nextId(): string {
  idCounter += 1;
  return mockId(`f${idCounter}`);
}

function currentPlan(): MealPlan {
  const existing = [...db.plans.values()].find((p) => p.scope === 'weekly');
  if (existing) return existing;
  const plan = buildWeeklyPlan(mockLocale);
  db.plans.set(plan.id, plan);
  return plan;
}

// Seed the default weekly plan so Home and Plans have data immediately.
currentPlan();

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

type Body = Record<string, unknown>;
async function readBody(request: Request): Promise<Body> {
  try {
    return (await request.json()) as Body;
  } catch {
    return {};
  }
}
function query(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}
const okEmpty = () => HttpResponse.json({ ok: true });

function localizedPlan(plan: MealPlan): MealPlan {
  // Re-localize entry titles for the active locale (mock-only side channel).
  return {
    ...plan,
    locale: mockLocale,
    entries: plan.entries.map((e) => {
      const def = recipeDefById(e.recipe.id);
      if (!def) return e;
      return { ...e, recipe: { ...e.recipe, title: def.title[mockLocale], locale: mockLocale } };
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Resolvers                                                           */
/* ------------------------------------------------------------------ */

const resolvers: Partial<Record<RouteName, HttpResponseResolver>> = {
  /* ---- Auth ---- */
  register: async ({ request }) => {
    const body = await readBody(request);
    db.user = {
      ...db.user,
      email: String(body.email ?? db.user.email),
      displayName: String(body.displayName ?? db.user.displayName),
      locale: (body.locale as Locale) ?? db.user.locale,
    };
    return HttpResponse.json(makeSession(db.user));
  },
  login: async ({ request }) => {
    const body = await readBody(request);
    db.user = { ...db.user, email: String(body.email ?? db.user.email) };
    return HttpResponse.json(makeSession(db.user));
  },
  oauthLogin: () => HttpResponse.json(makeSession(db.user)),
  refresh: () =>
    HttpResponse.json({ accessToken: 'mock.access.token', refreshToken: 'mock.refresh.token', expiresIn: 900 }),
  logout: okEmpty,
  getMe: () => HttpResponse.json(db.user),
  updateMe: async ({ request }) => {
    const body = await readBody(request);
    db.user = {
      ...db.user,
      displayName: body.displayName ? String(body.displayName) : db.user.displayName,
      locale: (body.locale as Locale) ?? db.user.locale,
    };
    return HttpResponse.json(db.user);
  },

  /* ---- Households & profile ---- */
  listHouseholds: () => HttpResponse.json([db.household]),
  createHousehold: async ({ request }) => {
    const body = await readBody(request);
    db.household = { ...db.household, name: String(body.name ?? db.household.name) };
    return HttpResponse.json(db.household);
  },
  joinHousehold: () => HttpResponse.json(db.household),
  updateHousehold: async ({ request }) => {
    const body = await readBody(request);
    db.household = { ...db.household, name: String(body.name ?? db.household.name) };
    return HttpResponse.json(db.household);
  },
  rotateInviteCode: () => {
    db.household = { ...db.household, inviteCode: randomCode() };
    return HttpResponse.json(db.household);
  },
  leaveHousehold: okEmpty,
  getProfile: () => HttpResponse.json(db.profile),
  updateProfile: async ({ request }) => {
    const body = await readBody(request);
    db.profile = { ...db.profile, ...(body as object) };
    return HttpResponse.json(db.profile);
  },

  /* ---- Catalog ---- */
  searchIngredients: ({ request }) => {
    const q = (query(request).get('q') ?? '').trim().toLowerCase();
    const items = db.catalog
      .filter(
        (i) =>
          !q ||
          i.canonicalNameEn.toLowerCase().includes(q) ||
          i.canonicalNameAr.includes(q) ||
          i.aliases.some((a) => a.toLowerCase().includes(q)),
      )
      .slice(0, 50);
    return HttpResponse.json({ items, nextCursor: null });
  },
  createIngredient: async ({ request }) => {
    const body = await readBody(request);
    const ingredient: Ingredient = {
      id: nextId(),
      canonicalNameEn: String(body.canonicalNameEn ?? 'New ingredient'),
      canonicalNameAr: String(body.canonicalNameAr ?? 'مكوّن جديد'),
      category: (body.category as Ingredient['category']) ?? 'other',
      defaultUnit: (body.defaultUnit as Ingredient['defaultUnit']) ?? 'piece',
      aliases: Array.isArray(body.aliases) ? (body.aliases as string[]) : [],
      isStaple: Boolean(body.isStaple),
      createdAt: isoDateTime(0),
    };
    db.catalog.push(ingredient);
    return HttpResponse.json(ingredient);
  },

  /* ---- Storage & inventory ---- */
  listLocations: () => HttpResponse.json(db.locations),
  createLocation: async ({ request }) => {
    const body = await readBody(request);
    const location = {
      id: nextId(),
      householdId: db.household.id,
      name: String(body.name ?? 'New location'),
      type: (body.type as (typeof db.locations)[number]['type']) ?? 'other',
    };
    db.locations.push(location);
    return HttpResponse.json(location);
  },
  deleteLocation: okEmpty,
  listInventory: ({ request }) => {
    const params = query(request);
    const locationId = params.get('locationId');
    const category = params.get('category');
    const q = (params.get('q') ?? '').trim().toLowerCase();
    const within = params.get('expiringWithinDays');
    const sort = params.get('sort') ?? 'expiry';

    let items = [...db.inventory];
    if (locationId) items = items.filter((i) => i.locationId === locationId);
    if (category) items = items.filter((i) => i.ingredient.category === category);
    if (q)
      items = items.filter(
        (i) =>
          i.ingredient.canonicalNameEn.toLowerCase().includes(q) ||
          i.ingredient.canonicalNameAr.includes(q),
      );
    if (within != null) {
      const max = Number(within);
      items = items.filter((i) => {
        if (!i.expiresAt) return false;
        const days = daysUntil(i.expiresAt);
        return days <= max;
      });
    }
    items = sortInventory(items, sort);
    return HttpResponse.json({ items, nextCursor: null });
  },
  bulkCreateInventory: async ({ request }) => {
    const body = await readBody(request);
    const inputs = Array.isArray(body.items) ? (body.items as Body[]) : [];
    const created: InventoryItem[] = inputs.map((input) => {
      const ingredient = resolveIngredient(input);
      return {
        id: nextId(),
        householdId: db.household.id,
        ingredient,
        locationId: String(input.locationId ?? db.locations[0]!.id),
        quantity: Number(input.quantity ?? 1),
        unit: (input.unit as InventoryItem['unit']) ?? ingredient.defaultUnit,
        expiresAt: (input.expiresAt as string | null) ?? null,
        source: (input.source as InventoryItem['source']) ?? 'manual',
        confidence: (input.confidence as number | null) ?? null,
        photoKey: (input.photoKey as string | null) ?? null,
        createdAt: isoDateTime(0),
        updatedAt: isoDateTime(0),
      };
    });
    db.inventory.push(...created);
    return HttpResponse.json(created);
  },
  updateInventoryItem: async ({ request, params }) => {
    const body = await readBody(request);
    const id = String(params.id);
    const item = db.inventory.find((i) => i.id === id);
    if (!item) return notFound();
    if (body.quantity != null) item.quantity = Number(body.quantity);
    if (body.unit) item.unit = body.unit as InventoryItem['unit'];
    if (body.locationId) item.locationId = String(body.locationId);
    if (body.expiresAt !== undefined) item.expiresAt = body.expiresAt as string | null;
    item.updatedAt = isoDateTime(0);
    return HttpResponse.json(item);
  },
  deleteInventoryItem: ({ params }) => {
    const id = String(params.id);
    db.inventory = db.inventory.filter((i) => i.id !== id);
    return okEmpty();
  },
  listInventoryEvents: () => HttpResponse.json([]),
  syncInventoryEvents: async ({ request }) => {
    const body = await readBody(request);
    const events = Array.isArray(body.events) ? (body.events as Body[]) : [];
    const applied: string[] = [];
    const touched = new Set<string>();
    for (const event of events) {
      applied.push(String(event.clientEventId));
      const item = db.inventory.find((i) => i.id === event.itemId);
      if (item) {
        item.quantity = Math.max(0, item.quantity + Number(event.delta ?? 0));
        item.updatedAt = isoDateTime(0);
        touched.add(item.id);
      }
    }
    return HttpResponse.json({
      applied,
      skipped: [],
      items: db.inventory.filter((i) => touched.has(i.id)),
    });
  },

  /* ---- Uploads & capture ---- */
  presignUpload: async ({ request }) => {
    const body = await readBody(request);
    const key = `uploads/${body.purpose ?? 'inventory_photo'}/${nextId()}`;
    return HttpResponse.json({
      uploadUrl: `https://uploads.kitchenai.dev/${key}`,
      key,
      headers: {},
      expiresIn: 900,
    });
  },
  recognizePhotos: async ({ request }) => {
    const body = await readBody(request);
    const photoKeys = Array.isArray(body.photoKeys) ? (body.photoKeys as string[]) : ['photo-1'];
    return HttpResponse.json(buildRecognitionSession(photoKeys));
  },
  getRecognitionSession: () => HttpResponse.json(buildRecognitionSession(['photo-1'])),
  lookupBarcode: ({ request }) => {
    const barcode = query(request).get('barcode') ?? '';
    if (barcode === '6281000012345') {
      const yogurt = ingredientByKey('yogurt');
      return HttpResponse.json({
        found: true,
        productName: 'Greek Yogurt 500g',
        brand: 'Al Marai',
        imageUrl: 'https://images.kitchenai.dev/products/yogurt.jpg',
        match: { ingredientId: yogurt.id, strategy: 'alias', confidence: 0.9, rawName: 'Greek Yogurt' },
        suggestedQuantity: 500,
        suggestedUnit: 'ml',
      });
    }
    return HttpResponse.json({
      found: false,
      productName: null,
      brand: null,
      imageUrl: null,
      match: null,
      suggestedQuantity: null,
      suggestedUnit: null,
    });
  },
  parseReceipt: () => {
    const job = createJob('receipt.parse', 'recognition_session', mockId('5e51'));
    return HttpResponse.json(jobView(job));
  },

  /* ---- Jobs ---- */
  getJob: ({ params }) => {
    const job = db.jobs.get(String(params.id));
    if (!job) return notFound();
    return HttpResponse.json(jobView(job));
  },

  /* ---- Recipes ---- */
  getRecipe: ({ request, params }) => {
    const def = recipeDefById(String(params.id));
    if (!def) return notFound();
    const locale = (query(request).get('locale') as Locale) ?? mockLocale;
    return HttpResponse.json(toRecipe(def, locale));
  },
  getRecipeVideos: ({ params }) => HttpResponse.json(recipeVideos(String(params.id))),
  markRecipeCooked: async ({ request, params }) => {
    const def = recipeDefById(String(params.id));
    const deducted: string[] = [];
    if (def) {
      for (const ri of def.ingredients) {
        const item = db.inventory.find((i) => i.ingredient.id === ingredientByKey(ri.key).id);
        if (item) {
          item.quantity = Math.max(0, item.quantity - ri.quantity);
          deducted.push(item.id);
        }
      }
    }
    await readBody(request);
    return HttpResponse.json({ deductedItemIds: deducted, missingIngredientIds: [] });
  },

  /* ---- Meal plans ---- */
  listPlans: () => HttpResponse.json([localizedPlan(currentPlan())]),
  generatePlan: async ({ request }) => {
    const body = await readBody(request);
    const scope = (body.scope as MealPlan['scope']) ?? 'weekly';
    const plan = buildWeeklyPlan(mockLocale);
    const generated: MealPlan = {
      ...plan,
      id: nextId(),
      scope,
      startsOn: (body.startsOn as string) ?? plan.startsOn,
      status: 'ready',
    };
    db.plans.set(generated.id, generated);
    const job = createJob('plan.generate', 'meal_plan', generated.id);
    return HttpResponse.json(jobView(job));
  },
  getPlan: ({ params }) => {
    const id = String(params.id);
    const plan = db.plans.get(id) ?? currentPlan();
    return HttpResponse.json(localizedPlan(plan));
  },
  deletePlan: ({ params }) => {
    db.plans.delete(String(params.id));
    return okEmpty();
  },
  getPlanCoverage: ({ params }) => {
    const plan = db.plans.get(String(params.id)) ?? currentPlan();
    const covered = plan.entries.filter((e) => e.fullyCovered).map((e) => e.id);
    const uncovered = plan.entries.filter((e) => !e.fullyCovered).map((e) => e.id);
    const lemon = ingredientByKey('lemon');
    return HttpResponse.json({
      planId: plan.id,
      coverageRatio: plan.entries.length ? covered.length / plan.entries.length : 1,
      coveredEntryIds: covered,
      uncoveredEntryIds: uncovered,
      shortfalls: uncovered.length
        ? [
            {
              ingredientId: lemon.id,
              nameEn: lemon.canonicalNameEn,
              nameAr: lemon.canonicalNameAr,
              required: 4,
              available: 2,
              shortfall: 2,
              unit: 'piece',
            },
          ]
        : [],
      expiringSoonIngredientIds: [ingredientByKey('chicken').id, ingredientByKey('parsley').id],
    });
  },
  updatePlanEntry: async ({ request, params }) => {
    const body = await readBody(request);
    const plan = db.plans.get(String(params.id)) ?? currentPlan();
    const entry = plan.entries.find((e) => e.id === String(params.entryId));
    if (!entry) return notFound();
    if (body.state) entry.state = body.state as typeof entry.state;
    if (body.servings) entry.servings = Number(body.servings);
    return HttpResponse.json(localizedEntry(entry));
  },
  regeneratePlanEntry: ({ params }) => {
    const plan = db.plans.get(String(params.id)) ?? currentPlan();
    const entry = plan.entries.find((e) => e.id === String(params.entryId));
    if (!entry) return notFound();
    const defs = ['4ec1', '4ec2', '4ec3'].map((s) => recipeDefById(mockId(s))!);
    const alt = defs.find((d) => d.id !== entry.recipe.id) ?? defs[0]!;
    entry.recipe = {
      id: alt.id,
      title: alt.title[mockLocale],
      locale: mockLocale,
      prepMinutes: alt.prepMinutes,
      cookMinutes: alt.cookMinutes,
      servings: alt.servings,
      difficulty: alt.difficulty,
      cuisine: alt.cuisine,
      heroImageUrl: alt.heroImageUrl,
    };
    entry.state = 'planned';
    return HttpResponse.json(localizedEntry(entry));
  },

  /* ---- Shopping ---- */
  getShoppingList: () => HttpResponse.json(db.shopping),
  addShoppingItems: async ({ request }) => {
    const body = await readBody(request);
    const inputs = Array.isArray(body.items) ? (body.items as Body[]) : [];
    for (const input of inputs) {
      const ingredient = db.catalog.find((i) => i.id === input.ingredientId);
      db.shopping.push({
        id: nextId(),
        planId: (body.planId as string | null) ?? null,
        ingredientId: String(input.ingredientId),
        nameEn: ingredient?.canonicalNameEn ?? 'Item',
        nameAr: ingredient?.canonicalNameAr ?? 'صنف',
        quantity: Number(input.quantity ?? 1),
        unit: (input.unit as ShoppingListItem['unit']) ?? 'piece',
        purchased: false,
        purchasedAt: null,
      });
    }
    return HttpResponse.json(db.shopping);
  },
  toggleShoppingItem: async ({ request, params }) => {
    const body = await readBody(request);
    const item = db.shopping.find((i) => i.id === String(params.id));
    if (!item) return notFound();
    item.purchased = Boolean(body.purchased);
    item.purchasedAt = item.purchased ? isoDateTime(0) : null;
    return HttpResponse.json(item);
  },
  checkoutShopping: async ({ request }) => {
    const body = await readBody(request);
    const ids = Array.isArray(body.itemIds) ? (body.itemIds as string[]) : [];
    const locationId = String(body.locationId ?? db.locations[0]!.id);
    const created: InventoryItem[] = [];
    for (const id of ids) {
      const shop = db.shopping.find((s) => s.id === id);
      if (!shop) continue;
      const ingredient = db.catalog.find((i) => i.id === shop.ingredientId) ?? ingredientByKey('onion');
      const item: InventoryItem = {
        id: nextId(),
        householdId: db.household.id,
        ingredient,
        locationId,
        quantity: shop.quantity,
        unit: shop.unit,
        expiresAt: null,
        source: 'manual',
        confidence: null,
        photoKey: null,
        createdAt: isoDateTime(0),
        updatedAt: isoDateTime(0),
      };
      db.inventory.push(item);
      created.push(item);
    }
    db.shopping = db.shopping.filter((s) => !ids.includes(s.id));
    return HttpResponse.json(created);
  },

  /* ---- Usage ---- */
  getAiUsage: () => HttpResponse.json({ ...mockAiUsage, day: isoDate(0) }),
};

/* ------------------------------------------------------------------ */
/* Local helpers                                                       */
/* ------------------------------------------------------------------ */

function localizedEntry(entry: MealPlan['entries'][number]): MealPlan['entries'][number] {
  const def = recipeDefById(entry.recipe.id);
  if (!def) return entry;
  return { ...entry, recipe: { ...entry.recipe, title: def.title[mockLocale], locale: mockLocale } };
}

function resolveIngredient(input: Body): Ingredient {
  if (input.ingredientId) {
    const found = db.catalog.find((i) => i.id === input.ingredientId);
    if (found) return found;
  }
  if (input.rawName) {
    const raw = String(input.rawName);
    const created: Ingredient = {
      id: nextId(),
      canonicalNameEn: raw,
      canonicalNameAr: raw,
      category: 'other',
      defaultUnit: 'piece',
      aliases: [],
      isStaple: false,
      createdAt: isoDateTime(0),
    };
    db.catalog.push(created);
    return created;
  }
  return ingredientByKey('onion');
}

function daysUntil(iso: string): number {
  const target = new Date(`${iso}T00:00:00`).getTime();
  const today = new Date(isoDate(0) + 'T00:00:00').getTime();
  return Math.round((target - today) / 86_400_000);
}

function sortInventory(items: InventoryItem[], sort: string): InventoryItem[] {
  const copy = [...items];
  if (sort === 'name') {
    copy.sort((a, b) => a.ingredient.canonicalNameEn.localeCompare(b.ingredient.canonicalNameEn));
  } else if (sort === 'recent') {
    copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } else {
    copy.sort((a, b) => {
      if (!a.expiresAt && !b.expiresAt) return 0;
      if (!a.expiresAt) return 1;
      if (!b.expiresAt) return -1;
      return daysUntil(a.expiresAt) - daysUntil(b.expiresAt);
    });
  }
  return copy;
}

function createJob(type: JobRecord['type'], resultKind: JobRecord['resultKind'], resultId: string): JobRecord {
  const job: JobRecord = { id: nextId(), type, createdAt: Date.now(), resultKind, resultId };
  db.jobs.set(job.id, job);
  return job;
}

function jobView(job: JobRecord) {
  const elapsed = Date.now() - job.createdAt;
  let status: 'queued' | 'running' | 'done';
  let progress: number;
  if (elapsed < 1200) {
    status = 'queued';
    progress = 0.1;
  } else if (elapsed < 3000) {
    status = 'running';
    progress = 0.55;
  } else {
    status = 'done';
    progress = 1;
  }
  return {
    id: job.id,
    type: job.type,
    status,
    progress,
    resultRef: status === 'done' ? { kind: job.resultKind, id: job.resultId } : null,
    error: null,
    createdAt: new Date(job.createdAt).toISOString(),
    finishedAt: status === 'done' ? isoDateTime(0) : null,
  };
}

function notFound() {
  return HttpResponse.json({ code: 'NOT_FOUND', messageKey: 'errors.NOT_FOUND' }, { status: 404 });
}

function randomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/* ------------------------------------------------------------------ */
/* Handler assembly — one per contract route                           */
/* ------------------------------------------------------------------ */

const METHOD = {
  GET: http.get,
  POST: http.post,
  PATCH: http.patch,
  PUT: http.put,
  DELETE: http.delete,
} as const;

/** MSW uses the same `:param` syntax as the contract, so paths pass through. */
export function buildHandlers(baseUrl: string) {
  const root = baseUrl.replace(/\/+$/, '');
  const handlers = [];
  for (const [name, route] of Object.entries(routes)) {
    const resolver = resolvers[name as RouteName];
    if (!resolver) continue;
    const register = METHOD[route.method];
    handlers.push(register(`${root}${route.path}`, resolver));
  }
  return handlers;
}
