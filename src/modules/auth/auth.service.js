import crypto from 'node:crypto';

import * as authRepository from './auth.repository.js';
import * as usersRepository from '../users/user.repository.js';
import * as notificationService from '../notifications/notification.service.js';

import { hashValue, compareValue } from '../../utils/hash.js';
import {
  signAccessToken,
  signPasswordResetToken,
  verifyPasswordResetToken,
} from '../../utils/jwt.js';

import {
  REFRESH_TOKEN_TTL_DAYS,
  OTP_TTL_MINUTES,
  OTP_MAX_ATTEMPTS,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from '../../utils/constants.js';

import {
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
} from '../../utils/errors.js';

const OTP_RESEND_COOLDOWN_SECONDS = 15;

const isEmail = (identifier) => identifier.includes('@');

const resolveUserByIdentifier = async (
  identifier,
  { forAuth = false } = {},
) => {
  if (isEmail(identifier)) {
    return forAuth
      ? usersRepository.getUserByEmailForAuth(identifier.trim().toLowerCase())
      : usersRepository.getUserByEmail(identifier.trim().toLowerCase());
  }

  return forAuth
    ? usersRepository.getUserByPhoneNumberForAuth(identifier)
    : usersRepository.getUserByPhoneNumber(identifier);
};

const generateRefreshToken = () => {
  return crypto.randomBytes(40).toString('hex');
};

const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

const generateOtp = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

const issueSession = async (user, { deviceInfo, ipAddress } = {}) => {
  const refreshToken = generateRefreshToken();

  const expiresAt = new Date(
    Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const session = await authRepository.createSession({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    deviceInfo,
    ipAddress,
    expiresAt,
  });

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    sid: session.id,
  });

  return {
    accessToken,
    refreshToken,
  };
};

export const login = async ({
  identifier,
  password,
  deviceInfo,
  ipAddress,
}) => {
  const user = await resolveUserByIdentifier(identifier, {
    forAuth: true,
  });

  const invalidCredentials = () =>
    new UnauthorizedError('Invalid email/phone or password.', 'INVALID_CREDENTIALS');

  if (!user) throw invalidCredentials();

  if (!user.isActive) {
    throw new ForbiddenError('This account has been deactivated');
  }

  if (!user.passwordHash) {
    throw invalidCredentials();
  }

  const passwordMatches = await compareValue(password, user.passwordHash);

  if (!passwordMatches) {
    throw invalidCredentials();
  }

  if (!user.isEmailVerified) {
    throw new ForbiddenError(
      'Please verify your email address before signing in.',
    );
  }

  const { accessToken, refreshToken } = await issueSession(user, {
    deviceInfo,
    ipAddress,
  });

  const { passwordHash, ...safeUser } = user;

  return {
    accessToken,
    refreshToken,
    user: safeUser,
  };
};

export const refreshAccessToken = async ({
  refreshToken,
  deviceInfo,
  ipAddress,
}) => {
  if (!refreshToken) {
    throw new UnauthorizedError(
      'Session is invalid or has expired, please log in again',
    );
  }

  const tokenHash = hashToken(refreshToken);

  const session = await authRepository.getSessionByTokenHash(tokenHash);

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new UnauthorizedError(
      'Session is invalid or has expired, please log in again',
    );
  }

  const user = await usersRepository.getUserByIdForAuth(session.userId);
  if (!user || !user.isActive) {
    throw new UnauthorizedError('Account is no longer active');
  }
  if (!user.isEmailVerified) {
    throw new UnauthorizedError('Please verify your email address to continue.');
  }

  // Claim the token atomically so concurrent replays cannot both rotate it.
  const revoked = await authRepository.revokeSessionIfActive(session.id);
  if (revoked.count !== 1) {
    throw new UnauthorizedError(
      'Session is invalid or has expired, please log in again',
    );
  }

  // Issue a completely new session.
  return issueSession(user, {
    deviceInfo,
    ipAddress,
  });
};

export const logout = async (sessionId) => {
  if (sessionId) {
    await authRepository.revokeSessionById(sessionId);
  }
};

export const logoutAllDevices = async (userId) => {
  await authRepository.revokeAllSessionsForUser(userId);
};

export const listActiveSessions = async (userId, pagination) => {
  return authRepository.getActiveSessionsByUser(userId, pagination);
};

export const verifyEmail = async ({ email, otp }) => {
  const genericError = () => new ValidationError('Invalid or expired code');
  const user = await usersRepository.getUserByEmailForAuth(
    email.trim().toLowerCase(),
  );
  if (!user) throw genericError();
  if (user.isEmailVerified) {
    return { message: 'Email address is already verified.' };
  }

  const otpRecord = await authRepository.getActiveOtpCode(
    user.id,
    'EMAIL_VERIFICATION',
  );
  if (!otpRecord || otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
    throw genericError();
  }
  if (!(await compareValue(otp, otpRecord.codeHash))) {
    await authRepository.incrementOtpAttempts(otpRecord.id);
    throw genericError();
  }

  const consumedOtp = await authRepository.consumeOtpCodeForPurpose({
    otpId: otpRecord.id,
    userId: user.id,
    purpose: 'EMAIL_VERIFICATION',
  });
  if (consumedOtp.count !== 1) throw genericError();

  await usersRepository.setEmailVerified(user.id);
  void notificationService.sendWelcomeEmail(user);

  return { message: 'Email verified successfully. You can now sign in.' };
};

export const resendVerificationEmail = async (email) => {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await usersRepository.getUserByEmailForAuth(normalizedEmail);
  if (user && !user.isEmailVerified && user.isActive) {
    const latestOtp = await authRepository.getLatestOtpCode(
      user.id,
      'EMAIL_VERIFICATION',
    );
    if (
      latestOtp?.createdAt &&
      Date.now() - latestOtp.createdAt.getTime() <
        OTP_RESEND_COOLDOWN_SECONDS * 1000
    ) {
      return {
        message:
          'If an unverified account exists, a verification code has been sent.',
      };
    }

    await authRepository.invalidateActiveOtpCodes(
      user.id,
      'EMAIL_VERIFICATION',
    );
    const otp = generateOtp();
    const codeHash = await hashValue(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    await authRepository.createOtpCode({
      userId: user.id,
      codeHash,
      purpose: 'EMAIL_VERIFICATION',
      expiresAt,
    });
    void notificationService.sendSignupVerificationOtpEmail(user, otp);
  }

  return {
    message: 'If an unverified account exists, a verification code has been sent.',
  };
};

export const forgotPassword = async (email) => {
  const user = await usersRepository.getUserByEmail(email.trim().toLowerCase());

  if (user) {
    const latestOtp = await authRepository.getLatestOtpCode(
      user.id,
      'PASSWORD_RESET',
    );
    if (
      latestOtp?.createdAt &&
      Date.now() - latestOtp.createdAt.getTime() <
        OTP_RESEND_COOLDOWN_SECONDS * 1000
    ) {
      return {
        message: 'If an account exists, a reset code has been sent.',
      };
    }

    await authRepository.invalidateActiveOtpCodes(user.id, 'PASSWORD_RESET');

    const otp = generateOtp();
    const codeHash = await hashValue(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await authRepository.createOtpCode({
      userId: user.id,
      codeHash,
      purpose: 'PASSWORD_RESET',
      expiresAt,
    });

    void notificationService.sendPasswordResetOtpEmail(user, otp);
  }

  return {
    message: 'If an account exists, a reset code has been sent.',
  };
};

export const verifyPasswordResetOtp = async ({ email, otp }) => {
  const genericError = () => new ValidationError('Invalid or expired code');
  const user = email
    ? await usersRepository.getUserByEmailForAuth(
        email.trim().toLowerCase(),
      )
    : null;
  if (!user) throw genericError();

  const otpRecord = await authRepository.getActiveOtpCode(
    user.id,
    'PASSWORD_RESET',
  );
  if (!otpRecord || otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
    throw genericError();
  }

  if (!(await compareValue(otp, otpRecord.codeHash))) {
    await authRepository.incrementOtpAttempts(otpRecord.id);
    throw genericError();
  }

  return {
    resetToken: signPasswordResetToken({
      userId: user.id,
      otpId: otpRecord.id,
    }),
  };
};

export const resetPassword = async ({
  resetToken,
  newPassword,
  confirmNewPassword,
}) => {
  const genericError = () => new ValidationError('Invalid or expired reset token');
  let payload;
  try {
    payload = verifyPasswordResetToken(resetToken);
  } catch {
    throw genericError();
  }
  if (
    payload.purpose !== 'PASSWORD_RESET' ||
    typeof payload.sub !== 'string' ||
    typeof payload.otpId !== 'string'
  ) {
    throw genericError();
  }

  if (newPassword.length < PASSWORD_MIN_LENGTH || newPassword.length > PASSWORD_MAX_LENGTH) {
    throw new ValidationError(
      `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters long`,
    );
  }
  if (newPassword !== confirmNewPassword) {
    throw new ValidationError('Passwords do not match');
  }

  const newPasswordHash = await hashValue(newPassword);
  const consumedToken = await authRepository.consumePasswordResetToken({
    otpId: payload.otpId,
    userId: payload.sub,
  });
  if (consumedToken.count !== 1) throw genericError();

  await usersRepository.updatePasswordHash(payload.sub, newPasswordHash);

  await authRepository.revokeAllSessionsForUser(payload.sub);

  return {
    message: 'Password reset successful. Please log in again.',
  };
};
