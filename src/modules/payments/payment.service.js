import crypto from 'crypto';
import * as paymentModel from './payment.model.js';
import * as paychangu from '../../payments/providers/paychangu.provider.js';
import * as transactionService from '../transactions/transaction.service.js';
import * as savingsService from '../savings/savings.service.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

const APP_BASE_URL = process.env.APP_BASE_URL; // e.g. https://api.kwachainvest.mw
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

  // Idempotency is enforced at the DB level via Transaction.idempotencyKey
  // being @unique — if this exact reference were ever reused, the create
  // below would fail rather than silently double-charging.
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
    // The charge call itself failed (network/4xx from PayChangu) — mark
    // both records FAILED now rather than leaving them stuck PENDING
    // forever with no webhook ever coming to resolve them.
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
    chargeResponse.data?.charge_id ?? chargeResponse.data?.chargeId;

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

  // NOTE: exact response field name for the checkout URL is unconfirmed —
  // PayChangu's docs didn't render an example body at the time this was
  // written. Verify against a live sandbox call and adjust this line.
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
  // Ownership already enforced inside getMyTransactionById.
  return transactionService.getMyTransactionById(userId, transactionId);
};

//  don't trust the webhook payload's status field
// alone — call the appropriate verify endpoint server-side before crediting
// anything.

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

  // Webhooks can be retried by the sender — if we've already recorded this
  // exact event id, acknowledge and stop, rather than double-processing.
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
    // Nothing on our side matches this event — log it and stop; don't
    // guess which transaction it might belong to.
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
    const verified =
      gatewayTransaction.mode === 'DIRECT_MOBILE_MONEY'
        ? await paychangu.verifyDirectChargeStatus(providerEventId)
        : await paychangu.verifyHostedCheckoutStatus(providerEventId);

    const verifiedStatus = (verified.data?.status ?? '').toLowerCase();
    const transaction = await transactionService.getTransactionByIdAdmin(
      gatewayTransaction.transactionId,
    );

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

      if (transaction.type === 'DEPOSIT') {
        await savingsService.incrementBalance(
          transaction.savingsAccountId,
          transaction.amount,
        );
      }

      if (transaction.provider && transaction.payerPhoneNumber) {
        await paymentModel.upsertSavedPaymentMethod({
          userId: transaction.savingsAccount.userId,
          provider: transaction.provider,
          operatorRefId:
            gatewayTransaction.responsePayload?.data?.operator_ref_id ?? '',
          phoneNumber: transaction.payerPhoneNumber,
          isVerified: true,
        });
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
    }
    // Any other status (still pending/processing) — leave as-is, a
    // later webhook or manual status check will resolve it.

    await paymentModel.markWebhookEventProcessed(webhookEvent.id);
    return { processed: true };
  } catch (err) {
    await paymentModel.markWebhookEventFailed(webhookEvent.id, err.message);
    throw err;
  }
};
