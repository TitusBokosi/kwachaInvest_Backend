import * as usersService from "./user.service.js"
import { asyncHandler } from "../../utils/asyncHandler.js"


export const register = asyncHandler(async (req, res) => {
    const user = await usersService.registerUser(req.body);
    res.status(201).json({ success: true, data: user });
})

export const getMe = asyncHandler(async (req, res) => {
    const user = await usersService.getUserById(req.user.id);
    res.status(200).json({ success: true, data: user });
})

export const getMyProfile = asyncHandler(async (req, res) => {
    const profile = await usersService.getUserProfile(req.user.id);
    res.status(200).json({ success: true, data: profile });
})

export const updateMe = asyncHandler(async (req, res) => {
    const user = await usersService.updateUser(req.user.id, req.body);
    res.status(200).json({ success: true, data: user });
})

export const changeMyPassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    await usersService.changePassword(req.user.id, currentPassword, newPassword);
    res.status(200).json({ success: true, message: "Password updated successfully" });
})

export const deactivateMe = asyncHandler(async (req, res) => {
    await usersService.deactivateUser(req.user.id);
    res.status(200).json({ success: true, message: "Account deactivated" });
})



export const getUserById = asyncHandler(async (req, res) => {
    const user = await usersService.getUserById(req.params.id);
    res.status(200).json({ success: true, data: user });
})

export const listUsers = asyncHandler(async (req, res) => {
    const { page, pageSize, isActive, createdAfter } = req.query;

    const filters = {
        isActive: isActive !== undefined ? isActive === "true" : undefined,
        createdAfter: createdAfter ? new Date(createdAfter) : undefined,
    };

    const result = await usersService.listUsers(filters, { page, pageSize });
    res.status(200).json({ success: true, ...result });
})

export const searchUsers = asyncHandler(async (req, res) => {
    const { q, page, pageSize } = req.query;
    const result = await usersService.searchUsers(q, { page, pageSize });
    res.status(200).json({ success: true, ...result });
})

export const deactivateUserById = asyncHandler(async (req, res) => {
    const user = await usersService.deactivateUser(req.params.id);
    res.status(200).json({ success: true, data: user });
})

export const reactivateUserById = asyncHandler(async (req, res) => {
    const user = await usersService.reactivateUser(req.params.id);
    res.status(200).json({ success: true, data: user });
})
export const updateUserRole = asyncHandler(async (req, res) => {
    const user = await usersService.updateUserRole(req.user.id, req.params.id, req.body.role);
    res.status(200).json({ success: true, data: user });
})