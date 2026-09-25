import { Router } from 'express';
import * as authController from './auth.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  loginRateLimiter,
  forgotPasswordRateLimiter,
  verifyResetOtpRateLimiter,
} from '../../middlewares/rateLimit.middleware.js';
import * as authValidator from './auth.validator.js';
import { verifyCsrfToken } from '../../middlewares/csrf.middleware.js';

const router = Router();

router.post(
  '/login',
  loginRateLimiter,
  validate(authValidator.loginSchema),
  authController.login,
);

router.post('/refresh', verifyCsrfToken, authController.refresh);

router.post(
  '/logout',
  validate(authValidator.logoutSchema),
  authController.logout,
);

router.post(
  '/forgot-password',
  forgotPasswordRateLimiter,
  validate(authValidator.forgotPasswordSchema),
  authController.forgotPassword,
);

router.post(
  '/verify-reset-otp',
  verifyResetOtpRateLimiter,
  validate(authValidator.verifyResetOtpSchema),
  authController.verifyResetOtp,
);

router.post(
  '/verify-signup-otp',
  verifyResetOtpRateLimiter,
  validate(authValidator.verifySignupOtpSchema),
  authController.verifySignupOtp,
);

router.post(
  '/resend-signup-otp',
  verifyResetOtpRateLimiter,
  validate(authValidator.forgotPasswordSchema), // expects { email }
  authController.resendSignupOtp,
);

// Public endpoint: check whether an OTP record exists (unconsumed & unexpired)
router.get('/otp-status', authController.otpStatus);

router.post(
  '/reset-password',
  validate(authValidator.resetPasswordSchema),
  authController.resetPassword,
);

router.use(authenticate);

router.get('/sessions', authController.listSessions);
router.post('/logout-all', authController.logoutAllDevices);

export default router;
