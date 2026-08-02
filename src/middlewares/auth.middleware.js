import jwt from "jsonwebtoken";
import { UnauthorizedError } from "../utils/errors.js";

/**
 * Verifies the Bearer token and attaches { id, role } to req.user.
 *
 * This assumes the auth module's login endpoint signs tokens with a payload
 * shaped like { sub: userId, role: "USER" | "ADMIN" } — keep that contract
 * in sync when you build the auth module, or this will silently attach
 * req.user.role = undefined and every authorize() check will fail closed.
 */
export const authenticate = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            throw new UnauthorizedError("Authentication token is missing");
        }

        const token = authHeader.slice("Bearer ".length).trim();

        let payload;
        try {
            payload = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            if (err.name === "TokenExpiredError") {
                throw new UnauthorizedError("Session expired, please log in again");
            }
            throw new UnauthorizedError("Invalid authentication token");
        }

        if (!payload.sub) {
            throw new UnauthorizedError("Invalid authentication token");
        }

        req.user = {
            id: payload.sub,
            role: payload.role,
        };

        next();
    } catch (err) {
        next(err);
    }
}
