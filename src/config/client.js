import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';
import { env } from './env.js';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    adapter,
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

// Prevent creating a new client (and new connection pool) on every
// hot-reload in dev — reuse the same instance across module reloads.
if (env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

export default prisma;
