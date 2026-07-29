import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import crypto from "crypto"
import * as authRepository from "./auth.repository.js"
import * as usersRepository from "../users/user.repository.js"
import { UnauthorizedError, ForbiddenError, ValidationError } from "../../utils/errors.js"

const SALT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY ?? "15m";
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30);
const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES ?? 10);
const OTP_MAX_ATTEMPTS = 5;


const isEmail = (identifier) => identifier.includes("@");


const resolveUserByIdentifier = async (identifier, { forAuth = false } = {}) => {
    if (isEmail(identifier)) {
        return forAuth
            ? usersRepository.getUserByEmailForAuth(identifier)
            : usersRepository.getUserByEmail(identifier);
    }
    return forAuth
        ? usersRepository.getUserByPhoneNumberForAuth(identifier)
        : usersRepository.getUserByPhoneNumber(identifier);
}

const generateAccessToken = (user) => {
    return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
        expiresIn: ACCESS_TOKEN_EXPIRY,
    });
}

const generateRefreshToken = () => crypto.randomBytes(40).toString("hex");

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const generateOtp = () => crypto.randomInt(100000, 1000000).toString();


const sendOtpSms = async (phoneNumber, otp) => {
    console.log(`[DEV ONLY — no SMS provider wired up] OTP for ${phoneNumber}: ${otp}`);
}

const issueSession = async (user, { deviceInfo, ipAddress } = {}) => {
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await authRepository.createSession({
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        deviceInfo,
        ipAddress,
        expiresAt,
    });

    return { accessToken, refreshToken };
}



export const login = async ({ identifier, password, deviceInfo, ipAddress }) => {
    const user = await resolveUserByIdentifier(identifier, { forAuth: true });


    if (!user) throw new UnauthorizedError("Invalid email/phone or password");

    if (!user.isActive) {
        throw new ForbiddenError("This account has been deactivated");
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) throw new UnauthorizedError("Invalid email/phone or password");

    const { accessToken, refreshToken } = await issueSession(user, { deviceInfo, ipAddress });
    const { passwordHash, ...safeUser } = user;

    return { accessToken, refreshToken, user: safeUser };
}

export const refreshAccessToken = async ({ refreshToken, deviceInfo, ipAddress }) => {
    if (!refreshToken) throw new ValidationError("Refresh token is required");

    const tokenHash = hashToken(refreshToken);
    const session = await authRepository.getSessionByTokenHash(tokenHash);

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
        throw new UnauthorizedError("Session is invalid or has expired, please log in again");
    }

    const user = await usersRepository.getUserByIdForAuth(session.userId);
    if (!user || !user.isActive) {
        throw new UnauthorizedError("Account is no longer active");
    }

    // Rotate: the old refresh token is single-use. This limits the damage
    // if a refresh token is ever stolen — it only works once.
    await authRepository.revokeSession(session.id);

    return issueSession(user, { deviceInfo, ipAddress });
}

export const logout = async (refreshToken) => {
    if (!refreshToken) throw new ValidationError("Refresh token is required");
    // Idempotent on purpose — logging out twice, or with an already-expired
    // token, should not be treated as an error from the caller's side.
    await authRepository.revokeSessionByTokenHash(hashToken(refreshToken));
}

export const logoutAllDevices = async (userId) => {
    await authRepository.revokeAllSessionsForUser(userId);
}

export const listActiveSessions = async (userId) => {
    return authRepository.getActiveSessionsByUser(userId);
}



export const forgotPassword = async (identifier) => {
    const user = await resolveUserByIdentifier(identifier);

    // Always return the same response whether or not the account exists —
    // otherwise this endpoint becomes a way to enumerate registered users.
    if (user) {
        await authRepository.invalidateActiveOtpCodes(user.id, "PASSWORD_RESET");

        const otp = generateOtp();
        const codeHash = await bcrypt.hash(otp, SALT_ROUNDS);
        const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

        await authRepository.createOtpCode({
            userId: user.id,
            codeHash,
            purpose: "PASSWORD_RESET",
            expiresAt,
        });

        await sendOtpSms(user.phoneNumber, otp);
    }

    return { message: "If an account exists, a reset code has been sent." };
}

export const resetPassword = async ({ identifier, otp, newPassword }) => {
    const user = await resolveUserByIdentifier(identifier);

    const genericError = () => new ValidationError("Invalid or expired code");

    if (!user) throw genericError();

    const otpRecord = await authRepository.getActiveOtpCode(user.id, "PASSWORD_RESET");
    if (!otpRecord) throw genericError();

    if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
        throw new ValidationError("Too many incorrect attempts. Please request a new code.");
    }

    const otpMatches = await bcrypt.compare(otp, otpRecord.codeHash);
    if (!otpMatches) {
        await authRepository.incrementOtpAttempts(otpRecord.id);
        throw genericError();
    }

    await authRepository.consumeOtpCode(otpRecord.id);

    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await usersRepository.updatePasswordHash(user.id, newPasswordHash);

   
    await authRepository.revokeAllSessionsForUser(user.id);

    return { message: "Password reset successful. Please log in again." };
}