-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('STRIPE', 'CASHFREE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "password" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "gateway" "PaymentGateway" NOT NULL DEFAULT 'STRIPE',
ADD COLUMN "gatewayOrderId" TEXT,
ADD COLUMN "gatewayPaymentId" TEXT,
ADD COLUMN "metadata" JSONB,
ALTER COLUMN "paymentIntentId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "resourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_gateway_idx" ON "Payment"("gateway");
CREATE INDEX "Payment_gatewayOrderId_idx" ON "Payment"("gatewayOrderId");
CREATE INDEX "Payment_gatewayPaymentId_idx" ON "Payment"("gatewayPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_userId_key_key" ON "IdempotencyKey"("userId", "key");
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");
CREATE INDEX "IdempotencyKey_userId_key_idx" ON "IdempotencyKey"("userId", "key");

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
