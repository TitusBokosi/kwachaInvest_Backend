import * as adminService from "./admin.service.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { sendSuccess } from "../../utils/response.js"

export const getDashboardStats = asyncHandler(async (req, res) => {
    const stats = await adminService.getDashboardStats();
    sendSuccess(res, { data: stats });
})

export const getAuditLogs = asyncHandler(async (req, res) => {
    const { page, pageSize, userId, entityType, action, from, to } = req.query;

    const result = await adminService.getAuditLogs(
        { userId, entityType, action, from, to },
        { page, pageSize }
    );

    sendSuccess(res, result);
})

export const listSavingsAccounts = asyncHandler(async (req, res) => {
    const { page, pageSize, status, type, userId } = req.query;

    const result = await adminService.listSavingsAccounts(
        { status, type, userId },
        { page, pageSize }
    );

    sendSuccess(res, result);
})

export const getSavingsAccountById = asyncHandler(async (req, res) => {
    const account = await adminService.getSavingsAccountById(req.params.id);
    sendSuccess(res, { data: account });
})

export const freezeSavingsAccount = asyncHandler(async (req, res) => {
    const account = await adminService.freezeSavingsAccount(
        req.user.id,
        req.params.id,
        req.body.reason
    );
    sendSuccess(res, { data: account });
})

export const unfreezeSavingsAccount = asyncHandler(async (req, res) => {
    const account = await adminService.unfreezeSavingsAccount(req.user.id, req.params.id);
    sendSuccess(res, { data: account });
})
