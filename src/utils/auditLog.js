import prisma from "../config/client.js"

/**
 * Central place to write AuditLog rows. Any module can import this instead
 * of calling prisma.auditLog.create directly — keeps the shape consistent,
 * and makes it easy to fan this out somewhere else (e.g. a separate audit
 * store) later without touching every call site.
 */
export const recordAuditLog = async ({ userId = null, action, entityType, entityId, metadata = null }) => {
    return prisma.auditLog.create({
        data: { userId, action, entityType, entityId, metadata },
    });
}

/** Most recent matching audit log entry, or null. */
export const findLatestAuditLog = async ({ action, entityType, entityId }) => {
    return prisma.auditLog.findFirst({
        where: { action, entityType, entityId },
        orderBy: { createdAt: "desc" },
    });
}
