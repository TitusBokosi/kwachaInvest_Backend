import crypto from 'crypto';
import * as paymentModel from './payment.model.js';
import * as paychangu from '../../payments/providers/paychangu.provider.js';
import * as transactionService from '../transactions/transaction.service.js';
import * as savingsService from '../savings/savings.service.js';
import * as usersRepository from '../users/user.repository.js';
import * as notificationService from '../notifications/notification.service.js';
import { recordAuditLog, findLatestAuditLog } from '../../utils/auditLog.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

const APP_BASE_URL = process.env.APP_BASE_URL;
const WEBHOOK_PATH = '/api/payments/webhooks/paychangu';

const PROVIDER_NAME_MATCHERS = {
  TNM: /tnm/i,
  AIRTEL: /airtel/i,
};

const matchOperatorRefId = (operators, provider) => {
  const matcher = PROVIDER_NAME_MATCHERS[provider];
  const match = operators.find((op) =>
    matcher.test(op.name ?? op.short_code ?? ''),
  );
  if (!match) {
    throw new ValidationError(
      `${provider} is not currently supported by the payment provider`,
    );
  }
  return match.ref_id ?? match.id;
};

export const listMobileMoneyOperators = async () => {
  const response = await paychangu.getMobileMoneyOperators();
  return response.data ?? response;
};

export const listMySavedPaymentMethods = async (userId) => {
  return paymentModel.findSavedPaymentMethodsForUser(userId);
};

export const deleteMySavedPaymentMethod = async (
  userId,
  savedPaymentMethodId,
) => {
  const method =
    await paymentModel.findSavedPaymentMethodById(savedPaymentMethodId);
  if (!method || method.userId !== userId) {
    throw new NotFoundError('Saved payment method not found');
  }
  await paymentModel.deleteSavedPaymentMethod(savedPaymentMethodId);
};

export const initiateMobileMoneyDeposit = async (
  userId,
  { savingsAccountId, amount, provider, phoneNumber },
) => {
  await savingsService.assertDepositable(userId, savingsAccountId);

  const operators = await listMobileMoneyOperators();
  const operatorRefId = matchOperatorRefId(operators, provider);

  const reference = crypto.randomUUID();

  const transaction = await transactionService.createTransaction({
    savingsAccountId,
    provider,
    payerPhoneNumber: phoneNumber,
    type: 'DEPOSIT',
    amount,
    idempotencyKey: reference,
  });

  const gatewayTransaction = await paymentModel.createPaymentGatewayTransaction(
    {
      transactionId: transaction.id,
      mode: 'DIRECT_MOBILE_MONEY',
      status: 'INITIATED',
    },
  );

  let chargeResponse;
  try {
    chargeResponse = await paychangu.chargeMobileMoney({
      mobile: phoneNumber,
      operatorRefId,
      amount,
      chargeId: reference,
    });
  } catch (err) {
    await paymentModel.updatePaymentGatewayTransaction(gatewayTransaction.id, {
      status: 'FAILED',
      responsePayload: err.response?.data ?? { message: err.message },
    });
    await transactionService.updateTransactionStatus(transaction.id, 'FAILED');
    throw new ValidationError(
      'Unable to initiate the mobile money charge. Please try again.',
    );
  }

  const gatewayChargeId =
    chargeResponse.data?.transaction?.charge_id ??
    chargeResponse.data?.transaction?.ref_id;

  await paymentModel.updatePaymentGatewayTransaction(gatewayTransaction.id, {
    gatewayReference: gatewayChargeId ? String(gatewayChargeId) : null,
    status: 'PENDING',
    responsePayload: chargeResponse,
  });

  const updatedTransaction = await transactionService.updateTransactionStatus(
    transaction.id,
    'PROCESSING',
  );

  await paymentModel.upsertSavedPaymentMethod({
    userId,
    provider,
    operatorRefId,
    phoneNumber,
    isVerified: false,
  });

  return updatedTransaction;
};

export const initiateMobileMoneyWithdrawal = async (
  userId,
  { savingsAccountId, amount, provider, phoneNumber },
) => {
  const breakdown = await savingsService.getWithdrawalBreakdown(
    userId,
    savingsAccountId,
    amount,
  );

  const operators = await listMobileMoneyOperators();
  const operatorRefId = matchOperatorRefId(operators, provider);

  const reference = crypto.randomUUID();

  await savingsService.decrementBalance(savingsAccountId, breakdown.amount);

  const transaction = await transactionService.createTransaction({
    savingsAccountId,
    provider,
    payerPhoneNumber: phoneNumber,
    type: 'WITHDRAWAL',
    amount: breakdown.amount,
    idempotencyKey: reference,
  });

  if (breakdown.isEarly) {
    await recordAuditLog({
      userId,
      action: 'EARLY_WITHDRAWAL_PENALTY_APPLIED',
      entityType: 'SavingsAccount',
      entityId: savingsAccountId,
      metadata: {
        transactionId: transaction.id,
        requestedAmount: breakdown.amount,
        penaltyPercentage: breakdown.penaltyPercentage,
        penaltyAmount: breakdown.penaltyAmount,
        payoutAmount: breakdown.payoutAmount,
      },
    });
  }

  const gatewayTransaction = await paymentModel.createPaymentGatewayTransaction(
    {
      transactionId: transaction.id,
      mode: 'DIRECT_MOBILE_MONEY',
      status: 'INITIATED',
    },
  );

  let payoutResponse;
  try {
    payoutResponse = await paychangu.initiateMobileMoneyPayout({
      mobile: phoneNumber,
      operatorRefId,
      amount: breakdown.payoutAmount,
      chargeId: reference,
    });
  } catch (err) {
    await savingsService.incrementBalance(savingsAccountId, breakdown.amount);
    await paymentModel.updatePaymentGatewayTransaction(gatewayTransaction.id, {
      status: 'FAILED',
      responsePayload: err.response?.data ?? { message: err.message },
    });
    await transactionService.updateTransactionStatus(transaction.id, 'FAILED');
    throw new ValidationError(
      'Unable to initiate the withdrawal. Please try again.',
    );
  }

  const gatewayChargeId =
    payoutResponse.data?.transaction?.charge_id ??
    payoutResponse.data?.transaction?.ref_id;

  await paymentModel.updatePaymentGatewayTransaction(gatewayTransaction.id, {
    gatewayReference: gatewayChargeId ? String(gatewayChargeId) : null,
    status: 'PENDING',
    responsePayload: payoutResponse,
  });

  return transactionService.updateTransactionStatus(
    transaction.id,
    'PROCESSING',
  );
};

export const initiateHostedCheckoutDeposit = async (
  userId,
  { savingsAccountId, amount, returnUrl },
) => {
  await savingsService.assertDepositable(userId, savingsAccountId);

  const reference = crypto.randomUUID();

  const transaction = await transactionService.createTransaction({
    savingsAccountId,
    type: 'DEPOSIT',
    amount,
    idempotencyKey: reference,
  });

  const gatewayTransaction = await paymentModel.createPaymentGatewayTransaction(
    {
      transactionId: transaction.id,
      mode: 'HOSTED_CHECKOUT',
      status: 'INITIATED',
    },
  );

  let checkoutResponse;
  try {
    checkoutResponse = await paychangu.initiateHostedCheckout({
      amount,
      txRef: reference,
      callbackUrl: `${APP_BASE_URL}${WEBHOOK_PATH}`,
      returnUrl,
      meta: { savingsAccountId, userId },
    });
  } catch (err) {
    await paymentModel.updatePaymentGatewayTransaction(gatewayTransaction.id, {
      status: 'FAILED',
      responsePayload: err.response?.data ?? { message: err.message },
    });
    await transactionService.updateTransactionStatus(transaction.id, 'FAILED');
    throw new ValidationError('Unable to start checkout. Please try again.');
  }

  const checkoutUrl =
    checkoutResponse.data?.checkout_url ?? checkoutResponse.data?.link;

  await paymentModel.updatePaymentGatewayTransaction(gatewayTransaction.id, {
    gatewayReference: reference,
    status: 'PENDING',
    responsePayload: checkoutResponse,
  });

  await transactionService.updateTransactionStatus(
    transaction.id,
    'PROCESSING',
  );

  return { transaction, checkoutUrl };
};

export const getMyDepositStatus = async (userId, transactionId) => {
  return transactionService.getMyTransactionById(userId, transactionId);
};

export const handlePaychanguWebhook = async (rawBody, signatureHeader) => {
  if (!paychangu.isValidWebhookSignature(rawBody, signatureHeader)) {
    throw new ValidationError('Invalid webhook signature');
  }

  const payload = JSON.parse(rawBody.toString('utf8'));
  const providerEventId = String(
    payload.charge_id ??
      payload.chargeId ??
      payload.tx_ref ??
      payload.reference,
  );

  const existingEvent =
    await paymentModel.findWebhookEventByProviderEventId(providerEventId);
  if (existingEvent) {
    return { alreadyProcessed: true };
  }

  const gatewayTransaction =
    await paymentModel.findPaymentGatewayTransactionByGatewayReference(
      providerEventId,
    );

  if (!gatewayTransaction) {
    await paymentModel.createWebhookEvent({
      paymentGatewayTransactionId: null,
      providerEventId,
      payload,
    });
    return { matched: false };
  }

  const webhookEvent = await paymentModel.createWebhookEvent({
    paymentGatewayTransactionId: gatewayTransaction.id,
    providerEventId,
    payload,
  });

  try {
    const transaction = await transactionService.getTransactionByIdAdmin(
      gatewayTransaction.transactionId,
    );

    let verified;
    if (
      gatewayTransaction.mode === 'DIRECT_MOBILE_MONEY' &&
      transaction.type === 'DEPOSIT'
    ) {
      verified = await paychangu.verifyDirectChargeStatus(providerEventId);
    } else if (
      gatewayTransaction.mode === 'DIRECT_MOBILE_MONEY' &&
      transaction.type === 'WITHDRAWAL'
    ) {
      verified = await paychangu.verifyMobileMoneyPayoutStatus(providerEventId);
    } else {
      verified = await paychangu.verifyHostedCheckoutStatus(providerEventId);
    }

    const verifiedStatus = (
      verified.data?.transaction?.status ?? ''
    ).toLowerCase();

    if (verifiedStatus === 'success' || verifiedStatus === 'successful') {
      await paymentModel.updatePaymentGatewayTransaction(
        gatewayTransaction.id,
        {
          status: 'SUCCESS',
          responsePayload: verified,
        },
      );
      await transactionService.updateTransactionStatus(
        transaction.id,
        'SUCCESS',
      );

      const user = await usersRepository.getUserById(
        transaction.savingsAccount.userId,
      );

      if (transaction.type === 'DEPOSIT') {
        await savingsService.incrementBalance(
          transaction.savingsAccountId,
          transaction.amount,
        );

        const updatedAccount = await savingsService.getMySavingsAccountById(
          transaction.savingsAccount.userId,
          transaction.savingsAccountId,
        );
        if (
          updatedAccount.type === 'TARGET_BASED' &&
          updatedAccount.targetBasedDetails &&
          Number(updatedAccount.balance) >=
            Number(updatedAccount.targetBasedDetails.target)
        ) {
          await savingsService.markCompleted(transaction.savingsAccountId);
        }

        if (user) {
          await notificationService.sendDepositSuccessEmail(user, {
            savingsAccountName: transaction.savingsAccount.name,
            amount: transaction.amount,
          });
        }
      } else {
        if (user) {
          const penaltyLog = await findLatestAuditLog({
            action: 'EARLY_WITHDRAWAL_PENALTY_APPLIED',
            entityType: 'SavingsAccount',
            entityId: transaction.savingsAccountId,
          });
          const penaltyAmount =
            penaltyLog?.metadata?.transactionId === transaction.id
              ? penaltyLog.metadata.penaltyAmount
              : 0;

          await notificationService.sendWithdrawalSuccessEmail(user, {
            savingsAccountName: transaction.savingsAccount.name,
            amount: transaction.amount,
            penaltyAmount,
          });
        }
      }

      if (transaction.provider && transaction.payerPhoneNumber) {
        const existingMethods =
          await paymentModel.findSavedPaymentMethodsForUser(
            transaction.savingsAccount.userId,
          );
        const existingMethod = existingMethods.find(
          (m) =>
            m.provider === transaction.provider &&
            m.phoneNumber === transaction.payerPhoneNumber,
        );
        if (existingMethod) {
          await paymentModel.upsertSavedPaymentMethod({
            userId: transaction.savingsAccount.userId,
            provider: transaction.provider,
            operatorRefId: existingMethod.operatorRefId,
            phoneNumber: transaction.payerPhoneNumber,
            isVerified: true,
          });
        }
      }
    } else if (verifiedStatus === 'failed' || verifiedStatus === 'cancelled') {
      await paymentModel.updatePaymentGatewayTransaction(
        gatewayTransaction.id,
        {
          status: 'FAILED',
          responsePayload: verified,
        },
      );
      await transactionService.updateTransactionStatus(
        transaction.id,
        'FAILED',
      );

      const user = await usersRepository.getUserById(
        transaction.savingsAccount.userId,
      );

      if (transaction.type === 'WITHDRAWAL') {
        await savingsService.incrementBalance(
          transaction.savingsAccountId,
          transaction.amount,
        );
        if (user) {
          await notificationService.sendWithdrawalFailedEmail(user, {
            savingsAccountName: transaction.savingsAccount.name,
            amount: transaction.amount,
          });
        }
      } else if (user) {
        await notificationService.sendDepositFailedEmail(user, {
          savingsAccountName: transaction.savingsAccount.name,
          amount: transaction.amount,
        });
      }
    }

    await paymentModel.markWebhookEventProcessed(webhookEvent.id);
    return { processed: true };
  } catch (err) {
    await paymentModel.markWebhookEventFailed(webhookEvent.id, err.message);
    throw err;
  }
};
