import { initWebhookWorker, closeWebhookWorker } from "./webhook.worker.js";
import { initNotificationWorker, closeNotificationWorker } from "./notification.worker.js";
import { initInvoiceWorker, closeInvoiceWorker } from "./invoice.worker.js";
import { initReconciliationWorker, closeReconciliationWorker } from "./reconciliation.worker.js";
import logger from "../config/logger.js";

let workersRunning = false;

export function startAllWorkers() {
  if (workersRunning) return;

  logger.info({ event: "STARTING_BACKGROUND_WORKERS" });

  initWebhookWorker();
  initNotificationWorker();
  initInvoiceWorker();
  initReconciliationWorker();

  workersRunning = true;
  logger.info({ event: "ALL_BACKGROUND_WORKERS_INITIALIZED" });
}

export async function closeAllWorkers() {
  if (!workersRunning) return;

  logger.info({ event: "STOPPING_BACKGROUND_WORKERS" });

  await Promise.allSettled([
    closeWebhookWorker(),
    closeNotificationWorker(),
    closeInvoiceWorker(),
    closeReconciliationWorker(),
  ]);

  workersRunning = false;
  logger.info({ event: "ALL_BACKGROUND_WORKERS_STOPPED" });
}

export default { startAllWorkers, closeAllWorkers };
