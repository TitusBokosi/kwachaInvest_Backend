import prisma from "../../config/client.js"
import { buildPagination, paginatedResult } from "../../utils/pagination.js"

const userSummarySelect = { id: true, fullName: true, email: true, phoneNumber: true };

// ---------------------------------------------------------------------------
// Internal — used by other modules (savings/payments) once they exist, not
// called directly from any route in this module.
// ---------------------------------------------------------------------------

export const createTransaction = async (
    { savingsAccountId, mobileMoneyAccountId, provider, payerPhoneNumber, type, amount, idempotencyKey },
    db = prisma
) => {
    return db.transaction.create({
        data: {
            savingsAccountId,
            mobileMoneyAccountId: mobileMoneyAccountId ?? null,
            provider,
            payerPhoneNumber,
            type,
            amount,
            idempotencyKey,
        },
    });
}

export const updateTransactionStatus = async (id, status, extra = {}, db = prisma) => {
    return db.transaction.update({
        where: { id },
        data: { status, ...extra },
    });
}

export const findTransactionByIdempotencyKey = async (idempotencyKey) => {
    return prisma.transaction.findUnique({
        where: { idempotencyKey },
        include: { savingsAccount: { select: { userId: true } } },
    });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const findTransactionById = async (id) => {
    return prisma.transaction.findUnique({
        where: { id },
        include: {
            savingsAccount: { select: { id: true, userId: true, name: true } },
            mobileMoneyAccount: { select: { id: true, provider: true, phoneNumber: true } },
            paymentGatewayTransaction: true,
        },
    });
}

const buildTransactionFilters = (filters = {}) => ({
    ...(filters.savingsAccountId && { savingsAccountId: filters.savingsAccountId }),
    ...(filters.type && { type: filters.type }),
    ...(filters.status && { status: filters.status }),
    ...((filters.from || filters.to) && {
        createdAt: {
            ...(filters.from && { gte: filters.from }),
            ...(filters.to && { lte: filters.to }),
        },
    }),
});

export const findTransactionsForUser = async (userId, filters = {}, pagination = {}) => {
    const { skip, take, page, pageSize } = buildPagination(pagination);
    const where = {
        savingsAccount: { userId },
        ...buildTransactionFilters(filters),
    };

    const [data, total] = await prisma.$transaction([
        prisma.transaction.findMany({
            where,
            skip,
            take,
            orderBy: { createdAt: "desc" },
            include: {
                savingsAccount: { select: { id: true, name: true } },
                mobileMoneyAccount: { select: { provider: true, phoneNumber: true } },
            },
        }),
        prisma.transaction.count({ where }),
    ]);

    return paginatedResult(data, total, page, pageSize);
}

/** Admin-only — no userId scoping unless explicitly filtered. */
export const findAllTransactions = async (filters = {}, pagination = {}) => {
    const { skip, take, page, pageSize } = buildPagination(pagination);
    const where = {
        ...(filters.userId && { savingsAccount: { userId: filters.userId } }),
        ...buildTransactionFilters(filters),
    };

    const [data, total] = await prisma.$transaction([
        prisma.transaction.findMany({
            where,
            skip,
            take,
            orderBy: { createdAt: "desc" },
            include: {
                savingsAccount: { select: { id: true, name: true, user: { select: userSummarySelect } } },
                mobileMoneyAccount: { select: { provider: true, phoneNumber: true } },
            },
        }),
        prisma.transaction.count({ where }),
    ]);

    return paginatedResult(data, total, page, pageSize);
}
