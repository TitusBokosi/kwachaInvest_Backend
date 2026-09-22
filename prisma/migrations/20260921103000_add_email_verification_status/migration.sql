-- New registrations require an email-verification OTP before authentication.
-- Existing accounts are retained as verified because there is no historical
-- verification record or OTP available for them to complete this flow.
ALTER TABLE "users"
ADD COLUMN "isEmailVerified" BOOLEAN NOT NULL DEFAULT false;

UPDATE "users"
SET "isEmailVerified" = true;
