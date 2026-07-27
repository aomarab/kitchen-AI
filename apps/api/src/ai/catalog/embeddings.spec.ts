import { describe, expect, it } from 'vitest';
import { MockEmbeddings } from './mock-embeddings.js';
import { ingredientEmbeddingText } from './embeddings.port.js';
import { EMBEDDING_DIMENSIONS } from './openai-embeddings.js';

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  return dot;
}

describe('embedding text', () => {
  it('indexes both scripts and every alias', () => {
    const text = ingredientEmbeddingText({
      canonicalNameEn: 'Eggplant',
      canonicalNameAr: 'باذنجان',
      aliases: ['aubergine', 'brinjal'],
    });
    expect(text).toContain('Eggplant');
    expect(text).toContain('باذنجان');
    expect(text).toContain('aubergine');
  });

  it('survives missing or empty aliases', () => {
    expect(
      ingredientEmbeddingText({ canonicalNameEn: 'Salt', canonicalNameAr: 'ملح', aliases: null }),
    ).toBe('Salt | ملح');
  });
});

describe('mock embeddings', () => {
  const mock = new MockEmbeddings();

  it('matches the vector column width', async () => {
    const [v] = await mock.embed(['tomato']);
    expect(v).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it('is deterministic', async () => {
    const [a] = await mock.embed(['tomato']);
    const [b] = await mock.embed(['tomato']);
    expect(a).toEqual(b);
  });

  it('is unit length, so cosine distance behaves', async () => {
    for (const text of ['tomato', 'دجاج', 'a']) {
      const [v] = await mock.embed([text]);
      expect(cosine(v!, v!)).toBeCloseTo(1, 5);
    }
  });

  it('puts a typo nearer its target than an unrelated word', async () => {
    // A stable-but-random mock would pass the type checker and make every
    // similarity assertion meaningless; this one has to actually work.
    const [tomato, tomatos, chicken] = await mock.embed(['tomato', 'tomatos', 'chicken']);
    expect(cosine(tomato!, tomatos!)).toBeGreaterThan(cosine(tomato!, chicken!));
  });

  it('returns one vector per input, in order, and handles empty input', async () => {
    expect(await mock.embed([])).toEqual([]);
    const out = await mock.embed(['a', 'b', 'c']);
    expect(out).toHaveLength(3);
    expect(out[0]).not.toEqual(out[1]);
  });
});
