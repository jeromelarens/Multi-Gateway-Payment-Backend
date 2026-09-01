# Queue Architecture & Worker Lifecycles

## Overview

The queue system is built on **BullMQ** with **Redis** as the message broker. Each critical asynchronous workflow operates within its own dedicated queue.

---

## Queue Configuration

All queues inherit shared defaults from `src/queues/queue.config.js`:
* **Prefix**: Configurable via `env.queuePrefix` (default `payment_queue`).
* **Connection**: Managed Redis client with automatic retry strategy and `maxRetriesPerRequest: null`.
* **Clean-up**: Completed jobs auto-removed after 1,000 counts; failed jobs retained up to 5,000 counts for observability.

---

## Dedicated Queues

### 1. `webhook-queue`
* **File**: `src/queues/webhook.queue.js`
* **Job**: `process-webhook`
* **Payload**: `{ webhookEventId, gateway, eventId, eventType }`
* **Retries**: 5 attempts with exponential backoff (initial delay: 5,000ms).

### 2. `notification-queue`
* **File**: `src/queues/notification.queue.js`
* **Job**: `PAYMENT_SUCCESS`, `REFUND_PROCESSED`
* **Payload**: `{ type, recipient, data }`
* **Retries**: 5 attempts with exponential backoff (initial delay: 3,000ms).
* **Deduplication**: `jobId: notif:${type}:${idempotencyKey}`.

### 3. `invoice-queue`
* **File**: `src/queues/invoice.queue.js`
* **Job**: `generate-invoice`
* **Payload**: `{ orderId, paymentId }`
* **Retries**: 3 attempts with exponential backoff (initial delay: 5,000ms).
* **Deduplication**: `jobId: invoice:order:${orderId}`.

### 4. `reconciliation-queue`
* **File**: `src/queues/reconciliation.queue.js`
* **Job**: `run-reconciliation`
* **Payload**: `{ gateway, lookbackDays, trigger }`
* **Concurrency**: 1 (prevents overlapping concurrent reconciliation jobs on the same gateway).

---

## Worker Lifecycle & Graceful Shutdown

Workers are managed centrally in `src/workers/index.js`:
* `startAllWorkers()`: Instantiates worker listeners upon application bootstrap.
* `closeAllWorkers()`: Closes active queue listeners, allowing in-flight jobs to finish processing before process termination (`SIGINT`/`SIGTERM`).
