import { Queue } from "bullmq";
import { getRedisClient } from "../config/redis.js";
import env from "../config/env.js";
import logger from "../config/logger.js";

export const QUEUE_NAMES = {
  WEBHOOK: "webhook-queue",
  PAYMENT: "payment-queue",
  NOTIFICATION: "notification-queue",
  INVOICE: "invoice-queue",
  RECONCILIATION: "reconciliation-queue",
};

export const defaultQueueOptions = {
  prefix: env.queuePrefix,
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
};

/**
 * Safe factory to create a queue with test-mode in-memory stub and production fallback
 */
export function createQueue(queueName, jobOptions = {}) {
  // In test environment, return an isolated in-memory queue to prevent open sockets
  if (process.env.NODE_ENV === "test") {
    const jobs = [];
    return {
      name: queueName,
      add: async (name, data, opts = {}) => {
        const job = {
          id: opts.jobId || `job_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name,
          data,
          opts,
          attemptsMade: 0,
        };
        jobs.push(job);
        return job;
      },
      getJobs: async () => jobs,
      close: async () => {},
      on: () => {},
    };
  }

  try {
    const queue = new Queue(queueName, {
      connection: getRedisClient(),
      ...defaultQueueOptions,
      defaultJobOptions: {
        ...defaultQueueOptions.defaultJobOptions,
        ...jobOptions,
      },
    });

    queue.on("error", (err) => {
      logger.warn({ event: "QUEUE_ERROR", queue: queueName, message: err.message });
    });

    return queue;
  } catch (error) {
    logger.warn({ event: "QUEUE_INIT_SKIPPED", queue: queueName, message: error.message });
    return null;
  }
}
