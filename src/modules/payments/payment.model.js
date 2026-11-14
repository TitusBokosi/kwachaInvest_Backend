import prisma from '../../config/client.js';
import { buildPagination, paginatedResult } from '../../utils/pagination.js';
import { withTransaction } from '../../utils/withTransaction.js';

export const findSavedPaymentMethodsForUser = async (
  userId,
  pagination = {},
) => {
  const { skip, take, page, pageSize } = buildPagination(pagination);
  const where = { userId };
  const [data, total] = await withTransaction([
    prisma.mobileMoneyAccount.findMany({
      where,
      skip,
      take,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.mobileMoneyAccount.count({ where }),
  ]);
  return paginatedResult(data, total, page, pageSize);
};

export const findSavedPaymentMethodByUserProviderPhone = async (
  userId,
  provider,
  phoneNumber,
) =>
  prisma.mobileMoneyAccount.findUnique({
    where: { userId_provider_phoneNumber: { userId, provider, phoneNumber } },
  });

export const findSavedPaymentMethodById = async (id) => {
  return prisma.mobileMoneyAccount.findUnique({ where: { id } });
};

export const upsertSavedPaymentMethod = async ({
  userId,
  provider,
  operatorRefId,
  phoneNumber,
  isVerified,
}) => {
  return prisma.mobileMoneyAccount.upsert({
    where: { userId_provider_phoneNumber: { userId, provider, phoneNumber } },
    create: { userId, provider, operatorRefId, phoneNumber, isVerified },
    update: {
      operatorRefId,
      ...(isVerified && { isVerified: true }),
      updatedAt: new Date(),
    },
  });
};

export const deleteSavedPaymentMethod = async (id) => {
  return prisma.mobileMoneyAccount.delete({ where: { id } });
};

export const createPaymentGatewayTransaction = async (
  { transactionId, mode, status, gatewayReference, responsePayload },
  db = prisma,
) => {
  return db.paymentGatewayTransaction.create({
    data: { transactionId, mode, status, gatewayReference, responsePayload },
  });
};

export const updatePaymentGatewayTransaction = async (
  id,
  data,
  db = prisma,
) => {
  return db.paymentGatewayTransaction.update({ where: { id }, data });
};

export const findPaymentGatewayTransactionByTransactionId = async (
  transactionId,
) => {
  return prisma.paymentGatewayTransaction.findUnique({
    where: { transactionId },
  });
};

export const findPaymentGatewayTransactionByGatewayReference = async (
  gatewayReference,
) => {
  return prisma.paymentGatewayTransaction.findFirst({
    where: { gatewayReference },
  });
};

export const createWebhookEvent = async ({
  paymentGatewayTransactionId,
  providerEventId,
  payload,
}) => {
  return prisma.webhookEvent.create({
    data: { paymentGatewayTransactionId, providerEventId, payload },
  });
};

export const findWebhookEventByProviderEventId = async (providerEventId) => {
  return prisma.webhookEvent.findUnique({ where: { providerEventId } });
};

export const markWebhookEventProcessed = async (id) => {
  return prisma.webhookEvent.update({
    where: { id },
    data: { status: 'PROCESSED', processedAt: new Date() },
  });
};

export const markWebhookEventFailed = async (id, errorMessage) => {
  return prisma.webhookEvent.update({
    where: { id },
    data: { status: 'FAILED', processedAt: new Date(), errorMessage },
  });
};
