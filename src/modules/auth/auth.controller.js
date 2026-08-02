import * as authService from "./auth.service.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { sendSuccess } from "../../utils/response.js"

const getDeviceContext = (req) => ({
    deviceInfo: req.headers["user-agent"],
    ipAddress: req.ip,
});

export const login = asyncHandler(async (req, res) => {
    const { identifier, password } = req.body;
    const result = await authService.login({ identifier, password, ...getDeviceContext(req) });
    sendSuccess(res, { data: result });
})

export const refresh = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const result = await authService.refreshAccessToken({ refreshToken, ...getDeviceContext(req) });
    sendSuccess(res, { data: result });
})

export const logout = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);
    sendSuccess(res, { message: "Logged out successfully" });
})

export const logoutAllDevices = asyncHandler(async (req, res) => {
    await authService.logoutAllDevices(req.user.id);
    sendSuccess(res, { message: "Logged out of all devices" });
})

export const listSessions = asyncHandler(async (req, res) => {
    const sessions = await authService.listActiveSessions(req.user.id);
    sendSuccess(res, { data: sessions });
})

export const forgotPassword = asyncHandler(async (req, res) => {
    const result = await authService.forgotPassword(req.body.identifier);
    sendSuccess(res, result);
})

export const resetPassword = asyncHandler(async (req, res) => {
    const result = await authService.resetPassword(req.body);
    sendSuccess(res, result);
})
