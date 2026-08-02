import * as savingsService from "./savings.service.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { sendSuccess } from "../../utils/response.js"

export const createTimeBasedSavings = asyncHandler(async (req, res) => {
    const account = await savingsService.createTimeBasedSavings(req.user.id, req.body);
    sendSuccess(res, { statusCode: 201, data: account });
})

export const createTargetBasedSavings = asyncHandler(async (req, res) => {
    const account = await savingsService.createTargetBasedSavings(req.user.id, req.body);
    sendSuccess(res, { statusCode: 201, data: account });
})

export const listMySavingsAccounts = asyncHandler(async (req, res) => {
    const { page, pageSize, status, type } = req.query;
    const result = await savingsService.listMySavingsAccounts(
        req.user.id,
        { status, type },
        { page, pageSize }
    );
    sendSuccess(res, result);
})

export const getMySavingsAccountById = asyncHandler(async (req, res) => {
    const account = await savingsService.getMySavingsAccountById(req.user.id, req.params.id);
    sendSuccess(res, { data: account });
})

export const updateMySavingsAccountName = asyncHandler(async (req, res) => {
    const account = await savingsService.updateMySavingsAccountName(
        req.user.id,
        req.params.id,
        req.body.name
    );
    sendSuccess(res, { data: account });
})

export const pauseMySavingsAccount = asyncHandler(async (req, res) => {
    const account = await savingsService.pauseMySavingsAccount(req.user.id, req.params.id);
    sendSuccess(res, { data: account });
})

export const resumeMySavingsAccount = asyncHandler(async (req, res) => {
    const account = await savingsService.resumeMySavingsAccount(req.user.id, req.params.id);
    sendSuccess(res, { data: account });
})

export const cancelMySavingsAccount = asyncHandler(async (req, res) => {
    const account = await savingsService.cancelMySavingsAccount(req.user.id, req.params.id);
    sendSuccess(res, { data: account });
})
