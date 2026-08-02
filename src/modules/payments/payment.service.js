import crypto from "crypto"
import * as paymentModel from "./payment.model.js"
import * as paychangu from "../../payments/providers/paychangu.provider.js"
import * as transactionService from "../transactions/transaction.service.js"
import * as savingsService from "../savings/savings.service.js"
import * as usersRepository from "../users/user.repository.js"
import * as notificationService from "../notifications/notification.service.js"
import { recordAuditLog, findLatestAuditLog } from "../../utils/auditLog.js"
import { NotFoundError, ValidationError } from "../../utils/errors.js"

const APP_BASE_URL = process.env.APP_BASE_URL; // e.g. https://api.kwachainvest.mw
const WEBHOOK_PATH = "/api/payments/webhooks/paychangu";

// Malawi only has these two mobile money operators today. PayChangu's own
// operator list is dynamic (fetched below), so this is only used to map a
// human-friendly name back to our fixed MobileMoneyProvider enum — if
// PayChangu adds a third operator, this mapping (and the enum) needs updating.
const PROVIDER_NAME_MATCHERS = {
    TNM: /tnm/i,
    AIRTEL: /airtel/i,
};

const matchOperatorRefId = (operators, provider) => {
    const matcher = PROVIDER_NAME_MATCHERS[provider];
    const match = operators.find((op) => matcher.test(op.name ?? op.short_code ?? ""));
    if (!match) {
        throw new ValidationError(`${provider} is not currently supported by the payment provider`);
    }
    return match.ref_id ?? match.id;
}

// ---------------------------------------------------------------------------
// Mobile Money operators (proxied — client never talks to PayChangu directly)
// ---------------------------------------------------------------------------

export const listMobileMoneyOperators = async () => {
    const response = await paychangu.getMobileMoneyOperators();
    return response.data ?? response;
}

// ---------------------------------------------------------------------------
// Saved payment methods
// ---------------------------------------------------------------------------

export const listMySavedPaymentMethods = async (userId) => {
    return paymentModel.findSavedPaymentMethodsForUser(userId);
}

export const deleteMySavedPaymentMethod = async (userId, savedPaymentMethodId) => {
    const method = await paymentModel.findSavedPaymentMethodById(savedPaymentMethodId);
    if (!method || method.userId !== userId) {
        throw new NotFoundError("Saved payment method not found");
    }
    await paymentModel.deleteSavedPaymentMethod(savedPaymentMethodId);
}

// ---------------------------------------------------------------------------
// Direct Charge — Mobile Money
// ---------------------------------------------------------------------------

export const initiateMobileMoneyDeposit = async (
    userId,
    { savingsAccountId, amount, provider, phoneNumber }
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
        type: "DEPOSIT",
        amount,
        idempotencyKey: reference,
    });

    const gatewayTransaction = await paymentModel.createPaymentGatewayTransaction({
        transactionId: transaction.id,
        mode: "DIRECT_MOBILE_MONEY",
        status: "INITIATED",
    });

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
            status: "FAILED",
            responsePayload: err.response?.data ?? { message: err.message },
        });
        await transactionService.updateTransactionStatus(transaction.id, "FAILED");
        throw new ValidationError(
            "Unable to initiate the mobile money charge. Please try again."
        );
    }

    const gatewayChargeId = chargeResponse.data?.transaction?.charge_id ?? chargeResponse.data?.transaction?.ref_id;

    await paymentModel.updatePaymentGatewayTransaction(gatewayTransaction.id, {
        gatewayReference: gatewayChargeId ? String(gatewayChargeId) : null,
        status: "PENDING",
        responsePayload: chargeResponse,
    });

    const updatedTransaction = await transactionService.updateTransactionStatus(
        transaction.id,
        "PROCESSING"
    );

    // Save/refresh the method for next time — NOT marked verified yet; that
    // only happens once we see an actual SUCCESS webhook for this number.
    await paymentModel.upsertSavedPaymentMethod({
        userId,
        provider,
        operatorRefId,
        phoneNumber,
        isVerified: false,
    });

    return updatedTransaction;
}

// ---------------------------------------------------------------------------
// Withdrawals — Mobile Money Payout
//
// Balance is decremented OPTIMISTICALLY at initiation, not on confirmed
// success. This is deliberate: it's what actually prevents a user from
// firing two withdrawal requests for the same money before the first one's
// webhook comes back (there's no separate "reserved" state to track — the
// balance itself IS the reservation). If the payout later fails, the
// webhook handler refunds the balance back.
// ---------------------------------------------------------------------------

export const initiateMobileMoneyWithdrawal = async (
    userId,
    { savingsAccountId, amount, provider, phoneNumber }
) => {
    const breakdown = await savingsService.getWithdrawalBreakdown(userId, savingsAccountId, amount);

    const operators = await listMobileMoneyOperators();
    const operatorRefId = matchOperatorRefId(operators, provider);

    const reference = crypto.randomUUID();

    // Full requested amount leaves the balance regardless of penalty — the
    // penalty portion is forfeited, not paid out (see getWithdrawalBreakdown).
    await savingsService.decrementBalance(savingsAccountId, breakdown.amount);

    const transaction = await transactionService.createTransaction({
        savingsAccountId,
        provider,
        payerPhoneNumber: phoneNumber,
        type: "WITHDRAWAL",
        amount: breakdown.amount,
        idempotencyKey: reference,
    });

    if (breakdown.isEarly) {
        await recordAuditLog({
            userId,
            action: "EARLY_WITHDRAWAL_PENALTY_APPLIED",
            entityType: "SavingsAccount",
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

    const gatewayTransaction = await paymentModel.createPaymentGatewayTransaction({
        transactionId: transaction.id,
        mode: "DIRECT_MOBILE_MONEY",
        status: "INITIATED",
    });

    let payoutResponse;
    try {
        payoutResponse = await paychangu.initiateMobileMoneyPayout({
            mobile: phoneNumber,
            operatorRefId,
            amount: breakdown.payoutAmount,
            chargeId: reference,
        });
    } catch (err) {
        // Payout call itself failed — refund the FULL amount (including the
        // never-actually-forfeited penalty) rather than leaving the user's
        // balance short with no payout ever in flight.
        await savingsService.incrementBalance(savingsAccountId, breakdown.amount);
        await paymentModel.updatePaymentGatewayTransaction(gatewayTransaction.id, {
            status: "FAILED",
            responsePayload: err.response?.data ?? { message: err.message },
        });
        await transactionService.updateTransactionStatus(transaction.id, "FAILED");
        throw new ValidationError("Unable to initiate the withdrawal. Please try again.");
    }

    const gatewayChargeId =
        payoutResponse.data?.transaction?.charge_id ?? payoutResponse.data?.transaction?.ref_id;

    await paymentModel.updatePaymentGatewayTransaction(gatewayTransaction.id, {
        gatewayReference: gatewayChargeId ? String(gatewayChargeId) : null,
        status: "PENDING",
        responsePayload: payoutResponse,
    });

    return transactionService.updateTransactionStatus(transaction.id, "PROCESSING");
}

// ---------------------------------------------------------------------------
// Hosted Standard Checkout
// ---------------------------------------------------------------------------

export const initiateHostedCheckoutDeposit = async (
    userId,
    { savingsAccountId, amount, returnUrl }
) => {
    await savingsService.assertDepositable(userId, savingsAccountId);

    const reference = crypto.randomUUID();

    const transaction = await transactionService.createTransaction({
        savingsAccountId,
        type: "DEPOSIT",
        amount,
        idempotencyKey: reference,
    });

    const gatewayTransaction = await paymentModel.createPaymentGatewayTransaction({
        transactionId: transaction.id,
        mode: "HOSTED_CHECKOUT",
        status: "INITIATED",
    });

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
            status: "FAILED",
            responsePayload: err.response?.data ?? { message: err.message },
        });
        await transactionService.updateTransactionStatus(transaction.id, "FAILED");
        throw new ValidationError("Unable to start checkout. Please try again.");
    }

    // NOTE: exact response field name for the checkout URL is unconfirmed —
    // PayChangu's docs didn't render an example body at the time this was
    // written. Verify against a live sandbox call and adjust this line.
    const checkoutUrl = checkoutResponse.data?.checkout_url ?? checkoutResponse.data?.link;

    await paymentModel.updatePaymentGatewayTransaction(gatewayTransaction.id, {
        gatewayReference: reference,
        status: "PENDING",
        responsePayload: checkoutResponse,
    });

    await transactionService.updateTransactionStatus(transaction.id, "PROCESSING");

    return { transaction, checkoutUrl };
}

// ---------------------------------------------------------------------------
// Status lookup (self-service, ownership-checked)
// ---------------------------------------------------------------------------

export const getMyDepositStatus = async (userId, transactionId) => {
    // Ownership already enforced inside getMyTransactionById.
    return transactionService.getMyTransactionById(userId, transactionId);
}

// ---------------------------------------------------------------------------
// Webhook handling
//
// PayChangu's own guidance: don't trust the webhook payload's status field
// alone — call the appropriate verify endpoint server-side before crediting
// anything. That's what happens below.
// ---------------------------------------------------------------------------

export const handlePaychanguWebhook = async (rawBody, signatureHeader) => {
    if (!paychangu.isValidWebhookSignature(rawBody, signatureHeader)) {
        throw new ValidationError("Invalid webhook signature");
    }

    const payload = JSON.parse(rawBody.toString("utf8"));
    const providerEventId = String(
        payload.charge_id ?? payload.chargeId ?? payload.tx_ref ?? payload.reference
    );

    // Webhooks can be retried by the sender — if we've already recorded this
    // exact event id, acknowledge and stop, rather than double-processing.
    const existingEvent = await paymentModel.findWebhookEventByProviderEventId(providerEventId);
    if (existingEvent) {
        return { alreadyProcessed: true };
    }

    const gatewayTransaction = await paymentModel.findPaymentGatewayTransactionByGatewayReference(
        providerEventId
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
        const transaction = await transactionService.getTransactionByIdAdmin(
            gatewayTransaction.transactionId
        );

        let verified;
        if (gatewayTransaction.mode === "DIRECT_MOBILE_MONEY" && transaction.type === "DEPOSIT") {
            verified = await paychangu.verifyDirectChargeStatus(providerEventId);
        } else if (gatewayTransaction.mode === "DIRECT_MOBILE_MONEY" && transaction.type === "WITHDRAWAL") {
            verified = await paychangu.verifyMobileMoneyPayoutStatus(providerEventId);
        } else {
            verified = await paychangu.verifyHostedCheckoutStatus(providerEventId);
        }

        const verifiedStatus = (verified.data?.transaction?.status ?? "").toLowerCase();

        if (verifiedStatus === "success" || verifiedStatus === "successful") {
            await paymentModel.updatePaymentGatewayTransaction(gatewayTransaction.id, {
                status: "SUCCESS",
                responsePayload: verified,
            });
            await transactionService.updateTransactionStatus(transaction.id, "SUCCESS");

            const user = await usersRepository.getUserById(transaction.savingsAccount.userId);

            if (transaction.type === "DEPOSIT") {
                await savingsService.incrementBalance(transaction.savingsAccountId, transaction.amount);

                // Target-based accounts complete themselves once the balance
                // reaches the target — nothing else in the system checks this.
                const updatedAccount = await savingsService.getMySavingsAccountById(
                    transaction.savingsAccount.userId,
                    transaction.savingsAccountId
                );
                if (
                    updatedAccount.type === "TARGET_BASED" &&
                    updatedAccount.targetBasedDetails &&
                    Number(updatedAccount.balance) >= Number(updatedAccount.targetBasedDetails.target)
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
                // type === WITHDRAWAL: balance was already decremented
                // optimistically at initiation — nothing further to do here.
                if (user) {
                    const penaltyLog = await findLatestAuditLog({
                        action: "EARLY_WITHDRAWAL_PENALTY_APPLIED",
                        entityType: "SavingsAccount",
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
                // Look up the existing saved method (created with the correct
                // operatorRefId back in initiateMobileMoneyDeposit) rather than
                // guessing at operatorRefId from the webhook payload — it's
                // not reliably present there.
                const existingMethods = await paymentModel.findSavedPaymentMethodsForUser(
                    transaction.savingsAccount.userId
                );
                const existingMethod = existingMethods.find(
                    (m) => m.provider === transaction.provider && m.phoneNumber === transaction.payerPhoneNumber
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
        } else if (verifiedStatus === "failed" || verifiedStatus === "cancelled") {
            await paymentModel.updatePaymentGatewayTransaction(gatewayTransaction.id, {
                status: "FAILED",
                responsePayload: verified,
            });
            await transactionService.updateTransactionStatus(transaction.id, "FAILED");

            const user = await usersRepository.getUserById(transaction.savingsAccount.userId);

            if (transaction.type === "WITHDRAWAL") {
                // The money never actually left — refund the optimistic
                // decrement made at withdrawal initiation.
                await savingsService.incrementBalance(transaction.savingsAccountId, transaction.amount);
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
        // Any other status (still pending/processing) — leave as-is, a
        // later webhook or manual status check will resolve it.

        await paymentModel.markWebhookEventProcessed(webhookEvent.id);
        return { processed: true };
    } catch (err) {
        await paymentModel.markWebhookEventFailed(webhookEvent.id, err.message);
        throw err;
    }
}
