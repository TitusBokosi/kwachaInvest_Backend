import jwt from 'jsonwebtoken';
import prisma from '../config/client.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authentication token is missing');
    }

    const token = authHeader.slice('Bearer '.length).trim();

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Session expired, please log in again');
      }
      throw new UnauthorizedError('Invalid authentication token');
    }

    if (!payload.sub || !payload.sid) {
      throw new UnauthorizedError('Invalid authentication token');
    }

    const session = await prisma.authSession.findUnique({
      where: { id: payload.sid },
      select: {
        userId: true,
        revokedAt: true,
        expiresAt: true,
        user: { select: { isActive: true, isEmailVerified: true, role: true } },
      },
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.user?.isActive ||
      session.user.role !== payload.role
    ) {
      throw new UnauthorizedError('Session is invalid or has expired, please log in again');
    }
    if (!session.user.isEmailVerified) {
      throw new ForbiddenError(
        'Please verify your email address before accessing your account.',
      );
    }

    req.user = {
      id: payload.sub,
      role: payload.role,
      sessionId: payload.sid,
    };

    next();
  } catch (err) {
    next(err);
  }
};
