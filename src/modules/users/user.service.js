import crypto from 'node:crypto';

import * as usersRepository from './user.repository.js';
import * as authRepository from '../auth/auth.repository.js';
import * as notificationService from '../notifications/notification.service.js';
import { hashValue, compareValue } from '../../utils/hash.js';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  OTP_TTL_MINUTES,
  OTP_MAX_ATTEMPTS,
} from '../../utils/constants.js';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  TooManyRequestsError,
} from '../../utils/errors.js';

const UPDATABLE_FIELDS = ['firstName', 'lastName', 'email', 'phoneNumber'];
const OTP_RESEND_COOLDOWN_SECONDS = 15;

const enforceOtpResendCooldown = async (userId, purpose) => {
  const latestOtp = await authRepository.getLatestOtpCode(userId, purpose);
  if (!latestOtp?.createdAt) return;

  const elapsedMs = Date.now() - latestOtp.createdAt.getTime();
  const remainingSeconds =
    OTP_RESEND_COOLDOWN_SECONDS - Math.floor(elapsedMs / 1000);
  if (remainingSeconds > 0) {
    throw new TooManyRequestsError(
      `Please wait ${remainingSeconds} seconds before requesting another code.`,
    );
  }
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const registerUser = async ({
  firstName,
  lastName,
  email,
  phoneNumber,
  password,
}) => {
  if (
    !password ||
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw new ValidationError(
      `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters long`,
    );
  }

  const alreadyExists = await usersRepository.existsByEmailOrPhone(
    email,
    phoneNumber,
  );
  if (alreadyExists) {
    throw new ConflictError(
      'A user with this email or phone number already exists',
    );
  }

  const passwordHash = await hashValue(password);
  const fullName = `${firstName} ${lastName}`.trim();

  const user = await usersRepository.createUser({
    firstName,
    lastName,
    fullName,
    email,
    phoneNumber,
    passwordHash,
    isEmailVerified: false,
  });

  const otp = crypto.randomInt(100000, 1000000).toString();
  const codeHash = await hashValue(otp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  await authRepository.createOtpCode({
    userId: user.id,
    codeHash,
    purpose: 'EMAIL_VERIFICATION',
    expiresAt,
  });
  void notificationService.sendSignupVerificationOtpEmail(user, otp);

  return user;
  // KYC HOOK: once KYC ships, this is where you'd also create the
  // KycVerification stub row (atomically, via createUserWithKyc).
};

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export const getUserById = async (id) => {
  const user = await usersRepository.getUserById(id);
  if (!user) throw new NotFoundError('User not found');
  return user;
};

export const getUserProfile = async (id) => {
  const profile = await usersRepository.getUserProfile(id);
  if (!profile) throw new NotFoundError('User not found');
  return profile;
};

export const listUsers = async (filters, pagination) => {
  return usersRepository.getUsers(filters, pagination);
};

export const searchUsers = async (query, pagination) => {
  if (!query || query.trim().length === 0) {
    throw new ValidationError('Search query is required');
  }
  return usersRepository.searchUsers(query.trim(), pagination);
};

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export const updateUser = async (id, data) => {
  const existing = await usersRepository.getUserById(id);
  if (!existing) throw new NotFoundError('User not found');

  // Whitelist: only known-safe fields can be updated this way. Never
  // spread req.body straight into a Prisma update — that would let a
  // caller overwrite isActive, passwordHash, etc.
  const updateData = {};
  for (const field of UPDATABLE_FIELDS) {
    if (data[field] !== undefined) updateData[field] = data[field];
  }

  if (updateData.firstName || updateData.lastName) {
    const firstName = updateData.firstName ?? existing.firstName;
    const lastName = updateData.lastName ?? existing.lastName;
    updateData.fullName = `${firstName} ${lastName}`.trim();
  }

  if (Object.keys(updateData).length === 0) {
    throw new ValidationError('No valid fields provided to update');
  }

  if (updateData.email || updateData.phoneNumber) {
    const conflict = await usersRepository.existsByEmailOrPhone(
      updateData.email,
      updateData.phoneNumber,
      id,
    );
    if (conflict)
      throw new ConflictError('Email or phone number already in use');
  }

  if (updateData.email && updateData.email !== existing.email) {
    updateData.isEmailVerified = false;
  }

  const updatedUser = await usersRepository.updateUser(id, updateData);
  if (updateData.isEmailVerified === false) {
    await authRepository.invalidateActiveOtpCodes(id, 'EMAIL_VERIFICATION');
    const otp = crypto.randomInt(100000, 1000000).toString();
    const codeHash = await hashValue(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    await authRepository.createOtpCode({
      userId: id,
      codeHash,
      purpose: 'EMAIL_VERIFICATION',
      expiresAt,
    });
    void notificationService.sendSignupVerificationOtpEmail(updatedUser, otp);
  }

  return updatedUser;
};

export const requestPasswordChangeOtp = async (id, currentPassword) => {
  const user = await usersRepository.getUserByIdForAuth(id);
  if (!user) throw new NotFoundError('User not found');

  if (!user.passwordHash) {
    throw new ValidationError(
      'This account does not have a password yet.',
    );
  }

  const isMatch = await compareValue(currentPassword, user.passwordHash);
  if (!isMatch) throw new ValidationError('Current password is incorrect');

  await enforceOtpResendCooldown(user.id, 'PASSWORD_CHANGE');
  await authRepository.invalidateActiveOtpCodes(user.id, 'PASSWORD_CHANGE');
  const otp = crypto.randomInt(100000, 1000000).toString();
  const codeHash = await hashValue(otp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  await authRepository.createOtpCode({
    userId: user.id,
    codeHash,
    purpose: 'PASSWORD_CHANGE',
    expiresAt,
  });
  void notificationService.sendPasswordChangeOtpEmail(user, otp);

  return { message: 'A verification code has been sent to your email.' };
};

export const changePassword = async (
  id,
  { currentPassword, newPassword, confirmNewPassword, otp },
) => {
  const user = await usersRepository.getUserByIdForAuth(id);
  if (!user) throw new NotFoundError('User not found');

  if (!user.passwordHash) {
    throw new ValidationError('This account does not have a password yet.');
  }

  const isMatch = await compareValue(currentPassword, user.passwordHash);
  if (!isMatch) throw new ValidationError('Current password is incorrect');

  if (
    !newPassword ||
    newPassword.length < PASSWORD_MIN_LENGTH ||
    newPassword.length > PASSWORD_MAX_LENGTH
  ) {
    throw new ValidationError(
      `New password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters long`,
    );
  }
  if (newPassword !== confirmNewPassword) {
    throw new ValidationError('Passwords do not match');
  }
  if (newPassword === currentPassword) {
    throw new ValidationError(
      'New password must be different from the current password',
    );
  }

  const genericError = () => new ValidationError('Invalid or expired code');
  const otpRecord = await authRepository.getActiveOtpCode(
    user.id,
    'PASSWORD_CHANGE',
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
    purpose: 'PASSWORD_CHANGE',
  });
  if (consumedOtp.count !== 1) throw genericError();

  const newPasswordHash = await hashValue(newPassword);
  await usersRepository.updatePasswordHash(id, newPasswordHash);
  // Self-service password changes deliberately preserve active sessions.
};

export const deactivateUser = async (id) => {
  const existing = await usersRepository.getUserById(id);
  if (!existing) throw new NotFoundError('User not found');
  return usersRepository.deactivateUser(id);
};

export const reactivateUser = async (id) => {
  const existing = await usersRepository.getUserById(id);
  if (!existing) throw new NotFoundError('User not found');
  return usersRepository.reactivateUser(id);
};

/**
 * Admin-only. `actingAdminId` is the id of whoever is making the request
 * (from req.user.id), not the target — needed to block an admin from
 * demoting themselves and accidentally locking the account out of the
 * admin panel with no other admin around to reverse it.
 */
export const updateUserRole = async (actingAdminId, targetUserId, role) => {
  const target = await usersRepository.getUserById(targetUserId);
  if (!target) throw new NotFoundError('User not found');

  if (actingAdminId === targetUserId && role !== 'ADMIN') {
    throw new ValidationError('You cannot change your own role');
  }

  if (target.role === role) {
    throw new ValidationError(`User already has the ${role} role`);
  }

  return usersRepository.updateUserRole(targetUserId, role);
};
