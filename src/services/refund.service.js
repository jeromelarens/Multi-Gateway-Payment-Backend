import crypto from "crypto";
import { Prisma } from "@prisma/client";

import logger from "../config/logger.js";
import ApiError from "../utils/ApiError.js";

import refundRepository from "../repositories/refund.repository.js";
import paymentRepository from "../repositories/payment.repository.js";

import stripeRefund from "../integrations/stripe/refund.js";
import stripePaymentIntent from "../integrations/stripe/paymentIntent.js";
import paymentStateMachine from "./paymentStateMachine.js";
import ledgerService from "./ledger.service.js";

class RefundService {
  /*
  |--------------------------------------------------------------------------
  | Stripe Refund Reason Validation
  |--------------------------------------------------------------------------
  */
  _validStripeReasons = new Set([
    "duplicate",
    "fraudulent",
    "requested_by_customer",
  ]);

  /*
  |--------------------------------------------------------------------------
  | Map Stripe Status to RefundStatus Enum
  |--------------------------------------------------------------------------
  */
  _mapStripeStatus(stripeStatus) {
    const mapping = {
      pending: "PENDING",
      succeeded: "SUCCEEDED",
      failed: "FAILED",
      canceled: "CANCELED",
    };

    return mapping[stripeStatus?.toLowerCase()] ?? "PENDING";
  }

  /*
  |--------------------------------------------------------------------------
  | Generate Refund Number
  |--------------------------------------------------------------------------
  */
  _generateRefundNumber() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const timestamp = String(now.getHours()).padStart(2, "0") +
                      String(now.getMinutes()).padStart(2, "0") +
                      String(now.getSeconds()).padStart(2, "0");
    const random = String(crypto.randomInt(100000, 999999)).padStart(6, "0");

    return `REF-${year}${month}${day}-${timestamp}-${random}`;
  }

  /*
  |--------------------------------------------------------------------------
  | Calculate Total Refunded Amount (SUCCEEDED only)
  |--------------------------------------------------------------------------
  */
  async _getTotalRefundedAmount(paymentId) {
    const existingRefunds = await refundRepository.findPaymentRefunds(paymentId);

    if (!existingRefunds || existingRefunds.length === 0) {
      return new Prisma.Decimal(0);
    }

    return existingRefunds
      .filter((refund) => refund.status === "SUCCEEDED")
      .reduce(
        (total, refund) => total.plus(new Prisma.Decimal(refund.amount)),
        new Prisma.Decimal(0)
      );
  }

  /*
  |--------------------------------------------------------------------------
  | Create Refund
  |--------------------------------------------------------------------------
  */
  async createRefund(data, authenticatedUserId = null, userRole = "USER") {
    const {
      paymentId,
      amount,
      reason = null,
      idempotencyKey = null,
    } = data;

    /*
    |--------------------------------------------------------------------------
    | Validate Payment Exists
    |--------------------------------------------------------------------------
    */

    const payment = await paymentRepository.findById(paymentId);

    if (!payment) {
      throw new ApiError(404, "Payment not found.");
    }

    // Ownership check: non-admins can only refund their own payments
    if (authenticatedUserId && userRole !== "ADMIN" && payment.userId !== authenticatedUserId) {
      throw ApiError.forbidden(
        "Access denied. You do not have permission to refund this payment.",
        [],
        "AUTHORIZATION_ERROR"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Validate Payment Status
    |--------------------------------------------------------------------------
    */

    if (payment.status !== "SUCCESS" && payment.status !== "PARTIALLY_REFUNDED") {
      throw new ApiError(
        400,
        `Payment must be in SUCCESS or PARTIALLY_REFUNDED status to process a refund. Current status: ${payment.status}`
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Validate Payment Has Stripe PaymentIntent
    |--------------------------------------------------------------------------
    */

    if (!payment.paymentIntentId) {
      throw new ApiError(400, "Payment does not have a Stripe PaymentIntent.");
    }

    /*
    |--------------------------------------------------------------------------
    | Validate Stripe Refund Reason
    |--------------------------------------------------------------------------
    */

    let validatedReason = null;

    if (reason) {
      const normalizedReason = reason.trim().toLowerCase();

      if (!this._validStripeReasons.has(normalizedReason)) {
        throw new ApiError(
          400,
          `Invalid refund reason. Allowed values: ${Array.from(this._validStripeReasons).join(", ")}`
        );
      }

      validatedReason = normalizedReason;
    }

    /*
    |--------------------------------------------------------------------------
    | Validate Refund Amount + Check Cumulative Refunds
    |--------------------------------------------------------------------------
    */

    const paymentAmount = new Prisma.Decimal(payment.amount);
    const totalRefunded = await this._getTotalRefundedAmount(paymentId);
    const remainingAmount = paymentAmount.minus(totalRefunded);

    if (remainingAmount.lessThanOrEqualTo(0)) {
      throw new ApiError(409, "Payment has already been fully refunded.");
    }

    let refundAmount = null;

    if (amount !== undefined && amount !== null) {
      refundAmount = new Prisma.Decimal(amount);

      if (refundAmount.lessThanOrEqualTo(0)) {
        throw new ApiError(400, "Refund amount must be greater than zero.");
      }

      if (refundAmount.greaterThan(remainingAmount)) {
        throw new ApiError(
          400,
          `Refund amount cannot exceed remaining amount of ${remainingAmount}.`
        );
      }
    } else {
      refundAmount = remainingAmount;
    }

    /*
    |--------------------------------------------------------------------------
    | Retrieve PaymentIntent from Stripe
    |--------------------------------------------------------------------------
    */

    let stripePaymentIntentData = null;

    try {
      stripePaymentIntentData = await stripePaymentIntent.retrieve(
        payment.paymentIntentId
      );
    } catch (stripeError) {
      logger.error({
        event: "REFUND_STRIPE_RETRIEVE_FAILED",
        paymentIntentId: payment.paymentIntentId,
        error: stripeError.stack || stripeError.message,
      });

      throw new ApiError(500, "Unable to retrieve payment from Stripe.");
    }

    if (stripePaymentIntentData.status !== "succeeded") {
      throw new ApiError(
        400,
        `Stripe payment not succeeded. Current status: ${stripePaymentIntentData.status}`
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Create Stripe Refund (ONCE ONLY — no retry)
    |--------------------------------------------------------------------------
    */

    // ✅ FIX 2: Deterministic idempotency key — no Date.now()
    const stableIdempotencyKey =
      idempotencyKey ??
      `${payment.paymentIntentId}-${refundAmount.toString()}-${validatedReason || "default"}`;

    let stripeRefundData = null;
    let refundNumber = this._generateRefundNumber();

    try {
      const stripeRefundPayload = {
        paymentIntent: payment.paymentIntentId,
        metadata: {
          refundNumber,
          paymentId: payment.id,
        },
      };

      if (!refundAmount.equals(paymentAmount)) {
        stripeRefundPayload.amount = refundAmount
          .times(100)
          .toDecimalPlaces(0)
          .toNumber();
      }

      if (validatedReason) {
        stripeRefundPayload.reason = validatedReason;
      }

      const stripeOptions = {
        idempotencyKey: stableIdempotencyKey,
      };

      stripeRefundData = await stripeRefund.create(
        stripeRefundPayload,
        stripeOptions
      );

      logger.info({
        event: "STRIPE_REFUND_CREATED",
        stripeRefundId: stripeRefundData.id,
        refundNumber,
        paymentIntentId: payment.paymentIntentId,
        amount: refundAmount.toString(),
        stripeStatus: stripeRefundData.status,
        idempotencyKey: stableIdempotencyKey,
      });
    } catch (stripeError) {
      logger.error({
        event: "STRIPE_REFUND_CREATE_FAILED",
        paymentIntentId: payment.paymentIntentId,
        error: stripeError.stack || stripeError.message,
        idempotencyKey: stableIdempotencyKey,
      });

      throw new ApiError(500, "Unable to create refund with Stripe.");
    }

    /*
    |--------------------------------------------------------------------------
    | Save Refund in Database (retry ONLY on refundNumber collision)
    |--------------------------------------------------------------------------
    */

    let refund = null;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        refund = await refundRepository.create({
          refundNumber,
          stripeRefundId: stripeRefundData.id,
          amount: refundAmount,
          reason: validatedReason,
          status: this._mapStripeStatus(stripeRefundData.status),
          paymentId: payment.id,
        });

        logger.info({
          event: "REFUND_CREATED",
          refundId: refund.id,
          refundNumber,
          stripeRefundId: stripeRefundData.id,
          paymentId: payment.id,
          status: refund.status,
        });

        break;

      } catch (dbError) {
        // Retry on unique constraint error (refundNumber collision)
        if (
          dbError.code === "P2002" &&
          dbError.meta?.target?.includes("refundNumber")
        ) {
          retryCount++;

          logger.warn({
            event: "REFUND_NUMBER_COLLISION",
            refundNumber,
            retryCount,
            maxRetries,
          });

          if (retryCount >= maxRetries) {
            logger.error({
              event: "REFUND_NUMBER_COLLISION_MAX_RETRIES",
              refundNumber,
              error: dbError.message,
            });

            throw new ApiError(
              500,
              "Unable to generate unique refund number after maximum retries."
            );
          }

          // ✅ FIX: Generate NEW refund number for DB retry only
          // ⚠️ Note: Stripe metadata still has old refundNumber — acceptable for debugging
          refundNumber = this._generateRefundNumber();
          continue;
        }

        // Non-unique error — log manual recovery
        logger.error({
          event: "REFUND_SYNC_REQUIRED",
          stripeRefundId: stripeRefundData.id,
          refundNumber,
          paymentId: payment.id,
          amount: refundAmount.toString(),
          error: dbError.stack || dbError.message,
        });

        throw new ApiError(
          500,
          "Refund created with Stripe but database save failed. Manual reconciliation required."
        );
      }
    }

    if (refund && refund.status === "SUCCEEDED") {
      const newTotalRefunded = totalRefunded.plus(refundAmount);
      const isFull = newTotalRefunded.greaterThanOrEqualTo(paymentAmount);

      await paymentStateMachine.transition(payment.id, isFull ? "REFUNDED" : "PARTIALLY_REFUNDED", {
        reason: isFull ? "Full refund processed" : "Partial refund processed",
      });

      await ledgerService.recordRefundDebit({
        payment,
        refund,
        isPartial: !isFull,
        description: `${isFull ? "Full" : "Partial"} refund of ₹${refundAmount.toString()}`,
      });
    }

    return {
      success: true,
      message: "Refund created successfully.",
      refund,
      status: refund.status,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Get Refund
  |--------------------------------------------------------------------------
  */
  async getRefund(refundId, authenticatedUserId = null, userRole = "USER") {
    const refund = await refundRepository.findById(refundId);

    if (!refund) {
      throw new ApiError(404, "Refund not found.");
    }

    // Ownership check: non-admins can only view their own refunds
    if (authenticatedUserId && userRole !== "ADMIN" && refund.payment?.userId !== authenticatedUserId) {
      throw ApiError.forbidden(
        "Access denied. You do not have permission to view this refund.",
        [],
        "AUTHORIZATION_ERROR"
      );
    }

    return refund;
  }

  /*
  |--------------------------------------------------------------------------
  | Get Payment Refunds
  |--------------------------------------------------------------------------
  */
  async getPaymentRefunds(paymentId, authenticatedUserId = null, userRole = "USER") {
    const payment = await paymentRepository.findById(paymentId);

    if (!payment) {
      throw new ApiError(404, "Payment not found.");
    }

    // Ownership check: non-admins can only view refunds of their own payments
    if (authenticatedUserId && userRole !== "ADMIN" && payment.userId !== authenticatedUserId) {
      throw ApiError.forbidden(
        "Access denied. You do not have permission to view refunds for this payment.",
        [],
        "AUTHORIZATION_ERROR"
      );
    }

    return refundRepository.findPaymentRefunds(paymentId);
  }

  /*
  |--------------------------------------------------------------------------
  | Get All Refunds
  |--------------------------------------------------------------------------
  */
  async getAllRefunds(authenticatedUserId = null, userRole = "USER") {
    if (userRole !== "ADMIN") {
      throw ApiError.forbidden(
        "Access denied. Only administrators can view all refunds.",
        [],
        "AUTHORIZATION_ERROR"
      );
    }
    return refundRepository.findAll();
  }
}

export default new RefundService();