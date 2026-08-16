import { Router } from "express";
import * as adminController from "./admin.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { authorize } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import * as adminValidation from "./admin.validator.js";
import * as userController from "../users/user.controller.js";
import * as userValidator from "../users/user.validator.js";

const router = Router();

router.use(authenticate, authorize("ADMIN"));

router.get("/dashboard", adminController.getDashboardStats);
router.get(
  "/users/search",
  validate(userValidator.searchUsersSchema),
  userController.searchUsers
);

router.get(
  "/users",
  validate(userValidator.listUsersSchema),
  userController.listUsers
);

router.get(
  "/users/:id",
  validate(userValidator.userIdParamSchema),
  userController.getUserById
);

router.patch(
  "/users/:id/deactivate",
  validate(userValidator.userIdParamSchema),
  userController.deactivateUserById
);

router.patch(
  "/users/:id/reactivate",
  validate(userValidator.userIdParamSchema),
  userController.reactivateUserById
);

router.patch(
  "/users/:id/role",
  validate(userValidator.updateUserRoleSchema),
  userController.updateUserRole
);

router.get(
  "/audit-logs",
  validate(adminValidation.auditLogQuerySchema),
  adminController.getAuditLogs
);

router.get(
  "/savings-accounts",
  validate(adminValidation.savingsAccountListQuerySchema),
  adminController.listSavingsAccounts
);

router.get(
  "/savings-accounts/:id",
  validate(adminValidation.savingsAccountIdParamSchema),
  adminController.getSavingsAccountById
);

router.patch(
  "/savings-accounts/:id/freeze",
  validate(adminValidation.freezeSavingsAccountSchema),
  adminController.freezeSavingsAccount
);

router.patch(
  "/savings-accounts/:id/unfreeze",
  validate(adminValidation.savingsAccountIdParamSchema),
  adminController.unfreezeSavingsAccount
);

export default router;
