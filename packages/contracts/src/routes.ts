import { z } from 'zod';
import {
  loginRequestSchema,
  oauthLoginRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
  sessionSchema,
  tokenPairSchema,
  updateMeRequestSchema,
  userSchema,
} from './auth.js';
import {
  createHouseholdRequestSchema,
  householdSchema,
  joinHouseholdRequestSchema,
  profileSchema,
  updateHouseholdRequestSchema,
  updateProfileRequestSchema,
} from './household.js';
import {
  createIngredientRequestSchema,
  ingredientSchema,
  searchIngredientsQuerySchema,
} from './catalog.js';
import {
  bulkCreateInventoryRequestSchema,
  createStorageLocationRequestSchema,
  inventoryEventSchema,
  inventoryItemSchema,
  listInventoryQuerySchema,
  presignUploadRequestSchema,
  presignUploadResponseSchema,
  storageLocationSchema,
  syncEventsRequestSchema,
  syncEventsResponseSchema,
  updateInventoryItemRequestSchema,
} from './inventory.js';
import {
  getRecipeQuerySchema,
  markCookedRequestSchema,
  markCookedResponseSchema,
  recipeSchema,
  recipeVideoSchema,
} from './recipe.js';
import {
  addShoppingItemsRequestSchema,
  checkoutShoppingRequestSchema,
  generatePlanRequestSchema,
  listPlansQuerySchema,
  mealPlanEntrySchema,
  mealPlanSchema,
  planCoverageSchema,
  regenerateEntryRequestSchema,
  shoppingListItemSchema,
  toggleShoppingItemRequestSchema,
  updateEntryRequestSchema,
} from './plan.js';
import {
  aiUsageSummarySchema,
  barcodeLookupQuerySchema,
  barcodeLookupResponseSchema,
  jobSchema,
  parseReceiptRequestSchema,
  recognitionSessionSchema,
  recognizeRequestSchema,
} from './ai.js';
import { idParamSchema, paginatedSchema, uuidSchema } from './common.js';

/**
 * Single registry of every HTTP endpoint. `@kitchen/api-client` and the MSW
 * mock handlers used by the web and mobile apps are both derived from this, so
 * a route can never drift between client and server.
 *
 * Path params are written as `:name`.
 *   auth      — requires a bearer access token
 *   household — requires the `x-household-id` header
 */
export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  auth: boolean;
  household: boolean;
  params?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  body?: z.ZodTypeAny;
  response: z.ZodTypeAny;
}

const emptyResponse = z.object({ ok: z.literal(true) });
const planEntryIdParam = z.object({ id: uuidSchema, entryId: uuidSchema });

export const routes = {
  /* ---------------- Auth ---------------- */
  register: {
    method: 'POST',
    path: '/auth/register',
    auth: false,
    household: false,
    body: registerRequestSchema,
    response: sessionSchema,
  },
  login: {
    method: 'POST',
    path: '/auth/login',
    auth: false,
    household: false,
    body: loginRequestSchema,
    response: sessionSchema,
  },
  oauthLogin: {
    method: 'POST',
    path: '/auth/oauth',
    auth: false,
    household: false,
    body: oauthLoginRequestSchema,
    response: sessionSchema,
  },
  refresh: {
    method: 'POST',
    path: '/auth/refresh',
    auth: false,
    household: false,
    body: refreshRequestSchema,
    response: tokenPairSchema,
  },
  logout: {
    method: 'POST',
    path: '/auth/logout',
    auth: true,
    household: false,
    body: refreshRequestSchema,
    response: emptyResponse,
  },
  getMe: {
    method: 'GET',
    path: '/me',
    auth: true,
    household: false,
    response: userSchema,
  },
  updateMe: {
    method: 'PATCH',
    path: '/me',
    auth: true,
    household: false,
    body: updateMeRequestSchema,
    response: userSchema,
  },

  /* ---------------- Households & profile ---------------- */
  listHouseholds: {
    method: 'GET',
    path: '/households',
    auth: true,
    household: false,
    response: z.array(householdSchema),
  },
  createHousehold: {
    method: 'POST',
    path: '/households',
    auth: true,
    household: false,
    body: createHouseholdRequestSchema,
    response: householdSchema,
  },
  joinHousehold: {
    method: 'POST',
    path: '/households/join',
    auth: true,
    household: false,
    body: joinHouseholdRequestSchema,
    response: householdSchema,
  },
  updateHousehold: {
    method: 'PATCH',
    path: '/households/:id',
    auth: true,
    household: false,
    params: idParamSchema,
    body: updateHouseholdRequestSchema,
    response: householdSchema,
  },
  rotateInviteCode: {
    method: 'POST',
    path: '/households/:id/invite-code',
    auth: true,
    household: false,
    params: idParamSchema,
    response: householdSchema,
  },
  leaveHousehold: {
    method: 'DELETE',
    path: '/households/:id/members/me',
    auth: true,
    household: false,
    params: idParamSchema,
    response: emptyResponse,
  },
  getProfile: {
    method: 'GET',
    path: '/profile',
    auth: true,
    household: false,
    response: profileSchema,
  },
  updateProfile: {
    method: 'PATCH',
    path: '/profile',
    auth: true,
    household: false,
    body: updateProfileRequestSchema,
    response: profileSchema,
  },

  /* ---------------- Catalog ---------------- */
  searchIngredients: {
    method: 'GET',
    path: '/ingredients',
    auth: true,
    household: false,
    query: searchIngredientsQuerySchema,
    response: paginatedSchema(ingredientSchema),
  },
  createIngredient: {
    method: 'POST',
    path: '/ingredients',
    auth: true,
    household: false,
    body: createIngredientRequestSchema,
    response: ingredientSchema,
  },

  /* ---------------- Storage & inventory ---------------- */
  listLocations: {
    method: 'GET',
    path: '/inventory/locations',
    auth: true,
    household: true,
    response: z.array(storageLocationSchema),
  },
  createLocation: {
    method: 'POST',
    path: '/inventory/locations',
    auth: true,
    household: true,
    body: createStorageLocationRequestSchema,
    response: storageLocationSchema,
  },
  deleteLocation: {
    method: 'DELETE',
    path: '/inventory/locations/:id',
    auth: true,
    household: true,
    params: idParamSchema,
    response: emptyResponse,
  },
  listInventory: {
    method: 'GET',
    path: '/inventory/items',
    auth: true,
    household: true,
    query: listInventoryQuerySchema,
    response: paginatedSchema(inventoryItemSchema),
  },
  getInventoryItem: {
    method: 'GET',
    path: '/inventory/items/:id',
    auth: true,
    household: true,
    params: idParamSchema,
    response: inventoryItemSchema,
  },
  bulkCreateInventory: {
    method: 'POST',
    path: '/inventory/items:bulk',
    auth: true,
    household: true,
    body: bulkCreateInventoryRequestSchema,
    response: z.array(inventoryItemSchema),
  },
  updateInventoryItem: {
    method: 'PATCH',
    path: '/inventory/items/:id',
    auth: true,
    household: true,
    params: idParamSchema,
    body: updateInventoryItemRequestSchema,
    response: inventoryItemSchema,
  },
  deleteInventoryItem: {
    method: 'DELETE',
    path: '/inventory/items/:id',
    auth: true,
    household: true,
    params: idParamSchema,
    response: emptyResponse,
  },
  listInventoryEvents: {
    method: 'GET',
    path: '/inventory/events',
    auth: true,
    household: true,
    response: z.array(inventoryEventSchema),
  },
  syncInventoryEvents: {
    method: 'POST',
    path: '/inventory/events:sync',
    auth: true,
    household: true,
    body: syncEventsRequestSchema,
    response: syncEventsResponseSchema,
  },

  /* ---------------- Uploads & capture ---------------- */
  presignUpload: {
    method: 'POST',
    path: '/uploads/presign',
    auth: true,
    household: true,
    body: presignUploadRequestSchema,
    response: presignUploadResponseSchema,
  },
  recognizePhotos: {
    method: 'POST',
    path: '/inventory/recognize',
    auth: true,
    household: true,
    body: recognizeRequestSchema,
    response: recognitionSessionSchema,
  },
  lookupBarcode: {
    method: 'GET',
    path: '/inventory/lookup',
    auth: true,
    household: true,
    query: barcodeLookupQuerySchema,
    response: barcodeLookupResponseSchema,
  },
  parseReceipt: {
    method: 'POST',
    path: '/inventory/receipts',
    auth: true,
    household: true,
    body: parseReceiptRequestSchema,
    response: jobSchema,
  },
  getRecognitionSession: {
    method: 'GET',
    path: '/inventory/recognition-sessions/:id',
    auth: true,
    household: true,
    params: idParamSchema,
    response: recognitionSessionSchema,
  },

  /* ---------------- Jobs ---------------- */
  getJob: {
    method: 'GET',
    path: '/jobs/:id',
    auth: true,
    household: true,
    params: idParamSchema,
    response: jobSchema,
  },

  /* ---------------- Recipes ---------------- */
  getRecipe: {
    method: 'GET',
    path: '/recipes/:id',
    auth: true,
    household: true,
    params: idParamSchema,
    query: getRecipeQuerySchema,
    response: recipeSchema,
  },
  getRecipeVideos: {
    method: 'GET',
    path: '/recipes/:id/videos',
    auth: true,
    household: true,
    params: idParamSchema,
    response: z.array(recipeVideoSchema),
  },
  markRecipeCooked: {
    method: 'POST',
    path: '/recipes/:id/cooked',
    auth: true,
    household: true,
    params: idParamSchema,
    body: markCookedRequestSchema,
    response: markCookedResponseSchema,
  },

  /* ---------------- Meal plans ---------------- */
  listPlans: {
    method: 'GET',
    path: '/meal-plans',
    auth: true,
    household: true,
    query: listPlansQuerySchema,
    response: z.array(mealPlanSchema),
  },
  generatePlan: {
    method: 'POST',
    path: '/meal-plans',
    auth: true,
    household: true,
    body: generatePlanRequestSchema,
    response: jobSchema,
  },
  getPlan: {
    method: 'GET',
    path: '/meal-plans/:id',
    auth: true,
    household: true,
    params: idParamSchema,
    response: mealPlanSchema,
  },
  deletePlan: {
    method: 'DELETE',
    path: '/meal-plans/:id',
    auth: true,
    household: true,
    params: idParamSchema,
    response: emptyResponse,
  },
  getPlanCoverage: {
    method: 'GET',
    path: '/meal-plans/:id/coverage',
    auth: true,
    household: true,
    params: idParamSchema,
    response: planCoverageSchema,
  },
  updatePlanEntry: {
    method: 'PATCH',
    path: '/meal-plans/:id/entries/:entryId',
    auth: true,
    household: true,
    params: planEntryIdParam,
    body: updateEntryRequestSchema,
    response: mealPlanEntrySchema,
  },
  regeneratePlanEntry: {
    method: 'POST',
    path: '/meal-plans/:id/entries/:entryId/regenerate',
    auth: true,
    household: true,
    params: planEntryIdParam,
    body: regenerateEntryRequestSchema,
    response: mealPlanEntrySchema,
  },

  /* ---------------- Shopping ---------------- */
  getShoppingList: {
    method: 'GET',
    path: '/shopping-list',
    auth: true,
    household: true,
    response: z.array(shoppingListItemSchema),
  },
  addShoppingItems: {
    method: 'POST',
    path: '/shopping-list',
    auth: true,
    household: true,
    body: addShoppingItemsRequestSchema,
    response: z.array(shoppingListItemSchema),
  },
  toggleShoppingItem: {
    method: 'PATCH',
    path: '/shopping-list/:id',
    auth: true,
    household: true,
    params: idParamSchema,
    body: toggleShoppingItemRequestSchema,
    response: shoppingListItemSchema,
  },
  checkoutShopping: {
    method: 'POST',
    path: '/shopping-list/checkout',
    auth: true,
    household: true,
    body: checkoutShoppingRequestSchema,
    response: z.array(inventoryItemSchema),
  },

  /* ---------------- Usage ---------------- */
  getAiUsage: {
    method: 'GET',
    path: '/ai/usage',
    auth: true,
    household: true,
    response: aiUsageSummarySchema,
  },
} as const satisfies Record<string, RouteDefinition>;

export type Routes = typeof routes;
export type RouteName = keyof Routes;

export type RouteBody<K extends RouteName> = Routes[K] extends { body: infer B }
  ? B extends z.ZodTypeAny
    ? z.input<B>
    : never
  : never;

export type RouteQuery<K extends RouteName> = Routes[K] extends { query: infer Q }
  ? Q extends z.ZodTypeAny
    ? z.input<Q>
    : never
  : never;

export type RouteParams<K extends RouteName> = Routes[K] extends { params: infer P }
  ? P extends z.ZodTypeAny
    ? z.infer<P>
    : never
  : never;

export type RouteResponse<K extends RouteName> = z.infer<Routes[K]['response']>;
