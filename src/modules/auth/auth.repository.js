import prisma from '../../config/client.js';

export const createSession = async ({
  userId,
  tokenHash,
  deviceInfo,
  ipAddress,
  expiresAt,
}) => {
  return prisma.authSession.create({
    data: { userId, tokenHash, deviceInfo, ipAddress, expiresAt },
  });
};

export const getSessionByTokenHash = async (tokenHash) => {
  return prisma.authSession.findUnique({ where: { tokenHash } });
};

export const getActiveSessionsByUser = async (userId) => {
  return prisma.authSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      deviceInfo: true,
      ipAddress: true,
      createdAt: true,
      expiresAt: true,
    },
  });
};

export const revokeSession = async (id) => {
  return prisma.authSession.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
};

export const revokeSessionByTokenHash = async (tokenHash) => {
  return prisma.authSession.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
};

export const revokeAllSessionsForUser = async (userId) => {
  return prisma.authSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
};

export const deleteExpiredSessions = async () => {
  return prisma.authSession.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
};

export const createOtpCode = async ({
  userId,
  codeHash,
  purpose,
  expiresAt,
}) => {
  return prisma.otpCode.create({
    data: { userId, codeHash, purpose, expiresAt },
  });
};

export const getActiveOtpCode = async (userId, purpose) => {
  return prisma.otpCode.findFirst({
    where: {
      userId,
      purpose,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const incrementOtpAttempts = async (id) => {
  return prisma.otpCode.update({
    where: { id },
    data: { attempts: { increment: 1 } },
  });
};

export const consumeOtpCode = async (id) => {
  return prisma.otpCode.update({
    where: { id },
    data: { consumedAt: new Date() },
  });
};

export const invalidateActiveOtpCodes = async (userId, purpose) => {
  return prisma.otpCode.updateMany({
    where: { userId, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
};
