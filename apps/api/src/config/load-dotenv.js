/* global module, process, __dirname */

const { existsSync } = module.require('node:fs');
const { dirname, join, parse } = module.require('node:path');

function findEnvFile(startDirs) {
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

function loadDotenv() {
  const envPath = findEnvFile([process.cwd(), __dirname]);
  if (!envPath) return null;

  try {
    process.loadEnvFile(envPath);
    return envPath;
  } catch {
    return null;
  }
}

loadDotenv();
