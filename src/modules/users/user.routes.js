import { Router } from "express";
import * as userController from "./user.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { authorize } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { registerRateLimiter } from "../../middlewares/rateLimit.middleware.js";
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
  "/me/change-password",
  validate(userValidator.changePasswordSchema),
  userController.changeMyPassword
);

router.delete("/me", userController.deactivateMe);

// ---------------------------------------------------------------------------
// Admin-only
// ---------------------------------------------------------------------------

router.use(authorize("ADMIN"));

router.get(
  "/search",
  validate(userValidator.searchUsersSchema),
  userController.searchUsers
);

router.get(
  "/",
  validate(userValidator.listUsersSchema),
  userController.listUsers
);

router.get(
  "/:id",
  validate(userValidator.userIdParamSchema),
  userController.getUserById
);

router.patch(
  "/:id/deactivate",
  validate(userValidator.userIdParamSchema),
  userController.deactivateUserById
);

router.patch(
  "/:id/reactivate",
  validate(userValidator.userIdParamSchema),
  userController.reactivateUserById
);

router.patch(
  "/:id/role",
  validate(userValidator.updateUserRoleSchema),
  userController.updateUserRole
);

export default router;
