import { OAuth2Client } from 'google-auth-library';

import { env } from '../config/env.js';
import { ValidationError } from './errors.js';

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

export async function verifyGoogleIdToken(idToken) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  if (!payload?.sub || !payload?.email) {
    throw new ValidationError('Invalid Google sign-in token');
  }

  const firstName = payload.given_name?.trim() || 'Google';
  const lastName = payload.family_name?.trim() || 'User';

  return {
    googleId: payload.sub,
    email: payload.email.trim().toLowerCase(),
    emailVerified: payload.email_verified === true,
    firstName,
    lastName,
    fullName: payload.name?.trim() || `${firstName} ${lastName}`.trim(),
  };
}
