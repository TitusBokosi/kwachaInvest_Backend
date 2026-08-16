import { Router } from "express";
import * as userController from "./user.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

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







export default router;
