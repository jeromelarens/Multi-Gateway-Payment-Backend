/*
  Warnings:

  - You are about to alter the column `amount` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to drop the column `transactionId` on the `Payment` table. All the data in the column will be lost.
  - You are about to alter the column `amount` on the `Payment` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `amount` on the `Refund` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - A unique constraint covering the columns `[stripeRefundId]` on the table `Refund` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Invoice" ADD COLUMN     "issuedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."Order" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "public"."Payment" DROP COLUMN "transactionId",
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "gatewayTransactionId" TEXT,
ADD COLUMN     "paymentMethodId" TEXT,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "public"."Refund" ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "stripeRefundId" TEXT,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "public"."WebhookEvent" ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Refund_stripeRefundId_key" ON "public"."Refund"("stripeRefundId");
