import { Router } from 'express';
import * as transactionController from './transaction.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorize } from '../../middlewares/role.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as transactionValidator from './transaction.validator.js';

const router = Router();

router.use(authenticate);

// ---------------------------------------------------------------------------
// Self-service
// ---------------------------------------------------------------------------

router.get(
  '/me',
  validate(transactionValidator.listMyTransactionsSchema),
  transactionController.listMyTransactions,
);

router.get(
  '/me/:id',
  validate(transactionValidator.transactionIdParamSchema),
  transactionController.getMyTransactionById,
);

// ---------------------------------------------------------------------------
// Admin-only
// ---------------------------------------------------------------------------

router.use(authorize('ADMIN'));

router.get(
  '/',
  validate(transactionValidator.listAllTransactionsSchema),
  transactionController.listAllTransactions,
);

router.get(
  '/:id',
  validate(transactionValidator.transactionIdParamSchema),
  transactionController.getTransactionByIdAdmin,
);

export default router;
