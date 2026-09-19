import jwt from "jsonwebtoken"
import { env } from "../config/env.js"
import { ACCESS_TOKEN_EXPIRY } from "./constants.js"

export const signAccessToken = (payload) => {
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export const verifyAccessToken = (token) => {
    return jwt.verify(token, env.JWT_SECRET);
}

// This token can only authorize a password reset. It is deliberately separate
// from the application's access and refresh tokens.
export const signPasswordResetToken = ({ userId, otpId }) => {
    return jwt.sign(
        { sub: userId, otpId, purpose: 'PASSWORD_RESET' },
        env.JWT_SECRET,
        { expiresIn: `${env.RESET_TOKEN_TTL_MINUTES}m` },
    );
}

export const verifyPasswordResetToken = (token) => {
    return jwt.verify(token, env.JWT_SECRET);
}
