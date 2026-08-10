import { http, HttpResponse } from 'msw';
import type {
  AddShoppingItemsRequest,
  BulkCreateInventoryRequest,
  CheckoutShoppingRequest,
  CreateHouseholdRequest,
  CreateIngredientRequest,
  CreateStorageLocationRequest,
  ErrorCode,
  GeneratePlanRequest,
  InventoryItem,
  JoinHouseholdRequest,
  Locale,
  LoginRequest,
  MealSlot,
  RegenerateEntryRequest,
  RegisterRequest,
  Session,
  ShoppingListItem,
  ToggleShoppingItemRequest,
  UpdateEntryRequest,
  UpdateHouseholdRequest,
  UpdateInventoryItemRequest,
  UpdateMeRequest,
  UpdateProfileRequest,
} from '@kitchen/contracts';
import { DEFAULT_SLOTS_BY_SCOPE } from '@kitchen/contracts';
import { API_URL } from '../lib/config';
import {
  buildRecognitionSession,
  computePlanCoverage,
  coverageForRecipe,
  db,
  projectEntry,
  projectPlan,
  projectRecipe,
  uuid,
} from './db';
import { getMockLocale } from './runtime';

const u = (path: string) => `${API_URL}${path}`;

/** Matches the API's `encodeCursor`/`decodeCursor`: base64url, unpadded. */
const encodeMockCursor = (offset: number) =>
  btoa(String(offset)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const decodeMockCursor = (cursor: string) => {
  const padded = cursor.replace(/-/g, '+').replace(/_/g, '/');
  return Number(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4)));
};

function err(code: ErrorCode, status: number) {
  return HttpResponse.json({ code, messageKey: `errors.${code}` }, { status });
}

function localeFrom(request: Request, explicit?: Locale | null): Locale {
  if (explicit) return explicit;
  const q = new URL(request.url).searchParams.get('locale');
  if (q === 'ar' || q === 'en') return q;
  return getMockLocale();
}

const iso = () => new Date().toISOString();
const dateFromNow = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

function makeSession(
  email: string,
  displayName: string,
  locale: Locale,
  householdIds: string[] = [db.household.id],
): Session {
  const existing = db.user;
  db.user = {
    id: existing?.id ?? uuid(),
    email,
    displayName,
    locale,
    hasPassword: existing?.hasPassword ?? true,
    createdAt: existing?.createdAt ?? iso(),
  };
  return {
    user: db.user,
    tokens: { accessToken: `mock.${uuid()}`, refreshToken: `mock.${uuid()}`, expiresIn: 900 },
    householdIds,
  };
}

/* ------------------------------------------------------------------ */
/* Plan generation                                                     */
/* ------------------------------------------------------------------ */

const GEN_POOL = ['kabsa', 'shakshuka', 'lentilSoup', 'hummus', 'potatoFrittata', 'moussaka'];

function scopeDays(scope: 'daily' | 'weekly' | 'monthly'): number {
  return scope === 'daily' ? 1 : scope === 'weekly' ? 7 : 28;
}

function generatePlan(body: GeneratePlanRequest, locale: Locale): string {
  const slots: MealSlot[] = body.slots ?? DEFAULT_SLOTS_BY_SCOPE[body.scope];
  const days = scopeDays(body.scope);
  const servings = body.servings ?? db.profile.householdSize;
  // Daily plans are guaranteed cookable from stock (spec §5.4), so drop the one
  // uncovered recipe from the pool for that scope.
  const pool =
    body.scope === 'daily' ? GEN_POOL.filter((k) => coverageForRecipe(db.seedById.get(db.recipeIdByKey.get(k)!)!).fullyCovered) : GEN_POOL;

  const entries = [];
  let n = 0;
  for (let day = 0; day < days; day += 1) {
    const date = (() => {
      const d = new Date(body.startsOn);
      d.setDate(d.getDate() + day);
      return d.toISOString().slice(0, 10);
    })();
    for (const slot of slots) {
      entries.push({
        id: uuid(),
        date,
        slot,
        recipeKey: pool[n % pool.length]!,
        servings,
        state: 'planned' as const,
      });
      n += 1;
    }
  }

  const id = uuid();
  const end = new Date(body.startsOn);
  end.setDate(end.getDate() + days - 1);
  db.plans.unshift({
    id,
    scope: body.scope,
    startsOn: body.startsOn,
    endsOn: end.toISOString().slice(0, 10),
    status: 'generating',
    locale,
    createdAt: iso(),
    entries,
  });
  return id;
}

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

export const handlers = [
  /* ---------- Auth ---------- */
  http.post(u('/auth/register'), async ({ request }) => {
    const body = (await request.json()) as RegisterRequest;
    // A brand-new account has no household yet — the setup screen creates one.
    return HttpResponse.json(makeSession(body.email, body.displayName, body.locale ?? 'en', []));
  }),
  http.post(u('/auth/login'), async ({ request }) => {
    const body = (await request.json()) as LoginRequest;
    return HttpResponse.json(makeSession(body.email, db.user?.displayName ?? 'Chef', db.user?.locale ?? 'en'));
  }),
  http.post(u('/auth/oauth'), async () =>
    HttpResponse.json(
      makeSession(db.user?.email ?? 'chef@example.com', db.user?.displayName ?? 'Chef', db.user?.locale ?? 'en'),
    ),
  ),
  http.post(u('/auth/refresh'), async () =>
    HttpResponse.json({ accessToken: `mock.${uuid()}`, refreshToken: `mock.${uuid()}`, expiresIn: 900 }),
  ),
  http.post(u('/auth/logout'), async () => HttpResponse.json({ ok: true })),
  http.get(u('/me'), async () => (db.user ? HttpResponse.json(db.user) : err('UNAUTHENTICATED', 401))),
  http.patch(u('/me'), async ({ request }) => {
    const body = (await request.json()) as UpdateMeRequest;
    const current = db.user;
    if (!current) return err('UNAUTHENTICATED', 401);
    db.user = { ...current, ...body };
    return HttpResponse.json(db.user);
  }),
  http.delete(u('/me'), async () => {
    // A deleted account must not still resolve; GET /me now 401s once null.
    db.user = null;
    return HttpResponse.json({ ok: true });
  }),

  /* ---------- Households & profile ---------- */
  http.get(u('/households'), async () => HttpResponse.json([db.household])),
  http.post(u('/households'), async ({ request }) => {
    const body = (await request.json()) as CreateHouseholdRequest;
    db.household = { ...db.household, name: body.name };
    return HttpResponse.json(db.household);
  }),
  http.post(u('/households/join'), async ({ request }) => {
    const body = (await request.json()) as JoinHouseholdRequest;
    if (body.inviteCode.toUpperCase() !== db.household.inviteCode) return err('NOT_FOUND', 404);
    return HttpResponse.json(db.household);
  }),
  http.patch(u('/households/:id'), async ({ request }) => {
    const body = (await request.json()) as UpdateHouseholdRequest;
    db.household = { ...db.household, name: body.name };
    return HttpResponse.json(db.household);
  }),
  http.post(u('/households/:id/invite-code'), async () => {
    db.household = { ...db.household, inviteCode: uuid().slice(0, 6).toUpperCase() };
    return HttpResponse.json(db.household);
  }),
  http.delete(u('/households/:id/members/me'), async () => HttpResponse.json({ ok: true })),
  http.get(u('/profile'), async () => HttpResponse.json(db.profile)),
  http.patch(u('/profile'), async ({ request }) => {
    const body = (await request.json()) as UpdateProfileRequest;
    db.profile = { ...db.profile, ...body };
    return HttpResponse.json(db.profile);
  }),

  /* ---------- Catalog ---------- */
  http.get(u('/ingredients'), async ({ request }) => {
    const q = new URL(request.url).searchParams.get('q')?.toLowerCase() ?? '';
    const items = db.ingredients.filter(
      (i) =>
        i.canonicalNameEn.toLowerCase().includes(q) ||
        i.canonicalNameAr.includes(q) ||
        i.aliases.some((a) => a.toLowerCase().includes(q)),
    );
    return HttpResponse.json({ items, nextCursor: null });
  }),
  http.post(u('/ingredients'), async ({ request }) => {
    const body = (await request.json()) as CreateIngredientRequest;
    const ingredient = {
      id: uuid(),
      canonicalNameEn: body.canonicalNameEn,
      canonicalNameAr: body.canonicalNameAr,
      category: body.category,
      defaultUnit: body.defaultUnit,
      aliases: body.aliases ?? [],
      isStaple: body.isStaple ?? false,
      createdAt: iso(),
    };
    db.ingredients.push(ingredient);
    db.ingredientsById.set(ingredient.id, ingredient);
    return HttpResponse.json(ingredient);
  }),

  /* ---------- Storage & inventory ---------- */
  http.get(u('/inventory/locations'), async () => HttpResponse.json(db.locations)),
  http.post(u('/inventory/locations'), async ({ request }) => {
    const body = (await request.json()) as CreateStorageLocationRequest;
    const location = { id: uuid(), householdId: db.household.id, name: body.name, type: body.type };
    db.locations.push(location);
    return HttpResponse.json(location);
  }),
  http.delete(u('/inventory/locations/:id'), async ({ params }) => {
    db.locations = db.locations.filter((l) => l.id !== params.id);
    return HttpResponse.json({ ok: true });
  }),
  http.get(u('/inventory/items'), async ({ request }) => {
    const sp = new URL(request.url).searchParams;
    const locationId = sp.get('locationId');
    const category = sp.get('category');
    const q = sp.get('q')?.toLowerCase() ?? '';
    const within = sp.get('expiringWithinDays');
    const sort = sp.get('sort') ?? 'expiry';

    let items = [...db.inventory];
    if (locationId) items = items.filter((i) => i.locationId === locationId);
    if (category) items = items.filter((i) => i.ingredient.category === category);
    if (q)
      items = items.filter(
        (i) =>
          i.ingredient.canonicalNameEn.toLowerCase().includes(q) ||
          i.ingredient.canonicalNameAr.includes(q),
      );
    if (within) {
      const limit = dateFromNow(Number(within));
      items = items.filter((i) => i.expiresAt !== null && i.expiresAt <= limit);
    }
    items.sort((a, b) => {
      if (sort === 'name') return a.ingredient.canonicalNameEn.localeCompare(b.ingredient.canonicalNameEn);
      if (sort === 'recent') return b.createdAt.localeCompare(a.createdAt);
      const ae = a.expiresAt ?? '9999-12-31';
      const be = b.expiresAt ?? '9999-12-31';
      return ae.localeCompare(be);
    });
    return HttpResponse.json({ items, nextCursor: null });
  }),
  http.post(/\/inventory\/items:bulk(\?|$)/, async ({ request }) => {
    const body = (await request.json()) as BulkCreateInventoryRequest;
    const created: InventoryItem[] = body.items.map((item) => {
      const ingredient =
        (item.ingredientId ? db.ingredientsById.get(item.ingredientId) : undefined) ??
        db.ingredients.find(
          (i) => i.canonicalNameEn.toLowerCase() === item.rawName?.toLowerCase(),
        ) ??
        db.ingredients[0]!;
      return {
        id: uuid(),
        householdId: db.household.id,
        ingredient,
        brand: item.brand ?? null,
        locationId: item.locationId,
        quantity: item.quantity,
        unit: item.unit,
        expiresAt: item.expiresAt ?? null,
        source: item.source,
        confidence: item.confidence ?? null,
        photoKey: item.photoKey ?? null,
        createdAt: iso(),
        updatedAt: iso(),
      };
    });
    db.inventory.push(...created);
    return HttpResponse.json(created);
  }),
  http.patch(u('/inventory/items/:id'), async ({ params, request }) => {
    const body = (await request.json()) as UpdateInventoryItemRequest;
    const item = db.inventory.find((i) => i.id === params.id);
    if (!item) return err('NOT_FOUND', 404);
    Object.assign(item, body, { updatedAt: iso() });
    return HttpResponse.json(item);
  }),
  http.delete(u('/inventory/items/:id'), async ({ params }) => {
    db.inventory = db.inventory.filter((i) => i.id !== params.id);
    return HttpResponse.json({ ok: true });
  }),
  http.get(u('/inventory/events'), async () => HttpResponse.json([])),
  http.post(/\/inventory\/events:sync(\?|$)/, async ({ request }) => {
    const body = (await request.json()) as { events: { clientEventId: string }[] };
    return HttpResponse.json({
      applied: body.events.map((e) => e.clientEventId),
      skipped: [],
      items: [],
    });
  }),

  /* ---------- Uploads & capture ---------- */
  http.post(u('/uploads/presign'), async () =>
    HttpResponse.json({
      uploadUrl: `${API_URL}/mock-upload/${uuid()}`,
      key: `mock/${uuid()}.jpg`,
      headers: {},
      expiresIn: 900,
    }),
  ),
  http.post(u('/inventory/recognize'), async ({ request }) => {
    const body = (await request.json()) as { locationHint?: 'fridge' | 'freezer' | 'pantry' | 'spice_rack' };
    const session = buildRecognitionSession(body.locationHint);
    db.recognitions.set(session.id, session);
    return HttpResponse.json(session);
  }),
  http.get(u('/inventory/recognition-sessions/:id'), async ({ params }) => {
    const session = db.recognitions.get(params.id as string);
    if (!session) return err('NOT_FOUND', 404);
    return HttpResponse.json(session);
  }),
  http.get(u('/inventory/lookup'), async ({ request }) => {
    const barcode = new URL(request.url).searchParams.get('barcode') ?? '';
    if (barcode.startsWith('0')) {
      return HttpResponse.json({
        found: false,
        productName: null,
        brand: null,
        imageUrl: null,
        match: null,
        suggestedQuantity: null,
        suggestedUnit: null,
      });
    }
    const ingredient = db.ingredientsByKey.get('chickpeas')!;
    return HttpResponse.json({
      found: true,
      productName: 'Canned Chickpeas 400g',
      brand: 'Al Wadi',
      imageUrl: 'https://picsum.photos/seed/barcode/400/400',
      match: { ingredientId: ingredient.id, strategy: 'alias', confidence: 0.9, rawName: 'Canned Chickpeas' },
      suggestedQuantity: 400,
      suggestedUnit: 'g',
    });
  }),
  http.post(u('/inventory/receipts'), async () => {
    const session = buildRecognitionSession('pantry');
    db.recognitions.set(session.id, session);
    const id = uuid();
    db.jobs.set(id, {
      id,
      type: 'receipt.parse',
      polls: 0,
      createdAt: iso(),
      resultKind: 'recognition_session',
      resultId: session.id,
    });
    return HttpResponse.json(jobView(id));
  }),

  /* ---------- Jobs ---------- */
  http.get(u('/jobs/:id'), async ({ params }) => {
    const job = db.jobs.get(params.id as string);
    if (!job) return err('NOT_FOUND', 404);
    return HttpResponse.json(jobView(job.id));
  }),

  /* ---------- Recipes ---------- */
  http.get(u('/recipes/:id'), async ({ params, request }) => {
    const seed = db.seedById.get(params.id as string);
    if (!seed) return err('NOT_FOUND', 404);
    return HttpResponse.json(projectRecipe(seed, localeFrom(request)));
  }),
  http.get(u('/recipes/:id/videos'), async ({ params, request }) => {
    const seed = db.seedById.get(params.id as string);
    if (!seed) return err('NOT_FOUND', 404);
    return HttpResponse.json(projectRecipe(seed, localeFrom(request)).videos);
  }),
  http.post(u('/recipes/:id/cooked'), async ({ params }) => {
    const seed = db.seedById.get(params.id as string);
    if (!seed) return err('NOT_FOUND', 404);
    const deductedItemIds: string[] = [];
    const missingIngredientIds: string[] = [];
    for (const ri of seed.ingredients) {
      const ingredient = db.ingredientsByKey.get(ri.ref)!;
      if (ingredient.isStaple) continue;
      const item = db.inventory.find((i) => i.ingredient.id === ingredient.id && i.unit === ri.unit);
      if (item && item.quantity >= ri.quantity) {
        item.quantity -= ri.quantity;
        item.updatedAt = iso();
        deductedItemIds.push(item.id);
      } else if (!ri.optional) {
        missingIngredientIds.push(ingredient.id);
      }
    }
    return HttpResponse.json({ deductedItemIds, missingIngredientIds });
  }),

  /* ---------- Meal plans ---------- */
  http.get(u('/meal-plans'), async ({ request }) => {
    const scope = new URL(request.url).searchParams.get('scope');
    const locale = localeFrom(request);
    let plans = db.plans;
    if (scope) plans = plans.filter((p) => p.scope === scope);
    return HttpResponse.json(plans.map((p) => projectPlan(p, locale)));
  }),
  http.post(u('/meal-plans'), async ({ request }) => {
    const body = (await request.json()) as GeneratePlanRequest;
    const locale = localeFrom(request, body.locale);
    const planId = generatePlan(body, locale);
    const jobId = uuid();
    db.jobs.set(jobId, {
      id: jobId,
      type: 'plan.generate',
      polls: 0,
      createdAt: iso(),
      resultKind: 'meal_plan',
      resultId: planId,
    });
    return HttpResponse.json(jobView(jobId));
  }),
  http.get(u('/meal-plans/:id'), async ({ params, request }) => {
    const plan = db.plans.find((p) => p.id === params.id);
    if (!plan) return err('NOT_FOUND', 404);
    return HttpResponse.json(projectPlan(plan, localeFrom(request)));
  }),
  http.delete(u('/meal-plans/:id'), async ({ params }) => {
    db.plans = db.plans.filter((p) => p.id !== params.id);
    return HttpResponse.json({ ok: true });
  }),
  http.get(u('/meal-plans/:id/coverage'), async ({ params }) => {
    const plan = db.plans.find((p) => p.id === params.id);
    if (!plan) return err('NOT_FOUND', 404);
    return HttpResponse.json(computePlanCoverage(plan));
  }),
  http.patch(u('/meal-plans/:id/entries/:entryId'), async ({ params, request }) => {
    const plan = db.plans.find((p) => p.id === params.id);
    const entry = plan?.entries.find((e) => e.id === params.entryId);
    if (!plan || !entry) return err('NOT_FOUND', 404);
    const body = (await request.json()) as UpdateEntryRequest;
    Object.assign(entry, body);
    return HttpResponse.json(projectEntry(entry, localeFrom(request), plan.id));
  }),
  http.post(u('/meal-plans/:id/entries/:entryId/regenerate'), async ({ params, request }) => {
    const plan = db.plans.find((p) => p.id === params.id);
    const entry = plan?.entries.find((e) => e.id === params.entryId);
    if (!plan || !entry) return err('NOT_FOUND', 404);
    const body = (await request.json().catch(() => ({}))) as RegenerateEntryRequest;
    const excluded = new Set(body.excludeRecipeIds ?? []);
    const next =
      GEN_POOL.map((k) => db.recipeIdByKey.get(k)!).find(
        (id) => id !== db.recipeIdByKey.get(entry.recipeKey) && !excluded.has(id),
      ) ?? db.recipeIdByKey.get(entry.recipeKey)!;
    entry.recipeKey = [...db.recipeIdByKey.entries()].find(([, id]) => id === next)![0];
    return HttpResponse.json(projectEntry(entry, localeFrom(request), plan.id));
  }),

  /* ---------- Shopping ---------- */
  http.get(u('/shopping-list'), async () => HttpResponse.json(db.shopping)),
  http.post(u('/shopping-list'), async ({ request }) => {
    const body = (await request.json()) as AddShoppingItemsRequest;
    const created: ShoppingListItem[] = body.items.map((item) => {
      const ingredient = db.ingredientsById.get(item.ingredientId);
      return {
        id: uuid(),
        planId: body.planId ?? null,
        ingredientId: item.ingredientId,
        nameEn: ingredient?.canonicalNameEn ?? 'Item',
        nameAr: ingredient?.canonicalNameAr ?? 'عنصر',
        quantity: item.quantity,
        unit: item.unit,
        purchased: false,
        purchasedAt: null,
      };
    });
    db.shopping.push(...created);
    return HttpResponse.json(db.shopping);
  }),
  http.patch(u('/shopping-list/:id'), async ({ params, request }) => {
    const item = db.shopping.find((s) => s.id === params.id);
    if (!item) return err('NOT_FOUND', 404);
    const body = (await request.json()) as ToggleShoppingItemRequest;
    item.purchased = body.purchased;
    item.purchasedAt = body.purchased ? iso() : null;
    return HttpResponse.json(item);
  }),
  http.post(u('/shopping-list/checkout'), async ({ request }) => {
    const body = (await request.json()) as CheckoutShoppingRequest;
    const moved = db.shopping.filter((s) => body.itemIds.includes(s.id));
    const created: InventoryItem[] = moved.map((s) => {
      const ingredient = db.ingredientsById.get(s.ingredientId) ?? db.ingredients[0]!;
      return {
        id: uuid(),
        householdId: db.household.id,
        ingredient,
        brand: null,
        locationId: body.locationId,
        quantity: s.quantity,
        unit: s.unit,
        expiresAt: null,
        source: 'manual',
        confidence: null,
        photoKey: null,
        createdAt: iso(),
        updatedAt: iso(),
      };
    });
    db.inventory.push(...created);
    db.shopping = db.shopping.filter((s) => !body.itemIds.includes(s.id));
    return HttpResponse.json(created);
  }),

  /* ---------- Feedback ---------- */
  http.post(u('/feedback'), async ({ request }) => {
    const body = (await request.json()) as {
      rating: number;
      message?: string;
      platform: 'ios' | 'android' | 'web';
      appVersion: string;
      locale: Locale;
    };
    const author = db.user;
    if (!author) return err('UNAUTHENTICATED', 401);
    const record = {
      id: uuid(),
      rating: body.rating,
      message: body.message ?? null,
      platform: body.platform,
      appVersion: body.appVersion,
      locale: body.locale,
      status: 'new' as const,
      createdAt: iso(),
      adminNote: null,
      reviewedAt: null,
      submitter: {
        id: author.id,
        email: author.email,
        displayName: author.displayName,
        locale: author.locale,
        joinedAt: author.createdAt,
      },
    };
    db.feedback.unshift(record);
    return HttpResponse.json({ id: record.id, createdAt: record.createdAt }, { status: 201 });
  }),

  /* ---------- Admin ---------- */
  http.get(u('/admin/feedback/stats'), () => {
    const all = db.feedback;
    const byStatus = { new: 0, triaged: 0, resolved: 0, wont_fix: 0 };
    const byRating: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    for (const item of all) {
      byStatus[item.status] += 1;
      byRating[String(item.rating)] = (byRating[String(item.rating)] ?? 0) + 1;
    }
    const total = all.length;
    const averageRating =
      total === 0
        ? null
        : Math.round((all.reduce((sum, i) => sum + i.rating, 0) / total) * 100) / 100;
    return HttpResponse.json({ total, averageRating, byStatus, byRating });
  }),

  http.get(u('/admin/feedback'), ({ request }) => {
    const params = new URL(request.url).searchParams;
    const status = params.get('status');
    const rating = params.get('rating');
    const platform = params.get('platform');
    const limit = Number(params.get('limit') ?? 50);
    const cursor = params.get('cursor');
    const offset = cursor ? Number(decodeMockCursor(cursor)) : 0;

    const filtered = db.feedback.filter(
      (item) =>
        (!status || item.status === status) &&
        (!rating || item.rating === Number(rating)) &&
        (!platform || item.platform === platform),
    );
    const page = filtered.slice(offset, offset + limit);
    const nextCursor = offset + limit < filtered.length ? encodeMockCursor(offset + limit) : null;

    return HttpResponse.json({
      items: page.map(({ submitter: _submitter, adminNote: _note, reviewedAt: _at, ...rest }) => rest),
      nextCursor,
    });
  }),

  http.get(u('/admin/feedback/:id'), ({ params }) => {
    const item = db.feedback.find((f) => f.id === params.id);
    return item ? HttpResponse.json(item) : err('NOT_FOUND', 404);
  }),

  http.patch(u('/admin/feedback/:id'), async ({ params, request }) => {
    const item = db.feedback.find((f) => f.id === params.id);
    if (!item) return err('NOT_FOUND', 404);
    const body = (await request.json()) as { status?: typeof item.status; adminNote?: string | null };
    if (body.status !== undefined) item.status = body.status;
    if (body.adminNote !== undefined) item.adminNote = body.adminNote;
    item.reviewedAt = iso();
    return HttpResponse.json(item);
  }),

  /* ---------- Usage ---------- */
  http.get(u('/ai/usage'), async () =>
    HttpResponse.json({
      householdId: db.household.id,
      day: dateFromNow(0),
      spentUsd: 0.42,
      budgetUsd: 2,
      callCount: 7,
    }),
  ),
];

/* ------------------------------------------------------------------ */
/* Job projection — advances a step on every poll                      */
/* ------------------------------------------------------------------ */

function jobView(id: string) {
  const job = db.jobs.get(id)!;
  job.polls += 1;
  const status = job.fail ? 'failed' : job.polls >= 3 ? 'done' : job.polls === 2 ? 'running' : 'queued';
  const progress = job.fail ? 0 : job.polls >= 3 ? 1 : job.polls === 2 ? 0.5 : 0.1;

  if (status === 'done' && job.resultKind === 'meal_plan') {
    const plan = db.plans.find((p) => p.id === job.resultId);
    if (plan) plan.status = 'ready';
  }

  return {
    id: job.id,
    type: job.type,
    status,
    progress,
    resultRef: status === 'done' ? { kind: job.resultKind, id: job.resultId } : null,
    error: status === 'failed' ? { code: 'JOB_FAILED', messageKey: 'errors.JOB_FAILED' } : null,
    createdAt: job.createdAt,
    finishedAt: status === 'done' || status === 'failed' ? iso() : null,
  };
}
