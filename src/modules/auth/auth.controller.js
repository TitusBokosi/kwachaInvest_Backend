import crypto from 'crypto';

import * as authService from './auth.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const REFRESH_COOKIE_PATH = '/api/auth/refresh';

const baseCookieOptions = {
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
};

const setAuthCookies = (res, refreshToken) => {
  const csrfToken = crypto.randomBytes(32).toString('hex');

  res.cookie('refreshToken', refreshToken, {
    ...baseCookieOptions,
    httpOnly: true,
    path: REFRESH_COOKIE_PATH,
  });

  res.cookie('csrfToken', csrfToken, {
    ...baseCookieOptions,
    httpOnly: false,
    path: '/',
  });

  console.log('\n========== AUTH COOKIES SET ==========');
  console.log('refreshToken:', Boolean(refreshToken));
  console.log('csrfToken:', csrfToken);
  console.log('refreshToken path:', REFRESH_COOKIE_PATH);
  console.log('csrfToken path: /');
  console.log('Cookie options:', baseCookieOptions);
  console.log('======================================\n');
};

const clearAuthCookies = (res) => {
  res.clearCookie('refreshToken', {
    ...baseCookieOptions,
    httpOnly: true,
    path: REFRESH_COOKIE_PATH,
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
  console.log('\n========== REFRESH CONTROLLER ==========');
  console.log('Cookies:', req.cookies);
  console.log('Refresh token exists:', Boolean(req.cookies?.refreshToken));
  console.log('CSRF cookie exists:', Boolean(req.cookies?.csrfToken));
  console.log('CSRF header:', req.headers['x-csrf-token']);
  console.log('=========================================\n');

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
  const result = await authService.forgotPassword(req.body.identifier);

  res.status(200).json({
    success: true,
    ...result,
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword(req.body);

  res.status(200).json({
    success: true,
    ...result,
  });
});
