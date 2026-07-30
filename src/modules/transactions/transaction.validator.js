import { z } from 'zod';

const paginationQuery = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
};

const transactionFilters = {
  savingsAccountId: z.string().cuid().optional(),
  type: z.enum(['DEPOSIT', 'WITHDRAWAL']).optional(),
  status: z
    .enum(['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REVERSED'])
    .optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
};

export const transactionIdParamSchema = {
  params: z.object({
    id: z.string().cuid('Invalid transaction id'),
  }),
};

export const listMyTransactionsSchema = {
  query: z.object({
    ...paginationQuery,
    ...transactionFilters,
  }),
};

export const listAllTransactionsSchema = {
  query: z.object({
    ...paginationQuery,
    ...transactionFilters,
    userId: z.string().cuid().optional(),
  }),
};
