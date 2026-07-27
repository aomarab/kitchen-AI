/**
 * Backfills `ingredients.embedding`.
 *
 * The resolution ladder's third rung (embedding similarity) is dead weight
 * until this runs — with an empty column every near-miss name falls straight
 * through to "create a new catalog row", which is how a global catalog fills
 * up with "Tomatos", "tomatoe" and "طماطم حمراء" as separate ingredients.
 *
 *   pnpm --filter @kitchen/api db:embed          # only rows missing a vector
 *   pnpm --filter @kitchen/api db:embed -- --all # re-embed everything
 *
 * Uses the real embeddings model unless AI_MOCK is set, and is safe to
 * re-run: it commits in batches and skips what is already done.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { isNull, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { ingredients } from './schema.js';
import { ingredientEmbeddingText } from '../ai/catalog/embeddings.port.js';
import { MockEmbeddings } from '../ai/catalog/mock-embeddings.js';
import { OpenAiEmbeddings } from '../ai/catalog/openai-embeddings.js';

const BATCH = 100;

async function main(): Promise<void> {
  const all = process.argv.includes('--all');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const useMock = process.env.AI_MOCK === 'true';
  const apiKey = process.env.OPENAI_API_KEY;
  if (!useMock && !apiKey) {
    throw new Error('OPENAI_API_KEY is required unless AI_MOCK=true');
  }
  const embeddings = useMock ? new MockEmbeddings() : new OpenAiEmbeddings(apiKey!);

  const client = postgres(databaseUrl, { max: 4 });
  const db = drizzle(client);

  try {
    const rows = await db
      .select({
        id: ingredients.id,
        canonicalNameEn: ingredients.canonicalNameEn,
        canonicalNameAr: ingredients.canonicalNameAr,
        aliases: ingredients.aliases,
      })
      .from(ingredients)
      .where(all ? sql`true` : isNull(ingredients.embedding));

    if (rows.length === 0) {
      console.warn('nothing to embed — every ingredient already has a vector');
      return;
    }
    console.warn(
      `embedding ${rows.length} ingredient(s) with ${useMock ? 'MockEmbeddings' : 'text-embedding-3-small'}`,
    );

    let done = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const vectors = await embeddings.embed(batch.map(ingredientEmbeddingText));

      // One statement per row, but inside a single transaction per batch: a
      // crash mid-run must not leave half a batch of vectors written against
      // text that has since changed.
      await db.transaction(async (tx) => {
        for (const [j, row] of batch.entries()) {
          const literal = `[${vectors[j]!.join(',')}]`;
          await tx.execute(
            sql`update ${ingredients} set embedding = ${literal}::vector where id = ${row.id}`,
          );
        }
      });

      done += batch.length;
      console.warn(`  ${done}/${rows.length}`);
    }

    const [remaining] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ingredients)
      .where(isNull(ingredients.embedding));
    console.warn(`done — ${remaining?.count ?? 0} ingredient(s) still without an embedding`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
