import { Worker } from "bullmq";
import { getRedisClient } from "../config/redis.js";
import { QUEUE_NAMES } from "../queues/queue.config.js";
import prisma from "../config/prisma.js";
import logger from "../config/logger.js";
import env from "../config/env.js";
import paymentStateMachine from "../services/paymentStateMachine.js";
import ledgerService from "../services/ledger.service.js";
import { addNotificationJob } from "../queues/notification.queue.js";
import { addInvoiceJob } from "../queues/invoice.queue.js";

/**
 * Webhook Background Worker
 *
 * Pulls jobs from BullMQ, loads authoritative state from PostgreSQL,
 * executes payment state transitions, updates immutable ledger, and triggers downstream jobs.
 */
export async function processWebhookJob(job) {
  const { webhookEventId, gateway, eventId, eventType } = job.data;

  logger.info({
    event: "WEBHOOK_WORKER_STARTED",
    jobId: job.id,
    webhookEventId,
    gateway,
    eventId,
    attempt: job.attemptsMade + 1,
  });

  const webhookRecord = await prisma.webhookEvent.findUnique({
    where: { id: webhookEventId },
  });

  if (!webhookRecord) {
    logger.warn({
      event: "WEBHOOK_EVENT_RECORD_NOT_FOUND",
      webhookEventId,
    });
    return { success: false, reason: "NOT_FOUND" };
  }

  if (webhookRecord.status === "PROCESSED") {
    logger.info({
      event: "WEBHOOK_ALREADY_PROCESSED",
      webhookEventId,
    });
    return { success: true, reason: "ALREADY_PROCESSED" };
  }

  // Update status to PROCESSING
  await prisma.webhookEvent.update({
    where: { id: webhookEventId },
    data: {
      status: "PROCESSING",
      attempts: { increment: 1 },
      lastAttemptAt: new Date(),
    },
  });

  try {
    const payload = webhookRecord.payload;
    let payment = null;

    if (gateway === "STRIPE") {
      const dataObject = payload?.data?.object || payload;

      if (eventType === "payment_intent.succeeded") {
        const paymentIntentId = dataObject.id;
        payment = await prisma.payment.findUnique({
          where: { paymentIntentId },
          include: { order: true, user: true },
        });

        if (payment) {
          // Execute payment state transition
          await paymentStateMachine.transition(payment.id, "SUCCESS", {
            reason: `Stripe webhook confirmation (${eventId})`,
          });

          // Record immutable ledger entry
          await ledgerService.recordPaymentCredit({
            payment,
            externalEventId: eventId,
            description: `Payment succeeded via Stripe (${paymentIntentId})`,
          });

          // Enqueue downstream async operations
          await addInvoiceJob({ orderId: payment.orderId, paymentId: payment.id });
          await addNotificationJob({
            type: "PAYMENT_SUCCESS",
            recipient: payment.user?.email,
            data: {
              paymentId: payment.id,
              orderNumber: payment.order?.orderNumber,
              amount: Number(payment.amount),
              currency: payment.currency,
            },
            idempotencyKey: payment.id,
          });
        }
      } else if (eventType === "payment_intent.payment_failed") {
        const paymentIntentId = dataObject.id;
        payment = await prisma.payment.findUnique({
          where: { paymentIntentId },
        });

        if (payment) {
          await paymentStateMachine.transition(payment.id, "FAILED", {
            reason: "Stripe webhook failure notice",
            failureReason: dataObject.last_payment_error?.message || "Payment failed",
          });
        }
      }
    } else if (gateway === "CASHFREE") {
      const orderId = payload?.data?.order?.order_id || payload?.order_id;
      const paymentStatus = payload?.data?.payment?.payment_status || payload?.payment_status;

      payment = await prisma.payment.findFirst({
        where: {
          OR: [
            { gatewayOrderId: String(orderId) },
            { order: { orderNumber: String(orderId) } },
          ],
        },
        include: { order: true, user: true },
      });

      if (payment) {
        if (paymentStatus === "SUCCESS") {
          await paymentStateMachine.transition(payment.id, "SUCCESS", {
            reason: `Cashfree webhook confirmation (${eventId})`,
          });

          await ledgerService.recordPaymentCredit({
            payment,
            externalEventId: eventId,
            description: `Payment succeeded via Cashfree (${orderId})`,
          });

          await addInvoiceJob({ orderId: payment.orderId, paymentId: payment.id });
          await addNotificationJob({
            type: "PAYMENT_SUCCESS",
            recipient: payment.user?.email,
            data: {
              paymentId: payment.id,
              orderNumber: payment.order?.orderNumber,
              amount: Number(payment.amount),
              currency: payment.currency,
            },
            idempotencyKey: payment.id,
          });
        } else if (paymentStatus === "FAILED" || paymentStatus === "USER_DROPPED") {
          await paymentStateMachine.transition(payment.id, "FAILED", {
            reason: `Cashfree webhook failure notice: ${paymentStatus}`,
          });
        }
      }
    }

    // Mark event PROCESSED
    await prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: {
        status: "PROCESSED",
        processed: true,
        processedAt: new Date(),
        errorMessage: null,
      },
    });

    logger.info({
      event: "WEBHOOK_WORKER_COMPLETED",
      webhookEventId,
      gateway,
      eventId,
    });

    return { success: true, webhookEventId };
  } catch (error) {
    const currentAttempts = (job.attemptsMade || 0) + 1;
    const isMaxAttempts = currentAttempts >= env.webhookMaxAttempts;

    const nextRetryDelay = Math.min(env.webhookBackoffMs * Math.pow(2, currentAttempts - 1), 1800000);
    const nextRetryAt = isMaxAttempts ? null : new Date(Date.now() + nextRetryDelay);

    logger.error({
      event: isMaxAttempts ? "WEBHOOK_MOVED_TO_DEAD_LETTER" : "WEBHOOK_PROCESSING_FAILED_WILL_RETRY",
      webhookEventId,
      currentAttempts,
      maxAttempts: env.webhookMaxAttempts,
      error: error.message,
      nextRetryAt,
    });

    await prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: {
        status: isMaxAttempts ? "DEAD_LETTER" : "RETRYING",
        failedAt: isMaxAttempts ? new Date() : null,
        nextRetryAt,
        errorMessage: error.message,
      },
    });

    // Re-throw to inform BullMQ
    throw error;
  }
}

let webhookWorker = null;

export function initWebhookWorker() {
  if (process.env.NODE_ENV === "test") return null;
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    webhookWorker = new Worker(
      QUEUE_NAMES.WEBHOOK,
      async (job) => processWebhookJob(job),
      {
        connection: redis,
        concurrency: 5,
        prefix: env.queuePrefix,
      }
    );

    webhookWorker.on("completed", (job) => {
      logger.info({ event: "BULLMQ_JOB_COMPLETED", queue: QUEUE_NAMES.WEBHOOK, jobId: job.id });
    });

    webhookWorker.on("failed", (job, err) => {
      logger.error({ event: "BULLMQ_JOB_FAILED", queue: QUEUE_NAMES.WEBHOOK, jobId: job?.id, error: err.message });
    });

    return webhookWorker;
  } catch (err) {
    logger.warn({ event: "WEBHOOK_WORKER_INIT_SKIPPED", error: err.message });
    return null;
  }
}

export async function closeWebhookWorker() {
  if (webhookWorker) {
    await webhookWorker.close();
    webhookWorker = null;
  }
}

export default { initWebhookWorker, closeWebhookWorker, processWebhookJob };
