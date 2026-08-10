import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every one of these is a famous music or meme video that once sat in the mock
 * catalogue behind a cooking title. Thumbnails are derived from the video id,
 * so each of them rendered a celebrity's face as a meal photo.
 */
const BANNED_IDS = [
  'dQw4w9WgXcQ', // Rick Astley — Never Gonna Give You Up
  'oHg5SJYRHA0', // RickRoll'D
  'kJQP7kiw5Fk', // Luis Fonsi — Despacito
  'e-ORhEE9VVg', // Eduard Khil — Trololo
  'fLexgOxsZu0', // Darude — Sandstorm
  '9bZkp7q19f0', // PSY — Gangnam Style
  'M7lc1UVf-VE', // YouTube Developers Live
];

const FIXTURE_FILES = [
  'apps/web/src/mocks/catalog.ts',
  'apps/mobile/src/mocks/data.ts',
  'apps/api/src/ai/clients/mock-youtube.client.ts',
];

describe('mock fixtures', () => {
  it('never pairs a cooking title with a music video', () => {
    const repoRoot = join(__dirname, '../../../..');
    const offenders: string[] = [];

    for (const relative of FIXTURE_FILES) {
      const source = readFileSync(join(repoRoot, relative), 'utf8');
      for (const id of BANNED_IDS) {
        if (source.includes(id)) offenders.push(`${relative} → ${id}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
