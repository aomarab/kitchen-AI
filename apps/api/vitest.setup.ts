import { resolve } from 'node:path';

// Integration specs read DATABASE_URL, JWT_SECRET, etc. from the repo-root .env,
// which turbo/nest do not inject into process.env. Node's loadEnvFile fills the
// gaps without overwriting variables already set by the caller.
const envPath = resolve(process.cwd(), '../../.env');
try {
  process.loadEnvFile(envPath);
} catch {
  // No .env at that path (e.g. CI provides real env vars) — ignore.
}
