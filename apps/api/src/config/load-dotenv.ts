import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

/**
 * Loads the repo-root `.env` into `process.env`.
 *
 * Nest, tsx and turbo all run scripts with the package directory as the working
 * directory and none of them read a `.env` above it, so every entry point that
 * needs configuration — the server, the migration and the seed — has to ask for
 * it explicitly. Importing this module first is that request.
 *
 * Variables already present in the environment win, matching `node --env-file`,
 * so CI and deployments keep injecting real values without a file on disk.
 */
function findEnvFile(startDirs: string[]): string | null {
  for (const start of startDirs) {
    const { root } = parse(start);
    let dir = start;
    while (true) {
      const candidate = join(dir, '.env');
      if (existsSync(candidate)) return candidate;
      if (dir === root) break;
      dir = dirname(dir);
    }
  }
  return null;
}

export function loadDotenv(): string | null {
  // The working directory covers `pnpm --filter` and turbo; `__dirname` covers a
  // compiled `node dist/main.js` started from somewhere else entirely.
  const envPath = findEnvFile([process.cwd(), __dirname]);
  if (!envPath) return null;

  try {
    process.loadEnvFile(envPath);
    return envPath;
  } catch {
    // Unreadable or malformed: fall through to whatever the real environment
    // provides so a broken file cannot take the process down on its own.
    return null;
  }
}

loadDotenv();
