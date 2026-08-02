import rateLimit from "express-rate-limit"

const jsonMessage = (message) => ({ success: false, message });

export const generalRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: jsonMessage("Too many requests. Please try again later."),
});

/**
 * For login specifically. skipSuccessfulRequests means only FAILED attempts
 * count toward the cap — a legitimate user logging in repeatedly (e.g.
 * across devices) never gets blocked, only repeated wrong-password attempts do.
 */
export const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: jsonMessage("Too many login attempts. Please try again later."),
});

/**
 * For forgot-password / reset-password / anything that sends or checks an
 * OTP. Tighter window — these are both a brute-force target (guessing a
 * 6-digit code) and an abuse target (spamming someone's inbox).
 */
export const otpRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: jsonMessage("Too many attempts. Please try again in a while."),
});

/** For registration — slows down bulk fake-account creation. */
export const registerRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: jsonMessage("Too many accounts created from this location. Please try again later."),
});
