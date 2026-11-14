import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

jest.mock('../../config/client.js', () => ({
  __esModule: true,
  default: {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    authSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
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
    $transaction: jest.fn(),
  },
}));

jest.mock('../../utils/hash.js', () => ({
  hashValue: jest.fn(),
  compareValue: jest.fn(),
}));

jest.mock('../../utils/jwt.js', () => ({
  signAccessToken: jest.fn(),
  signPasswordResetToken: jest.fn(),
  verifyPasswordResetToken: jest.fn(),
}));

jest.mock('../notifications/notification.service.js', () => ({
  sendPasswordResetOtpEmail: jest.fn(),
  sendSignupVerificationOtpEmail: jest.fn(),
  sendWelcomeEmail: jest.fn(),
}));

import prisma from '../../config/client.js';
import * as hashUtil from '../../utils/hash.js';
import * as jwtUtil from '../../utils/jwt.js';
import * as notificationService from '../notifications/notification.service.js';
import * as authRepository from './auth.repository.js';
import * as authService from './auth.service.js';
import * as authController from './auth.controller.js';
import * as authValidator from './auth.validator.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import {
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
} from '../../utils/errors.js';

const buildRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
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
  isEmailVerified: true,
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
      prisma.authSession.count.mockResolvedValue(0);
      prisma.$transaction.mockResolvedValue([[], 0]);

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

    it('getLatestOtpCode reads the newest code regardless of consumption or expiry', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({ createdAt: new Date() });

      await authRepository.getLatestOtpCode('u1', 'PASSWORD_RESET');

      expect(prisma.otpCode.findFirst).toHaveBeenCalledWith({
        where: { userId: 'u1', purpose: 'PASSWORD_RESET' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
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

      it('blocks an unverified account from creating a login session', async () => {
        prisma.user.findUnique.mockResolvedValue({
          ...activeUser,
          isEmailVerified: false,
        });
        hashUtil.compareValue.mockResolvedValue(true);

        await expect(
          authService.login({
            identifier: activeUser.email,
            password: 'correct-password',
          }),
        ).rejects.toThrow(ForbiddenError);

        expect(prisma.authSession.create).not.toHaveBeenCalled();
        expect(prisma.otpCode.create).not.toHaveBeenCalled();
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
          sid: 's1',
        });
        expect(prisma.authSession.create).toHaveBeenCalled();
        expect(result.accessToken).toBe('signed.jwt.token');
        expect(result.refreshToken).toEqual(expect.any(String));
        expect(result.user.passwordHash).toBeUndefined();
        expect(result.user.email).toBe(activeUser.email);
      });
    });

    describe('refreshAccessToken', () => {
      it('throws UnauthorizedError when no token is provided', async () => {
        await expect(authService.refreshAccessToken({})).rejects.toThrow(
          UnauthorizedError,
        );
      });

      describe('email verification', () => {
        it('verifies and consumes the email OTP before marking the account verified', async () => {
          prisma.user.findUnique.mockResolvedValue({
            ...activeUser,
            isEmailVerified: false,
          });
          prisma.otpCode.findFirst.mockResolvedValue({
            id: 'otp1',
            attempts: 0,
            codeHash: 'otp-hash',
          });
          hashUtil.compareValue.mockResolvedValue(true);
          prisma.otpCode.updateMany.mockResolvedValue({ count: 1 });
          prisma.user.update.mockResolvedValue({ id: 'u1' });

          await expect(
            authService.verifyEmail({
              email: activeUser.email,
              otp: '123456',
            }),
          ).resolves.toMatchObject({ message: expect.stringMatching(/verified/i) });

          expect(prisma.otpCode.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.objectContaining({
                id: 'otp1',
                userId: 'u1',
                purpose: 'EMAIL_VERIFICATION',
              }),
            }),
          );
          expect(prisma.user.update).toHaveBeenCalledWith({
            where: { id: 'u1' },
            data: { isEmailVerified: true },
          });
        });

        it('increments attempts and rejects an incorrect verification OTP', async () => {
          prisma.user.findUnique.mockResolvedValue({
            ...activeUser,
            isEmailVerified: false,
          });
          prisma.otpCode.findFirst.mockResolvedValue({
            id: 'otp1',
            attempts: 0,
            codeHash: 'otp-hash',
          });
          hashUtil.compareValue.mockResolvedValue(false);
          prisma.otpCode.update.mockResolvedValue({});

          await expect(
            authService.verifyEmail({
              email: activeUser.email,
              otp: '123456',
            }),
          ).rejects.toThrow(ValidationError);
          expect(prisma.otpCode.update).toHaveBeenCalledWith({
            where: { id: 'otp1' },
            data: { attempts: { increment: 1 } },
          });
          expect(prisma.user.update).not.toHaveBeenCalled();
        });
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
        prisma.authSession.updateMany.mockResolvedValue({ count: 1 });
        jwtUtil.signAccessToken.mockReturnValue('new.jwt.token');
        prisma.authSession.create.mockResolvedValue({ id: 's2' });

        const result = await authService.refreshAccessToken({
          refreshToken: 'sometoken',
        });

        expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
          where: {
            id: 's1',
            revokedAt: null,
            expiresAt: { gt: expect.any(Date) },
          },
          data: { revokedAt: expect.any(Date) },
        });
        expect(result.accessToken).toBe('new.jwt.token');
      });
    });

    describe('logout / logoutAllDevices / listActiveSessions', () => {
      it('logout succeeds with no token so cookie cleanup remains idempotent', async () => {
        await expect(authService.logout(undefined)).resolves.toBeUndefined();
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
        prisma.authSession.count.mockResolvedValue(1);
        prisma.$transaction.mockResolvedValue([[{ id: 's1' }], 1]);
        const result = await authService.listActiveSessions('u1');
        expect(result).toEqual({
          data: [{ id: 's1' }],
          total: 1,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        });
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

      it('returns before the OTP email delivery completes', async () => {
        prisma.user.findUnique.mockResolvedValue(activeUser);
        prisma.otpCode.updateMany.mockResolvedValue({ count: 0 });
        hashUtil.hashValue.mockResolvedValue('hashed-otp');
        prisma.otpCode.create.mockResolvedValue({ id: 'otp1' });
        notificationService.sendPasswordResetOtpEmail.mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 800)),
        );

        const start = Date.now();
        const result = await authService.forgotPassword(activeUser.email);
        const elapsed = Date.now() - start;

        expect(result.message).toMatch(/if an account exists/i);
        expect(elapsed).toBeLessThan(600);
      });

      it('does not send another reset code during the 15-second resend cooldown', async () => {
        prisma.user.findUnique.mockResolvedValue(activeUser);
        prisma.otpCode.findFirst.mockResolvedValue({
          createdAt: new Date(),
        });

        const result = await authService.forgotPassword(activeUser.email);

        expect(result.message).toMatch(/if an account exists/i);
        expect(prisma.otpCode.create).not.toHaveBeenCalled();
        expect(
          notificationService.sendPasswordResetOtpEmail,
        ).not.toHaveBeenCalled();
      });
    });

    describe('password reset', () => {
      it('verifies the OTP and returns a short-lived reset token', async () => {
        prisma.user.findUnique.mockResolvedValue(activeUser);
        prisma.otpCode.findFirst.mockResolvedValue({
          id: 'otp1',
          attempts: 0,
          codeHash: 'h',
        });
        hashUtil.compareValue.mockResolvedValue(true);
        jwtUtil.signPasswordResetToken.mockReturnValue('signed.reset.token');

        await expect(
          authService.verifyPasswordResetOtp({
            email: activeUser.email,
            otp: '123456',
          }),
        ).resolves.toEqual({ resetToken: 'signed.reset.token' });
        expect(jwtUtil.signPasswordResetToken).toHaveBeenCalledWith({
          userId: 'u1',
          otpId: 'otp1',
        });
        expect(prisma.otpCode.updateMany).not.toHaveBeenCalled();
      });

      it('changes the password only when the reset token atomically claims its OTP', async () => {
        jwtUtil.verifyPasswordResetToken.mockReturnValue({
          sub: 'u1',
          otpId: 'otp1',
          purpose: 'PASSWORD_RESET',
        });
        prisma.otpCode.updateMany.mockResolvedValue({ count: 1 });
        hashUtil.hashValue.mockResolvedValue('new-hash');
        prisma.user.update.mockResolvedValue({
          id: 'u1',
          updatedAt: new Date(),
        });
        prisma.authSession.updateMany.mockResolvedValue({ count: 2 });

        await expect(
          authService.resetPassword({
            resetToken: 'signed.reset.token',
            newPassword: 'newpassword1',
            confirmNewPassword: 'newpassword1',
          }),
        ).resolves.toMatchObject({
          message: expect.stringMatching(/successful/i),
        });
        expect(prisma.otpCode.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              id: 'otp1',
              userId: 'u1',
              purpose: 'PASSWORD_RESET',
              consumedAt: null,
              resetTokenUsedAt: null,
              expiresAt: { gt: expect.any(Date) },
            }),
          }),
        );
        expect(prisma.authSession.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }),
        );
      });
    });

  });

  describe('authentication middleware', () => {
    const makeRequest = () => ({
      headers: {
        authorization: `Bearer ${jwt.sign(
          { sub: 'u1', role: 'USER', sid: 's1' },
          process.env.JWT_SECRET,
        )}`,
      },
    });

    it('rejects access tokens whose session has been revoked', async () => {
      prisma.authSession.findUnique.mockResolvedValue({
        userId: 'u1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        user: { isActive: true, isEmailVerified: true, role: 'USER' },
      });
      const next = jest.fn();

      await authenticate(makeRequest(), {}, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('accepts a token only while its session and user are active', async () => {
      prisma.authSession.findUnique.mockResolvedValue({
        userId: 'u1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: { isActive: true, isEmailVerified: true, role: 'USER' },
      });
      const next = jest.fn();
      const req = makeRequest();

      await authenticate(req, {}, next);

      expect(req.user).toMatchObject({
        id: 'u1',
        role: 'USER',
        sessionId: 's1',
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('blocks protected access until the email is verified', async () => {
      prisma.authSession.findUnique.mockResolvedValue({
        userId: 'u1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: { isActive: true, isEmailVerified: false, role: 'USER' },
      });
      const next = jest.fn();

      await authenticate(makeRequest(), {}, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
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
      const req = { body: { email: 'nobody@example.com' } };
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

    it('verifyPasswordResetOtpSchema rejects a non-6-digit otp', () => {
      const result = authValidator.verifyPasswordResetOtpSchema.body.safeParse({
        email: 'a@b.com',
        otp: '12',
      });
      expect(result.success).toBe(false);
    });

    it('resetPasswordSchema rejects mismatched password confirmation', () => {
      const result = authValidator.resetPasswordSchema.body.safeParse({
        resetToken: 'token',
        newPassword: 'newpassword1',
        confirmNewPassword: 'different',
      });
      expect(result.success).toBe(false);
    });

  });
});
