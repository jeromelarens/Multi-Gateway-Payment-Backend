import { Prisma } from "@prisma/client";

import logger from "../config/logger.js";
import ApiError from "../utils/ApiError.js";

import paymentService from "./payment.service.js";
import paymentRepository from "../repositories/payment.repository.js";
import refundRepository from "../repositories/refund.repository.js";
import webhookRepository from "../repositories/webhook.repository.js";
import gatewayResolver from "../integrations/payment/gatewayResolver.js";
import stripeWebhook from "../integrations/stripe/webhook.js";
import { addWebhookJob } from "../queues/webhook.queue.js";

class WebhookService {
  /*
  |--------------------------------------------------------------------------
  | Gateway-Independent Webhook Entry Point (Fast HTTP ACK + Async Queue)
  |--------------------------------------------------------------------------
  */
  async handleGatewayWebhook(gatewayName, payload, headers) {
    const gatewayAdapter = gatewayResolver.resolve(gatewayName);
    const normalizedGateway = gatewayAdapter.name;
    const event = gatewayAdapter.verifyWebhook(payload, headers);

    const existingEvent = await webhookRepository.findByGatewayAndEventId(normalizedGateway, event.eventId);
    if (existingEvent) {
      logger.info({
        event: "WEBHOOK_DUPLICATE",
        gateway: normalizedGateway,
        eventId: event.eventId,
      });
      return { success: true, message: "Duplicate webhook event ignored." };
    }

    let webhookEventRecord = null;
    try {
      webhookEventRecord = await webhookRepository.create({
        gateway: normalizedGateway,
        eventId: event.eventId,
        eventType: event.eventType,
        payload: event.raw || event.data,
        status: "RECEIVED",
      });
    } catch (dbError) {
      if (dbError?.code === "P2002") {
        return { success: true, message: "Duplicate webhook event ignored." };
      }
      throw dbError;
    }

    logger.info({
      event: "WEBHOOK_STORED_FOR_QUEUE",
      webhookEventId: webhookEventRecord.id,
      gateway: normalizedGateway,
      eventId: event.eventId,
    });

    // Enqueue for asynchronous background processing
    await addWebhookJob({
      webhookEventId: webhookEventRecord.id,
      gateway: normalizedGateway,
      eventId: event.eventId,
      eventType: event.eventType,
    });

    return {
      success: true,
      message: "Webhook received and queued for asynchronous processing.",
      eventId: event.eventId,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Main Entry Point (Stripe) (Fast HTTP ACK + Async Queue)
  |--------------------------------------------------------------------------
  */

  async handleStripeWebhook(payload, signature) {
    let event = null;
    let webhookEventRecord = null;

    try {
      try {
        event = stripeWebhook.verify(payload, signature);
      } catch (verifyError) {
        logger.warn({
          event: "WEBHOOK_SIGNATURE_INVALID",
          error: verifyError.message,
        });

        throw new ApiError(400, "Invalid Stripe webhook signature.");
      }

      logger.info({
        event: "WEBHOOK_RECEIVED",
        stripeEventId: event.id,
        stripeEventType: event.type,
      });

      // Check Duplicate Event
      const existingEvent = await webhookRepository.findByGatewayAndEventId("STRIPE", event.id);

      if (existingEvent) {
        logger.warn({
          event: "WEBHOOK_DUPLICATE",
          stripeEventId: event.id,
          stripeEventType: event.type,
        });

        return {
          success: true,
          message: "Duplicate webhook event ignored.",
        };
      }

      // Store Webhook Event (status: RECEIVED) with concurrency lock
      try {
        webhookEventRecord = await webhookRepository.create({
          gateway: "STRIPE",
          eventId: event.id,
          eventType: event.type,
          payload: event,
          status: "RECEIVED",
        });
      } catch (dbError) {
        if (dbError?.code === "P2002") {
          return {
            success: true,
            message: "Duplicate webhook event ignored.",
          };
        }
        throw dbError;
      }

      logger.info({
        event: "WEBHOOK_STORED",
        webhookEventId: webhookEventRecord.id,
        stripeEventId: event.id,
        stripeEventType: event.type,
      });

      // Enqueue job for background processing
      await addWebhookJob({
        webhookEventId: webhookEventRecord.id,
        gateway: "STRIPE",
        eventId: event.id,
        eventType: event.type,
      });

      // Fast ACK to Stripe
      return {
        success: true,
        message: "Webhook received and queued for asynchronous processing.",
        eventId: event.id,
      };

    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error({
        event: "WEBHOOK_INGESTION_ERROR",
        error: error.message,
      });
      throw new ApiError(500, "Webhook ingestion failed.");
    }
  }

  /*
  |--------------------------------------------------------------------------
  | payment_intent.succeeded
  |--------------------------------------------------------------------------
  */

  async handlePaymentIntentSucceeded(paymentIntent) {
    const paymentIntentId = paymentIntent.id;
    const stripeChargeId = paymentIntent.latest_charge || null;
    const gatewayTransactionId = paymentIntent.id;
    const paymentMethodId = paymentIntent.payment_method || null;

    logger.info({
      event: "PAYMENT_INTENT_SUCCEEDED_RECEIVED",
      paymentIntentId,
      stripeChargeId,
      paymentMethodId,
    });

    const payment = await paymentRepository.findByPaymentIntent(paymentIntentId);

    if (!payment) {
      logger.warn({
        event: "PAYMENT_INTENT_SUCCEEDED_NO_RECORD",
        paymentIntentId,
        message: "Payment record not found in database.",
      });
      return;
    }

    // Prevent duplicate processing if payment already succeeded
    if (payment.status === "SUCCESS") {
      logger.info({
        event: "PAYMENT_ALREADY_CONFIRMED",
        paymentIntentId,
        paymentId: payment.id,
      });
      return;
    }

    await paymentService.confirmPayment(
      paymentIntentId,
      stripeChargeId,
      gatewayTransactionId,
      paymentMethodId
    );

    logger.info({
      event: "PAYMENT_INTENT_SUCCEEDED_HANDLED",
      paymentIntentId,
      orderId: payment.orderId,
    });
  }

  /*
  |--------------------------------------------------------------------------
  | payment_intent.payment_failed
  |--------------------------------------------------------------------------
  */

  async handlePaymentIntentPaymentFailed(paymentIntent) {
    const paymentIntentId = paymentIntent.id;
    const failureReason =
      paymentIntent.last_payment_error?.message || "Unknown payment failure";

    logger.info({
      event: "PAYMENT_INTENT_FAILED_RECEIVED",
      paymentIntentId,
      failureReason,
    });

    const payment = await paymentRepository.findByPaymentIntent(paymentIntentId);

    if (!payment) {
      logger.warn({
        event: "PAYMENT_INTENT_FAILED_NO_RECORD",
        paymentIntentId,
        message: "Payment record not found in database.",
      });
      return;
    }

    // Prevent duplicate processing if payment already failed
    if (payment.status === "FAILED") {
      logger.info({
        event: "PAYMENT_ALREADY_FAILED",
        paymentIntentId,
        paymentId: payment.id,
      });
      return;
    }

    await paymentService.markPaymentFailed(paymentIntentId, failureReason);

    logger.info({
      event: "PAYMENT_INTENT_FAILED_HANDLED",
      paymentIntentId,
      orderId: payment.orderId,
      failureReason,
    });
  }

  /*
  |--------------------------------------------------------------------------
  | payment_intent.canceled
  |--------------------------------------------------------------------------
  */

  async handlePaymentIntentCanceled(paymentIntent) {
    const paymentIntentId = paymentIntent.id;
    const cancellationReason =
      paymentIntent.cancellation_reason || "Payment canceled";

    logger.info({
      event: "PAYMENT_INTENT_CANCELED_RECEIVED",
      paymentIntentId,
      cancellationReason,
    });

    const payment = await paymentRepository.findByPaymentIntent(paymentIntentId);

    if (!payment) {
      logger.warn({
        event: "PAYMENT_INTENT_CANCELED_NO_RECORD",
        paymentIntentId,
        message: "Payment record not found in database.",
      });
      return;
    }

    // Prevent duplicate processing if payment already failed
    if (payment.status === "FAILED") {
      logger.info({
        event: "PAYMENT_ALREADY_FAILED",
        paymentIntentId,
        paymentId: payment.id,
        reason: "Canceled webhook — payment already failed",
      });
      return;
    }

    await paymentService.markPaymentFailed(paymentIntentId, cancellationReason);

    logger.info({
      event: "PAYMENT_INTENT_CANCELED_HANDLED",
      paymentIntentId,
      orderId: payment.orderId,
      cancellationReason,
    });
  }

  /*
  |--------------------------------------------------------------------------
  | charge.refunded
  |--------------------------------------------------------------------------
  */

  async handleChargeRefunded(charge) {
    const chargeId = charge.id;
    const paymentIntentId = charge.payment_intent || null;
    const refundAmount = charge.amount_refunded || 0;
    const currency = charge.currency || null;

    logger.info({
      event: "CHARGE_REFUNDED_RECEIVED",
      chargeId,
      paymentIntentId,
      refundAmount,
      currency,
    });

    if (!paymentIntentId) {
      logger.warn({
        event: "CHARGE_REFUNDED_NO_PAYMENT_INTENT",
        chargeId,
        message: "No payment_intent associated with this charge.",
      });
      return;
    }

    const payment = await paymentRepository.findByPaymentIntent(paymentIntentId);

    if (!payment) {
      logger.warn({
        event: "CHARGE_REFUNDED_NO_RECORD",
        chargeId,
        paymentIntentId,
        message: "Payment record not found in database.",
      });
      return;
    }

    // Payment status is updated by handleRefundUpdated() after verifying cumulative balance
    // to prevent partial refunds from prematurely marking payment as REFUNDED.

    logger.info({
      event: "CHARGE_REFUNDED_HANDLED",
      chargeId,
      paymentIntentId,
      orderId: payment.orderId,
      message: "Charge refund event received. Payment status update deferred to refund.updated handler.",
    });
  }

  /*
  |--------------------------------------------------------------------------
  | refund.updated
  |--------------------------------------------------------------------------
  */

  async handleRefundUpdated(refund) {
    const stripeRefundId = refund.id;
    const chargeId = refund.charge || null;
    const paymentIntentId = refund.payment_intent || null;
    const refundStatus = refund.status;
    const refundAmount = refund.amount || 0;

    logger.info({
      event: "REFUND_UPDATED_RECEIVED",
      stripeRefundId,
      chargeId,
      paymentIntentId,
      refundStatus,
      refundAmount,
    });

    if (!paymentIntentId) {
      logger.warn({
        event: "REFUND_UPDATED_NO_PAYMENT_INTENT",
        stripeRefundId,
        message: "No payment_intent associated with this refund.",
      });
      return;
    }

    const payment = await paymentRepository.findByPaymentIntent(paymentIntentId);

    if (!payment) {
      logger.warn({
        event: "REFUND_UPDATED_NO_RECORD",
        stripeRefundId,
        paymentIntentId,
        message: "Payment record not found in database.",
      });
      return;
    }

    // Find and update refund record by stripeRefundId
    const refundRecord = await refundRepository.findByStripeRefundId(stripeRefundId);

    if (refundRecord) {
      await refundRepository.update(refundRecord.id, {
        status: this._mapRefundStatus(refundStatus),
      });

      logger.info({
        event: "REFUND_STATUS_UPDATED",
        refundId: refundRecord.id,
        stripeRefundId,
        newStatus: refundStatus,
      });
    } else {
      logger.warn({
        event: "REFUND_UPDATED_NO_LOCAL_RECORD",
        stripeRefundId,
        message: "Refund record not found in database.",
      });
    }

    // Check if fully refunded, then update payment status
    const totalRefunded = await this._calculateTotalRefunded(payment.id);

    if (totalRefunded.greaterThanOrEqualTo(new Prisma.Decimal(payment.amount))) {
      await paymentRepository.update(payment.id, {
        status: "REFUNDED",
      });

      logger.info({
        event: "PAYMENT_FULLY_REFUNDED",
        paymentId: payment.id,
        paymentIntentId,
        totalRefunded: totalRefunded.toString(),
      });
    }

    logger.info({
      event: "REFUND_UPDATED_HANDLED",
      stripeRefundId,
      paymentIntentId,
      orderId: payment.orderId,
      refundStatus,
      message: "Refund update processed.",
    });
  }

  /*
  |--------------------------------------------------------------------------
  | Get All Webhook Events
  |--------------------------------------------------------------------------
  */

  async getWebhookEvents() {
    return webhookRepository.findAll();
  }

  /*
  |--------------------------------------------------------------------------
  | Get Webhook Event by ID
  |--------------------------------------------------------------------------
  */

  async getWebhookById(eventId) {
    const event = await webhookRepository.findById(eventId);

    if (!event) {
      throw new ApiError(404, "Webhook event not found.");
    }

    return event;
  }

  /*
  |--------------------------------------------------------------------------
  | Helper: Map Stripe Refund Status
  |--------------------------------------------------------------------------
  */
  _mapRefundStatus(stripeStatus) {
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
  | Helper: Calculate Total Refunded
  |--------------------------------------------------------------------------
  */
  async _calculateTotalRefunded(paymentId) {
    const refunds = await refundRepository.findPaymentRefunds(paymentId);

    if (!refunds || refunds.length === 0) {
      return new Prisma.Decimal(0);
    }

    // Only count SUCCEEDED refunds towards cumulative total
    return refunds
      .filter((refund) => refund.status === "SUCCEEDED")
      .reduce(
        (total, refund) => total.plus(new Prisma.Decimal(refund.amount)),
        new Prisma.Decimal(0)
      );
  }
}

export default new WebhookService();