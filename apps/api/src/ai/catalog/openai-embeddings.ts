import OpenAI from 'openai';
import { AppError } from '../../common/errors.js';
import type { EmbeddingsPort } from './embeddings.port.js';

/** Matches the `vector(1536)` column in `ingredients`. */
export const EMBEDDING_DIMENSIONS = 1536;

/** Kept well under the API's per-request cap, and small enough to retry cheaply. */
const BATCH_SIZE = 128;

export class OpenAiEmbeddings implements EmbeddingsPort {
  readonly dimensions = EMBEDDING_DIMENSIONS;
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model = 'text-embedding-3-small',
  ) {
    this.client = new OpenAI({ apiKey, timeout: 60_000, maxRetries: 2 });
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const out: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const res = await this.client.embeddings.create({ model: this.model, input: batch });
      // The API documents index-ordered data, but this is the one place a
      // silent reorder would poison the whole catalog, so sort explicitly.
      const sorted = [...res.data].sort((a, b) => a.index - b.index);
      if (sorted.length !== batch.length) {
        throw new AppError('AI_UNAVAILABLE', 'errors.AI_UNAVAILABLE', {
          reason: 'embedding_count_mismatch',
          expected: batch.length,
          received: sorted.length,
        });
      }
      for (const item of sorted) {
        if (item.embedding.length !== this.dimensions) {
          throw new AppError('AI_UNAVAILABLE', 'errors.AI_UNAVAILABLE', {
            reason: 'embedding_dimension_mismatch',
            expected: this.dimensions,
            received: item.embedding.length,
          });
        }
        out.push(item.embedding);
      }
    }
    return out;
  }
}
