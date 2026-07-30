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

// ---------------------------------------------------------------------------
// Webhook router — MUST be mounted BEFORE the app's global express.json()
// middleware, using its own raw body parser. Signature verification needs
// the exact raw bytes PayChangu sent; a JSON-parsed-then-re-stringified
// body will not produce a matching HMAC.
//
// In app.js:
//   import { webhookRouter } from "./modules/payments/payment.routes.js";
//   app.use("/api/payments/webhooks", webhookRouter);   // BEFORE express.json()
//   app.use(express.json());
//   app.use("/api/payments", paymentRoutes);            // the default export above
// ---------------------------------------------------------------------------

export const webhookRouter = Router();

webhookRouter.post(
  '/paychangu',
  express.raw({ type: 'application/json' }),
  paymentController.handlePaychanguWebhook,
);
