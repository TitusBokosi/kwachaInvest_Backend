import prisma from "../../config/client.js"
import { withTransaction } from "../../utils/withTransaction.js"

// ---------------------------------------------------------------------------
// NOTE ON SCOPE
// KYC is out of scope for this MVP release. Functions and includes that
// touched KycVerification / kycStatus have been removed below. Search for
// "KYC HOOK" comments — those mark the spots to extend when KYC ships.
// The schema.prisma models/fields (KycVerification, User.kycStatus) are
// left untouched so no migration is needed when you re-introduce this.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers (not exported as endpoints — used internally to avoid repetition)
// ---------------------------------------------------------------------------

/**
 * Strips fields that should never leave the repository layer toward a
 * controller/response. Add any new sensitive column here once, instead of
 * destructuring it out in every function.
 */
const omitSensitive = (user) => {
    if (!user) return null;
    const { passwordHash, ...safeUser } = user;
    return safeUser;
}

/**
 * Normalizes page/pageSize into Prisma's skip/take, with sane defaults and
 * an upper bound so nobody can request pageSize=999999 and dump the table.
 */
const buildPagination = ({ page = 1, pageSize = 20 } = {}) => {
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    return {
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
        page: safePage,
        pageSize: safePageSize,
    };
}

/** Wraps a Prisma findMany result + count into a consistent paginated shape. */
const toPaginatedResult = (data, total, page, pageSize) => ({
    data: data.map(omitSensitive),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
})

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export const createUser = async (input) => {
    const user = await prisma.user.create({
        data: input,
    })
    return omitSensitive(user);
    // KYC HOOK: once KYC ships, replace this with a createUserWithKyc()
    // that wraps User + KycVerification creation in prisma.$transaction,
    // so a user is never created without a KYC stub row.
}

// ---------------------------------------------------------------------------
// Read — single record (safe: passwordHash always stripped)
// ---------------------------------------------------------------------------

export const getUserById = async (id) => {
    const userData = await prisma.user.findUnique({
        where: { id },
    })
    return omitSensitive(userData);
}

export const getUserByEmail = async (email) => {
    const userData = await prisma.user.findUnique({
        where: { email },
    })
    return omitSensitive(userData);
}

export const getUserByPhoneNumber = async (phoneNumber) => {
    const userData = await prisma.user.findUnique({
        where: { phoneNumber },
    })
    return omitSensitive(userData);
}

export const getUserProfile = async (id) => {
    const userData = await prisma.user.findUnique({
        where: { id },
        include: {
            mobileMoneyAccounts: true,
            savingsAccounts: true,
            // KYC HOOK: add `kycVerification: true` back here once KYC ships.
        },
    })
    return omitSensitive(userData);
}

// ---------------------------------------------------------------------------
// Read — internal/auth-only (INCLUDES passwordHash — never return these
// straight to a controller response; only the auth service should call them,
// to verify a login password or before hashing+saving a new one)
// ---------------------------------------------------------------------------

export const getUserByEmailForAuth = async (email) => {
    return prisma.user.findUnique({ where: { email } });
}

export const getUserByPhoneNumberForAuth = async (phoneNumber) => {
    return prisma.user.findUnique({ where: { phoneNumber } });
}

export const getUserByIdForAuth = async (id) => {
    return prisma.user.findUnique({ where: { id } });
}

// ---------------------------------------------------------------------------
// Read — lists (always paginated)
// ---------------------------------------------------------------------------

export const getUsers = async (filters = {}, pagination = {}) => {
    const { skip, take, page, pageSize } = buildPagination(pagination);
    const where = {
        ...(filters.isActive !== undefined && { isActive: filters.isActive }),
        ...(filters.createdAfter && { createdAt: { gte: filters.createdAfter } }),
        // KYC HOOK: add `...(filters.kycStatus && { kycStatus: filters.kycStatus })`
        // back here once KYC ships.
    }

    const [data, total] = await withTransaction([
        prisma.user.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
        prisma.user.count({ where }),
    ])

    return toPaginatedResult(data, total, page, pageSize);
}

export const searchUsers = async (query, pagination = {}) => {
    const { skip, take, page, pageSize } = buildPagination(pagination);
    const where = {
        OR: [
            { fullName: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { phoneNumber: { contains: query } },
        ],
    }

    const [data, total] = await withTransaction([
        prisma.user.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
        prisma.user.count({ where }),
    ])

    return toPaginatedResult(data, total, page, pageSize);
}

// KYC HOOK: re-add `getUsersByKycStatus(kycStatus, pagination)` here once
// KYC ships — it was a thin wrapper: `getUsers({ kycStatus }, pagination)`.

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export const updateUser = async (id, data) => {
    const userData = await prisma.user.update({
        where: { id },
        data,
    })
    return omitSensitive(userData);
}

/**
 * Only the auth service should call this (after hashing the new password).
 * Returns the minimum needed to confirm the write, not the full row.
 */
export const updatePasswordHash = async (id, newPasswordHash) => {
    const { id: userId, updatedAt } = await prisma.user.update({
        where: { id },
        data: { passwordHash: newPasswordHash },
    })
    return { id: userId, updatedAt };
}

export const deactivateUser = async (id) => {
    const userData = await prisma.user.update({
        where: { id },
        data: { isActive: false },
    })
    return omitSensitive(userData);
}

export const reactivateUser = async (id) => {
    const userData = await prisma.user.update({
        where: { id },
        data: { isActive: true },
    })
    return omitSensitive(userData);
}

export const updateUserRole = async (id, role) => {
    const userData = await prisma.user.update({
        where: { id },
        data: { role },
    })
    return omitSensitive(userData);
}

// ---------------------------------------------------------------------------
// Checks / counts (cheap — no full row returned)
// ---------------------------------------------------------------------------

export const existsByEmailOrPhone = async (email, phoneNumber) => {
    const count = await prisma.user.count({
        where: { OR: [{ email }, { phoneNumber }] },
    })
    return count > 0;
}

export const isUserActive = async (id) => {
    const user = await prisma.user.findUnique({
        where: { id },
        select: { isActive: true },
    })
    return user?.isActive ?? false;
}

export const countUsers = async (filters = {}) => {
    const where = {
        ...(filters.isActive !== undefined && { isActive: filters.isActive }),
    }
    return prisma.user.count({ where });
}
