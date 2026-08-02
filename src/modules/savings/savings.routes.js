import { Router } from "express";
import * as savingsController from "./savings.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import * as savingsValidator from "./savings.validator.js";

const router = Router();

router.use(authenticate);

router.post(
  "/time-based",
  validate(savingsValidator.createTimeBasedSavingsSchema),
  savingsController.createTimeBasedSavings
);

router.post(
  "/target-based",
  validate(savingsValidator.createTargetBasedSavingsSchema),
  savingsController.createTargetBasedSavings
);

router.get(
  "/",
  validate(savingsValidator.listMySavingsAccountsSchema),
  savingsController.listMySavingsAccounts
);

router.get(
  "/:id",
  validate(savingsValidator.savingsAccountIdParamSchema),
  savingsController.getMySavingsAccountById
);

router.patch(
  "/:id",
  validate(savingsValidator.updateSavingsAccountNameSchema),
  savingsController.updateMySavingsAccountName
);

router.patch(
  "/:id/pause",
  validate(savingsValidator.savingsAccountIdParamSchema),
  savingsController.pauseMySavingsAccount
);

router.patch(
  "/:id/resume",
  validate(savingsValidator.savingsAccountIdParamSchema),
  savingsController.resumeMySavingsAccount
);

router.patch(
  "/:id/cancel",
  validate(savingsValidator.savingsAccountIdParamSchema),
  savingsController.cancelMySavingsAccount
);

export default router;
