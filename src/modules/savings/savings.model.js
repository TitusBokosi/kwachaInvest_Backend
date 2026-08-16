import prisma from '../../config/client.js';
import { buildPagination, paginatedResult } from '../../utils/pagination.js';
import { withTransaction } from '../../utils/withTransaction.js';

const detailInclude = {
  timeBasedDetails: true,
  targetBasedDetails: true,
};

// ---------------------------------------------------------------------------
// Create — SavingsAccount + its type-specific detail row are written
// atomically via $transaction, so a savings account is never left without
// its matching TimeBasedSavings/TargetBasedSavings row.
// ---------------------------------------------------------------------------

export const createTimeBasedSavings = async ({
  userId,
  name,
  withdrawalPolicy,
  penaltyPercentage,
  startDate,
  maturityDate,
}) => {
  return withTransaction(async (tx) => {
    const account = await tx.savingsAccount.create({
      data: {
        userId,
        name,
        type: 'TIME_BASED',
        withdrawalPolicy,
        ...(penaltyPercentage !== undefined && { penaltyPercentage }),
      },
    });

    await tx.timeBasedSavings.create({
      data: {
        savingsAccountId: account.id,
        startDate: startDate ?? new Date(),
        maturityDate,
      },
    });

    return tx.savingsAccount.findUnique({
      where: { id: account.id },
      include: detailInclude,
    });
  });
};

export const createTargetBasedSavings = async ({
  userId,
  name,
  withdrawalPolicy,
  penaltyPercentage,
  target,
}) => {
  return withTransaction(async (tx) => {
    const account = await tx.savingsAccount.create({
      data: {
        userId,
        name,
        type: 'TARGET_BASED',
        withdrawalPolicy,
        ...(penaltyPercentage !== undefined && { penaltyPercentage }),
      },
    });

    await tx.targetBasedSavings.create({
      data: {
        savingsAccountId: account.id,
        target,
      },
    });

    return tx.savingsAccount.findUnique({
      where: { id: account.id },
      include: detailInclude,
    });
  });
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const findSavingsAccountById = async (id) => {
  return prisma.savingsAccount.findUnique({
    where: { id },
    include: {
      ...detailInclude,
      transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
};

export const findSavingsAccountsForUser = async (
  userId,
  filters = {},
  pagination = {},
) => {
  const { skip, take, page, pageSize } = buildPagination(pagination);
  const where = {
    userId,
    ...(filters.status && { status: filters.status }),
    ...(filters.type && { type: filters.type }),
  };

  const [data, total] = await withTransaction([
    prisma.savingsAccount.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: detailInclude,
    }),
    prisma.savingsAccount.count({ where }),
  ]);

  return paginatedResult(data, total, page, pageSize);
};

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------

export const updateSavingsAccountName = async (id, name) => {
  return prisma.savingsAccount.update({
    where: { id },
    data: { name },
  });
};

export const updateSavingsAccountStatus = async (id, status) => {
  return prisma.savingsAccount.update({
    where: { id },
    data: { status },
  });
};

// ---------------------------------------------------------------------------
// Internal — for the future payments/jobs modules (automated debits,
// maturity/target completion). Not called from any route in this module.
// ---------------------------------------------------------------------------

export const incrementBalance = async (id, amount, db = prisma) => {
  return db.savingsAccount.update({
    where: { id },
    data: { balance: { increment: amount } },
  });
};

export const decrementBalance = async (id, amount, db = prisma) => {
  return db.savingsAccount.update({
    where: { id },
    data: { balance: { decrement: amount } },
  });
};

export const markCompleted = async (id, db = prisma) => {
  return db.savingsAccount.update({
    where: { id },
    data: { status: 'COMPLETED', maturedAt: new Date() },
  });
};
