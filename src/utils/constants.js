import { env } from '../config/env.js';

export const SALT_ROUNDS = 10;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72; // bcrypt's hard input limit

export const ACCESS_TOKEN_EXPIRY = env.ACCESS_TOKEN_EXPIRY;
export const REFRESH_TOKEN_TTL_DAYS = env.REFRESH_TOKEN_TTL_DAYS;
export const OTP_TTL_MINUTES = env.OTP_TTL_MINUTES;
export const OTP_MAX_ATTEMPTS = 5;

export const ROLES = Object.freeze({ USER: 'USER', ADMIN: 'ADMIN' });

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PENALTY_PERCENTAGE = 5;
