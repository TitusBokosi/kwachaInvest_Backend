import { jest } from '@jest/globals';

jest.mock('../../config/client.js', () => ({
  __esModule: true,
  default: {
    user: { count: jest.fn() },
    savingsAccount: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    transaction: { aggregate: jest.fn(), groupBy: jest.fn() },
    auditLog: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../notifications/notification.service.js', () => ({
  sendSavingsFrozenEmail: jest.fn(),
  sendSavingsUnfrozenEmail: jest.fn(),
}));

import prisma from '../../config/client.js';
import * as notificationService from '../notifications/notification.service.js';
import * as adminRepository from './admin.repository.js';
import * as adminService from './admin.service.js';
import * as adminController from './admin.controller.js';
import * as adminValidator from './admin.validator.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

const buildRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const account = (overrides = {}) => ({
  id: 'sa1',
  name: 'My Savings',
  status: 'ACTIVE',
  user: { id: 'u1', fullName: 'Tee', email: 'tee@example.com' },
  ...overrides,
});

describe('Admin module', () => {
  describe('repository', () => {
    it('getDashboardStats converts Decimal sums to plain numbers', async () => {
      prisma.$transaction.mockResolvedValue([
        10,
        8,
        { _sum: { balance: '5000.50' }, _count: 4 },
        [{ status: 'ACTIVE', _count: 3 }],
        [{ type: 'TIME_BASED', _count: 2 }],
        { _sum: { amount: '1200' }, _count: 6 },
        [{ status: 'SUCCESS', _count: 6 }],
      ]);

      const stats = await adminRepository.getDashboardStats();

      expect(stats.savings.totalBalance).toBe(5000.5);
      expect(typeof stats.savings.totalBalance).toBe('number');
      expect(stats.users).toEqual({ total: 10, active: 8 });
    });

    it("getAllSavingsAccounts includes the owning user's contact info", async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      await adminRepository.getAllSavingsAccounts({}, {});
      const [args] = prisma.savingsAccount.findMany.mock.calls.at(-1);
      expect(args.include.user.select).toEqual(
        expect.objectContaining({ email: true, phoneNumber: true }),
      );
    });
  });

  describe('service', () => {
    describe('freezeSavingsAccount', () => {
      it("throws NotFoundError when the account doesn't exist", async () => {
        prisma.savingsAccount.findUnique.mockResolvedValue(null);
        await expect(
          adminService.freezeSavingsAccount('admin1', 'sa1', 'fraud check'),
        ).rejects.toThrow(NotFoundError);
      });

      it('refuses to double-freeze an already-FROZEN account', async () => {
        prisma.savingsAccount.findUnique.mockResolvedValue(
          account({ status: 'FROZEN' }),
        );
        await expect(
          adminService.freezeSavingsAccount('admin1', 'sa1'),
        ).rejects.toThrow(ValidationError);
      });

      it('refuses to freeze a COMPLETED or CANCELLED account', async () => {
        prisma.savingsAccount.findUnique.mockResolvedValue(
          account({ status: 'COMPLETED' }),
        );
        await expect(
          adminService.freezeSavingsAccount('admin1', 'sa1'),
        ).rejects.toThrow(ValidationError);
      });

      it("on success: updates status, writes an audit log with the acting admin's id, and emails the user", async () => {
        prisma.savingsAccount.findUnique.mockResolvedValue(
          account({ status: 'ACTIVE' }),
        );
        prisma.savingsAccount.update.mockResolvedValue(
          account({ status: 'FROZEN' }),
        );
        prisma.auditLog.create.mockResolvedValue({});

        await adminService.freezeSavingsAccount('admin1', 'sa1', 'fraud check');

        expect(prisma.savingsAccount.update).toHaveBeenCalledWith({
          where: { id: 'sa1' },
          data: { status: 'FROZEN' },
        });
        expect(prisma.auditLog.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            userId: 'admin1',
            action: 'SAVINGS_ACCOUNT_FROZEN',
            entityId: 'sa1',
          }),
        });
        expect(notificationService.sendSavingsFrozenEmail).toHaveBeenCalledWith(
          account().user,
          expect.objectContaining({ reason: 'fraud check' }),
        );
      });
    });

    describe('unfreezeSavingsAccount', () => {
      it("refuses to unfreeze an account that isn't currently FROZEN", async () => {
        prisma.savingsAccount.findUnique.mockResolvedValue(
          account({ status: 'ACTIVE' }),
        );
        await expect(
          adminService.unfreezeSavingsAccount('admin1', 'sa1'),
        ).rejects.toThrow(ValidationError);
      });

      it('on success: restores ACTIVE status and emails the user', async () => {
        prisma.savingsAccount.findUnique.mockResolvedValue(
          account({ status: 'FROZEN' }),
        );
        prisma.savingsAccount.update.mockResolvedValue(
          account({ status: 'ACTIVE' }),
        );

        await adminService.unfreezeSavingsAccount('admin1', 'sa1');

        expect(prisma.savingsAccount.update).toHaveBeenCalledWith({
          where: { id: 'sa1' },
          data: { status: 'ACTIVE' },
        });
        expect(notificationService.sendSavingsUnfrozenEmail).toHaveBeenCalled();
      });
    });
  });

  describe('controller', () => {
    it('freezeSavingsAccount passes req.user.id as the acting admin, separate from req.params.id (the target)', async () => {
      const req = {
        user: { id: 'admin1' },
        params: { id: 'sa1' },
        body: { reason: 'test' },
      };
      const res = buildRes();
      const next = jest.fn();
      prisma.savingsAccount.findUnique.mockResolvedValue(
        account({ status: 'ACTIVE' }),
      );
      prisma.savingsAccount.update.mockResolvedValue(
        account({ status: 'FROZEN' }),
      );

      await adminController.freezeSavingsAccount(req, res, next);

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'admin1' }),
        }),
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('getDashboardStats forwards no params at all', async () => {
      const req = {};
      const res = buildRes();
      const next = jest.fn();
      prisma.$transaction.mockResolvedValue([
        0,
        0,
        { _sum: { balance: null }, _count: 0 },
        [],
        [],
        { _sum: { amount: null }, _count: 0 },
        [],
      ]);

      await adminController.getDashboardStats(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('freezeSavingsAccountSchema treats reason as optional', () => {
      expect(
        adminValidator.freezeSavingsAccountSchema.body.safeParse({}).success,
      ).toBe(true);
    });

    it('savingsAccountListQuerySchema rejects an invalid status enum', () => {
      expect(
        adminValidator.savingsAccountListQuerySchema.query.safeParse({
          status: 'BOGUS',
        }).success,
      ).toBe(false);
    });

    it('auditLogQuerySchema accepts a from/to date range', () => {
      const result = adminValidator.auditLogQuerySchema.query.safeParse({
        from: '2026-01-01',
        to: '2026-02-01',
      });
      expect(result.success).toBe(true);
    });
  });
});
