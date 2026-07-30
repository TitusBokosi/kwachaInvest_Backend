import * as savingsModel from './savings.model.js';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from '../../utils/errors.js';

export const createTimeBasedSavings = async (userId, input) => {
  return savingsModel.createTimeBasedSavings({ userId, ...input });
};

export const createTargetBasedSavings = async (userId, input) => {
  return savingsModel.createTargetBasedSavings({ userId, ...input });
};

const getOwnedAccountOrThrow = async (userId, savingsAccountId) => {
  const account = await savingsModel.findSavingsAccountById(savingsAccountId);

  if (!account || account.userId !== userId) {
    throw new NotFoundError('Savings account not found');
  }

  return account;
};

export const getMySavingsAccountById = async (userId, savingsAccountId) => {
  return getOwnedAccountOrThrow(userId, savingsAccountId);
};

export const listMySavingsAccounts = async (userId, filters, pagination) => {
  return savingsModel.findSavingsAccountsForUser(userId, filters, pagination);
};

export const updateMySavingsAccountName = async (
  userId,
  savingsAccountId,
  name,
) => {
  const account = await getOwnedAccountOrThrow(userId, savingsAccountId);

  if (account.status === 'CANCELLED' || account.status === 'COMPLETED') {
    throw new ValidationError(
      `Cannot update a savings account that is ${account.status.toLowerCase()}`,
    );
  }

  return savingsModel.updateSavingsAccountName(savingsAccountId, name);
};

export const pauseMySavingsAccount = async (userId, savingsAccountId) => {
  const account = await getOwnedAccountOrThrow(userId, savingsAccountId);

  if (account.status === 'FROZEN') {
    throw new ForbiddenError(
      'This savings account has been frozen by an administrator and cannot be modified',
    );
  }
  if (account.status !== 'ACTIVE') {
    throw new ValidationError(
      `Cannot pause an account that is ${account.status.toLowerCase()}`,
    );
  }

  return savingsModel.updateSavingsAccountStatus(savingsAccountId, 'PAUSED');
};

export const resumeMySavingsAccount = async (userId, savingsAccountId) => {
  const account = await getOwnedAccountOrThrow(userId, savingsAccountId);

  if (account.status === 'FROZEN') {
    throw new ForbiddenError(
      'This savings account has been frozen by an administrator. Contact support to resolve this.',
    );
  }
  if (account.status !== 'PAUSED') {
    throw new ValidationError(
      `Cannot resume an account that is ${account.status.toLowerCase()}`,
    );
  }

  return savingsModel.updateSavingsAccountStatus(savingsAccountId, 'ACTIVE');
};

export const creditSavingsAccount = async (savingsAccountId, amount, db) => {
  return savingsModel.incrementBalance(savingsAccountId, amount, db);
};

export const cancelMySavingsAccount = async (userId, savingsAccountId) => {
  const account = await getOwnedAccountOrThrow(userId, savingsAccountId);

  if (account.status === 'FROZEN') {
    throw new ForbiddenError(
      'This savings account has been frozen by an administrator and cannot be modified',
    );
  }
  if (account.status === 'CANCELLED' || account.status === 'COMPLETED') {
    throw new ValidationError(
      `This account is already ${account.status.toLowerCase()}`,
    );
  }
  if (Number(account.balance) > 0) {
    throw new ValidationError(
      'Please withdraw your balance before cancelling this savings account',
    );
  }

  return savingsModel.updateSavingsAccountStatus(savingsAccountId, 'CANCELLED');
};

export const assertDepositable = async (userId, savingsAccountId) => {
  const account = await getOwnedAccountOrThrow(userId, savingsAccountId);

  if (account.status !== 'ACTIVE') {
    throw new ValidationError(
      `Cannot deposit into a savings account that is ${account.status.toLowerCase()}`,
    );
  }

  return account;
};

export const incrementBalance = async (id, amount, db) => {
  return savingsModel.incrementBalance(id, amount, db);
};

export const markCompleted = async (id, db) => {
  return savingsModel.markCompleted(id, db);
};
