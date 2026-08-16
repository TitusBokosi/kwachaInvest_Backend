import prisma from "../config/client.js"

/**
 * Wraps prisma.$transaction(callback) with longer maxWait/timeout than
 * Prisma's defaults (maxWait: 2000ms, timeout: 5000ms). Those defaults
 * assume a local/low-latency Postgres. Against a remote pooled endpoint
 * (Prisma Postgres, Supabase, Neon, etc.) that can have several seconds
 * of cold-start latency on the first query after idle, 2s is too tight —
 * this is what was producing P2028 "Unable to start a transaction in the
 * given time" under real usage, even though a warm connection completes
 * the same transaction in ~1s.
 *
 * Use this instead of prisma.$transaction(callback) for every INTERACTIVE
 * (callback-style) transaction. Array-style transactions
 * (prisma.$transaction([queryA, queryB])) don't need this — they're not
 * susceptible to the same acquisition-timing issue.
 */
export const withTransaction = (callback) => {
    return prisma.$transaction(callback, {
        maxWait: 10_000, // time allowed to acquire a connection and start
        timeout: 15_000, // time allowed for the callback itself to complete
    });
}
