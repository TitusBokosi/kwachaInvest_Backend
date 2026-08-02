import jwt from "jsonwebtoken"
import { env } from "../config/env.js"
import { ACCESS_TOKEN_EXPIRY } from "./constants.js"

export const signAccessToken = (payload) => {
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export const verifyAccessToken = (token) => {
    return jwt.verify(token, env.JWT_SECRET);
}
