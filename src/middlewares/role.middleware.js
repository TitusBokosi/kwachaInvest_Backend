import { ForbiddenError, UnauthorizedError } from "../utils/errors.js";

/**
 * Must run after `authenticate`. Usage: authorize("ADMIN") or
 * authorize("ADMIN", "SUPPORT") for multiple allowed roles.
 */
export const authorize = (...allowedRoles) => (req, res, next) => {
    if (!req.user) {
        return next(new UnauthorizedError("Authentication required"));
    }

    if (!allowedRoles.includes(req.user.role)) {
        return next(new ForbiddenError("You do not have permission to perform this action"));
    }

    next();
}
