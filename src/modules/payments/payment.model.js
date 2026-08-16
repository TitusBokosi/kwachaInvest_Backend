import prisma from '../../config/client.js';

export const findSavedPaymentMethodsForUser = async (userId) => {
  return prisma.mobileMoneyAccount.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
};

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
    update: { operatorRefId, isVerified, updatedAt: new Date() },
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
