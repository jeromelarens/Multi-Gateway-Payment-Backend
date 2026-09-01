import { createQueue, QUEUE_NAMES } from "./queue.config.js";
import env from "../config/env.js";
import logger from "../config/logger.js";

const invoiceQueue = createQueue(QUEUE_NAMES.INVOICE, {
  attempts: env.invoiceMaxAttempts,
  backoff: {
    type: "exponential",
    delay: 5000,
  },
});

/**
 * Enqueue an asynchronous invoice generation job
 */
export async function addInvoiceJob({ orderId, paymentId }) {
  const jobId = `invoice:order:${orderId}`;

  if (!invoiceQueue) {
    logger.warn({
      event: "INVOICE_QUEUE_UNAVAILABLE",
      jobId,
      orderId,
    });
    return null;
  }

  try {
    const job = await invoiceQueue.add(
      "generate-invoice",
      {
        orderId,
        paymentId,
      },
      {
        jobId,
      }
    );

    logger.info({
      event: "INVOICE_JOB_QUEUED",
      jobId: job.id,
      orderId,
    });

    return job;
  } catch (error) {
    logger.error({
      event: "INVOICE_QUEUE_ADD_FAILED",
      jobId,
      error: error.message,
    });
    return null;
  }
}

export default invoiceQueue;
