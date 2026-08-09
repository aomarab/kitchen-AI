// Integration specs read DATABASE_URL, JWT_SECRET, etc. from the repo-root .env,
// which vitest does not inject into process.env. The server and the db scripts
// bootstrap from the same loader, so tests and runtime agree on where
// configuration comes from.
import './src/config/load-dotenv.js';
