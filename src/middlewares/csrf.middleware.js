import { ForbiddenError } from '../utils/errors.js';

export const verifyCsrfToken = (req, res, next) => {
  const cookieToken = req.cookies?.csrfToken;
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return next(new ForbiddenError('Invalid or missing CSRF token'));
  }

  next();
};
