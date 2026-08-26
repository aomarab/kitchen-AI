import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the one mistake that takes the whole app down and that nothing else
 * here can see.
 *
 * A React provider is not inside its own value. `RootLayout` renders
 * `QueryClientProvider`, so any hook it calls that reads the query *context*
 * throws "No QueryClient set, use QueryClientProvider to set one" — a red
 * screen on launch, every screen, no way past it.
 *
 * Nothing caught it when it happened: the unit tests are pure logic, the
 * hook's own tests never mount it under a real tree, typecheck and lint are
 * both blind to which component provides what, and the app still *builds*,
 * *installs* and *runs* — the process stays alive behind the error overlay.
 *
 * So this reads the source instead. It works out which hooks depend on the
 * query context (directly, or by calling something that does, however many
 * files deep) and asserts none of them are called in the component that
 * provides it. Mount those under `QueryScopedEffects`, which is a child.
 */

const SRC = join(__dirname, '..');
const CONTEXT_READERS = /\b(useQuery|useMutation|useInfiniteQuery|useQueryClient|useQueries)\s*\(/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(path) || /\.spec\.tsx?$/.test(path)) return [];
    return [path];
  });
}

/** Body of the `{...}` block that starts at or after `from`, by brace depth. */
function blockAt(source: string, from: number): string {
  const open = source.indexOf('{', from);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return source.slice(open);
}

/**
 * Body of a `function name(...)` declaration.
 *
 * The parameter list has to be skipped rather than searched past, because a
 * default value is itself a brace: `useInventory(query = {})` would otherwise
 * report a body of `{}` and look like a hook that does nothing at all.
 */
function functionBodyAt(source: string, from: number): string {
  const paren = source.indexOf('(', from);
  if (paren === -1) return '';
  let depth = 0;
  for (let i = paren; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return blockAt(source, i + 1);
    }
  }
  return '';
}

/** Every `useSomething` / component function in the codebase, name -> body. */
function collectFunctions(): Map<string, string> {
  const bodies = new Map<string, string>();
  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, 'utf8');
    const declaration = /(?:export\s+)?(?:default\s+)?function\s+([A-Za-z_$][\w$]*)\s*[(<]/g;
    for (let m = declaration.exec(source); m; m = declaration.exec(source)) {
      bodies.set(m[1] ?? '', functionBodyAt(source, m.index));
    }
    const arrow = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:\([^)]*\)|[\w$]+)\s*(?::[^=]+)?=>/g;
    for (let m = arrow.exec(source); m; m = arrow.exec(source)) {
      bodies.set(m[1] ?? '', blockAt(source, m.index + m[0].length));
    }
  }
  return bodies;
}

/** Hooks that cannot run outside a QueryClientProvider, transitively. */
function needsQueryContext(bodies: Map<string, string>): Set<string> {
  const needs = new Set<string>();
  for (const [name, body] of bodies) {
    if (CONTEXT_READERS.test(body)) needs.add(name);
  }

  for (let changed = true; changed; ) {
    changed = false;
    for (const [name, body] of bodies) {
      if (needs.has(name)) continue;
      const calls = body.match(/\buse[A-Z][\w$]*\s*\(/g) ?? [];
      if (calls.some((call) => needs.has(call.replace(/\s*\($/, '')))) {
        needs.add(name);
        changed = true;
      }
    }
  }
  return needs;
}

describe('query client provider boundary', () => {
  const bodies = collectFunctions();

  it('finds the component that renders QueryClientProvider', () => {
    const provider = [...bodies].filter(([, body]) => body.includes('<QueryClientProvider'));
    // If this ever fails the rest of the suite is silently checking nothing.
    expect(provider.map(([name]) => name)).toEqual(['RootLayout']);
  });

  it('recognises the app hooks that read the query context', () => {
    const needs = needsQueryContext(bodies);
    // Anchors the analysis to real hooks: useInventory calls useQuery itself,
    // useNotificationScheduler only reaches it two files away.
    expect(needs).toContain('useInventory');
    expect(needs).toContain('useNotificationScheduler');
    // The offline sync hook uses the queryClient singleton, not the context,
    // which is exactly why it is allowed to sit in RootLayout.
    expect(needs).not.toContain('useOfflineSync');
  });

  it('never calls a query-context hook from the component that provides it', () => {
    const needs = needsQueryContext(bodies);
    const rootLayout = bodies.get('RootLayout') ?? '';
    const body = rootLayout.slice(0, rootLayout.indexOf('return ('));

    const offenders = (body.match(/\buse[A-Z][\w$]*\s*\(/g) ?? [])
      .map((call) => call.replace(/\s*\($/, ''))
      .filter((name) => needs.has(name));

    expect(offenders).toEqual([]);
  });
});
