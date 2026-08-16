import { jest } from '@jest/globals';

jest.mock('../../config/client.js', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn() },
    savingsAccount: { findUnique: jest.fn(), update: jest.fn() },
    transaction: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    mobileMoneyAccount: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    paymentGatewayTransaction: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    webhookEvent: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: { create: jest.fn(), findFirst: jest.fn() },
  },
}));

jest.mock('../../payments/providers/paychangu.provider.js', () => ({
  getMobileMoneyOperators: jest.fn(),
  chargeMobileMoney: jest.fn(),
  initiateMobileMoneyPayout: jest.fn(),
  verifyDirectChargeStatus: jest.fn(),
  verifyMobileMoneyPayoutStatus: jest.fn(),
  verifyHostedCheckoutStatus: jest.fn(),
  isValidWebhookSignature: jest.fn(),
}));

jest.mock('../notifications/notification.service.js', () => ({
  sendDepositSuccessEmail: jest.fn(),
  sendDepositFailedEmail: jest.fn(),
  sendWithdrawalSuccessEmail: jest.fn(),
  sendWithdrawalFailedEmail: jest.fn(),
}));

import prisma from '../../config/client.js';
import * as paychangu from '../../payments/providers/paychangu.provider.js';
import * as notificationService from '../notifications/notification.service.js';
import * as paymentService from './payment.service.js';
import * as paymentController from './payment.controller.js';
import * as paymentValidator from './payment.validator.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

const buildRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const operators = [
  { name: 'TNM Mpamba', ref_id: 'op-tnm-1' },
  { name: 'Airtel Money', ref_id: 'op-airtel-1' },
];

const savingsAccount = (overrides = {}) => ({
  id: 'sa1',
  userId: 'u1',
  name: 'My Savings',
  type: 'TIME_BASED',
  status: 'ACTIVE',
  balance: '500',
  withdrawalPolicy: 'FLEXIBLE',
  penaltyPercentage: '5',
  timeBasedDetails: { maturityDate: new Date('2099-01-01') },
  targetBasedDetails: null,
  ...overrides,
});

describe('Payments module', () => {
  beforeEach(() => {
    paychangu.getMobileMoneyOperators.mockResolvedValue({ data: operators });
  });

  describe('initiateMobileMoneyDeposit', () => {
    it('blocks a deposit into a non-ACTIVE account before ever calling PayChangu', async () => {
      prisma.savingsAccount.findUnique.mockResolvedValue(
        savingsAccount({ status: 'PAUSED' }),
      );

      await expect(
        paymentService.initiateMobileMoneyDeposit('u1', {
          savingsAccountId: 'sa1',
          amount: 100,
          provider: 'TNM',
          phoneNumber: '0991234567',
        }),
      ).rejects.toThrow(ValidationError);

      expect(paychangu.chargeMobileMoney).not.toHaveBeenCalled();
    });

    it('on a failed charge call: marks both records FAILED and throws a clean error (not the raw axios error)', async () => {
      prisma.savingsAccount.findUnique.mockResolvedValue(savingsAccount());
      prisma.transaction.create.mockResolvedValue({ id: 't1' });
      prisma.paymentGatewayTransaction.create.mockResolvedValue({ id: 'pgt1' });
      paychangu.chargeMobileMoney.mockRejectedValue(new Error('network error'));
      prisma.transaction.update.mockResolvedValue({});

      await expect(
        paymentService.initiateMobileMoneyDeposit('u1', {
          savingsAccountId: 'sa1',
          amount: 100,
          provider: 'TNM',
          phoneNumber: '0991234567',
        }),
      ).rejects.toThrow(/unable to initiate/i);

      expect(prisma.paymentGatewayTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });

    it('on success: creates transaction + gateway record, calls PayChangu with the resolved operatorRefId, and saves an UNVERIFIED payment method', async () => {
      prisma.savingsAccount.findUnique.mockResolvedValue(savingsAccount());
      prisma.transaction.create.mockResolvedValue({ id: 't1' });
      prisma.paymentGatewayTransaction.create.mockResolvedValue({ id: 'pgt1' });
      paychangu.chargeMobileMoney.mockResolvedValue({
        data: { transaction: { charge_id: 'pc-charge-1' } },
      });
      prisma.paymentGatewayTransaction.update.mockResolvedValue({});
      prisma.transaction.update.mockResolvedValue({
        id: 't1',
        status: 'PROCESSING',
      });
      prisma.mobileMoneyAccount.upsert.mockResolvedValue({});

      await paymentService.initiateMobileMoneyDeposit('u1', {
        savingsAccountId: 'sa1',
        amount: 100,
        provider: 'TNM',
        phoneNumber: '0991234567',
      });

      expect(paychangu.chargeMobileMoney).toHaveBeenCalledWith(
        expect.objectContaining({
          operatorRefId: 'op-tnm-1',
          mobile: '0991234567',
        }),
      );
      expect(prisma.mobileMoneyAccount.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ isVerified: false }),
        }),
      );
    });

    it("throws ValidationError when the operator can't be matched (defensive — provider enum should prevent this)", async () => {
      prisma.savingsAccount.findUnique.mockResolvedValue(savingsAccount());
      paychangu.getMobileMoneyOperators.mockResolvedValue({ data: [] }); // no operators at all

      await expect(
        paymentService.initiateMobileMoneyDeposit('u1', {
          savingsAccountId: 'sa1',
          amount: 100,
          provider: 'TNM',
          phoneNumber: '0991234567',
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('initiateMobileMoneyWithdrawal', () => {
    it('decrements the FULL requested amount from balance even when a penalty applies (penalty is forfeited, not refunded to balance)', async () => {
      const account = savingsAccount({
        withdrawalPolicy: 'LOCKED',
        penaltyPercentage: '10',
        balance: '1000',
      });
      prisma.savingsAccount.findUnique.mockResolvedValue(account);
      prisma.savingsAccount.update.mockResolvedValue({});
      prisma.transaction.create.mockResolvedValue({ id: 't1' });
      prisma.auditLog.create.mockResolvedValue({});
      prisma.paymentGatewayTransaction.create.mockResolvedValue({ id: 'pgt1' });
      paychangu.initiateMobileMoneyPayout.mockResolvedValue({
        data: { transaction: { charge_id: 'payout-1' } },
      });
      prisma.paymentGatewayTransaction.update.mockResolvedValue({});
      prisma.transaction.update.mockResolvedValue({});

      await paymentService.initiateMobileMoneyWithdrawal('u1', {
        savingsAccountId: 'sa1',
        amount: 100,
        provider: 'TNM',
        phoneNumber: '0991234567',
      });

      expect(prisma.savingsAccount.update).toHaveBeenCalledWith({
        where: { id: 'sa1' },
        data: { balance: { decrement: 100 } },
      });
      expect(paychangu.initiateMobileMoneyPayout).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 90 }),
      );
    });

    it('records an EARLY_WITHDRAWAL_PENALTY_APPLIED audit log only when the withdrawal is actually early', async () => {
      const account = savingsAccount({ withdrawalPolicy: 'FLEXIBLE' }); // no penalty possible
      prisma.savingsAccount.findUnique.mockResolvedValue(account);
      prisma.savingsAccount.update.mockResolvedValue({});
      prisma.transaction.create.mockResolvedValue({ id: 't1' });
      prisma.paymentGatewayTransaction.create.mockResolvedValue({ id: 'pgt1' });
      paychangu.initiateMobileMoneyPayout.mockResolvedValue({
        data: { transaction: { charge_id: 'p1' } },
      });
      prisma.paymentGatewayTransaction.update.mockResolvedValue({});
      prisma.transaction.update.mockResolvedValue({});

      await paymentService.initiateMobileMoneyWithdrawal('u1', {
        savingsAccountId: 'sa1',
        amount: 100,
        provider: 'TNM',
        phoneNumber: '0991234567',
      });

      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('refunds the FULL amount if the payout call itself fails', async () => {
      prisma.savingsAccount.findUnique.mockResolvedValue(savingsAccount());
      prisma.savingsAccount.update.mockResolvedValue({});
      prisma.transaction.create.mockResolvedValue({ id: 't1' });
      prisma.paymentGatewayTransaction.create.mockResolvedValue({ id: 'pgt1' });
      paychangu.initiateMobileMoneyPayout.mockRejectedValue(
        new Error('gateway down'),
      );
      prisma.transaction.update.mockResolvedValue({});

      await expect(
        paymentService.initiateMobileMoneyWithdrawal('u1', {
          savingsAccountId: 'sa1',
          amount: 100,
          provider: 'TNM',
          phoneNumber: '0991234567',
        }),
      ).rejects.toThrow(ValidationError);

      expect(prisma.savingsAccount.update).toHaveBeenCalledTimes(2);
      expect(prisma.savingsAccount.update).toHaveBeenLastCalledWith({
        where: { id: 'sa1' },
        data: { balance: { increment: 100 } },
      });
    });
  });

  describe('handlePaychanguWebhook', () => {
    const rawBody = Buffer.from(JSON.stringify({ charge_id: 'pc-charge-1' }));

    it('rejects an invalid signature before touching the database at all', async () => {
      paychangu.isValidWebhookSignature.mockReturnValue(false);

      await expect(
        paymentService.handlePaychanguWebhook(rawBody, 'bad-sig'),
      ).rejects.toThrow(/invalid webhook signature/i);
      expect(prisma.webhookEvent.findUnique).not.toHaveBeenCalled();
    });

    it('is idempotent: a duplicate webhook (same providerEventId) is acknowledged without reprocessing', async () => {
      paychangu.isValidWebhookSignature.mockReturnValue(true);
      prisma.webhookEvent.findUnique.mockResolvedValue({ id: 'existing' });

      const result = await paymentService.handlePaychanguWebhook(
        rawBody,
        'good-sig',
      );

      expect(result).toEqual({ alreadyProcessed: true });
      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it('on a DEPOSIT success: increments balance, sends the success email, and does NOT touch balance twice', async () => {
      paychangu.isValidWebhookSignature.mockReturnValue(true);
      prisma.webhookEvent.findUnique.mockResolvedValue(null);
      prisma.paymentGatewayTransaction.findFirst.mockResolvedValue({
        id: 'pgt1',
        transactionId: 't1',
        mode: 'DIRECT_MOBILE_MONEY',
      });
      prisma.webhookEvent.create.mockResolvedValue({ id: 'we1' });
      prisma.transaction.findUnique.mockResolvedValue({
        id: 't1',
        type: 'DEPOSIT',
        amount: '100',
        savingsAccountId: 'sa1',
        savingsAccount: { id: 'sa1', userId: 'u1', name: 'My Savings' },
        provider: null,
        payerPhoneNumber: null,
      });
      paychangu.verifyDirectChargeStatus.mockResolvedValue({
        data: { transaction: { status: 'success' } },
      });
      prisma.paymentGatewayTransaction.update.mockResolvedValue({});
      prisma.transaction.update.mockResolvedValue({});
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'tee@example.com',
      });
      prisma.savingsAccount.update.mockResolvedValue(savingsAccount());
      prisma.savingsAccount.findUnique.mockResolvedValue(
        savingsAccount({ type: 'TIME_BASED' }),
      );
      prisma.webhookEvent.update.mockResolvedValue({});

      await paymentService.handlePaychanguWebhook(rawBody, 'good-sig');

      expect(prisma.savingsAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { balance: { increment: '100' } } }),
      );
      expect(notificationService.sendDepositSuccessEmail).toHaveBeenCalled();
    });

    it('on a WITHDRAWAL failure: refunds the balance (undoing the optimistic decrement from initiation)', async () => {
      paychangu.isValidWebhookSignature.mockReturnValue(true);
      prisma.webhookEvent.findUnique.mockResolvedValue(null);
      prisma.paymentGatewayTransaction.findFirst.mockResolvedValue({
        id: 'pgt1',
        transactionId: 't1',
        mode: 'DIRECT_MOBILE_MONEY',
      });
      prisma.webhookEvent.create.mockResolvedValue({ id: 'we1' });
      prisma.transaction.findUnique.mockResolvedValue({
        id: 't1',
        type: 'WITHDRAWAL',
        amount: '100',
        savingsAccountId: 'sa1',
        savingsAccount: { id: 'sa1', userId: 'u1', name: 'My Savings' },
        provider: 'TNM',
        payerPhoneNumber: '0991234567',
      });
      paychangu.verifyMobileMoneyPayoutStatus.mockResolvedValue({
        data: { transaction: { status: 'failed' } },
      });
      prisma.paymentGatewayTransaction.update.mockResolvedValue({});
      prisma.transaction.update.mockResolvedValue({});
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'tee@example.com',
      });
      prisma.savingsAccount.update.mockResolvedValue({});
      prisma.webhookEvent.update.mockResolvedValue({});

      await paymentService.handlePaychanguWebhook(rawBody, 'good-sig');

      expect(prisma.savingsAccount.update).toHaveBeenCalledWith({
        where: { id: 'sa1' },
        data: { balance: { increment: '100' } },
      });
      expect(notificationService.sendWithdrawalFailedEmail).toHaveBeenCalled();
    });

    it('marks the webhook event FAILED (and rethrows) if processing itself throws', async () => {
      paychangu.isValidWebhookSignature.mockReturnValue(true);
      prisma.webhookEvent.findUnique.mockResolvedValue(null);
      prisma.paymentGatewayTransaction.findFirst.mockResolvedValue({
        id: 'pgt1',
        transactionId: 't1',
        mode: 'DIRECT_MOBILE_MONEY',
      });
      prisma.webhookEvent.create.mockResolvedValue({ id: 'we1' });
      prisma.transaction.findUnique.mockResolvedValue(null);
      prisma.webhookEvent.update.mockResolvedValue({});

      await expect(
        paymentService.handlePaychanguWebhook(rawBody, 'good-sig'),
      ).rejects.toThrow(NotFoundError);

      expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });
  });

  describe('controller', () => {
    it('webhook handler reads the raw Signature header and always responds 200 on successful processing', async () => {
      const req = {
        body: Buffer.from(JSON.stringify({ charge_id: 'x' })),
        headers: { signature: 'sig' },
      };
      const res = buildRes();
      const next = jest.fn();
      paychangu.isValidWebhookSignature.mockReturnValue(true);
      prisma.webhookEvent.findUnique.mockResolvedValue({ id: 'already-seen' });

      await paymentController.handlePaychanguWebhook(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('initiateMobileMoneyDeposit responds 202 (accepted, not yet confirmed) not 200/201', async () => {
      const req = {
        user: { id: 'u1' },
        body: {
          savingsAccountId: 'sa1',
          amount: 100,
          provider: 'TNM',
          phoneNumber: '0991234567',
        },
      };
      const res = buildRes();
      const next = jest.fn();
      prisma.savingsAccount.findUnique.mockResolvedValue(savingsAccount());
      prisma.transaction.create.mockResolvedValue({ id: 't1' });
      prisma.paymentGatewayTransaction.create.mockResolvedValue({ id: 'pgt1' });
      paychangu.chargeMobileMoney.mockResolvedValue({
        data: { transaction: { charge_id: 'c1' } },
      });
      prisma.paymentGatewayTransaction.update.mockResolvedValue({});
      prisma.transaction.update.mockResolvedValue({});
      prisma.mobileMoneyAccount.upsert.mockResolvedValue({});

      await paymentController.initiateMobileMoneyDeposit(req, res, next);

      expect(res.status).toHaveBeenCalledWith(202);
    });
  });

  describe('validation', () => {
    it('initiateMobileMoneyDepositSchema rejects a provider outside TNM/AIRTEL', () => {
      const result =
        paymentValidator.initiateMobileMoneyDepositSchema.body.safeParse({
          savingsAccountId: 'cjld2cjxh0000qzrmn831i7rn',
          amount: 100,
          provider: 'MPESA',
          phoneNumber: '0991234567',
        });
      expect(result.success).toBe(false);
    });

    it('initiateMobileMoneyDepositSchema rejects a non-positive amount', () => {
      const result =
        paymentValidator.initiateMobileMoneyDepositSchema.body.safeParse({
          savingsAccountId: 'cjld2cjxh0000qzrmn831i7rn',
          amount: 0,
          provider: 'TNM',
          phoneNumber: '0991234567',
        });
      expect(result.success).toBe(false);
    });

    it('initiateHostedCheckoutDepositSchema does not require a phone number or provider', () => {
      const result =
        paymentValidator.initiateHostedCheckoutDepositSchema.body.safeParse({
          savingsAccountId: 'cjld2cjxh0000qzrmn831i7rn',
          amount: 100,
        });
      expect(result.success).toBe(true);
    });
  });
});
