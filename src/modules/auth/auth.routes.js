import { Router } from 'express';
import * as authController from './auth.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  loginRateLimiter,
  otpRateLimiter,
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
  otpRateLimiter,
  validate(authValidator.forgotPasswordSchema),
  authController.forgotPassword,
);

router.post(
  '/reset-password',
  otpRateLimiter,
  validate(authValidator.resetPasswordSchema),
  authController.resetPassword,
);

router.use(authenticate);

router.get('/sessions', authController.listSessions);
router.post('/logout-all', authController.logoutAllDevices);

export default router;
