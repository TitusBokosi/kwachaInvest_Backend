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
import { UnauthorizedError } from '../../utils/errors.js';

const router = Router();

const requireRefreshCookie = (req, res, next) => {
  if (!req.cookies?.refreshToken) {
    return next(
      new UnauthorizedError(
        'Session is invalid or has expired, please log in again',
      ),
    );
  }
  next();
};

router.post(
  '/login',
  loginRateLimiter,
  validate(authValidator.loginSchema),
  authController.login,
);

router.post(
  '/verify-email',
  verifyResetOtpRateLimiter,
  validate(authValidator.verifyEmailSchema),
  authController.verifyEmail,
);

router.post(
  '/resend-verification',
  forgotPasswordRateLimiter,
  validate(authValidator.resendVerificationSchema),
  authController.resendVerificationEmail,
);

router.post(
  '/refresh',
  requireRefreshCookie,
  verifyCsrfToken,
  authController.refresh,
);

router.post(
  '/logout',
  authenticate,
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
  '/reset-password',
  verifyResetOtpRateLimiter,
  validate(authValidator.resetPasswordSchema),
  authController.resetPassword,
);

router.post(
  '/verify-reset-otp',
  verifyResetOtpRateLimiter,
  validate(authValidator.verifyPasswordResetOtpSchema),
  authController.verifyPasswordResetOtp,
);

router.use(authenticate);

router.get(
  '/sessions',
  validate(authValidator.listSessionsSchema),
  authController.listSessions,
);
router.post('/logout-all', authController.logoutAllDevices);

export default router;
