import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { routes, type RouteName } from '@kitchen/contracts';

const SRC = path.join(__dirname, '..');

function read(file: string): string {
  return fs.readFileSync(path.join(SRC, file), 'utf8');
}

/** Route names the app actually calls, read from the hooks and lib layer. */
function calledRouteNames(): RouteName[] {
  const names = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'mocks' || entry.name === 'node_modules') continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name) || /\.spec\.tsx?$/.test(entry.name)) continue;
      for (const match of fs.readFileSync(full, 'utf8').matchAll(/api\.call\(\s*'([a-zA-Z]+)'/g)) {
        names.add(match[1]!);
      }
    }
  };
  walk(SRC);
  return [...names].filter((name): name is RouteName => name in routes);
}

function resolverNames(): Set<string> {
  const source = read('mocks/handlers.ts');
  const start = source.indexOf('const resolvers');
  // The object literal ends at the first line that is exactly `};`.
  const end = source.indexOf('\n};', start);
  const block = source.slice(start, end);
  return new Set([...block.matchAll(/^ {2}([a-zA-Z]+):/gm)].map((m) => m[1]!));
}

/**
 * `buildHandlers` skips any route with no resolver (`if (!resolver) continue`),
 * and the mock server runs with `onUnhandledRequest: 'bypass'`. A route the app
 * calls but the mocks do not implement therefore escapes to a real
 * `localhost:3333` that is usually not running — the screen shows an error and
 * the global offline banner appears, with nothing anywhere saying why.
 *
 * Mocks are the default in this app, so that combination means a route can be
 * added, typecheck cleanly, pass every unit test, and still be broken for
 * everyone running the app as it ships. This asserts the two lists agree.
 */
describe('mock coverage', () => {
  it('implements every route the app calls', () => {
    const resolvers = resolverNames();
    const missing = calledRouteNames().filter((name) => !resolvers.has(name));
    expect(missing).toEqual([]);
  });

  it('does not define resolvers for routes that do not exist', () => {
    const unknown = [...resolverNames()].filter((name) => !(name in routes));
    expect(unknown).toEqual([]);
  });
});
