-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'RETRYING', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('PAYMENT', 'REFUND', 'PARTIAL_REFUND', 'ADJUSTMENT', 'FEE');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('MATCHED', 'MISMATCH', 'RESOLVED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "ReconciliationDifferenceType" AS ENUM ('STATUS_MISMATCH', 'AMOUNT_MISMATCH', 'MISSING_INTERNAL_PAYMENT', 'MISSING_GATEWAY_PAYMENT', 'CURRENCY_MISMATCH', 'UNKNOWN');

-- AlterTable WebhookEvent
DROP INDEX IF EXISTS "WebhookEvent_eventId_key";

ALTER TABLE "WebhookEvent" ADD COLUMN "gateway" "PaymentGateway" NOT NULL DEFAULT 'STRIPE',
ADD COLUMN "status" "WebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN "nextRetryAt" TIMESTAMP(3),
ADD COLUMN "failedAt" TIMESTAMP(3),
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "WebhookEvent_gateway_eventId_key" ON "WebhookEvent"("gateway", "eventId");
CREATE INDEX "WebhookEvent_gateway_eventId_idx" ON "WebhookEvent"("gateway", "eventId");
CREATE INDEX "WebhookEvent_status_idx" ON "WebhookEvent"("status");
CREATE INDEX "WebhookEvent_nextRetryAt_idx" ON "WebhookEvent"("nextRetryAt");
CREATE INDEX "WebhookEvent_createdAt_idx" ON "WebhookEvent"("createdAt");

-- CreateTable TransactionLedger
CREATE TABLE "TransactionLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "paymentId" TEXT,
    "refundId" TEXT,
    "type" "LedgerEntryType" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "gateway" "PaymentGateway" NOT NULL,
    "idempotencyRef" TEXT NOT NULL,
    "externalReference" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransactionLedger_idempotencyRef_key" ON "TransactionLedger"("idempotencyRef");
CREATE INDEX "TransactionLedger_userId_idx" ON "TransactionLedger"("userId");
CREATE INDEX "TransactionLedger_paymentId_idx" ON "TransactionLedger"("paymentId");
CREATE INDEX "TransactionLedger_orderId_idx" ON "TransactionLedger"("orderId");
CREATE INDEX "TransactionLedger_type_idx" ON "TransactionLedger"("type");
CREATE INDEX "TransactionLedger_gateway_idx" ON "TransactionLedger"("gateway");
CREATE INDEX "TransactionLedger_createdAt_idx" ON "TransactionLedger"("createdAt");

ALTER TABLE "TransactionLedger" ADD CONSTRAINT "TransactionLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransactionLedger" ADD CONSTRAINT "TransactionLedger_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable ReconciliationRecord
CREATE TABLE "ReconciliationRecord" (
    "id" TEXT NOT NULL,
    "gateway" "PaymentGateway" NOT NULL,
    "paymentId" TEXT,
    "gatewayReference" TEXT,
    "internalStatus" TEXT,
    "gatewayStatus" TEXT,
    "internalAmount" DECIMAL(12,2),
    "gatewayAmount" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "differenceType" "ReconciliationDifferenceType" NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'MISMATCH',
    "resolution" TEXT,
    "resolvedBy" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ReconciliationRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReconciliationRecord_gateway_idx" ON "ReconciliationRecord"("gateway");
CREATE INDEX "ReconciliationRecord_status_idx" ON "ReconciliationRecord"("status");
CREATE INDEX "ReconciliationRecord_differenceType_idx" ON "ReconciliationRecord"("differenceType");
CREATE INDEX "ReconciliationRecord_createdAt_idx" ON "ReconciliationRecord"("createdAt");
CREATE INDEX "ReconciliationRecord_paymentId_idx" ON "ReconciliationRecord"("paymentId");

ALTER TABLE "ReconciliationRecord" ADD CONSTRAINT "ReconciliationRecord_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable AuditLog
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "requestId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
