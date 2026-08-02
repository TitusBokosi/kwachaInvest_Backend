import * as paymentService from "./payment.service.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { sendSuccess } from "../../utils/response.js"

export const listMobileMoneyOperators = asyncHandler(async (req, res) => {
    const operators = await paymentService.listMobileMoneyOperators();
    sendSuccess(res, { data: operators });
})

export const listMySavedPaymentMethods = asyncHandler(async (req, res) => {
    const methods = await paymentService.listMySavedPaymentMethods(req.user.id);
    sendSuccess(res, { data: methods });
})

export const deleteMySavedPaymentMethod = asyncHandler(async (req, res) => {
    await paymentService.deleteMySavedPaymentMethod(req.user.id, req.params.id);
    sendSuccess(res, { message: "Payment method removed" });
})

export const initiateMobileMoneyDeposit = asyncHandler(async (req, res) => {
    const transaction = await paymentService.initiateMobileMoneyDeposit(req.user.id, req.body);
    sendSuccess(res, { statusCode: 202, data: transaction });
})

export const initiateMobileMoneyWithdrawal = asyncHandler(async (req, res) => {
    const transaction = await paymentService.initiateMobileMoneyWithdrawal(req.user.id, req.body);
    sendSuccess(res, { statusCode: 202, data: transaction });
})

export const initiateHostedCheckoutDeposit = asyncHandler(async (req, res) => {
    const { transaction, checkoutUrl } = await paymentService.initiateHostedCheckoutDeposit(
        req.user.id,
        req.body
    );
    sendSuccess(res, { statusCode: 202, data: { transaction, checkoutUrl } });
})

export const getMyDepositStatus = asyncHandler(async (req, res) => {
    const transaction = await paymentService.getMyDepositStatus(req.user.id, req.params.id);
    sendSuccess(res, { data: transaction });
})

// ---------------------------------------------------------------------------
// Webhook — mounted with a raw body parser (see payment.routes.js). req.body
// here is a Buffer, not parsed JSON — the service needs the raw bytes to
// verify the signature. Deliberately NOT using sendSuccess: this response
// goes to PayChangu, not to our own client, so it doesn't need our envelope.
// ---------------------------------------------------------------------------

export const handlePaychanguWebhook = asyncHandler(async (req, res) => {
    const signature = req.headers["signature"];
    await paymentService.handlePaychanguWebhook(req.body, signature);
    // Always 200 quickly — PayChangu retries on non-2xx, and we've already
    // durably recorded the event before this point.
    res.status(200).json({ received: true });
})
