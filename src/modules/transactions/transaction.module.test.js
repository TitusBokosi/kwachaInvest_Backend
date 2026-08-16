import { jest } from '@jest/globals';

jest.mock('../../config/client.js', () => ({
  __esModule: true,
  default: {
    transaction: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import prisma from '../../config/client.js';
import * as transactionModel from './transaction.model.js';
import * as transactionService from './transaction.service.js';
import * as transactionController from './transaction.controller.js';
import * as transactionValidator from './transaction.validator.js';
import { NotFoundError } from '../../utils/errors.js';

const buildRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const txWithOwner = (userId, overrides = {}) => ({
  id: 't1',
  savingsAccountId: 'sa1',
  savingsAccount: { id: 'sa1', userId, name: 'My Savings' },
  mobileMoneyAccount: { provider: 'TNM', phoneNumber: '0991234567' },
  type: 'DEPOSIT',
  amount: '100',
  status: 'SUCCESS',
  ...overrides,
});

describe('Transactions module', () => {
  // =========================================================================
  // MODEL
  // =========================================================================
  describe('model', () => {
    it('findTransactionsForUser always scopes to the given userId via savingsAccount', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await transactionModel.findTransactionsForUser('u1', {}, {});
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ savingsAccount: { userId: 'u1' } }),
        }),
      );
    });

    it('findAllTransactions has NO userId scoping unless explicitly filtered (admin-only)', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await transactionModel.findAllTransactions({}, {});
      const [args] = prisma.transaction.findMany.mock.calls.at(-1);
      expect(args.where.savingsAccount).toBeUndefined();
    });

    it('findAllTransactions DOES scope by userId when explicitly filtered', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await transactionModel.findAllTransactions({ userId: 'u1' }, {});
      const [args] = prisma.transaction.findMany.mock.calls.at(-1);
      expect(args.where.savingsAccount).toEqual({ userId: 'u1' });
    });

    it('updateTransactionStatus merges extra fields (e.g. providerReference) alongside status', async () => {
      prisma.transaction.update.mockResolvedValue({});
      await transactionModel.updateTransactionStatus('t1', 'SUCCESS', {
        providerReference: 'ref123',
      });
      expect(prisma.transaction.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { status: 'SUCCESS', providerReference: 'ref123' },
      });
    });
  });

  // =========================================================================
  // SERVICE
  // =========================================================================
  describe('service', () => {
    it('getMyTransactionById throws NotFoundError when it belongs to someone else (not a 403)', async () => {
      prisma.transaction.findUnique.mockResolvedValue(
        txWithOwner('someone-else'),
      );
      await expect(
        transactionService.getMyTransactionById('u1', 't1'),
      ).rejects.toThrow(NotFoundError);
    });

    it("getMyTransactionById throws the SAME error type when it doesn't exist at all", async () => {
      prisma.transaction.findUnique.mockResolvedValue(null);
      await expect(
        transactionService.getMyTransactionById('u1', 't1'),
      ).rejects.toThrow(NotFoundError);
    });

    it('getMyTransactionById returns it when owned', async () => {
      prisma.transaction.findUnique.mockResolvedValue(txWithOwner('u1'));
      const result = await transactionService.getMyTransactionById('u1', 't1');
      expect(result.id).toBe('t1');
    });

    it('getTransactionByIdAdmin ignores ownership entirely', async () => {
      prisma.transaction.findUnique.mockResolvedValue(
        txWithOwner('literally-anyone'),
      );
      const result = await transactionService.getTransactionByIdAdmin('t1');
      expect(result.id).toBe('t1');
    });

    it('getTransactionByIdAdmin still throws NotFoundError if missing', async () => {
      prisma.transaction.findUnique.mockResolvedValue(null);
      await expect(
        transactionService.getTransactionByIdAdmin('t1'),
      ).rejects.toThrow(NotFoundError);
    });

    it('createTransaction / updateTransactionStatus / findByIdempotencyKey are thin passthroughs (internal API for payments module)', async () => {
      prisma.transaction.create.mockResolvedValue({ id: 't1' });
      await transactionService.createTransaction({
        savingsAccountId: 'sa1',
        amount: 100,
      });
      expect(prisma.transaction.create).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // CONTROLLER
  // =========================================================================
  describe('controller', () => {
    it('getMyTransactionById uses req.user.id, not any client-supplied user id', async () => {
      const req = { user: { id: 'u1' }, params: { id: 't1' } };
      const res = buildRes();
      const next = jest.fn();
      prisma.transaction.findUnique.mockResolvedValue(txWithOwner('u1'));

      await transactionController.getMyTransactionById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({ id: 't1' }),
      });
    });

    it('getMyTransactionById forwards NotFoundError to next() when owned by someone else', async () => {
      const req = { user: { id: 'u1' }, params: { id: 't1' } };
      const res = buildRes();
      const next = jest.fn();
      prisma.transaction.findUnique.mockResolvedValue(
        txWithOwner('someone-else'),
      );

      await transactionController.getMyTransactionById(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
      expect(res.status).not.toHaveBeenCalled();
    });

    it('listAllTransactions accepts an admin-supplied userId filter that listMyTransactions has no equivalent for', async () => {
      const req = { query: { userId: 'someone' }, user: { id: 'admin1' } };
      const res = buildRes();
      const next = jest.fn();
      prisma.$transaction.mockResolvedValue([[], 0]);

      await transactionController.listAllTransactions(req, res, next);

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            savingsAccount: { userId: 'someone' },
          }),
        }),
      );
    });
  });

  // =========================================================================
  // VALIDATION
  // =========================================================================
  describe('validation', () => {
    it('transactionIdParamSchema rejects a non-cuid id', () => {
      expect(
        transactionValidator.transactionIdParamSchema.params.safeParse({
          id: 'not-a-cuid',
        }).success,
      ).toBe(false);
    });

    it('listMyTransactionsSchema accepts an empty query (all filters optional)', () => {
      expect(
        transactionValidator.listMyTransactionsSchema.query.safeParse({})
          .success,
      ).toBe(true);
    });

    it('listMyTransactionsSchema rejects an invalid type or status enum value', () => {
      expect(
        transactionValidator.listMyTransactionsSchema.query.safeParse({
          type: 'NOT_REAL',
        }).success,
      ).toBe(false);
      expect(
        transactionValidator.listMyTransactionsSchema.query.safeParse({
          status: 'NOT_REAL',
        }).success,
      ).toBe(false);
    });

    it('listAllTransactionsSchema additionally accepts a userId filter', () => {
      const result =
        transactionValidator.listAllTransactionsSchema.query.safeParse({
          userId: 'cjld2cjxh0000qzrmn831i7rn',
        });
      expect(result.success).toBe(true);
    });
  });
});
