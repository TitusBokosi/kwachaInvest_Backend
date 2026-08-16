import { jest } from '@jest/globals';

jest.mock('../../config/client.js', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    authSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    otpCode: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock('../../utils/hash.js', () => ({
  hashValue: jest.fn(),
  compareValue: jest.fn(),
}));

jest.mock('../../utils/jwt.js', () => ({
  signAccessToken: jest.fn(),
}));

jest.mock('../notifications/notification.service.js', () => ({
  sendPasswordResetOtpEmail: jest.fn(),
}));

import prisma from '../../config/client.js';
import * as hashUtil from '../../utils/hash.js';
import * as jwtUtil from '../../utils/jwt.js';
import * as notificationService from '../notifications/notification.service.js';
import * as authRepository from './auth.repository.js';
import * as authService from './auth.service.js';
import * as authController from './auth.controller.js';
import * as authValidator from './auth.validator.js';
import {
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
} from '../../utils/errors.js';

const buildRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const activeUser = {
  id: 'u1',
  fullName: 'Tee Banda',
  email: 'tee@example.com',
  phoneNumber: '0991234567',
  passwordHash: 'stored-hash',
  role: 'USER',
  isActive: true,
};

describe('Auth module', () => {
  describe('repository', () => {
    it('createSession writes userId/tokenHash/deviceInfo/ipAddress/expiresAt', async () => {
      prisma.authSession.create.mockResolvedValue({ id: 's1' });

      await authRepository.createSession({
        userId: 'u1',
        tokenHash: 'hash',
        deviceInfo: 'iPhone',
        ipAddress: '127.0.0.1',
        expiresAt: new Date('2026-02-01'),
      });

      expect(prisma.authSession.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          tokenHash: 'hash',
          deviceInfo: 'iPhone',
          ipAddress: '127.0.0.1',
          expiresAt: new Date('2026-02-01'),
        },
      });
    });

    it('getActiveSessionsByUser excludes tokenHash from the select', async () => {
      prisma.authSession.findMany.mockResolvedValue([]);

      await authRepository.getActiveSessionsByUser('u1');

      const [args] = prisma.authSession.findMany.mock.calls[0];
      expect(args.select.tokenHash).toBeUndefined();
      expect(args.where).toEqual({
        userId: 'u1',
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      });
    });

    it('revokeAllSessionsForUser only targets currently-unrevoked sessions', async () => {
      prisma.authSession.updateMany.mockResolvedValue({ count: 2 });

      await authRepository.revokeAllSessionsForUser('u1');

      expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('getActiveOtpCode only returns unconsumed, unexpired codes, most recent first', async () => {
      prisma.otpCode.findFirst.mockResolvedValue(null);

      await authRepository.getActiveOtpCode('u1', 'PASSWORD_RESET');

      expect(prisma.otpCode.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'u1',
          purpose: 'PASSWORD_RESET',
          consumedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('service', () => {
    describe('login', () => {
      it('throws UnauthorizedError for an unknown identifier', async () => {
        prisma.user.findUnique.mockResolvedValue(null);

        await expect(
          authService.login({
            identifier: 'nobody@example.com',
            password: 'x',
          }),
        ).rejects.toThrow(UnauthorizedError);
      });

      it('throws ForbiddenError for a deactivated account', async () => {
        prisma.user.findUnique.mockResolvedValue({
          ...activeUser,
          isActive: false,
        });

        await expect(
          authService.login({ identifier: activeUser.email, password: 'x' }),
        ).rejects.toThrow(ForbiddenError);
      });

      it('throws UnauthorizedError on a wrong password (same error as unknown user)', async () => {
        prisma.user.findUnique.mockResolvedValue(activeUser);
        hashUtil.compareValue.mockResolvedValue(false);

        await expect(
          authService.login({
            identifier: activeUser.email,
            password: 'wrong',
          }),
        ).rejects.toThrow(UnauthorizedError);
      });

      it('on success: creates a session, signs a token, and strips passwordHash from the returned user', async () => {
        prisma.user.findUnique.mockResolvedValue(activeUser);
        hashUtil.compareValue.mockResolvedValue(true);
        jwtUtil.signAccessToken.mockReturnValue('signed.jwt.token');
        prisma.authSession.create.mockResolvedValue({ id: 's1' });

        const result = await authService.login({
          identifier: activeUser.email,
          password: 'correct-password',
          deviceInfo: 'Chrome',
          ipAddress: '1.2.3.4',
        });

        expect(jwtUtil.signAccessToken).toHaveBeenCalledWith({
          sub: 'u1',
          role: 'USER',
        });
        expect(prisma.authSession.create).toHaveBeenCalled();
        expect(result.accessToken).toBe('signed.jwt.token');
        expect(result.refreshToken).toEqual(expect.any(String));
        expect(result.user.passwordHash).toBeUndefined();
        expect(result.user.email).toBe(activeUser.email);
      });
    });

    describe('refreshAccessToken', () => {
      it('throws ValidationError when no token is provided', async () => {
        await expect(authService.refreshAccessToken({})).rejects.toThrow(
          ValidationError,
        );
      });

      it('throws UnauthorizedError for a revoked session', async () => {
        prisma.authSession.findUnique.mockResolvedValue({
          id: 's1',
          userId: 'u1',
          revokedAt: new Date(),
          expiresAt: new Date(Date.now() + 100000),
        });

        await expect(
          authService.refreshAccessToken({ refreshToken: 'sometoken' }),
        ).rejects.toThrow(UnauthorizedError);
      });

      it('throws UnauthorizedError for an expired session', async () => {
        prisma.authSession.findUnique.mockResolvedValue({
          id: 's1',
          userId: 'u1',
          revokedAt: null,
          expiresAt: new Date(Date.now() - 1000),
        });

        await expect(
          authService.refreshAccessToken({ refreshToken: 'sometoken' }),
        ).rejects.toThrow(UnauthorizedError);
      });

      it('rotates the token: revokes the old session and issues a new one', async () => {
        prisma.authSession.findUnique.mockResolvedValue({
          id: 's1',
          userId: 'u1',
          revokedAt: null,
          expiresAt: new Date(Date.now() + 100000),
        });
        prisma.user.findUnique.mockResolvedValue(activeUser);
        prisma.authSession.update.mockResolvedValue({});
        jwtUtil.signAccessToken.mockReturnValue('new.jwt.token');
        prisma.authSession.create.mockResolvedValue({ id: 's2' });

        const result = await authService.refreshAccessToken({
          refreshToken: 'sometoken',
        });

        expect(prisma.authSession.update).toHaveBeenCalledWith({
          where: { id: 's1' },
          data: { revokedAt: expect.any(Date) },
        });
        expect(result.accessToken).toBe('new.jwt.token');
      });
    });

    describe('logout / logoutAllDevices / listActiveSessions', () => {
      it('logout throws ValidationError with no token', async () => {
        await expect(authService.logout(undefined)).rejects.toThrow(
          ValidationError,
        );
      });

      it('logout revokes the session by token hash', async () => {
        prisma.authSession.updateMany.mockResolvedValue({ count: 1 });
        await authService.logout('sometoken');
        expect(prisma.authSession.updateMany).toHaveBeenCalled();
      });

      it('logoutAllDevices delegates to revokeAllSessionsForUser', async () => {
        prisma.authSession.updateMany.mockResolvedValue({ count: 3 });
        await authService.logoutAllDevices('u1');
        expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
          where: { userId: 'u1', revokedAt: null },
          data: { revokedAt: expect.any(Date) },
        });
      });

      it('listActiveSessions returns the repository result as-is', async () => {
        prisma.authSession.findMany.mockResolvedValue([{ id: 's1' }]);
        const result = await authService.listActiveSessions('u1');
        expect(result).toEqual([{ id: 's1' }]);
      });
    });

    describe('forgotPassword', () => {
      it("does nothing but returns the generic message when the user doesn't exist", async () => {
        prisma.user.findUnique.mockResolvedValue(null);

        const result = await authService.forgotPassword('nobody@example.com');

        expect(prisma.otpCode.create).not.toHaveBeenCalled();
        expect(
          notificationService.sendPasswordResetOtpEmail,
        ).not.toHaveBeenCalled();
        expect(result.message).toMatch(/if an account exists/i);
      });

      it('creates an OTP and emails it when the user exists', async () => {
        prisma.user.findUnique.mockResolvedValue(activeUser);
        prisma.otpCode.updateMany.mockResolvedValue({ count: 0 });
        hashUtil.hashValue.mockResolvedValue('hashed-otp');
        prisma.otpCode.create.mockResolvedValue({ id: 'otp1' });

        const result = await authService.forgotPassword(activeUser.email);

        expect(prisma.otpCode.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              userId: 'u1',
              purpose: 'PASSWORD_RESET',
            }),
          }),
        );
        expect(
          notificationService.sendPasswordResetOtpEmail,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'u1',
            email: 'tee@example.com',
            fullName: 'Tee Banda',
            phoneNumber: '0991234567',
            role: 'USER',
            isActive: true,
          }),
          expect.any(String),
        );
        expect(result.message).toMatch(/if an account exists/i);
      });
    });

    describe('resetPassword', () => {
      const validInput = {
        identifier: activeUser.email,
        otp: '123456',
        newPassword: 'newpassword1',
      };

      it("throws a generic ValidationError when the user doesn't exist", async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        await expect(authService.resetPassword(validInput)).rejects.toThrow(
          ValidationError,
        );
      });

      it("throws when there's no active OTP", async () => {
        prisma.user.findUnique.mockResolvedValue(activeUser);
        prisma.otpCode.findFirst.mockResolvedValue(null);
        await expect(authService.resetPassword(validInput)).rejects.toThrow(
          ValidationError,
        );
      });

      it('throws and does NOT increment attempts once the max is already reached', async () => {
        prisma.user.findUnique.mockResolvedValue(activeUser);
        prisma.otpCode.findFirst.mockResolvedValue({
          id: 'otp1',
          attempts: 5,
          codeHash: 'h',
        });

        await expect(authService.resetPassword(validInput)).rejects.toThrow(
          /too many incorrect attempts/i,
        );
        expect(prisma.otpCode.update).not.toHaveBeenCalled();
      });

      it('increments attempts on a wrong code', async () => {
        prisma.user.findUnique.mockResolvedValue(activeUser);
        prisma.otpCode.findFirst.mockResolvedValue({
          id: 'otp1',
          attempts: 1,
          codeHash: 'h',
        });
        hashUtil.compareValue.mockResolvedValue(false);
        prisma.otpCode.update.mockResolvedValue({});

        await expect(authService.resetPassword(validInput)).rejects.toThrow(
          ValidationError,
        );
        expect(prisma.otpCode.update).toHaveBeenCalledWith({
          where: { id: 'otp1' },
          data: { attempts: { increment: 1 } },
        });
      });

      it('on success: consumes the OTP, updates the password, and revokes every session', async () => {
        prisma.user.findUnique.mockResolvedValue(activeUser);
        prisma.otpCode.findFirst.mockResolvedValue({
          id: 'otp1',
          attempts: 0,
          codeHash: 'h',
        });
        hashUtil.compareValue.mockResolvedValue(true);
        prisma.otpCode.update.mockResolvedValue({});
        hashUtil.hashValue.mockResolvedValue('new-hash');
        prisma.user.update.mockResolvedValue({
          id: 'u1',
          updatedAt: new Date(),
        });
        prisma.authSession.updateMany.mockResolvedValue({ count: 2 });

        const result = await authService.resetPassword(validInput);

        expect(prisma.otpCode.update).toHaveBeenCalledWith({
          where: { id: 'otp1' },
          data: { consumedAt: expect.any(Date) },
        });
        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: 'u1' },
          data: { passwordHash: 'new-hash' },
        });
        expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
          where: { userId: 'u1', revokedAt: null },
          data: { revokedAt: expect.any(Date) },
        });
        expect(result.message).toMatch(/password reset successful/i);
      });
    });
  });

  // =========================================================================
  // CONTROLLER
  // =========================================================================
  describe('controller', () => {
    it('login reads identifier/password from body and device context from headers', async () => {
      const req = {
        body: { identifier: activeUser.email, password: 'correct-password' },
        headers: { 'user-agent': 'Chrome' },
        ip: '1.2.3.4',
      };
      const res = buildRes();
      const next = jest.fn();

      prisma.user.findUnique.mockResolvedValue(activeUser);
      hashUtil.compareValue.mockResolvedValue(true);
      jwtUtil.signAccessToken.mockReturnValue('token');
      prisma.authSession.create.mockResolvedValue({ id: 's1' });

      await authController.login(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const [body] = res.json.mock.calls[0];
      expect(body.success).toBe(true);
      expect(body.data.accessToken).toBe('token');
      expect(next).not.toHaveBeenCalled();
    });

    it('forwards a thrown error to next() rather than throwing', async () => {
      const req = {
        body: { identifier: 'nobody@example.com', password: 'x' },
        headers: {},
        ip: '1.1.1.1',
      };
      const res = buildRes();
      const next = jest.fn();
      prisma.user.findUnique.mockResolvedValue(null);

      await authController.login(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
      expect(res.status).not.toHaveBeenCalled();
    });

    it('logoutAllDevices uses req.user.id', async () => {
      const req = { user: { id: 'u1' } };
      const res = buildRes();
      const next = jest.fn();
      prisma.authSession.updateMany.mockResolvedValue({ count: 1 });

      await authController.logoutAllDevices(req, res, next);

      expect(prisma.authSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'u1' }),
        }),
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Logged out of all devices',
      });
    });

    it('forgotPassword spreads the service result (message) into the response body', async () => {
      const req = { body: { identifier: 'nobody@example.com' } };
      const res = buildRes();
      const next = jest.fn();
      prisma.user.findUnique.mockResolvedValue(null);

      await authController.forgotPassword(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'If an account exists, a reset code has been sent.',
      });
    });
  });

  // =========================================================================
  // VALIDATION
  // =========================================================================
  describe('validation', () => {
    it('loginSchema requires both identifier and password', () => {
      expect(authValidator.loginSchema.body.safeParse({}).success).toBe(false);
      expect(
        authValidator.loginSchema.body.safeParse({
          identifier: 'a@b.com',
          password: 'x',
        }).success,
      ).toBe(true);
    });

    it('resetPasswordSchema rejects a non-6-digit otp', () => {
      const result = authValidator.resetPasswordSchema.body.safeParse({
        identifier: 'a@b.com',
        otp: '12',
        newPassword: 'newpassword1',
        confirmNewPassword: 'newpassword1',
      });
      expect(result.success).toBe(false);
    });

    it('resetPasswordSchema rejects mismatched password confirmation', () => {
      const result = authValidator.resetPasswordSchema.body.safeParse({
        identifier: 'a@b.com',
        otp: '123456',
        newPassword: 'newpassword1',
        confirmNewPassword: 'different',
      });
      expect(result.success).toBe(false);
    });

    it('refreshSchema and logoutSchema both require a non-empty refreshToken', () => {
      expect(authValidator.refreshSchema.body.safeParse({}).success).toBe(
        false,
      );
      expect(
        authValidator.logoutSchema.body.safeParse({ refreshToken: '' }).success,
      ).toBe(false);
      expect(
        authValidator.logoutSchema.body.safeParse({ refreshToken: 'abc' })
          .success,
      ).toBe(true);
    });
  });
});
