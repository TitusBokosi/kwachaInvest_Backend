import * as paymentService from './payment.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';

export const listMobileMoneyOperators = asyncHandler(async (req, res) => {
  const operators = await paymentService.listMobileMoneyOperators();
  sendSuccess(res, { data: operators });
});

export const listMySavedPaymentMethods = asyncHandler(async (req, res) => {
  const methods = await paymentService.listMySavedPaymentMethods(req.user.id);
  sendSuccess(res, { data: methods });
});

export const deleteMySavedPaymentMethod = asyncHandler(async (req, res) => {
  await paymentService.deleteMySavedPaymentMethod(req.user.id, req.params.id);
  sendSuccess(res, { message: 'Payment method removed' });
});

export const initiateMobileMoneyDeposit = asyncHandler(async (req, res) => {
  const transaction = await paymentService.initiateMobileMoneyDeposit(
    req.user.id,
    req.body,
  );
  sendSuccess(res, { statusCode: 202, data: transaction });
});

export const initiateMobileMoneyWithdrawal = asyncHandler(async (req, res) => {
  const transaction = await paymentService.initiateMobileMoneyWithdrawal(
    req.user.id,
    req.body,
  );
  sendSuccess(res, { statusCode: 202, data: transaction });
});

export const initiateHostedCheckoutDeposit = asyncHandler(async (req, res) => {
  const { transaction, checkoutUrl } =
    await paymentService.initiateHostedCheckoutDeposit(req.user.id, req.body);
  sendSuccess(res, { statusCode: 202, data: { transaction, checkoutUrl } });
});

export const getMyDepositStatus = asyncHandler(async (req, res) => {
  const transaction = await paymentService.getMyDepositStatus(
    req.user.id,
    req.params.id,
  );
  sendSuccess(res, { data: transaction });
});

export const handlePaychanguWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['signature'];
  await paymentService.handlePaychanguWebhook(req.body, signature);

  res.status(200).json({ received: true });
});
