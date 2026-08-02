import * as transactionModel from "./transaction.model.js"
import { NotFoundError } from "../../utils/errors.js"

// ---------------------------------------------------------------------------
// Internal — for the future payments/savings modules to call when a real
// debit is actually initiated against TNM/Airtel. Not wired to any route.
// ---------------------------------------------------------------------------

export const createTransaction = async (data) => {
    return transactionModel.createTransaction(data);
}

export const updateTransactionStatus = async (id, status, extra) => {
    return transactionModel.updateTransactionStatus(id, status, extra);
}

export const findByIdempotencyKey = async (idempotencyKey) => {
    return transactionModel.findTransactionByIdempotencyKey(idempotencyKey);
}

// ---------------------------------------------------------------------------
// Self-service
// ---------------------------------------------------------------------------

export const getMyTransactionById = async (userId, transactionId) => {
    const transaction = await transactionModel.findTransactionById(transactionId);

    // Same NotFoundError whether the transaction doesn't exist or belongs to
    // someone else — a distinct 403 would confirm the id is valid and just
    // not theirs, which lets IDs be probed/enumerated.
    if (!transaction || transaction.savingsAccount.userId !== userId) {
        throw new NotFoundError("Transaction not found");
    }

    return transaction;
}

export const listMyTransactions = async (userId, filters, pagination) => {
    return transactionModel.findTransactionsForUser(userId, filters, pagination);
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const listAllTransactions = async (filters, pagination) => {
    return transactionModel.findAllTransactions(filters, pagination);
}

export const getTransactionByIdAdmin = async (transactionId) => {
    const transaction = await transactionModel.findTransactionById(transactionId);
    if (!transaction) throw new NotFoundError("Transaction not found");
    return transaction;
}
