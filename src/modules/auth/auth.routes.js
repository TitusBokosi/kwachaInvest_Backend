import { Router } from "express";
import * as authController from "./auth.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { loginRateLimiter, otpRateLimiter } from "../../middlewares/rateLimit.middleware.js";
import * as authValidator from "./auth.validator.js";

const router = Router();

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

router.post(
  "/login",
  loginRateLimiter,
  validate(authValidator.loginSchema),
  authController.login
);

router.post(
  "/refresh",
  validate(authValidator.refreshSchema),
  authController.refresh
);

router.post(
  "/logout",
  validate(authValidator.logoutSchema),
  authController.logout
);

router.post(
  "/forgot-password",
  otpRateLimiter,
  validate(authValidator.forgotPasswordSchema),
  authController.forgotPassword
);

router.post(
  "/reset-password",
  otpRateLimiter,
  validate(authValidator.resetPasswordSchema),
  authController.resetPassword
);

// ---------------------------------------------------------------------------
// Authenticated
// ---------------------------------------------------------------------------

router.use(authenticate);

router.get("/sessions", authController.listSessions);
router.post("/logout-all", authController.logoutAllDevices);

export default router;
