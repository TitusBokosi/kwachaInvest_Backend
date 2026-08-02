import * as adminRepository from "./admin.repository.js"
import * as notificationService from "../notifications/notification.service.js"
import { recordAuditLog } from "../../utils/auditLog.js"
import { NotFoundError, ValidationError } from "../../utils/errors.js"

export const getAuditLogs = async (filters, pagination) => {
    return adminRepository.getAuditLogs(filters, pagination);
}

export const getDashboardStats = async () => {
    return adminRepository.getDashboardStats();
}

export const listSavingsAccounts = async (filters, pagination) => {
    return adminRepository.getAllSavingsAccounts(filters, pagination);
}

export const getSavingsAccountById = async (id) => {
    const account = await adminRepository.getSavingsAccountById(id);
    if (!account) throw new NotFoundError("Savings account not found");
    return account;
}

/**
 * Uses the FROZEN status — deliberately distinct from PAUSED, which is
 * reserved for a user pausing their own savings. If both used the same
 * status, a future "resume my savings" self-service endpoint would let a
 * user silently undo an admin-imposed freeze (e.g. during a fraud hold).
 */
export const freezeSavingsAccount = async (adminId, savingsAccountId, reason) => {
    const account = await adminRepository.getSavingsAccountById(savingsAccountId);
    if (!account) throw new NotFoundError("Savings account not found");

    if (account.status === "FROZEN") {
        throw new ValidationError("This savings account is already frozen");
    }
    if (account.status === "COMPLETED" || account.status === "CANCELLED") {
        throw new ValidationError(
            `Cannot freeze a savings account that is already ${account.status.toLowerCase()}`
        );
    }

    const updated = await adminRepository.updateSavingsAccountStatus(savingsAccountId, "FROZEN");

    await recordAuditLog({
        userId: adminId,
        action: "SAVINGS_ACCOUNT_FROZEN",
        entityType: "SavingsAccount",
        entityId: savingsAccountId,
        metadata: reason ? { reason, previousStatus: account.status } : { previousStatus: account.status },
    });

    if (account.user) {
        await notificationService.sendSavingsFrozenEmail(account.user, {
            savingsAccountName: account.name,
            reason,
        });
    }

    return updated;
}

export const unfreezeSavingsAccount = async (adminId, savingsAccountId) => {
    const account = await adminRepository.getSavingsAccountById(savingsAccountId);
    if (!account) throw new NotFoundError("Savings account not found");

    if (account.status !== "FROZEN") {
        throw new ValidationError("This savings account is not currently frozen");
    }

    const updated = await adminRepository.updateSavingsAccountStatus(savingsAccountId, "ACTIVE");

    await recordAuditLog({
        userId: adminId,
        action: "SAVINGS_ACCOUNT_UNFROZEN",
        entityType: "SavingsAccount",
        entityId: savingsAccountId,
    });

    if (account.user) {
        await notificationService.sendSavingsUnfrozenEmail(account.user, {
            savingsAccountName: account.name,
        });
    }

    return updated;
}
