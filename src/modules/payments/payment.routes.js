import { Router } from 'express';
import express from 'express';
import * as paymentController from './payment.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as paymentValidator from './payment.validator.js';

const router = Router();

router.use(authenticate);

router.get(
  '/mobile-money-operators',
  paymentController.listMobileMoneyOperators,
);

router.get('/saved-methods', paymentController.listMySavedPaymentMethods);

router.delete(
  '/saved-methods/:id',
  validate(paymentValidator.savedPaymentMethodIdParamSchema),
  paymentController.deleteMySavedPaymentMethod,
);

router.post(
  '/deposits/mobile-money',
  validate(paymentValidator.initiateMobileMoneyDepositSchema),
  paymentController.initiateMobileMoneyDeposit,
);

router.post(
  '/withdrawals/mobile-money',
  validate(paymentValidator.initiateMobileMoneyWithdrawalSchema),
  paymentController.initiateMobileMoneyWithdrawal,
);

router.post(
  '/deposits/checkout',
  validate(paymentValidator.initiateHostedCheckoutDepositSchema),
  paymentController.initiateHostedCheckoutDeposit,
);

router.get(
  '/deposits/:id',
  validate(paymentValidator.transactionIdParamSchema),
  paymentController.getMyDepositStatus,
);

export default router;

export const webhookRouter = Router();

webhookRouter.post(
  '/paychangu',
  express.raw({ type: 'application/json' }),
  paymentController.handlePaychanguWebhook,
);
