import { Router } from "express";
import * as userController from "./user.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { authorize } from "../../middlewares/role.middleware.js";

import { validate } from "../../middlewares/validate.middleware.js";
import { registerRateLimiter } from "../../middlewares/rateLimit.middleware.js";
import { otpRateLimiter } from "../../middlewares/rateLimit.middleware.js";
import * as userValidator from "./user.validator.js";

const router = Router();

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

router.post(
  "/register",
  registerRateLimiter,
  validate(userValidator.registerSchema),
  userController.register
);

// ---------------------------------------------------------------------------
// Self-service (authenticated user, any role)
// ---------------------------------------------------------------------------

router.use(authenticate);

router.get("/me", userController.getMe);
router.get("/me/profile", userController.getMyProfile);

router.patch(
  "/me",
  validate(userValidator.updateMeSchema),
  userController.updateMe
);

router.post(
  "/me/change-password/otp",
  otpRateLimiter,
  validate(userValidator.requestPasswordChangeOtpSchema),
  userController.requestMyPasswordChangeOtp
);

router.post(
  "/me/change-password",
  validate(userValidator.changePasswordSchema),
  userController.changeMyPassword
);

router.delete("/me", userController.deactivateMe);

// ---------------------------------------------------------------------------
// Admin-facing user management
// ---------------------------------------------------------------------------

router.get(
  "/search",
  authorize("ADMIN"),
  validate(userValidator.searchUsersSchema),
  userController.searchUsers
);

router.get(
  "/",
  authorize("ADMIN"),
  validate(userValidator.listUsersSchema),
  userController.listUsers
);

router.get(
  "/:id",
  authorize("ADMIN"),
  validate(userValidator.userIdParamSchema),
  userController.getUserById
);

router.patch(
  "/:id/deactivate",
  authorize("ADMIN"),
  validate(userValidator.userIdParamSchema),
  userController.deactivateUserById
);

router.patch(
  "/:id/reactivate",
  authorize("ADMIN"),
  validate(userValidator.userIdParamSchema),
  userController.reactivateUserById
);

router.patch(
  "/:id/role",
  authorize("ADMIN"),
  validate(userValidator.updateUserRoleSchema),
  userController.updateUserRole
);







export default router;
