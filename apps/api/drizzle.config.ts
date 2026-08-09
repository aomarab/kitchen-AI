import './src/config/load-dotenv.js';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://kitchen:kitchen@localhost:5432/kitchen',
  },
  strict: true,
  verbose: true,
});
