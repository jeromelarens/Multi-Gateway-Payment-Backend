import { Prisma } from "@prisma/client";
import ledgerRepository from "../repositories/ledger.repository.js";
import logger from "../config/logger.js";
import env from "../config/env.js";

/**
 * Immutable Transaction Ledger Service
 *
 * Implements double-entry-style financial accounting principles.
 * Every financial movement generates an immutable journal entry.
 */
class LedgerService {
  /**
   * Record credit entry for a successful payment
   */
  async recordPaymentCredit({ payment, externalEventId = null, description = null, metadata = {}, tx = null }) {
    if (!env.ledgerEnabled) return null;

    const idempotencyRef = `${payment.gateway}:${externalEventId || payment.gatewayPaymentId || payment.id}:PAYMENT`;

    // Check existing entry to guarantee idempotency
    const existing = await ledgerRepository.findByIdempotencyRef(idempotencyRef, tx);
    if (existing) {
      logger.info({
        event: "LEDGER_ENTRY_ALREADY_EXISTS",
        idempotencyRef,
        ledgerId: existing.id,
      });
      return existing;
    }

    const entry = await ledgerRepository.create(
      {
        userId: payment.userId,
        orderId: payment.orderId,
        paymentId: payment.id,
        refundId: null,
        type: "PAYMENT",
        direction: "CREDIT",
        amount: new Prisma.Decimal(payment.amount),
        currency: payment.currency || "INR",
        gateway: payment.gateway,
        idempotencyRef,
        externalReference: externalEventId || payment.gatewayPaymentId,
        description: description || `Payment received for order ${payment.order?.orderNumber || payment.orderId}`,
        metadata: {
          ...metadata,
          gatewayOrderId: payment.gatewayOrderId,
          gatewayPaymentId: payment.gatewayPaymentId,
        },
      },
      tx
    );

    logger.info({
      event: "LEDGER_CREDIT_RECORDED",
      ledgerId: entry.id,
      paymentId: payment.id,
      amount: Number(payment.amount),
      idempotencyRef,
    });

    return entry;
  }

  /**
   * Record debit entry for a processed refund
   */
  async recordRefundDebit({ payment, refund, externalEventId = null, description = null, metadata = {}, isPartial = false, tx = null }) {
    if (!env.ledgerEnabled) return null;

    const refundIdentifier = refund.id || refund.refundNumber || refund.stripeRefundId;
    const idempotencyRef = `${payment.gateway}:${refundIdentifier}:REFUND`;

    const existing = await ledgerRepository.findByIdempotencyRef(idempotencyRef, tx);
    if (existing) {
      return existing;
    }

    const entryType = isPartial ? "PARTIAL_REFUND" : "REFUND";

    const entry = await ledgerRepository.create(
      {
        userId: payment.userId,
        orderId: payment.orderId,
        paymentId: payment.id,
        refundId: refund.id,
        type: entryType,
        direction: "DEBIT",
        amount: new Prisma.Decimal(refund.amount),
        currency: payment.currency || "INR",
        gateway: payment.gateway,
        idempotencyRef,
        externalReference: externalEventId || refund.stripeRefundId || refund.refundNumber,
        description: description || `Refund processed for payment ${payment.id}`,
        metadata: {
          ...metadata,
          reason: refund.reason,
          refundNumber: refund.refundNumber,
        },
      },
      tx
    );

    logger.info({
      event: "LEDGER_DEBIT_RECORDED",
      ledgerId: entry.id,
      paymentId: payment.id,
      refundId: refund.id,
      amount: Number(refund.amount),
      type: entryType,
    });

    return entry;
  }

  /**
   * Record manual adjustment entry
   */
  async recordAdjustment({ userId, paymentId = null, orderId = null, amount, direction, gateway, reason, metadata = {}, tx = null }) {
    if (!env.ledgerEnabled) return null;

    const idempotencyRef = `ADJUSTMENT:${paymentId || userId}:${Date.now()}`;

    return ledgerRepository.create(
      {
        userId,
        orderId,
        paymentId,
        type: "ADJUSTMENT",
        direction,
        amount: new Prisma.Decimal(amount),
        currency: "INR",
        gateway,
        idempotencyRef,
        description: `Manual financial adjustment: ${reason}`,
        metadata,
      },
      tx
    );
  }

  /**
   * Calculate settled balance and remaining refundable amount for a payment
   */
  async getPaymentBalance(paymentId, tx = null) {
    const entries = await ledgerRepository.findByPaymentId(paymentId, tx);

    let credits = new Prisma.Decimal(0);
    let debits = new Prisma.Decimal(0);

    for (const entry of entries) {
      if (entry.direction === "CREDIT") {
        credits = credits.plus(new Prisma.Decimal(entry.amount));
      } else if (entry.direction === "DEBIT") {
        debits = debits.plus(new Prisma.Decimal(entry.amount));
      }
    }

    const netSettled = credits.minus(debits);

    return {
      paymentId,
      totalCredits: credits.toNumber(),
      totalDebits: debits.toNumber(),
      netSettled: netSettled.toNumber(),
      remainingRefundable: netSettled.toNumber(),
      entries,
    };
  }
}

export default new LedgerService();
