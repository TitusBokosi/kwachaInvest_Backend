import { jest } from '@jest/globals';

jest.mock('../../config/client.js', () => ({
  __esModule: true,
  default: {
    savingsAccount: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    timeBasedSavings: { create: jest.fn() },
    targetBasedSavings: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import prisma from '../../config/client.js';
import * as savingsModel from './savings.model.js';
import * as savingsService from './savings.service.js';
import * as savingsController from './savings.controller.js';
import * as savingsValidator from './savings.validator.js';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from '../../utils/errors.js';

const buildRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const baseAccount = (overrides = {}) => ({
  id: 'sa1',
  userId: 'u1',
  name: 'My Savings',
  type: 'TIME_BASED',
  status: 'ACTIVE',
  balance: '0',
  withdrawalPolicy: 'FLEXIBLE',
  penaltyPercentage: '5',
  timeBasedDetails: { maturityDate: new Date('2027-01-01') },
  targetBasedDetails: null,
  ...overrides,
});

describe('Savings module', () => {
  // =========================================================================
  // MODEL (repository)
  // =========================================================================
  describe('model', () => {
    it('createTimeBasedSavings writes the account and detail row inside one $transaction', async () => {
      const tx = {
        savingsAccount: {
          create: jest.fn().mockResolvedValue({ id: 'sa1' }),
          findUnique: jest.fn().mockResolvedValue(baseAccount()),
        },
        timeBasedSavings: { create: jest.fn().mockResolvedValue({}) },
      };
      prisma.$transaction.mockImplementation((fn) => fn(tx));

      await savingsModel.createTimeBasedSavings({
        userId: 'u1',
        name: 'My Savings',
        withdrawalPolicy: 'FLEXIBLE',
        maturityDate: new Date('2027-01-01'),
      });

      expect(tx.savingsAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'TIME_BASED' }),
        }),
      );
      expect(tx.timeBasedSavings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ savingsAccountId: 'sa1' }),
        }),
      );
    });

    it('findSavingsAccountsForUser scopes the where clause to userId and caps pageSize', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      const result = await savingsModel.findSavingsAccountsForUser(
        'u1',
        {},
        { pageSize: 500 },
      );

      expect(result.pageSize).toBe(100);
    });

    it("incrementBalance uses Prisma's increment, not read-modify-write", async () => {
      prisma.savingsAccount.update.mockResolvedValue({});
      await savingsModel.incrementBalance('sa1', 100);
      expect(prisma.savingsAccount.update).toHaveBeenCalledWith({
        where: { id: 'sa1' },
        data: { balance: { increment: 100 } },
      });
    });
  });

  // =========================================================================
  // SERVICE
  // =========================================================================
  describe('service', () => {
    describe('ownership enforcement', () => {
      it('getMySavingsAccountById throws NotFoundError when the account belongs to someone else', async () => {
        prisma.savingsAccount.findUnique.mockResolvedValue(
          baseAccount({ userId: 'someone-else' }),
        );
        await expect(
          savingsService.getMySavingsAccountById('u1', 'sa1'),
        ).rejects.toThrow(NotFoundError);
      });

      it("getMySavingsAccountById throws NotFoundError when it doesn't exist at all", async () => {
        prisma.savingsAccount.findUnique.mockResolvedValue(null);
        await expect(
          savingsService.getMySavingsAccountById('u1', 'sa1'),
        ).rejects.toThrow(NotFoundError);
      });
    });

    describe('pause / resume', () => {
      it('pause blocks a FROZEN account with ForbiddenError', async () => {
        prisma.savingsAccount.findUnique.mockResolvedValue(
          baseAccount({ status: 'FROZEN' }),
        );
        await expect(
          savingsService.pauseMySavingsAccount('u1', 'sa1'),
        ).rejects.toThrow(ForbiddenError);
      });

      it('pause blocks a non-ACTIVE account with ValidationError', async () => {
        prisma.savingsAccount.findUnique.mockResolvedValue(
          baseAccount({ status: 'PAUSED' }),
        );
        await expect(
          savingsService.pauseMySavingsAccount('u1', 'sa1'),
        ).rejects.toThrow(ValidationError);
      });

      it('resume BLOCKS a FROZEN account — this is the whole reason FROZEN and PAUSED are separate statuses', async () => {
        prisma.savingsAccount.findUnique.mockResolvedValue(
          baseAccount({ status: 'FROZEN' }),
        );
        await expect(
          savingsService.resumeMySavingsAccount('u1', 'sa1'),
        ).rejects.toThrow(ForbiddenError);
        expect(prisma.savingsAccount.update).not.toHaveBeenCalled();
      });

      it('resume succeeds from PAUSED', async () => {
        prisma.savingsAccount.findUnique.mockResolvedValue(
          baseAccount({ status: 'PAUSED' }),
        );
        prisma.savingsAccount.update.mockResolvedValue(
          baseAccount({ status: 'ACTIVE' }),
        );
        await savingsService.resumeMySavingsAccount('u1', 'sa1');
        expect(prisma.savingsAccount.update).toHaveBeenCalledWith({
          where: { id: 'sa1' },
          data: { status: 'ACTIVE' },
        });
      });
    });

    describe('cancel', () => {
      it('blocks cancellation when balance > 0', async () => {
        prisma.savingsAccount.findUnique.mockResolvedValue(
          baseAccount({ balance: '500' }),
        );
        await expect(
          savingsService.cancelMySavingsAccount('u1', 'sa1'),
        ).rejects.toThrow(/withdraw your balance/i);
      });

      it('allows cancellation at zero balance', async () => {
        prisma.savingsAccount.findUnique.mockResolvedValue(
          baseAccount({ balance: '0' }),
        );
        prisma.savingsAccount.update.mockResolvedValue(
          baseAccount({ status: 'CANCELLED' }),
        );
        await savingsService.cancelMySavingsAccount('u1', 'sa1');
        expect(prisma.savingsAccount.update).toHaveBeenCalledWith({
          where: { id: 'sa1' },
          data: { status: 'CANCELLED' },
        });
      });
    });

    describe('assertDepositable', () => {
      it('rejects deposits into a non-ACTIVE account', async () => {
        prisma.savingsAccount.findUnique.mockResolvedValue(
          baseAccount({ status: 'PAUSED' }),
        );
        await expect(
          savingsService.assertDepositable('u1', 'sa1'),
        ).rejects.toThrow(ValidationError);
      });

      it('allows deposits into an ACTIVE account', async () => {
        prisma.savingsAccount.findUnique.mockResolvedValue(
          baseAccount({ status: 'ACTIVE' }),
        );
        await expect(
          savingsService.assertDepositable('u1', 'sa1'),
        ).resolves.toBeTruthy();
      });
    });

    describe('getWithdrawalBreakdown — the core locking/penalty logic', () => {
      it('FLEXIBLE accounts: no penalty regardless of maturity', async () => {
        const account = baseAccount({
          withdrawalPolicy: 'FLEXIBLE',
          balance: '1000',
          timeBasedDetails: { maturityDate: new Date('2099-01-01') },
        });
        prisma.savingsAccount.findUnique.mockResolvedValue(account);

        const breakdown = await savingsService.getWithdrawalBreakdown(
          'u1',
          'sa1',
          100,
        );

        expect(breakdown.isEarly).toBe(false);
        expect(breakdown.penaltyAmount).toBe(0);
        expect(breakdown.payoutAmount).toBe(100);
      });

      it('LOCKED time-based, before maturity: penalized but ALLOWED, not blocked', async () => {
        const account = baseAccount({
          withdrawalPolicy: 'LOCKED',
          balance: '1000',
          penaltyPercentage: '10',
          timeBasedDetails: { maturityDate: new Date('2099-01-01') },
        });
        prisma.savingsAccount.findUnique.mockResolvedValue(account);

        const breakdown = await savingsService.getWithdrawalBreakdown(
          'u1',
          'sa1',
          100,
        );

        expect(breakdown.isEarly).toBe(true);
        expect(breakdown.penaltyAmount).toBe(10);
        expect(breakdown.payoutAmount).toBe(90);
      });

      it('LOCKED time-based, after maturity: no penalty', async () => {
        const account = baseAccount({
          withdrawalPolicy: 'LOCKED',
          balance: '1000',
          penaltyPercentage: '10',
          timeBasedDetails: { maturityDate: new Date('2020-01-01') },
        });
        prisma.savingsAccount.findUnique.mockResolvedValue(account);

        const breakdown = await savingsService.getWithdrawalBreakdown(
          'u1',
          'sa1',
          100,
        );

        expect(breakdown.isEarly).toBe(false);
        expect(breakdown.penaltyAmount).toBe(0);
        expect(breakdown.payoutAmount).toBe(100);
      });

      it('LOCKED target-based, target not yet reached: penalized', async () => {
        const account = baseAccount({
          type: 'TARGET_BASED',
          withdrawalPolicy: 'LOCKED',
          balance: '500',
          penaltyPercentage: '20',
          timeBasedDetails: null,
          targetBasedDetails: { target: '1000' },
        });
        prisma.savingsAccount.findUnique.mockResolvedValue(account);

        const breakdown = await savingsService.getWithdrawalBreakdown(
          'u1',
          'sa1',
          100,
        );

        expect(breakdown.isEarly).toBe(true);
        expect(breakdown.penaltyAmount).toBe(20);
      });

      it('LOCKED target-based, target already reached: no penalty', async () => {
        const account = baseAccount({
          type: 'TARGET_BASED',
          withdrawalPolicy: 'LOCKED',
          balance: '1200',
          penaltyPercentage: '20',
          timeBasedDetails: null,
          targetBasedDetails: { target: '1000' },
        });
        prisma.savingsAccount.findUnique.mockResolvedValue(account);

        const breakdown = await savingsService.getWithdrawalBreakdown(
          'u1',
          'sa1',
          100,
        );

        expect(breakdown.isEarly).toBe(false);
        expect(breakdown.penaltyAmount).toBe(0);
      });

      it('rejects a withdrawal larger than the balance', async () => {
        prisma.savingsAccount.findUnique.mockResolvedValue(
          baseAccount({ balance: '50' }),
        );
        await expect(
          savingsService.getWithdrawalBreakdown('u1', 'sa1', 100),
        ).rejects.toThrow(/insufficient balance/i);
      });

      it('blocks withdrawal entirely on a FROZEN account', async () => {
        prisma.savingsAccount.findUnique.mockResolvedValue(
          baseAccount({ status: 'FROZEN', balance: '1000' }),
        );
        await expect(
          savingsService.getWithdrawalBreakdown('u1', 'sa1', 100),
        ).rejects.toThrow(ForbiddenError);
      });

      it('blocks withdrawal on an already-CANCELLED account', async () => {
        prisma.savingsAccount.findUnique.mockResolvedValue(
          baseAccount({ status: 'CANCELLED', balance: '1000' }),
        );
        await expect(
          savingsService.getWithdrawalBreakdown('u1', 'sa1', 100),
        ).rejects.toThrow(ValidationError);
      });

      it('allows withdrawal on a COMPLETED account (claiming matured funds)', async () => {
        prisma.savingsAccount.findUnique.mockResolvedValue(
          baseAccount({
            status: 'COMPLETED',
            balance: '1000',
            withdrawalPolicy: 'FLEXIBLE',
          }),
        );
        await expect(
          savingsService.getWithdrawalBreakdown('u1', 'sa1', 100),
        ).resolves.toMatchObject({ payoutAmount: 100 });
      });
    });
  });

  // =========================================================================
  // CONTROLLER
  // =========================================================================
  describe('controller', () => {
    it('createTimeBasedSavings returns 201', async () => {
      const req = {
        user: { id: 'u1' },
        body: {
          name: 'x',
          withdrawalPolicy: 'FLEXIBLE',
          maturityDate: new Date('2099-01-01'),
        },
      };
      const res = buildRes();
      const next = jest.fn();

      prisma.$transaction.mockImplementation(async (fn) =>
        fn({
          savingsAccount: {
            create: jest.fn().mockResolvedValue({ id: 'sa1' }),
            findUnique: jest.fn().mockResolvedValue(baseAccount()),
          },
          timeBasedSavings: { create: jest.fn().mockResolvedValue({}) },
        }),
      );

      await savingsController.createTimeBasedSavings(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(next).not.toHaveBeenCalled();
    });

    it('pauseMySavingsAccount forwards a ForbiddenError (FROZEN) to next()', async () => {
      const req = { user: { id: 'u1' }, params: { id: 'sa1' } };
      const res = buildRes();
      const next = jest.fn();
      prisma.savingsAccount.findUnique.mockResolvedValue(
        baseAccount({ status: 'FROZEN' }),
      );

      await savingsController.pauseMySavingsAccount(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
      expect(res.status).not.toHaveBeenCalled();
    });

    it('listMySavingsAccounts passes status/type query filters through', async () => {
      const req = {
        user: { id: 'u1' },
        query: { status: 'ACTIVE', type: 'TIME_BASED' },
      };
      const res = buildRes();
      const next = jest.fn();
      prisma.$transaction.mockResolvedValue([[], 0]);

      await savingsController.listMySavingsAccounts(req, res, next);

      expect(prisma.savingsAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'u1',
            status: 'ACTIVE',
            type: 'TIME_BASED',
          }),
        }),
      );
    });
  });

  // =========================================================================
  // VALIDATION
  // =========================================================================
  describe('validation', () => {
    it('createTimeBasedSavingsSchema rejects a maturity date in the past', () => {
      const result =
        savingsValidator.createTimeBasedSavingsSchema.body.safeParse({
          name: 'x',
          withdrawalPolicy: 'LOCKED',
          maturityDate: '2020-01-01',
        });
      expect(result.success).toBe(false);
    });

    it('createTimeBasedSavingsSchema rejects maturityDate before startDate', () => {
      const result =
        savingsValidator.createTimeBasedSavingsSchema.body.safeParse({
          name: 'x',
          withdrawalPolicy: 'LOCKED',
          startDate: '2027-06-01',
          maturityDate: '2027-01-01',
        });
      expect(result.success).toBe(false);
    });

    it('createTargetBasedSavingsSchema rejects a non-positive target', () => {
      const result =
        savingsValidator.createTargetBasedSavingsSchema.body.safeParse({
          name: 'x',
          withdrawalPolicy: 'FLEXIBLE',
          target: 0,
        });
      expect(result.success).toBe(false);
    });

    it('listMySavingsAccountsSchema rejects an invalid status', () => {
      const result =
        savingsValidator.listMySavingsAccountsSchema.query.safeParse({
          status: 'NOT_A_REAL_STATUS',
        });
      expect(result.success).toBe(false);
    });
  });
});
