import dotenv from 'dotenv';
import path from 'path';

// Runs before the test framework and any test file are loaded (via Jest's
// `setupFiles`) — this is what config/env.js needs to already see valid
// values by the time it's imported, since Jest never goes through index.js
// (which is where dotenv/config normally loads .env in the real app).
dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });
