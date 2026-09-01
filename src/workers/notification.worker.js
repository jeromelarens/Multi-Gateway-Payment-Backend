import { Worker } from "bullmq";
import { getRedisClient } from "../config/redis.js";
import { QUEUE_NAMES } from "../queues/queue.config.js";
import notificationService from "../services/notification.service.js";
import prisma from "../config/prisma.js";
import logger from "../config/logger.js";
import env from "../config/env.js";

export async function processNotificationJob(job) {
  const { type, recipient, data } = job.data;

  logger.info({
    event: "NOTIFICATION_WORKER_STARTED",
    jobId: job.id,
    type,
    recipient,
  });

  try {
    if (type === "PAYMENT_SUCCESS" && data?.paymentId) {
      const payment = await prisma.payment.findUnique({
        where: { id: data.paymentId },
        include: { user: true, order: true },
      });

      if (payment && payment.user) {
        await notificationService.sendPaymentSuccess({
          user: payment.user,
          order: payment.order,
          payment,
        });
      }
    }

    logger.info({
      event: "NOTIFICATION_WORKER_COMPLETED",
      jobId: job.id,
      type,
    });

    return { success: true };
  } catch (error) {
    logger.error({
      event: "NOTIFICATION_WORKER_FAILED",
      jobId: job.id,
      error: error.message,
    });
    throw error;
  }
}

let notificationWorker = null;

export function initNotificationWorker() {
  if (process.env.NODE_ENV === "test") return null;
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    notificationWorker = new Worker(
      QUEUE_NAMES.NOTIFICATION,
      async (job) => processNotificationJob(job),
      {
        connection: redis,
        concurrency: 5,
        prefix: env.queuePrefix,
      }
    );

    return notificationWorker;
  } catch (err) {
    logger.warn({ event: "NOTIFICATION_WORKER_INIT_SKIPPED", error: err.message });
    return null;
  }
}

export async function closeNotificationWorker() {
  if (notificationWorker) {
    await notificationWorker.close();
    notificationWorker = null;
  }
}

export default { initNotificationWorker, closeNotificationWorker, processNotificationJob };
