import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

/* ------------------------------------------------------------------ */
/* Enums — kept in sync with @kitchen/contracts                        */
/* ------------------------------------------------------------------ */

export const localeEnum = pgEnum('locale', ['en', 'ar']);
export const householdRoleEnum = pgEnum('household_role', ['owner', 'member']);
export const userRoleEnum = pgEnum('user_role', ['user', 'staff']);
export const feedbackStatusEnum = pgEnum('feedback_status', ['new', 'triaged', 'resolved', 'wont_fix']);
export const feedbackPlatformEnum = pgEnum('feedback_platform', ['ios', 'android', 'web']);
export const oauthProviderEnum = pgEnum('oauth_provider', ['apple', 'google']);
export const storageLocationTypeEnum = pgEnum('storage_location_type', [
  'fridge',
  'freezer',
  'pantry',
  'spice_rack',
  'other',
]);
export const ingredientCategoryEnum = pgEnum('ingredient_category', [
  'vegetable',
  'fruit',
  'meat',
  'poultry',
  'seafood',
  'dairy',
  'egg',
  'grain',
  'legume',
  'pasta',
  'bread',
  'spice',
  'herb',
  'condiment',
  'oil',
  'sweetener',
  'nut',
  'beverage',
  'frozen',
  'canned',
  'baking',
  'other',
]);
export const unitEnum = pgEnum('unit', [
  'g',
  'kg',
  'ml',
  'l',
  'piece',
  'bunch',
  'clove',
  'slice',
  'can',
  'jar',
  'packet',
  'bottle',
  'cup',
  'tbsp',
  'tsp',
  'pinch',
]);
export const inventorySourceEnum = pgEnum('inventory_source', [
  'photo',
  'manual',
  'barcode',
  'receipt',
]);
export const inventoryEventReasonEnum = pgEnum('inventory_event_reason', [
  'added',
  'consumed',
  'expired',
  'corrected',
  'purchased',
]);
export const mealSlotEnum = pgEnum('meal_slot', ['breakfast', 'lunch', 'dinner', 'snack']);
export const planScopeEnum = pgEnum('plan_scope', ['daily', 'weekly', 'monthly']);
export const planStatusEnum = pgEnum('plan_status', ['generating', 'ready', 'failed']);
export const entryStateEnum = pgEnum('entry_state', ['planned', 'cooked', 'skipped']);
export const difficultyEnum = pgEnum('difficulty', ['easy', 'medium', 'hard']);
export const generatedByEnum = pgEnum('generated_by', ['ai', 'user']);
export const jobTypeEnum = pgEnum('job_type', [
  'receipt.parse',
  'plan.generate',
  'recipe.translate',
  'video.fetch',
]);
export const jobStatusEnum = pgEnum('job_status', ['queued', 'running', 'done', 'failed']);

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash'),
    displayName: text('display_name').notNull(),
    locale: localeEnum('locale').notNull().default('en'),
    role: userRoleEnum('role').notNull().default('user'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_email_key').on(sql`lower(${table.email})`)],
);

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: oauthProviderEnum('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    /**
     * Apple refresh token, AES-256-GCM ciphertext (see `auth/token-crypto.ts`).
     * Null for Google, and for Apple links created before revocation shipped.
     */
    refreshTokenEncrypted: text('refresh_token_encrypted'),
    /**
     * The `aud` the identity token was validated against. APPLE_CLIENT_ID is a
     * comma-separated list because Apple uses the bundle id natively and the
     * Services ID on the web; the revoke call must present the right one.
     */
    revokeClientId: text('revoke_client_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('oauth_provider_account_key').on(table.provider, table.providerAccountId),
    index('oauth_user_idx').on(table.userId),
  ],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('refresh_token_hash_key').on(table.tokenHash),
    index('refresh_user_idx').on(table.userId),
  ],
);

export const households = pgTable(
  'households',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    inviteCode: text('invite_code').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('households_invite_code_key').on(table.inviteCode)],
);

export const householdMembers = pgTable(
  'household_members',
  {
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: householdRoleEnum('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.householdId, table.userId] }),
    index('household_members_user_idx').on(table.userId),
  ],
);

export const profiles = pgTable('profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  dietaryPrefs: text('dietary_prefs').array().notNull().default(sql`ARRAY[]::text[]`),
  allergies: text('allergies').array().notNull().default(sql`ARRAY[]::text[]`),
  halal: boolean('halal').notNull().default(false),
  cuisinePrefs: text('cuisine_prefs').array().notNull().default(sql`ARRAY[]::text[]`),
  householdSize: integer('household_size').notNull().default(2),
  healthGoals: text('health_goals').array().notNull().default(sql`ARRAY[]::text[]`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const reminderSettings = pgTable('reminder_settings', {
  householdId: uuid('household_id')
    .primaryKey()
    .references(() => households.id, { onDelete: 'cascade' }),
  breakEnabled: boolean('break_enabled').notNull().default(true),
  stretchEnabled: boolean('stretch_enabled').notNull().default(true),
  morningEnabled: boolean('morning_enabled').notNull().default(true),
  hydrationEnabled: boolean('hydration_enabled').notNull().default(true),
  breakCadenceMinutes: integer('break_cadence_minutes').notNull().default(60),
  hydrationGoalCups: integer('hydration_goal_cups').notNull().default(8),
  quietHoursStart: integer('quiet_hours_start').notNull().default(22),
  quietHoursEnd: integer('quiet_hours_end').notNull().default(7),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Catalog & inventory                                                 */
/* ------------------------------------------------------------------ */

export const ingredients = pgTable(
  'ingredients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    canonicalNameEn: text('canonical_name_en').notNull(),
    canonicalNameAr: text('canonical_name_ar').notNull(),
    category: ingredientCategoryEnum('category').notNull(),
    defaultUnit: unitEnum('default_unit').notNull(),
    aliases: text('aliases').array().notNull().default(sql`ARRAY[]::text[]`),
    /** Assumed available during plan validation. See spec §5.4. */
    isStaple: boolean('is_staple').notNull().default(false),
    embedding: vector('embedding', { dimensions: 1536 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('ingredients_name_en_key').on(sql`lower(${table.canonicalNameEn})`),
    index('ingredients_category_idx').on(table.category),
    index('ingredients_aliases_idx').using('gin', table.aliases),
    index('ingredients_embedding_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
  ],
);

export const storageLocations = pgTable(
  'storage_locations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: storageLocationTypeEnum('type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('storage_locations_household_idx').on(table.householdId)],
);

export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'restrict' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => storageLocations.id, { onDelete: 'cascade' }),
    /** Materialized current state; the source of truth is `inventory_events`. */
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    unit: unitEnum('unit').notNull(),
    /**
     * Manufacturer from a barcode lookup. Deliberately not part of
     * `inventory_unique_slot`: two brands of the same ingredient in one place
     * stay a single pooled row, and the column goes null when they disagree.
     */
    brand: text('brand'),
    expiresAt: date('expires_at'),
    source: inventorySourceEnum('source').notNull(),
    confidence: numeric('confidence', { precision: 4, scale: 3 }),
    photoKey: text('photo_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('inventory_household_idx').on(table.householdId),
    index('inventory_expiry_idx').on(table.householdId, table.expiresAt),
    uniqueIndex('inventory_unique_slot').on(
      table.householdId,
      table.ingredientId,
      table.locationId,
      table.unit,
    ),
  ],
);

export const inventoryEvents = pgTable(
  'inventory_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Client-assigned, making offline replay idempotent. See spec §9. */
    clientEventId: uuid('client_event_id'),
    itemId: uuid('item_id')
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'cascade' }),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    delta: numeric('delta', { precision: 12, scale: 3 }).notNull(),
    unit: unitEnum('unit').notNull(),
    reason: inventoryEventReasonEnum('reason').notNull(),
    mealPlanEntryId: uuid('meal_plan_entry_id'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('inventory_events_client_key').on(table.clientEventId),
    index('inventory_events_item_idx').on(table.itemId),
    index('inventory_events_household_idx').on(table.householdId, table.createdAt),
  ],
);

/* ------------------------------------------------------------------ */
/* Recipes                                                             */
/* ------------------------------------------------------------------ */

export const recipes = pgTable(
  'recipes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Null means globally shared. */
    householdId: uuid('household_id').references(() => households.id, { onDelete: 'cascade' }),
    titleEn: text('title_en'),
    titleAr: text('title_ar'),
    descriptionEn: text('description_en'),
    descriptionAr: text('description_ar'),
    stepsEn: jsonb('steps_en').$type<{ index: number; text: string; durationMinutes: number | null }[]>(),
    stepsAr: jsonb('steps_ar').$type<{ index: number; text: string; durationMinutes: number | null }[]>(),
    prepMinutes: integer('prep_minutes').notNull().default(0),
    cookMinutes: integer('cook_minutes').notNull().default(0),
    servings: integer('servings').notNull().default(2),
    difficulty: difficultyEnum('difficulty').notNull().default('easy'),
    cuisine: text('cuisine'),
    nutrition: jsonb('nutrition').$type<Record<string, number>>(),
    heroImageKey: text('hero_image_key'),
    generatedBy: generatedByEnum('generated_by').notNull().default('ai'),
    sourceModel: text('source_model'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('recipes_household_idx').on(table.householdId)],
);

export const recipeIngredients = pgTable(
  'recipe_ingredients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    unit: unitEnum('unit').notNull(),
    optional: boolean('optional').notNull().default(false),
    note: text('note'),
  },
  (table) => [
    index('recipe_ingredients_recipe_idx').on(table.recipeId),
    index('recipe_ingredients_ingredient_idx').on(table.ingredientId),
  ],
);

export const recipeVideos = pgTable(
  'recipe_videos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    youtubeId: text('youtube_id').notNull(),
    title: text('title').notNull(),
    channel: text('channel').notNull(),
    thumbnailUrl: text('thumbnail_url').notNull(),
    durationSeconds: integer('duration_seconds'),
    locale: localeEnum('locale').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('recipe_video_key').on(table.recipeId, table.youtubeId)],
);

/* ------------------------------------------------------------------ */
/* Planning                                                            */
/* ------------------------------------------------------------------ */

export const mealPlans = pgTable(
  'meal_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    scope: planScopeEnum('scope').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    status: planStatusEnum('status').notNull().default('generating'),
    locale: localeEnum('locale').notNull().default('en'),
    generationParams: jsonb('generation_params').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('meal_plans_household_range_idx').on(table.householdId, table.startsOn)],
);

export const mealPlanEntries = pgTable(
  'meal_plan_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => mealPlans.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    slot: mealSlotEnum('slot').notNull(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'restrict' }),
    servings: integer('servings').notNull(),
    state: entryStateEnum('state').notNull().default('planned'),
    position: integer('position').notNull().default(0),
    fullyCovered: boolean('fully_covered').notNull().default(false),
  },
  (table) => [
    index('meal_plan_entries_plan_idx').on(table.planId, table.date),
    uniqueIndex('meal_plan_entry_slot_key').on(table.planId, table.date, table.slot),
  ],
);

export const shoppingListItems = pgTable(
  'shopping_list_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').references(() => mealPlans.id, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    unit: unitEnum('unit').notNull(),
    purchased: boolean('purchased').notNull().default(false),
    purchasedAt: timestamp('purchased_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('shopping_household_idx').on(table.householdId, table.purchased)],
);

/* ------------------------------------------------------------------ */
/* Infrastructure                                                      */
/* ------------------------------------------------------------------ */

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    type: jobTypeEnum('type').notNull(),
    status: jobStatusEnum('status').notNull().default('queued'),
    idempotencyKey: text('idempotency_key'),
    progress: numeric('progress', { precision: 4, scale: 3 }).notNull().default('0'),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    result: jsonb('result').$type<Record<string, unknown>>(),
    error: jsonb('error').$type<{ code: string; messageKey: string }>(),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('jobs_idempotency_key').on(table.householdId, table.type, table.idempotencyKey),
    index('jobs_household_idx').on(table.householdId, table.createdAt),
  ],
);

export const recognitionSessions = pgTable(
  'recognition_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    photoKeys: text('photo_keys').array().notNull().default(sql`ARRAY[]::text[]`),
    items: jsonb('items').$type<unknown[]>().notNull(),
    emptyPhotoKeys: text('empty_photo_keys').array().notNull().default(sql`ARRAY[]::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('recognition_household_idx').on(table.householdId, table.createdAt)],
);

export const aiUsage = pgTable(
  'ai_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    model: text('model').notNull(),
    operation: text('operation').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('ai_usage_household_day_idx').on(table.householdId, table.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

/**
 * App feedback: a 1–5 rating and an optional message.
 *
 * `ON DELETE CASCADE` on `user_id` is deliberate. Account deletion must have a
 * single erasure path, and the message is free text the user has asked us to
 * forget; keeping an orphaned row for the sake of an average would retain
 * exactly the part we were asked to delete.
 *
 * `platform`, `app_version` and `locale` are captured because a 2★ rating
 * without them is unactionable. None is a device identifier.
 */
export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: smallint('rating').notNull(),
    message: text('message'),
    platform: feedbackPlatformEnum('platform').notNull(),
    appVersion: text('app_version').notNull(),
    locale: localeEnum('locale').notNull(),
    status: feedbackStatusEnum('status').notNull().default('new'),
    adminNote: text('admin_note'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('feedback_rating_range', sql`${table.rating} between 1 and 5`),
    index('feedback_status_created_idx').on(table.status, table.createdAt.desc()),
    index('feedback_created_idx').on(table.createdAt.desc()),
    index('feedback_user_created_idx').on(table.userId, table.createdAt.desc()),
  ],
);

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export const usersRelations = relations(users, ({ many, one }) => ({
  memberships: many(householdMembers),
  profile: one(profiles, { fields: [users.id], references: [profiles.userId] }),
}));

export const householdsRelations = relations(households, ({ many }) => ({
  members: many(householdMembers),
  locations: many(storageLocations),
  items: many(inventoryItems),
  plans: many(mealPlans),
}));

export const householdMembersRelations = relations(householdMembers, ({ one }) => ({
  household: one(households, {
    fields: [householdMembers.householdId],
    references: [households.id],
  }),
  user: one(users, { fields: [householdMembers.userId], references: [users.id] }),
}));

export const storageLocationsRelations = relations(storageLocations, ({ one, many }) => ({
  household: one(households, {
    fields: [storageLocations.householdId],
    references: [households.id],
  }),
  items: many(inventoryItems),
}));

export const inventoryItemsRelations = relations(inventoryItems, ({ one, many }) => ({
  household: one(households, {
    fields: [inventoryItems.householdId],
    references: [households.id],
  }),
  ingredient: one(ingredients, {
    fields: [inventoryItems.ingredientId],
    references: [ingredients.id],
  }),
  location: one(storageLocations, {
    fields: [inventoryItems.locationId],
    references: [storageLocations.id],
  }),
  events: many(inventoryEvents),
}));

export const inventoryEventsRelations = relations(inventoryEvents, ({ one }) => ({
  item: one(inventoryItems, {
    fields: [inventoryEvents.itemId],
    references: [inventoryItems.id],
  }),
  household: one(households, {
    fields: [inventoryEvents.householdId],
    references: [households.id],
  }),
  actor: one(users, { fields: [inventoryEvents.actorUserId], references: [users.id] }),
}));

export const recipesRelations = relations(recipes, ({ many }) => ({
  ingredients: many(recipeIngredients),
  videos: many(recipeVideos),
}));

export const recipeVideosRelations = relations(recipeVideos, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeVideos.recipeId], references: [recipes.id] }),
}));

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeIngredients.recipeId], references: [recipes.id] }),
  ingredient: one(ingredients, {
    fields: [recipeIngredients.ingredientId],
    references: [ingredients.id],
  }),
}));

export const mealPlansRelations = relations(mealPlans, ({ many, one }) => ({
  entries: many(mealPlanEntries),
  household: one(households, { fields: [mealPlans.householdId], references: [households.id] }),
}));

export const mealPlanEntriesRelations = relations(mealPlanEntries, ({ one }) => ({
  plan: one(mealPlans, { fields: [mealPlanEntries.planId], references: [mealPlans.id] }),
  recipe: one(recipes, { fields: [mealPlanEntries.recipeId], references: [recipes.id] }),
}));

export const feedbackRelations = relations(feedback, ({ one }) => ({
  user: one(users, { fields: [feedback.userId], references: [users.id], relationName: 'submitter' }),
  reviewer: one(users, { fields: [feedback.reviewedBy], references: [users.id], relationName: 'reviewer' }),
}));

export const schema = {
  users,
  oauthAccounts,
  refreshTokens,
  households,
  householdMembers,
  profiles,
  ingredients,
  storageLocations,
  inventoryItems,
  inventoryEvents,
  recipes,
  recipeIngredients,
  recipeVideos,
  mealPlans,
  mealPlanEntries,
  shoppingListItems,
  jobs,
  recognitionSessions,
  aiUsage,
  feedback,
  usersRelations,
  householdsRelations,
  householdMembersRelations,
  storageLocationsRelations,
  inventoryItemsRelations,
  inventoryEventsRelations,
  recipesRelations,
  recipeIngredientsRelations,
  recipeVideosRelations,
  mealPlansRelations,
  mealPlanEntriesRelations,
  feedbackRelations,
};
