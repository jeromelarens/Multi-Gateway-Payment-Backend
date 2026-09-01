import { createQueue, QUEUE_NAMES } from "./queue.config.js";
import logger from "../config/logger.js";

const paymentQueue = createQueue(QUEUE_NAMES.PAYMENT, {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5000,
  },
});

export async function addPaymentJob({ action, paymentId, data = {} }) {
  const jobId = `payment:${action}:${paymentId}`;

  if (!paymentQueue) {
    logger.warn({
      event: "PAYMENT_QUEUE_UNAVAILABLE",
      jobId,
      action,
    });
    return null;
  }

  try {
    const job = await paymentQueue.add(
      action,
      {
        action,
        paymentId,
        data,
      },
      {
        jobId,
      }
    );

    return job;
  } catch (error) {
    logger.error({
      event: "PAYMENT_QUEUE_ADD_FAILED",
      jobId,
      error: error.message,
    });
    return null;
  }
}

export default paymentQueue;
