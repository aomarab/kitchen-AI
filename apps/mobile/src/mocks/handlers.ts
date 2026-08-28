import { http, HttpResponse, type HttpResponseResolver } from 'msw';
import {
  applyTimerAction,
  projectTimer,
  routes,
  wakingStart,
  REMINDER_MESSAGE_KEYS,
  REALTIME_SECRET_TTL_SEC,
  type CookingTimer,
  type CreateTimerRequest,
  type Ingredient,
  type InventoryItem,
  type Locale,
  type MealPlan,
  type ReminderOccurrence,
  type ReminderType,
  type RouteName,
  type ShoppingListItem,
  type UpdateTimerRequest,
} from '@kitchen/contracts';
import { CREDIT_PACKS } from '@kitchen/contracts';
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
  mockCredits,
  mockHousehold,
  mockId,
  mockProfile,
  mockReminderSettings,
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

/**
 * A small ledger of already-fired nudges so the wellness screen has something
 * to render offline. These are fixtures in the mock layer — the same status as
 * the seeded pantry — not data any real engine claims to have produced.
 *
 * The times are spread across the *elapsed part of today's waking window*
 * rather than a fixed number of minutes ago. A fixed offset silently falls off
 * the list: the ledger is read from `wakingStart`, so "four hours ago" is
 * before waking whenever the app is opened in the morning, and the seeded
 * history disappears exactly when someone first looks at the screen.
 */
function seedOccurrences(): ReminderOccurrence[] {
  const now = Date.now();
  const from = wakingStart(mockReminderSettings, new Date(now)).getTime();
  const elapsed = Math.max(0, now - from);
  /** `fraction` of the way from waking to now. */
  const at = (fraction: number): string => new Date(from + elapsed * fraction).toISOString();

  const fired = (
    id: string,
    type: ReminderType,
    firedFraction: number,
    acknowledgedFraction: number | null,
  ): ReminderOccurrence => ({
    id,
    householdId: mockHousehold.id,
    type,
    channel: 'screen',
    messageKey: REMINDER_MESSAGE_KEYS[type],
    firedAt: at(firedFraction),
    acknowledgedAt: acknowledgedFraction === null ? null : at(acknowledgedFraction),
  });

  return [
    fired(mockId('cc0'), 'morning', 0.05, 0.08),
    fired(mockId('cc1'), 'hydration', 0.35, 0.4),
    fired(mockId('cc2'), 'hydration', 0.75, null),
    fired(mockId('cc3'), 'stretch', 0.95, null),
  ];
}

const db = {
  user: { ...mockUser },
  household: { ...mockHousehold },
  profile: { ...mockProfile },
  reminderSettings: { ...mockReminderSettings },
  reminderOccurrences: seedOccurrences(),
  timers: [] as CookingTimer[],
  locations: [...seedLocations],
  inventory: buildInventory(),
  shopping: buildShoppingList(),
  catalog: [...catalog],
  plans: new Map<string, MealPlan>(),
  jobs: new Map<string, JobRecord>(),
  credits: { ...mockCredits },
  purchaseIntents: new Map<string, { productId: string; credits: number }>(),
  /** Product reviews, keyed by the product the item is: `ingredientId|brand`. */
  productReviews: new Map<string, { id: string; rating: number; message: string | null }>(),
};

let mockLocale: Locale = 'en';
export function setMockLocale(locale: Locale): void {
  mockLocale = locale;
}

/** Client event ids the server has already committed, so replays read as duplicates. */
const processedEventIds = new Set<string>();

let idCounter = 9000;
function nextId(): string {
  idCounter += 1;
  return mockId(`f${idCounter}`);
}

/**
 * Which product an item is, for review purposes. Mirrors the server's unique
 * index: same ingredient and same brand case-insensitively, with no brand
 * collapsing to `''` rather than staying distinct the way SQL nulls would.
 */
function productKey(item: { ingredient: { id: string }; brand: string | null }): string {
  return `${item.ingredient.id}|${(item.brand ?? '').toLowerCase()}`;
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
    HttpResponse.json({
      accessToken: 'mock.access.token',
      refreshToken: 'mock.refresh.token',
      expiresIn: 900,
    }),
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
  // Real backend returns the shared `{ ok: true }` envelope; a 204/null body
  // would fail the client's response validation (`emptyResponse`).
  deleteMe: okEmpty,

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
  submitFeedback: () =>
    HttpResponse.json(
      { id: crypto.randomUUID(), createdAt: new Date().toISOString() },
      { status: 201 },
    ),
  updateProfile: async ({ request }) => {
    const body = await readBody(request);
    db.profile = { ...db.profile, ...(body as object) };
    return HttpResponse.json(db.profile);
  },
  /* ---- Cooking timers ---- */
  listTimers: () => {
    const now = new Date();
    return HttpResponse.json({ items: db.timers.map((timer) => projectTimer(timer, now)) });
  },
  createTimer: async ({ request }) => {
    const body = (await request.json()) as CreateTimerRequest;
    const now = new Date();
    const timer: CookingTimer = {
      id: nextId(),
      householdId: db.household.id,
      label: body.label.trim(),
      durationSec: body.durationSec,
      status: 'running',
      endsAt: new Date(now.getTime() + body.durationSec * 1000).toISOString(),
      remainingSec: body.durationSec,
      createdAt: now.toISOString(),
    };
    db.timers = [...db.timers, timer];
    return HttpResponse.json(timer, { status: 201 });
  },
  updateTimer: async ({ request, params }) => {
    const body = (await request.json()) as UpdateTimerRequest;
    const now = new Date();
    const current = db.timers.find((t) => t.id === params.id);
    if (!current) return notFound();

    // The one state machine the server also runs — see `applyTimerAction`.
    const result = applyTimerAction(projectTimer(current, now), body, now);
    if (!result.ok) return conflict();
    db.timers = db.timers.map((t) => (t.id === result.timer.id ? result.timer : t));
    return HttpResponse.json(result.timer);
  },
  deleteTimer: ({ params }) => {
    const before = db.timers.length;
    db.timers = db.timers.filter((t) => t.id !== params.id);
    return db.timers.length === before ? notFound() : HttpResponse.json({ ok: true });
  },

  getReminderSettings: () => HttpResponse.json(db.reminderSettings),
  updateReminderSettings: async ({ request }) => {
    const body = await readBody(request);
    db.reminderSettings = { ...db.reminderSettings, ...(body as object) };
    return HttpResponse.json(db.reminderSettings);
  },
  // Mirrors the server: the ledger is read per waking day, and acknowledging
  // twice keeps the first timestamp.
  listReminderOccurrences: ({ request }) => {
    const since = query(request).get('since');
    const from = since ? new Date(since) : wakingStart(db.reminderSettings, new Date());
    return HttpResponse.json(db.reminderOccurrences.filter((o) => new Date(o.firedAt) >= from));
  },
  acknowledgeReminder: ({ params }) => {
    const found = db.reminderOccurrences.find((o) => o.id === params.id);
    if (!found) return notFound();
    if (!found.acknowledgedAt) found.acknowledgedAt = new Date().toISOString();
    return HttpResponse.json(found);
  },

  /* ---- Live assistant ---- */
  // `isMock: true` is the load-bearing field: it is what keeps the client on
  // the scripted adapter and the demo badge lit. The secret is deliberately
  // implausible so it can never be mistaken for a usable credential.
  createRealtimeSession: () =>
    HttpResponse.json({
      clientSecret: 'mock-realtime-secret',
      expiresAt: new Date(Date.now() + REALTIME_SECRET_TTL_SEC * 1000).toISOString(),
      model: 'mock-realtime',
      callsUrl: 'https://example.invalid/realtime/calls',
      isMock: true,
    }),

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
  updateLocation: async ({ params, request }) => {
    const body = await readBody(request);
    const location = db.locations.find((l) => l.id === String(params.id));
    if (!location) return notFound();
    if (body.name !== undefined) location.name = String(body.name);
    if (body.type !== undefined) location.type = body.type as (typeof db.locations)[number]['type'];
    return HttpResponse.json(location);
  },
  deleteLocation: ({ params, request }) => {
    const id = String(params.id);
    const index = db.locations.findIndex((l) => l.id === id);
    if (index === -1) return notFound();

    const contents = db.inventory.filter((i) => i.locationId === id);
    const moveTo = query(request).get('moveTo');
    if (contents.length > 0) {
      // Mirrors the API: a place is not its contents, so deleting one that
      // still holds food is refused unless the food is given somewhere to go.
      if (!moveTo) {
        return HttpResponse.json(
          {
            code: 'CONFLICT',
            messageKey: 'errors.CONFLICT',
            details: { reason: 'location_not_empty', itemCount: contents.length },
          },
          { status: 409 },
        );
      }
      if (!db.locations.some((l) => l.id === moveTo)) return notFound();
      for (const item of contents) item.locationId = moveTo;
    }

    db.locations.splice(index, 1);
    return HttpResponse.json({ ok: true });
  },
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
          i.ingredient.canonicalNameAr.includes(q) ||
          (i.label ?? '').toLowerCase().includes(q),
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
        brand: (input.brand as string | null) ?? null,
        label: null,
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
  getInventoryItem: ({ params }) => {
    const item = db.inventory.find((i) => i.id === String(params.id));
    return item ? HttpResponse.json(item) : notFound();
  },
  getProductFeedback: ({ params }) => {
    const item = db.inventory.find((i) => i.id === String(params.id));
    if (!item) return notFound();
    const mine = db.productReviews.get(productKey(item)) ?? null;
    return HttpResponse.json({
      mine: mine
        ? {
            id: mine.id,
            ingredientId: item.ingredient.id,
            brand: item.brand,
            rating: mine.rating,
            message: mine.message,
            createdAt: new Date().toISOString(),
          }
        : null,
      // A fixed stranger average, so the "others" line has something to render
      // offline. Only the reader's own review is stateful here.
      averageRating: mine ? Math.round(((mine.rating + 4) / 2) * 100) / 100 : 4,
      count: mine ? 2 : 1,
    });
  },
  submitProductFeedback: async ({ request, params }) => {
    const item = db.inventory.find((i) => i.id === String(params.id));
    if (!item) return notFound();
    const body = (await readBody(request)) as { rating: number; message?: string };
    const key = productKey(item);
    // Upsert, mirroring the unique index: re-reviewing replaces, never stacks.
    const existing = db.productReviews.get(key);
    const saved = {
      id: existing?.id ?? nextId(),
      rating: body.rating,
      message: body.message ?? null,
    };
    db.productReviews.set(key, saved);
    return HttpResponse.json({
      id: saved.id,
      ingredientId: item.ingredient.id,
      brand: item.brand,
      rating: saved.rating,
      message: saved.message,
      createdAt: new Date().toISOString(),
    });
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
    if (body.brand !== undefined) item.brand = body.brand as string | null;
    if (body.label !== undefined) item.label = body.label as string | null;
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
    const duplicate: string[] = [];
    const rejected: { clientEventId: string; reason: string }[] = [];
    const touched = new Set<string>();
    for (const event of events) {
      const clientEventId = String(event.clientEventId);
      if (processedEventIds.has(clientEventId)) {
        duplicate.push(clientEventId);
        continue;
      }
      const item = db.inventory.find((i) => i.id === event.itemId);
      if (!item) {
        rejected.push({ clientEventId, reason: 'item_not_found' });
        continue;
      }
      item.quantity = Math.max(0, item.quantity + Number(event.delta ?? 0));
      item.updatedAt = isoDateTime(0);
      touched.add(item.id);
      processedEventIds.add(clientEventId);
      applied.push(clientEventId);
    }
    return HttpResponse.json({
      applied,
      duplicate,
      rejected,
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
        productNameAr: 'زبادي يوناني ٥٠٠ جم',
        brand: 'Al Marai',
        imageUrl: 'https://images.kitchenai.dev/products/yogurt.jpg',
        match: {
          ingredientId: yogurt.id,
          strategy: 'alias',
          confidence: 0.9,
          rawName: 'Greek Yogurt',
        },
        category: 'dairy',
        suggestedQuantity: 500,
        suggestedUnit: 'ml',
      });
    }
    // A real product the catalog has never seen. Confirming this is the case
    // that creates a global ingredient row, so it is the one worth having a
    // fixture for.
    if (barcode === '6281000099999') {
      return HttpResponse.json({
        found: true,
        productName: 'Pomegranate Molasses',
        productNameAr: 'دبس الرمان',
        brand: 'Cortas',
        imageUrl: 'https://images.kitchenai.dev/products/molasses.jpg',
        match: {
          ingredientId: null,
          strategy: 'unresolved',
          confidence: 0,
          rawName: 'Pomegranate Molasses',
        },
        category: 'condiment',
        suggestedQuantity: 600,
        suggestedUnit: 'ml',
      });
    }
    return HttpResponse.json({
      found: false,
      productName: null,
      productNameAr: null,
      brand: null,
      imageUrl: null,
      match: null,
      category: null,
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
      const ingredient =
        db.catalog.find((i) => i.id === shop.ingredientId) ?? ingredientByKey('onion');
      const item: InventoryItem = {
        id: nextId(),
        householdId: db.household.id,
        ingredient,
        brand: null,
        label: null,
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

  /* ---- Credits ---- */
  getCredits: () => HttpResponse.json(db.credits),
  createPurchaseIntent: async ({ request }) => {
    const body = await readBody(request);
    const pack = CREDIT_PACKS.find((p) => p.productId === body.productId);
    if (!pack) {
      return HttpResponse.json(
        { code: 'VALIDATION_FAILED', messageKey: 'errors.VALIDATION_FAILED' },
        { status: 422 },
      );
    }
    const intentId = nextId();
    db.purchaseIntents.set(intentId, { productId: pack.productId, credits: pack.credits });
    return HttpResponse.json({ intentId, productId: pack.productId, credits: pack.credits });
  },
  confirmPurchase: async ({ request }) => {
    const body = await readBody(request);
    const intent = db.purchaseIntents.get(String(body.intentId));
    if (!intent) return notFound();
    db.purchaseIntents.delete(String(body.intentId));
    db.credits = { ...db.credits, paidBalance: db.credits.paidBalance + intent.credits };
    return HttpResponse.json(db.credits);
  },
};

/* ------------------------------------------------------------------ */
/* Local helpers                                                       */
/* ------------------------------------------------------------------ */

function localizedEntry(entry: MealPlan['entries'][number]): MealPlan['entries'][number] {
  const def = recipeDefById(entry.recipe.id);
  if (!def) return entry;
  return {
    ...entry,
    recipe: { ...entry.recipe, title: def.title[mockLocale], locale: mockLocale },
  };
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

function createJob(
  type: JobRecord['type'],
  resultKind: JobRecord['resultKind'],
  resultId: string,
): JobRecord {
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

function conflict() {
  return HttpResponse.json({ code: 'CONFLICT', messageKey: 'errors.CONFLICT' }, { status: 409 });
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
