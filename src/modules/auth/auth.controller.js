import * as authService from "./auth.service.js"
import { asyncHandler } from "../../utils/asyncHandler.js"

const getDeviceContext = (req) => ({
    deviceInfo: req.headers["user-agent"],
    ipAddress: req.ip,
});

export const login = asyncHandler(async (req, res) => {
    const { identifier, password } = req.body;
    const result = await authService.login({ identifier, password, ...getDeviceContext(req) });
    res.status(200).json({ success: true, data: result });
})

export const refresh = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const result = await authService.refreshAccessToken({ refreshToken, ...getDeviceContext(req) });
    res.status(200).json({ success: true, data: result });
})

export const logout = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);
    res.status(200).json({ success: true, message: "Logged out successfully" });
})

export const logoutAllDevices = asyncHandler(async (req, res) => {
    await authService.logoutAllDevices(req.user.id);
    res.status(200).json({ success: true, message: "Logged out of all devices" });
})

export const listSessions = asyncHandler(async (req, res) => {
    const sessions = await authService.listActiveSessions(req.user.id);
    res.status(200).json({ success: true, data: sessions });
})

export const forgotPassword = asyncHandler(async (req, res) => {
    const result = await authService.forgotPassword(req.body.identifier);
    res.status(200).json({ success: true, ...result });
})

export const resetPassword = asyncHandler(async (req, res) => {
    const result = await authService.resetPassword(req.body);
    res.status(200).json({ success: true, ...result });
})