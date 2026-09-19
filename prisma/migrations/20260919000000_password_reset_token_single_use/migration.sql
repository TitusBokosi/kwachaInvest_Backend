-- Records redemption of the short-lived password-reset JWT associated with an
-- already-verified OTP. This prevents reset-token replay before JWT expiry.
ALTER TABLE "otp_codes" ADD COLUMN "resetTokenUsedAt" TIMESTAMP(3);
