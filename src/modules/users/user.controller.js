import * as usersService from "./user.service.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { sendSuccess } from "../../utils/response.js"

// ---------------------------------------------------------------------------
// Self-service endpoints (assumes an auth middleware sets req.user.id)
// ---------------------------------------------------------------------------

export const register = asyncHandler(async (req, res) => {
    const user = await usersService.registerUser(req.body);
    sendSuccess(res, { statusCode: 201, data: user });
})

export const getMe = asyncHandler(async (req, res) => {
    const user = await usersService.getUserById(req.user.id);
    sendSuccess(res, { data: user });
})

export const getMyProfile = asyncHandler(async (req, res) => {
    const profile = await usersService.getUserProfile(req.user.id);
    sendSuccess(res, { data: profile });
})

export const updateMe = asyncHandler(async (req, res) => {
    const user = await usersService.updateUser(req.user.id, req.body);
    sendSuccess(res, { data: user });
})

export const changeMyPassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    await usersService.changePassword(req.user.id, currentPassword, newPassword);
    sendSuccess(res, { message: "Password updated successfully" });
})

export const deactivateMe = asyncHandler(async (req, res) => {
    await usersService.deactivateUser(req.user.id);
    sendSuccess(res, { message: "Account deactivated" });
})

// ---------------------------------------------------------------------------
// Admin-facing endpoints (assumes an admin-only auth middleware upstream)
// ---------------------------------------------------------------------------

export const getUserById = asyncHandler(async (req, res) => {
    const user = await usersService.getUserById(req.params.id);
    sendSuccess(res, { data: user });
})

export const listUsers = asyncHandler(async (req, res) => {
    const { page, pageSize, isActive, createdAfter } = req.query;

    const filters = {
        isActive: isActive !== undefined ? isActive === "true" : undefined,
        createdAfter: createdAfter ? new Date(createdAfter) : undefined,
    };

    const result = await usersService.listUsers(filters, { page, pageSize });
    sendSuccess(res, result);
})

export const searchUsers = asyncHandler(async (req, res) => {
    const { q, page, pageSize } = req.query;
    const result = await usersService.searchUsers(q, { page, pageSize });
    sendSuccess(res, result);
})

export const deactivateUserById = asyncHandler(async (req, res) => {
    const user = await usersService.deactivateUser(req.params.id);
    sendSuccess(res, { data: user });
})

export const reactivateUserById = asyncHandler(async (req, res) => {
    const user = await usersService.reactivateUser(req.params.id);
    sendSuccess(res, { data: user });
})

export const updateUserRole = asyncHandler(async (req, res) => {
    const user = await usersService.updateUserRole(req.user.id, req.params.id, req.body.role);
    sendSuccess(res, { data: user });
})
