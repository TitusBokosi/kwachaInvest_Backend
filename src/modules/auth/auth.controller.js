import crypto from 'crypto';

import * as authService from './auth.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const AUTH_COOKIE_PATH = '/api/auth';

const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);

const baseCookieOptions = {
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
};

const setAuthCookies = (res, refreshToken) => {
  const csrfToken = crypto.randomBytes(32).toString('hex');

  res.cookie('refreshToken', refreshToken, {
    ...baseCookieOptions,
    httpOnly: true,
    path: AUTH_COOKIE_PATH,
  });

  res.cookie('csrfToken', csrfToken, {
    ...baseCookieOptions,
    httpOnly: false,
    path: '/',
  });
};

const clearAuthCookies = (res) => {
  res.clearCookie('refreshToken', {
    ...baseCookieOptions,
    httpOnly: true,
    path: AUTH_COOKIE_PATH,
  });

  // Remove cookies issued before the auth-wide cookie path was introduced.
  res.clearCookie('refreshToken', {
    ...baseCookieOptions,
    httpOnly: true,
    path: '/api/auth/refresh',
  });

  res.clearCookie('csrfToken', {
    ...baseCookieOptions,
    httpOnly: false,
    path: '/',
  });
};

const getDeviceContext = (req) => ({
  deviceInfo: req.headers['user-agent'],
  ipAddress: req.ip,
});

export const login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;

  const result = await authService.login({
    identifier,
    password,
    ...getDeviceContext(req),
  });

  setAuthCookies(res, result.refreshToken);

  const { refreshToken, ...safeResult } = result;

  res.status(200).json({
    success: true,
    data: safeResult,
  });
});

export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.cookies;

  const result = await authService.refreshAccessToken({
    refreshToken,
    ...getDeviceContext(req),
  });

  setAuthCookies(res, result.refreshToken);

  const { refreshToken: newRefreshToken, ...safeResult } = result;

  res.status(200).json({
    success: true,
    data: safeResult,
  });
});

export const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.cookies;

  await authService.logout(refreshToken);

  clearAuthCookies(res);

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

export const logoutAllDevices = asyncHandler(async (req, res) => {
  await authService.logoutAllDevices(req.user.id);

  res.status(200).json({
    success: true,
    message: 'Logged out of all devices',
  });
});

export const listSessions = asyncHandler(async (req, res) => {
  const sessions = await authService.listActiveSessions(req.user.id);

  res.status(200).json({
    success: true,
    data: sessions,
  });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.body.email);

  res.status(200).json({
    success: true,
    ...result,
  });
});

export const verifyResetOtp = asyncHandler(async (req, res) => {
  const result = await authService.verifyResetOtp(req.body);

  res.status(200).json({
    success: true,
    data: result,
  });
});

export const verifySignupOtp = asyncHandler(async (req, res) => {
  const result = await authService.verifySignupOtp(req.body);

  res.status(200).json({
    success: true,
    ...result,
  });
});

export const otpStatus = asyncHandler(async (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res
      .status(400)
      .json({ success: false, message: 'email is required' });
  }

  const exists = await authService.checkOtpExistsForEmail(email);

  res.status(200).json({ success: true, data: { exists } });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword(req.body);

  res.status(200).json({
    success: true,
    ...result,
  });
});
