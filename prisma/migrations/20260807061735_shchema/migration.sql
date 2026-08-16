/*
  Warnings:

  - You are about to drop the column `provider` on the `payment_gateway_transactions` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,provider,phoneNumber]` on the table `mobile_money_accounts` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `operatorRefId` to the `mobile_money_accounts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `mode` to the `payment_gateway_transactions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `payerPhoneNumber` to the `transactions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `provider` to the `transactions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('HOSTED_CHECKOUT', 'DIRECT_MOBILE_MONEY', 'DIRECT_BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('SENT', 'FAILED');

-- AlterEnum
ALTER TYPE "SavingsStatus" ADD VALUE 'FROZEN';

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_mobileMoneyAccountId_fkey";

-- DropIndex
DROP INDEX "mobile_money_accounts_provider_phoneNumber_key";

-- AlterTable
ALTER TABLE "mobile_money_accounts" ADD COLUMN     "operatorRefId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "payment_gateway_transactions" DROP COLUMN "provider",
ADD COLUMN     "mode" "PaymentMode" NOT NULL;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "payerPhoneNumber" TEXT NOT NULL,
ADD COLUMN     "penaltyAmount" DECIMAL(18,2),
ADD COLUMN     "provider" "MobileMoneyProvider" NOT NULL,
ALTER COLUMN "mobileMoneyAccountId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceInfo" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_tokenHash_key" ON "auth_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions"("userId");

-- CreateIndex
CREATE INDEX "otp_codes_userId_purpose_idx" ON "otp_codes"("userId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "mobile_money_accounts_userId_provider_phoneNumber_key" ON "mobile_money_accounts"("userId", "provider", "phoneNumber");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_mobileMoneyAccountId_fkey" FOREIGN KEY ("mobileMoneyAccountId") REFERENCES "mobile_money_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
