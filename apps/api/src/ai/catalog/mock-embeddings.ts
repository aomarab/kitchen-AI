import type { EmbeddingsPort } from './embeddings.port.js';
import { EMBEDDING_DIMENSIONS } from './openai-embeddings.js';

/**
 * Offline embeddings. Deterministic and, importantly, *meaningful*: vectors are
 * built from character trigrams, so "tomatos" lands near "tomato" and nowhere
 * near "chicken". A random-but-stable vector would satisfy the types while
 * making every similarity test a lie.
 *
 * Not a substitute for the real model — it has no idea "aubergine" is
 * "eggplant" — but enough that the similarity *plumbing* can be tested without
 * network or spend.
 */
export class MockEmbeddings implements EmbeddingsPort {
  readonly dimensions = EMBEDDING_DIMENSIONS;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.vector(text));
  }

  private vector(text: string): number[] {
    const vec = new Array<number>(this.dimensions).fill(0);
    const normalized = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

    for (let i = 0; i + 3 <= normalized.length; i++) {
      const gram = normalized.slice(i, i + 3);
      let hash = 2166136261;
      for (let c = 0; c < gram.length; c++) {
        hash ^= gram.charCodeAt(c);
        hash = Math.imul(hash, 16777619);
      }
      const slot = Math.abs(hash) % this.dimensions;
      vec[slot] = (vec[slot] ?? 0) + 1;
    }

    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    return norm > 0 ? vec.map((v) => v / norm) : vec.map((_, i) => (i === 0 ? 1 : 0));
  }
}
