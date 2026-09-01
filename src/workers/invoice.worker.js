import { Worker } from "bullmq";
import { getRedisClient } from "../config/redis.js";
import { QUEUE_NAMES } from "../queues/queue.config.js";
import invoiceService from "../services/invoice.service.js";
import prisma from "../config/prisma.js";
import logger from "../config/logger.js";
import env from "../config/env.js";

export async function processInvoiceJob(job) {
  const { orderId, paymentId } = job.data;

  logger.info({
    event: "INVOICE_WORKER_STARTED",
    jobId: job.id,
    orderId,
  });

  try {
    const existingInvoice = await prisma.invoice.findUnique({
      where: { orderId },
    });

    if (existingInvoice) {
      logger.info({ event: "INVOICE_ALREADY_EXISTS", orderId });
      return { success: true, invoiceId: existingInvoice.id };
    }

    const invoice = await invoiceService.createInvoice({ orderId });

    logger.info({
      event: "INVOICE_WORKER_COMPLETED",
      jobId: job.id,
      invoiceId: invoice?.id,
      orderId,
    });

    return { success: true, invoiceId: invoice?.id };
  } catch (error) {
    logger.error({
      event: "INVOICE_WORKER_FAILED",
      jobId: job.id,
      orderId,
      error: error.message,
    });
    throw error;
  }
}

let invoiceWorker = null;

export function initInvoiceWorker() {
  if (process.env.NODE_ENV === "test") return null;
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    invoiceWorker = new Worker(
      QUEUE_NAMES.INVOICE,
      async (job) => processInvoiceJob(job),
      {
        connection: redis,
        concurrency: 3,
        prefix: env.queuePrefix,
      }
    );

    return invoiceWorker;
  } catch (err) {
    logger.warn({ event: "INVOICE_WORKER_INIT_SKIPPED", error: err.message });
    return null;
  }
}

export async function closeInvoiceWorker() {
  if (invoiceWorker) {
    await invoiceWorker.close();
    invoiceWorker = null;
  }
}

export default { initInvoiceWorker, closeInvoiceWorker, processInvoiceJob };
