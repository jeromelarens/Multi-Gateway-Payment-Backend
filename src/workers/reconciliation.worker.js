import { Worker } from "bullmq";
import { getRedisClient } from "../config/redis.js";
import { QUEUE_NAMES } from "../queues/queue.config.js";
import reconciliationService from "../services/reconciliation.service.js";
import logger from "../config/logger.js";
import env from "../config/env.js";

export async function processReconciliationJob(job) {
  const { gateway, lookbackDays = 1 } = job.data;

  logger.info({
    event: "RECONCILIATION_WORKER_STARTED",
    jobId: job.id,
    gateway,
  });

  try {
    const gatewaysToReconcile = gateway ? [gateway] : ["STRIPE", "CASHFREE"];
    const results = [];

    for (const gw of gatewaysToReconcile) {
      const result = await reconciliationService.runReconciliation({
        gateway: gw,
        lookbackDays,
      });
      results.push(result);
    }

    logger.info({
      event: "RECONCILIATION_WORKER_COMPLETED",
      jobId: job.id,
      results,
    });

    return { success: true, results };
  } catch (error) {
    logger.error({
      event: "RECONCILIATION_WORKER_FAILED",
      jobId: job.id,
      error: error.message,
    });
    throw error;
  }
}

let reconciliationWorker = null;

export function initReconciliationWorker() {
  if (process.env.NODE_ENV === "test") return null;
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    reconciliationWorker = new Worker(
      QUEUE_NAMES.RECONCILIATION,
      async (job) => processReconciliationJob(job),
      {
        connection: redis,
        concurrency: 1,
        prefix: env.queuePrefix,
      }
    );

    return reconciliationWorker;
  } catch (err) {
    logger.warn({ event: "RECONCILIATION_WORKER_INIT_SKIPPED", error: err.message });
    return null;
  }
}

export async function closeReconciliationWorker() {
  if (reconciliationWorker) {
    await reconciliationWorker.close();
    reconciliationWorker = null;
  }
}

export default { initReconciliationWorker, closeReconciliationWorker, processReconciliationJob };
