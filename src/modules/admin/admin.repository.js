import prisma from '../../config/client.js';
import { buildPagination, paginatedResult } from '../../utils/pagination.js';
import { withTransaction } from '../../utils/withTransaction.js';

const savingsAccountInclude = {
  user: {
    select: { id: true, fullName: true, email: true, phoneNumber: true },
  },
  timeBasedDetails: true,
  targetBasedDetails: true,
};

export const getAuditLogs = async (filters = {}, pagination = {}) => {
  const { skip, take, page, pageSize } = buildPagination(pagination);
  const where = {
    ...(filters.userId && { userId: filters.userId }),
    ...(filters.entityType && { entityType: filters.entityType }),
    ...(filters.action && { action: filters.action }),
    ...((filters.from || filters.to) && {
      createdAt: {
        ...(filters.from && { gte: filters.from }),
        ...(filters.to && { lte: filters.to }),
      },
    }),
  };

  const [data, total] = await withTransaction([
    prisma.auditLog.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return paginatedResult(data, total, page, pageSize);
};

export const getDashboardStats = async () => {
  const [
    totalUsers,
    activeUsers,
    savingsAggregate,
    savingsByStatus,
    savingsByType,
    successfulTransactions,
    transactionsByStatus,
  ] = await withTransaction([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.savingsAccount.aggregate({ _sum: { balance: true }, _count: true }),
    prisma.savingsAccount.groupBy({ by: ['status'], _count: true }),
    prisma.savingsAccount.groupBy({ by: ['type'], _count: true }),
    prisma.transaction.aggregate({
      where: { status: 'SUCCESS' },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.transaction.groupBy({ by: ['status'], _count: true }),
  ]);

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
    },
    savings: {
      totalAccounts: savingsAggregate._count,
      totalBalance: Number(savingsAggregate._sum.balance ?? 0),
      byStatus: savingsByStatus.map((row) => ({
        status: row.status,
        count: row._count,
      })),
      byType: savingsByType.map((row) => ({
        type: row.type,
        count: row._count,
      })),
    },
    transactions: {
      totalSuccessful: successfulTransactions._count,
      totalSuccessfulAmount: Number(successfulTransactions._sum.amount ?? 0),
      byStatus: transactionsByStatus.map((row) => ({
        status: row.status,
        count: row._count,
      })),
    },
  };
};

export const getAllSavingsAccounts = async (filters = {}, pagination = {}) => {
  const { skip, take, page, pageSize } = buildPagination(pagination);
  const where = {
    ...(filters.status && { status: filters.status }),
    ...(filters.type && { type: filters.type }),
    ...(filters.userId && { userId: filters.userId }),
  };

  const [data, total] = await withTransaction([
    prisma.savingsAccount.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: savingsAccountInclude,
    }),
    prisma.savingsAccount.count({ where }),
  ]);

  return paginatedResult(data, total, page, pageSize);
};

export const getSavingsAccountById = async (id) => {
  return prisma.savingsAccount.findUnique({
    where: { id },
    include: {
      ...savingsAccountInclude,
      transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
};

export const updateSavingsAccountStatus = async (id, status) => {
  return prisma.savingsAccount.update({ where: { id }, data: { status } });
};
