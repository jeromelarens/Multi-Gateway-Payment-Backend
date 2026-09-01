import { createQueue, QUEUE_NAMES } from "./queue.config.js";
import logger from "../config/logger.js";

const reconciliationQueue = createQueue(QUEUE_NAMES.RECONCILIATION, {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 10000,
  },
});

/**
 * Enqueue a reconciliation job
 */
export async function addReconciliationJob({ gateway, lookbackDays = 1, trigger = "MANUAL" }) {
  const jobId = `recon:${gateway || "ALL"}:${Date.now()}`;

  if (!reconciliationQueue) {
    logger.warn({
      event: "RECONCILIATION_QUEUE_UNAVAILABLE",
      jobId,
      gateway,
    });
    return null;
  }

  try {
    const job = await reconciliationQueue.add(
      "run-reconciliation",
      {
        gateway,
        lookbackDays,
        trigger,
      },
      {
        jobId,
      }
    );

    logger.info({
      event: "RECONCILIATION_JOB_QUEUED",
      jobId: job.id,
      gateway,
    });

    return job;
  } catch (error) {
    logger.error({
      event: "RECONCILIATION_QUEUE_ADD_FAILED",
      jobId,
      error: error.message,
    });
    return null;
  }
}

export default reconciliationQueue;
