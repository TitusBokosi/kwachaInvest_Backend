import * as transactionService from './transaction.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const listMyTransactions = asyncHandler(async (req, res) => {
  const { page, pageSize, savingsAccountId, type, status, from, to } =
    req.query;

  const result = await transactionService.listMyTransactions(
    req.user.id,
    { savingsAccountId, type, status, from, to },
    { page, pageSize },
  );

  res.status(200).json({ success: true, ...result });
});

export const getMyTransactionById = asyncHandler(async (req, res) => {
  const transaction = await transactionService.getMyTransactionById(
    req.user.id,
    req.params.id,
  );
  res.status(200).json({ success: true, data: transaction });
});

export const listAllTransactions = asyncHandler(async (req, res) => {
  const { page, pageSize, userId, savingsAccountId, type, status, from, to } =
    req.query;

  const result = await transactionService.listAllTransactions(
    { userId, savingsAccountId, type, status, from, to },
    { page, pageSize },
  );

  res.status(200).json({ success: true, ...result });
});

export const getTransactionByIdAdmin = asyncHandler(async (req, res) => {
  const transaction = await transactionService.getTransactionByIdAdmin(
    req.params.id,
  );
  res.status(200).json({ success: true, data: transaction });
});
