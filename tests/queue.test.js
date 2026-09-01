import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { addWebhookJob } from "../src/queues/webhook.queue.js";
import { addNotificationJob } from "../src/queues/notification.queue.js";
import { addInvoiceJob } from "../src/queues/invoice.queue.js";
import { addReconciliationJob } from "../src/queues/reconciliation.queue.js";
import { processNotificationJob } from "../src/workers/notification.worker.js";
import { processInvoiceJob } from "../src/workers/invoice.worker.js";
import prisma from "../src/config/prisma.js";

describe("Queue & Worker Asynchronous Architecture Test Suite", () => {
  it("Queue Job Creation: registers typed jobs with deterministic job IDs", async () => {
    const webhookJob = await addWebhookJob({
      webhookEventId: "evt_rec_q1",
      gateway: "STRIPE",
      eventId: "evt_q1",
      eventType: "payment_intent.succeeded",
    });
    assert.ok(webhookJob);
    assert.equal(webhookJob.id, "webhook:STRIPE:evt_q1");

    const notifJob = await addNotificationJob({
      type: "PAYMENT_SUCCESS",
      recipient: "customer@example.com",
      data: { paymentId: "pay_q1" },
      idempotencyKey: "pay_q1",
    });
    assert.ok(notifJob);
    assert.equal(notifJob.id, "notif:PAYMENT_SUCCESS:pay_q1");

    const invoiceJob = await addInvoiceJob({
      orderId: "ord_q1",
      paymentId: "pay_q1",
    });
    assert.ok(invoiceJob);
    assert.equal(invoiceJob.id, "invoice:order:ord_q1");

    const reconJob = await addReconciliationJob({
      gateway: "STRIPE",
      lookbackDays: 2,
    });
    assert.ok(reconJob);
    assert.ok(reconJob.id.startsWith("recon:STRIPE:"));
  });

  it("Notification Worker: processes email job without throwing error", async () => {
    prisma.payment.findUnique = async () => ({
      id: "pay_notif_w1",
      user: { email: "user@example.com", fullName: "Test User" },
      order: { orderNumber: "ORD-N1" },
    });

    const job = {
      id: "job_notif_1",
      data: {
        type: "PAYMENT_SUCCESS",
        recipient: "user@example.com",
        data: { paymentId: "pay_notif_w1" },
      },
    };

    const result = await processNotificationJob(job);
    assert.equal(result.success, true);
  });

  it("Invoice Worker: skips duplicate invoice generation if invoice already exists", async () => {
    prisma.invoice.findUnique = async () => ({
      id: "inv_existing_1",
      orderId: "ord_inv_w1",
    });

    const job = {
      id: "job_inv_1",
      data: {
        orderId: "ord_inv_w1",
        paymentId: "pay_inv_w1",
      },
    };

    const result = await processInvoiceJob(job);
    assert.equal(result.success, true);
    assert.equal(result.invoiceId, "inv_existing_1");
  });
});
