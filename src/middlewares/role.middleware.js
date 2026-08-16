import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

export const authorize =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError('You do not have permission to perform this action'),
      );
    }

    next();
  };
