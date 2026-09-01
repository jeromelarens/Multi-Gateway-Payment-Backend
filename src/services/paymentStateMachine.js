import ApiError from "../utils/ApiError.js";
import logger from "../config/logger.js";
import prisma from "../config/prisma.js";

/**
 * Explicit Payment State Machine
 *
 * Enforces valid lifecycle transitions and eliminates illegal status modifications.
 */
export const ALLOWED_TRANSITIONS = {
  PENDING: ["SUCCESS", "FAILED"],
  SUCCESS: ["PARTIALLY_REFUNDED", "REFUNDED"],
  PARTIALLY_REFUNDED: ["PARTIALLY_REFUNDED", "REFUNDED"],
  FAILED: [],     // Terminal state
  REFUNDED: [],   // Terminal state
};

class PaymentStateMachine {
  /**
   * Check if a state transition is permissible
   */
  canTransition(currentStatus, targetStatus) {
    if (!currentStatus || !targetStatus) return false;
    if (currentStatus === targetStatus) return true; // Idempotent no-op

    const allowed = ALLOWED_TRANSITIONS[currentStatus];
    return Array.isArray(allowed) && allowed.includes(targetStatus);
  }

  /**
   * Validate transition or throw standardized ApiError
   */
  validateTransition(currentStatus, targetStatus) {
    if (!this.canTransition(currentStatus, targetStatus)) {
      throw ApiError.badRequest(
        `Illegal payment state transition from '${currentStatus}' to '${targetStatus}'.`,
        [],
        "INVALID_STATE_TRANSITION"
      );
    }
  }

  /**
   * Execute state transition on a payment and sync order status
   *
   * @param {string} paymentId
   * @param {string} targetStatus
   * @param {Object} options - { reason, tx, failureReason }
   */
  async transition(paymentId, targetStatus, options = {}) {
    const { reason, tx = null, failureReason = null } = options;
    const db = tx || prisma;

    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });

    if (!payment) {
      throw ApiError.notFound("Payment not found for state transition.", [], "RESOURCE_NOT_FOUND");
    }

    if (payment.status === targetStatus) {
      // Idempotent transition: already in target state
      return payment;
    }

    this.validateTransition(payment.status, targetStatus);

    const updateData = {
      status: targetStatus,
    };

    if (failureReason) {
      updateData.failureReason = failureReason;
    }

    const updatedPayment = await db.payment.update({
      where: { id: paymentId },
      data: updateData,
    });

    // Synchronize order status
    if (payment.orderId) {
      let targetOrderStatus = null;
      if (targetStatus === "SUCCESS") targetOrderStatus = "PAID";
      else if (targetStatus === "FAILED") targetOrderStatus = "FAILED";
      else if (targetStatus === "REFUNDED") targetOrderStatus = "CANCELLED";

      if (targetOrderStatus) {
        await db.order.update({
          where: { id: payment.orderId },
          data: { status: targetOrderStatus },
        });
      }
    }

    logger.info({
      event: "PAYMENT_STATE_TRANSITION",
      paymentId,
      from: payment.status,
      to: targetStatus,
      reason,
    });

    return updatedPayment;
  }
}

export default new PaymentStateMachine();
