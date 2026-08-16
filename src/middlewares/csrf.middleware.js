import { ForbiddenError } from '../utils/errors.js';

export const verifyCsrfToken = (req, res, next) => {
  const cookieToken = req.cookies?.csrfToken;
  const headerToken = req.headers['x-csrf-token'];

  console.log('\n========== CSRF DEBUG ==========');
  console.log('Request:', req.method, req.originalUrl);
  console.log('Cookies:', req.cookies);
  console.log('CSRF cookie:', cookieToken);
  console.log('CSRF header:', headerToken);
  console.log('Cookie exists:', Boolean(cookieToken));
  console.log('Header exists:', Boolean(headerToken));
  console.log('Tokens match:', cookieToken === headerToken);
  console.log('================================\n');

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    console.log('❌ CSRF VALIDATION FAILED');

    return next(new ForbiddenError('Invalid or missing CSRF token'));
  }

  console.log('✅ CSRF VALIDATION PASSED');

  next();
};
