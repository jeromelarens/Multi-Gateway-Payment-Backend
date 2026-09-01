/*
  Warnings:

  - The values [SUCCESS] on the enum `RefundStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `refundId` on the `Refund` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[refundNumber]` on the table `Refund` will be added. If there are existing duplicate values, this will fail.
  - Made the column `stripeRefundId` on table `Refund` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."RefundStatus_new" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED');
ALTER TABLE "public"."Refund" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."Refund" ALTER COLUMN "status" TYPE "public"."RefundStatus_new" USING ("status"::text::"public"."RefundStatus_new");
ALTER TYPE "public"."RefundStatus" RENAME TO "RefundStatus_old";
ALTER TYPE "public"."RefundStatus_new" RENAME TO "RefundStatus";
DROP TYPE "public"."RefundStatus_old";
ALTER TABLE "public"."Refund" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- DropIndex
DROP INDEX "public"."Refund_refundId_key";

-- AlterTable
ALTER TABLE "public"."Refund" DROP COLUMN "refundId",
ADD COLUMN     "refundNumber" TEXT,
ALTER COLUMN "stripeRefundId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Refund_refundNumber_key" ON "public"."Refund"("refundNumber");
