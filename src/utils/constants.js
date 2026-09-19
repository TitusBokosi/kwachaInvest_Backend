import { env } from '../config/env.js';

export const SALT_ROUNDS = 10;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72; // bcrypt's hard input limit

export const ACCESS_TOKEN_EXPIRY = env.ACCESS_TOKEN_EXPIRY;
export const REFRESH_TOKEN_TTL_DAYS = env.REFRESH_TOKEN_TTL_DAYS;
export const OTP_TTL_MINUTES = env.OTP_TTL_MINUTES;
export const OTP_MAX_ATTEMPTS = 5;
export const RESET_TOKEN_TTL_MINUTES = env.RESET_TOKEN_TTL_MINUTES;

export const ROLES = Object.freeze({ USER: 'USER', ADMIN: 'ADMIN' });

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PENALTY_PERCENTAGE = 15;
// Product rule: flexible accounts may be withdrawn early, with a fixed fee.
// The stored account percentage is retained for historical compatibility but
// must not override this rule at withdrawal time.
export const EARLY_FLEXIBLE_WITHDRAWAL_PENALTY_PERCENTAGE = 15;
