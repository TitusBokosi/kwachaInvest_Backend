-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MobileMoneyProvider" AS ENUM ('AIRTEL', 'TNM');

-- CreateEnum
CREATE TYPE "SavingsType" AS ENUM ('TIME_BASED', 'TARGET_BASED');

-- CreateEnum
CREATE TYPE "SavingsStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED', 'PAUSED');

-- CreateEnum
CREATE TYPE "WithdrawalPolicy" AS ENUM ('LOCKED', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_verifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idType" TEXT NOT NULL,
    "idNumber" TEXT NOT NULL,
    "status" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobile_money_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "MobileMoneyProvider" NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobile_money_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SavingsType" NOT NULL,
    "status" "SavingsStatus" NOT NULL DEFAULT 'ACTIVE',
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "withdrawalPolicy" "WithdrawalPolicy" NOT NULL,
    "penaltyPercentage" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "maturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "savings_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_based_savings" (
    "id" TEXT NOT NULL,
    "savingsAccountId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maturityDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_based_savings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "target_based_savings" (
    "id" TEXT NOT NULL,
    "savingsAccountId" TEXT NOT NULL,
    "target" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "target_based_savings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "savingsAccountId" TEXT NOT NULL,
    "mobileMoneyAccountId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "providerReference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_gateway_transactions" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "provider" "MobileMoneyProvider" NOT NULL,
    "gatewayReference" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "responsePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_gateway_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "paymentGatewayTransactionId" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phoneNumber_key" ON "users"("phoneNumber");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_phoneNumber_idx" ON "users"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "kyc_verifications_userId_key" ON "kyc_verifications"("userId");

-- CreateIndex
CREATE INDEX "mobile_money_accounts_userId_idx" ON "mobile_money_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "mobile_money_accounts_provider_phoneNumber_key" ON "mobile_money_accounts"("provider", "phoneNumber");

-- CreateIndex
CREATE INDEX "savings_accounts_userId_idx" ON "savings_accounts"("userId");

-- CreateIndex
CREATE INDEX "savings_accounts_status_idx" ON "savings_accounts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "time_based_savings_savingsAccountId_key" ON "time_based_savings"("savingsAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "target_based_savings_savingsAccountId_key" ON "target_based_savings"("savingsAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_providerReference_key" ON "transactions"("providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_idempotencyKey_key" ON "transactions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "transactions_savingsAccountId_idx" ON "transactions"("savingsAccountId");

-- CreateIndex
CREATE INDEX "transactions_mobileMoneyAccountId_idx" ON "transactions"("mobileMoneyAccountId");

-- CreateIndex
CREATE INDEX "transactions_status_idx" ON "transactions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_gateway_transactions_transactionId_key" ON "payment_gateway_transactions"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_providerEventId_key" ON "webhook_events"("providerEventId");

-- CreateIndex
CREATE INDEX "webhook_events_status_idx" ON "webhook_events"("status");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "kyc_verifications" ADD CONSTRAINT "kyc_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_money_accounts" ADD CONSTRAINT "mobile_money_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_accounts" ADD CONSTRAINT "savings_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_based_savings" ADD CONSTRAINT "time_based_savings_savingsAccountId_fkey" FOREIGN KEY ("savingsAccountId") REFERENCES "savings_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_based_savings" ADD CONSTRAINT "target_based_savings_savingsAccountId_fkey" FOREIGN KEY ("savingsAccountId") REFERENCES "savings_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_savingsAccountId_fkey" FOREIGN KEY ("savingsAccountId") REFERENCES "savings_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_mobileMoneyAccountId_fkey" FOREIGN KEY ("mobileMoneyAccountId") REFERENCES "mobile_money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_gateway_transactions" ADD CONSTRAINT "payment_gateway_transactions_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_paymentGatewayTransactionId_fkey" FOREIGN KEY ("paymentGatewayTransactionId") REFERENCES "payment_gateway_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
