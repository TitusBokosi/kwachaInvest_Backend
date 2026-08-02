import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../generated/prisma/client.ts"
import { env } from "./env.js"

// This import MUST keep the .ts extension. Prisma's "prisma-client"
// generator emits TypeScript source only — by design, it has no .js
// output option (confirmed in Prisma's own docs/discussions). Running
// this file requires `tsx` (see index.js / package.json scripts) rather
// than plain `node`, which is why `node index.js` fails otherwise.

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

const globalForPrisma = globalThis;

const prisma =
    globalForPrisma.__prisma ??
    new PrismaClient({
        adapter,
        log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });

// Prevent creating a new client (and new connection pool) on every
// hot-reload in dev — reuse the same instance across module reloads.
if (env.NODE_ENV !== "production") {
    globalForPrisma.__prisma = prisma;
}

export default prisma;
