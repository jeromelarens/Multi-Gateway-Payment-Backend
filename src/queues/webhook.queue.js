import { createQueue, QUEUE_NAMES } from "./queue.config.js";
import env from "../config/env.js";
import logger from "../config/logger.js";

const webhookQueue = createQueue(QUEUE_NAMES.WEBHOOK, {
  attempts: env.webhookMaxAttempts,
  backoff: {
    type: "exponential",
    delay: env.webhookBackoffMs,
  },
});

/**
 * Enqueue a webhook processing job with deterministic job ID
 */
export async function addWebhookJob({ webhookEventId, gateway, eventId, eventType }) {
  const jobId = `webhook:${gateway}:${eventId}`;

  if (!webhookQueue) {
    logger.warn({
      event: "WEBHOOK_QUEUE_UNAVAILABLE",
      jobId,
      message: "Webhook queued in DB but Redis queue unavailable.",
    });
    return null;
  }

  try {
    const job = await webhookQueue.add(
      "process-webhook",
      {
        webhookEventId,
        gateway,
        eventId,
        eventType,
      },
      {
        jobId,
      }
    );

    logger.info({
      event: "WEBHOOK_JOB_QUEUED",
      jobId: job.id,
      gateway,
      eventId,
    });

    return job;
  } catch (error) {
    logger.error({
      event: "WEBHOOK_QUEUE_ADD_FAILED",
      jobId,
      error: error.message,
    });
    return null;
  }
}

export default webhookQueue;
