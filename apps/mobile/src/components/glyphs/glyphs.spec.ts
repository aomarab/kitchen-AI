import { describe, expect, it } from 'vitest';
import { ICON_PATHS } from './icon-paths';
import { ILLUSTRATION_PATHS } from './illustration-paths';
import { BRAND_ICON_NAMES, DIRECTIONAL_ICON_NAMES } from './stroke';

type PathCommand = 'M' | 'L' | 'H' | 'V' | 'C' | 'Z';
interface Coordinate {
  readonly x?: number;
  readonly y?: number;
}

const COMMANDS = new Set<PathCommand>(['M', 'L', 'H', 'V', 'C', 'Z']);
const TOKEN_PATTERN = /[MLHVCZ]|-?\d+(?:\.\d+)?/g;

function isCommand(token: string | undefined): token is PathCommand {
  return COMMANDS.has(token as PathCommand);
}

function readNumber(tokens: readonly string[], index: { value: number }, d: string): number {
  const token = tokens[index.value];
  if (token === undefined || isCommand(token)) {
    throw new Error(`Expected number at token ${index.value} in ${d}`);
  }
  index.value += 1;
  const value = Number(token);
  if (!Number.isFinite(value)) throw new Error(`Invalid number ${token} in ${d}`);
  return value;
}

function readCoordinates(d: string): Coordinate[] {
  const tokens = d.match(TOKEN_PATTERN) ?? [];
  const index = { value: 0 };
  const coordinates: Coordinate[] = [];
  let command: PathCommand | null = null;

  while (index.value < tokens.length) {
    const token = tokens[index.value];
    if (isCommand(token)) {
      command = token;
      index.value += 1;
      if (command === 'Z') continue;
    }
    if (command === null) throw new Error(`Path starts with coordinates before a command: ${d}`);

    if (command === 'M' || command === 'L') {
      while (index.value < tokens.length && !isCommand(tokens[index.value])) {
        coordinates.push({
          x: readNumber(tokens, index, d),
          y: readNumber(tokens, index, d),
        });
      }
      if (command === 'M') command = 'L';
    } else if (command === 'H') {
      while (index.value < tokens.length && !isCommand(tokens[index.value])) {
        coordinates.push({ x: readNumber(tokens, index, d) });
      }
    } else if (command === 'V') {
      while (index.value < tokens.length && !isCommand(tokens[index.value])) {
        coordinates.push({ y: readNumber(tokens, index, d) });
      }
    } else if (command === 'C') {
      while (index.value < tokens.length && !isCommand(tokens[index.value])) {
        coordinates.push({
          x: readNumber(tokens, index, d),
          y: readNumber(tokens, index, d),
        });
        coordinates.push({
          x: readNumber(tokens, index, d),
          y: readNumber(tokens, index, d),
        });
        coordinates.push({
          x: readNumber(tokens, index, d),
          y: readNumber(tokens, index, d),
        });
      }
    }
  }

  return coordinates;
}

function expectPathInsideBox(d: string, box: number) {
  for (const coordinate of readCoordinates(d)) {
    if (coordinate.x !== undefined) {
      expect(coordinate.x, `${d} x`).toBeGreaterThanOrEqual(0);
      expect(coordinate.x, `${d} x`).toBeLessThanOrEqual(box);
    }
    if (coordinate.y !== undefined) {
      expect(coordinate.y, `${d} y`).toBeGreaterThanOrEqual(0);
      expect(coordinate.y, `${d} y`).toBeLessThanOrEqual(box);
    }
  }
}

describe('J Coral glyph path data', () => {
  it('has at least one in-bounds path for every 24-box icon', () => {
    const icons = Object.entries(ICON_PATHS);
    expect(icons).toHaveLength(82);

    for (const [name, paths] of icons) {
      expect(paths.length, name).toBeGreaterThan(0);
      for (const d of paths) expectPathInsideBox(d, 24);
    }
  });

  it('has at least one in-bounds path for every 64-box illustration', () => {
    const illustrations = Object.entries(ILLUSTRATION_PATHS);
    expect(illustrations).toHaveLength(42);

    for (const [name, paths] of illustrations) {
      expect(paths.length, name).toBeGreaterThan(0);
      for (const [d, tone] of paths) {
        expect(['ink', 'coral'], name).toContain(tone);
        expectPathInsideBox(d, 64);
      }
    }
  });

  it('keeps brand marks as the only non-glyph icon names', () => {
    const glyphNames = new Set<string>(Object.keys(ICON_PATHS));

    expect(BRAND_ICON_NAMES).toEqual(['apple', 'google']);
    for (const name of BRAND_ICON_NAMES) {
      expect(glyphNames.has(name), name).toBe(false);
    }
  });

  it('exports exactly the icons that mirror under RTL', () => {
    const expected = ['chevL', 'chevR', 'arrowL', 'arrowR', 'send', 'logout'];
    const glyphNames = new Set<string>(Object.keys(ICON_PATHS));

    expect(DIRECTIONAL_ICON_NAMES).toEqual(expected);
    for (const name of DIRECTIONAL_ICON_NAMES) {
      expect(glyphNames.has(name), name).toBe(true);
    }
  });
});
