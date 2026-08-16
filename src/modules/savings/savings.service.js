import * as savingsModel from './savings.model.js';
import { DEFAULT_PENALTY_PERCENTAGE } from '../../utils/constants.js';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from '../../utils/errors.js';

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export const createTimeBasedSavings = async (userId, input) => {
  return savingsModel.createTimeBasedSavings({
    userId,
    ...input,
    penaltyPercentage: DEFAULT_PENALTY_PERCENTAGE,
  });
};

export const createTargetBasedSavings = async (userId, input) => {
  return savingsModel.createTargetBasedSavings({
    userId,
    ...input,
    penaltyPercentage: DEFAULT_PENALTY_PERCENTAGE,
  });
};

// ---------------------------------------------------------------------------
// Reads (ownership-enforced)
// ---------------------------------------------------------------------------

const getOwnedAccountOrThrow = async (userId, savingsAccountId) => {
  const account = await savingsModel.findSavingsAccountById(savingsAccountId);

  // Same NotFoundError whether it doesn't exist or belongs to someone
  // else — avoids confirming a savings-account id is valid but not theirs.
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

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------

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

/**
 * Pauses automated debits on an ACTIVE account. Blocked on FROZEN accounts —
 * pausing isn't the concern there, but keeping the same status-transition
 * guard shape as resume/cancel below for consistency.
 */
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

/**
 * A FROZEN account can only be un-frozen by an admin (see admin.service.js)
 * — this deliberately does NOT allow FROZEN -> ACTIVE, which is the entire
 * reason FROZEN and PAUSED are separate statuses in the first place.
 */
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

/**
 * Internal — called by the payments module once a deposit is confirmed
 * successful (after server-side verification with the gateway, never from
 * the webhook payload alone). Not wired to any route.
 */
export const creditSavingsAccount = async (savingsAccountId, amount, db) => {
  return savingsModel.incrementBalance(savingsAccountId, amount, db);
};

/**
 * Blocked while there's a balance to withdraw — there's no payment/payout
 * flow yet to actually return the money, so cancelling with funds still in
 * the account would strand them with no way to get it back out.
 */
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

// ---------------------------------------------------------------------------
// Internal — for the payments module. Not called from any route here.
// ---------------------------------------------------------------------------

/**
 * Confirms a savings account can actually receive a deposit right now:
 * owned by this user, and not PAUSED/FROZEN/CANCELLED/COMPLETED. This is
 * the check that was previously a known gap — nothing stopped a deposit
 * from landing on a paused or frozen account.
 */
export const assertDepositable = async (userId, savingsAccountId) => {
  const account = await getOwnedAccountOrThrow(userId, savingsAccountId);

  if (account.status !== 'ACTIVE') {
    throw new ValidationError(
      `Cannot deposit into a savings account that is ${account.status.toLowerCase()}`,
    );
  }

  return account;
};

/**
 * Withdrawals are allowed while ACTIVE, PAUSED, or COMPLETED (e.g. claiming
 * matured funds) — but never while FROZEN (admin hold) or already CANCELLED.
 *
 * This is also where withdrawalPolicy and penaltyPercentage — both present
 * in the schema since the very first version of this model, but never
 * actually enforced anywhere — come into effect:
 *
 * - FLEXIBLE accounts: always withdrawable in full, no penalty, regardless
 *   of maturity/target progress.
 * - LOCKED accounts: withdrawing before maturity (time-based) or before
 *   reaching the target (target-based) is still ALLOWED, but incurs
 *   `penaltyPercentage` deducted from the payout. The full requested amount
 *   still leaves the balance — the penalty portion is forfeited, not paid
 *   out. LOCKED withdrawals made after maturity/target are penalty-free.
 *
 * Returns a breakdown rather than throwing on "early" — early withdrawal is
 * a normal, allowed path here, just a costed one. Blocking it outright
 * would be a different product decision than what penaltyPercentage implies.
 */
export const getWithdrawalBreakdown = async (
  userId,
  savingsAccountId,
  amount,
) => {
  const account = await getOwnedAccountOrThrow(userId, savingsAccountId);
  const requested = Number(amount);

  if (account.status === 'FROZEN') {
    throw new ForbiddenError(
      'This savings account has been frozen by an administrator and cannot be modified',
    );
  }
  if (account.status === 'CANCELLED') {
    throw new ValidationError(
      'This savings account has already been cancelled',
    );
  }
  if (requested > Number(account.balance)) {
    throw new ValidationError('Insufficient balance for this withdrawal');
  }

  let isEarly = false;
  if (account.type === 'TIME_BASED' && account.timeBasedDetails) {
    isEarly = new Date() < new Date(account.timeBasedDetails.maturityDate);
  } else if (account.type === 'TARGET_BASED' && account.targetBasedDetails) {
    isEarly =
      Number(account.balance) < Number(account.targetBasedDetails.target);
  }

  if (isEarly && account.withdrawalPolicy === 'LOCKED') {
    const reason =
      account.type === 'TIME_BASED'
        ? `This account is locked until ${new Date(
            account.timeBasedDetails.maturityDate,
          ).toDateString()}.`
        : `This account is locked until you reach your target of ${account.targetBasedDetails.target}.`;
    throw new ValidationError(`Withdrawals aren't allowed yet. ${reason}`);
  }

  // Either not early at all, or early on a FLEXIBLE account — both
  // reach here. FLEXIBLE + early is the only case that costs anything.
  const penaltyPercentage =
    isEarly && account.withdrawalPolicy === 'FLEXIBLE'
      ? Number(account.penaltyPercentage)
      : 0;
  const penaltyAmount =
    Math.round(requested * (penaltyPercentage / 100) * 100) / 100;
  const payoutAmount = Math.round((requested - penaltyAmount) * 100) / 100;

  return {
    account,
    amount: requested,
    isEarly,
    penaltyPercentage,
    penaltyAmount,
    payoutAmount,
  };
};

export const incrementBalance = async (id, amount, db) => {
  return savingsModel.incrementBalance(id, amount, db);
};

export const decrementBalance = async (id, amount, db) => {
  return savingsModel.decrementBalance(id, amount, db);
};

export const markCompleted = async (id, db) => {
  return savingsModel.markCompleted(id, db);
};
