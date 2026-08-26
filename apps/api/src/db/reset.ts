import '../config/load-dotenv.js';
import postgres from 'postgres';

/**
 * Clears every account and all household-owned data, leaving an empty app that
 * still works: the first person to sign in gets a real, fresh kitchen.
 *
 * Two categories of row deliberately survive.
 *
 * `ingredients` is the global bilingual catalog seeded from `seed-data/*.json`.
 * It is not user content — pantry coverage is a deterministic SQL question
 * against it (spec §4.2), so wiping it would stop plan generation working at
 * all and force a re-seed plus an embedding backfill.
 *
 * `dish_media` and `dish_videos` are caches keyed by dish name and locale, not
 * by household. Their rows cost YouTube Data API quota to rebuild and contain
 * nothing about any person, so dropping them would spend real quota to arrive
 * at exactly the state we are already in. Pass `--purge-cache` when the cached
 * media itself is what you want gone.
 */

/** Ordered parents-last: `households.created_by` is ON DELETE RESTRICT. */
const USER_DATA_TABLES = [
  'inventory_events',
  'inventory_items',
  'shopping_list_items',
  'meal_plan_entries',
  'meal_plans',
  'recipe_ingredients',
  'recipes',
  'recognition_sessions',
  'storage_locations',
  'jobs',
  'ai_usage',
  'credit_ledger',
  'credit_purchases',
  'household_credits',
  'product_feedback',
  'feedback',
  'household_members',
  'households',
  'refresh_tokens',
  'oauth_accounts',
  'profiles',
  'users',
] as const;

const CACHE_TABLES = ['dish_media', 'dish_videos'] as const;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal']);

/**
 * The hostname alone, so the confirmation an operator types stays short. Falls
 * back to the raw string rather than throwing: an unparseable URL is not a URL
 * we should treat as local.
 */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  // Gating on NODE_ENV is not a guard at all here: `tsx` leaves NODE_ENV unset,
  // so the production branch never runs, while the loader happily picks up
  // whatever DATABASE_URL is in the nearest .env — including a staging or
  // production one. The trustworthy fact is the host we are about to connect
  // to, so that is what the operator has to name. Local databases stay
  // frictionless; anything remote must be typed out in full.
  const host = hostOf(url);
  if (!LOCAL_HOSTS.has(host) && process.env.CONFIRM_RESET !== host) {
    throw new Error(
      `Refusing to reset the non-local database at ${host}. ` +
        `Re-run with CONFIRM_RESET=${host} if that is really what you want.`,
    );
  }

  const purgeCache = process.argv.includes('--purge-cache');
  const sql = postgres(url, { max: 1 });

  try {
    const counted: Record<string, number> = {};
    const tables = purgeCache ? [...USER_DATA_TABLES, ...CACHE_TABLES] : USER_DATA_TABLES;

    await sql.begin(async (tx) => {
      for (const table of tables) {
        const [row] = await tx`SELECT count(*)::int AS n FROM ${tx(table)}`;
        const n = (row as { n: number } | undefined)?.n ?? 0;
        if (n > 0) counted[table] = n;
        await tx`DELETE FROM ${tx(table)}`;
      }
    });

    const [kept] = await sql`SELECT count(*)::int AS n FROM ingredients`;
    const removed = Object.entries(counted);

    if (removed.length === 0) {
      console.warn('Nothing to remove — the database was already empty of user data.');
    } else {
      for (const [table, n] of removed) console.warn(`  removed ${n} from ${table}`);
    }
    console.warn(`Kept ${(kept as { n: number }).n} catalog ingredients.`);
    if (!purgeCache)
      console.warn('Kept dish media/video caches (pass --purge-cache to drop them).');
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
