import { createQueue, QUEUE_NAMES } from "./queue.config.js";
import env from "../config/env.js";
import logger from "../config/logger.js";

const notificationQueue = createQueue(QUEUE_NAMES.NOTIFICATION, {
  attempts: env.emailMaxAttempts,
  backoff: {
    type: "exponential",
    delay: 3000,
  },
});

/**
 * Enqueue an asynchronous notification job with idempotent job ID
 */
export async function addNotificationJob({ type, recipient, data, idempotencyKey }) {
  const jobId = `notif:${type}:${idempotencyKey || Date.now()}`;

  if (!notificationQueue) {
    logger.warn({
      event: "NOTIFICATION_QUEUE_UNAVAILABLE",
      jobId,
      recipient,
    });
    return null;
  }

  try {
    const job = await notificationQueue.add(
      type,
      {
        type,
        recipient,
        data,
      },
      {
        jobId,
      }
    );

    logger.info({
      event: "NOTIFICATION_JOB_QUEUED",
      jobId: job.id,
      type,
    });

    return job;
  } catch (error) {
    logger.error({
      event: "NOTIFICATION_QUEUE_ADD_FAILED",
      jobId,
      error: error.message,
    });
    return null;
  }
}

export default notificationQueue;
