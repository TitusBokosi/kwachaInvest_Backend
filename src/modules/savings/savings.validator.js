import { z } from 'zod';

const paginationQuery = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
};

const name = z.string().trim().min(1, 'Name is required').max(100);
const withdrawalPolicy = z.enum(['LOCKED', 'FLEXIBLE']);
const penaltyPercentage = z.coerce.number().min(0).max(100).optional();

export const createTimeBasedSavingsSchema = {
  body: z
    .object({
      name,
      withdrawalPolicy,
      startDate: z.coerce.date().optional(),
      maturityDate: z.coerce.date(),
    })
    .refine((data) => data.maturityDate > new Date(), {
      message: 'Maturity date must be in the future',
      path: ['maturityDate'],
    })
    .refine((data) => !data.startDate || data.maturityDate > data.startDate, {
      message: 'Maturity date must be after the start date',
      path: ['maturityDate'],
    }),
};

export const createTargetBasedSavingsSchema = {
  body: z.object({
    name,
    withdrawalPolicy,
    target: z.coerce.number().positive('Target amount must be greater than 0'),
  }),
};

export const savingsAccountIdParamSchema = {
  params: z.object({
    id: z.string().cuid('Invalid savings account id'),
  }),
};

export const updateSavingsAccountNameSchema = {
  params: z.object({
    id: z.string().cuid('Invalid savings account id'),
  }),
  body: z.object({
    name,
  }),
};

export const listMySavingsAccountsSchema = {
  query: z.object({
    ...paginationQuery,
    status: z
      .enum(['ACTIVE', 'COMPLETED', 'CANCELLED', 'PAUSED', 'FROZEN'])
      .optional(),
    type: z.enum(['TIME_BASED', 'TARGET_BASED']).optional(),
  }),
};
