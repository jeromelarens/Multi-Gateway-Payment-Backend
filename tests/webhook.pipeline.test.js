import "./setup.js";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

import webhookService from "../src/services/webhook.service.js";
import webhookRepository from "../src/repositories/webhook.repository.js";
import { processWebhookJob } from "../src/workers/webhook.worker.js";
import paymentStateMachine from "../src/services/paymentStateMachine.js";
import ledgerService from "../src/services/ledger.service.js";
import prisma from "../src/config/prisma.js";
import stripeWebhook from "../src/integrations/stripe/webhook.js";

describe("Webhook Reliability Pipeline & DLQ Test Suite", () => {
  const webhookStore = new Map();
  const paymentStore = new Map();

  beforeEach(() => {
    webhookStore.clear();
    paymentStore.clear();

    webhookRepository.findByGatewayAndEventId = async (gateway, eventId) => {
      return webhookStore.get(`${gateway}:${eventId}`) || null;
    };

    webhookRepository.create = async (data) => {
      const record = {
        id: `evt_rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        ...data,
        attempts: data.attempts || 0,
        status: data.status || "RECEIVED",
        processed: false,
        processedAt: null,
        errorMessage: null,
        createdAt: new Date(),
      };
      webhookStore.set(`${data.gateway}:${data.eventId}`, record);
      webhookStore.set(record.id, record);
      return record;
    };

    webhookRepository.update = async (id, data) => {
      const record = webhookStore.get(id);
      if (record) {
        Object.assign(record, data);
      }
      return record;
    };

    prisma.webhookEvent = {
      findUnique: async ({ where }) => webhookStore.get(where.id) || null,
      update: async ({ where, data }) => {
        const record = webhookStore.get(where.id);
        if (record) {
          if (data.attempts?.increment) {
            record.attempts = (record.attempts || 0) + data.attempts.increment;
          }
          Object.assign(record, data);
        }
        return record;
      },
    };

    prisma.payment = {
      findUnique: async ({ where }) => {
        if (where.paymentIntentId) {
          return paymentStore.get(where.paymentIntentId) || null;
        }
        if (where.id) {
          return Array.from(paymentStore.values()).find((p) => p.id === where.id) || null;
        }
        return null;
      },
      update: async ({ where, data }) => {
        const payment = Array.from(paymentStore.values()).find((p) => p.id === where.id);
        if (payment) {
          Object.assign(payment, data);
        }
        return payment;
      },
    };

    prisma.order = {
      update: async () => ({}),
    };
  });

  it("Fast ACK: verifies signature, persists RECEIVED event, and returns 200 immediately", async () => {
    // Mock Stripe signature verification
    stripeWebhook.verify = () => ({
      id: "evt_fast_ack_1",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_fast_ack_1" } },
    });

    const result = await webhookService.handleStripeWebhook("dummy_raw_body", "valid_sig");

    assert.equal(result.success, true);
    assert.equal(result.eventId, "evt_fast_ack_1");

    const saved = await webhookRepository.findByGatewayAndEventId("STRIPE", "evt_fast_ack_1");
    assert.ok(saved);
    assert.equal(saved.status, "RECEIVED");
    assert.equal(saved.attempts, 0);
  });

  it("Duplicate Webhook: ignores duplicate event without double processing", async () => {
    stripeWebhook.verify = () => ({
      id: "evt_duplicate_test",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_dup_1" } },
    });

    const first = await webhookService.handleStripeWebhook("dummy", "sig");
    assert.equal(first.success, true);

    const second = await webhookService.handleStripeWebhook("dummy", "sig");
    assert.equal(second.success, true);
    assert.equal(second.message, "Duplicate webhook event ignored.");
  });

  it("Worker Execution: transitions payment to SUCCESS and marks event PROCESSED", async () => {
    // Seed payment
    const payment = {
      id: "pay_worker_1",
      orderId: "ord_worker_1",
      userId: "usr_worker_1",
      paymentIntentId: "pi_worker_1",
      status: "PENDING",
      amount: new Prisma.Decimal("2500.00"),
      currency: "INR",
      gateway: "STRIPE",
      order: { orderNumber: "ORD-W1" },
      user: { email: "customer@example.com" },
    };
    paymentStore.set(payment.paymentIntentId, payment);

    // Save webhook event in RECEIVED status
    const eventRecord = await webhookRepository.create({
      gateway: "STRIPE",
      eventId: "evt_worker_success",
      eventType: "payment_intent.succeeded",
      payload: { data: { object: { id: "pi_worker_1" } } },
      status: "RECEIVED",
    });

    const job = {
      id: "job_test_1",
      data: {
        webhookEventId: eventRecord.id,
        gateway: "STRIPE",
        eventId: "evt_worker_success",
        eventType: "payment_intent.succeeded",
      },
      attemptsMade: 0,
    };

    const workerResult = await processWebhookJob(job);
    assert.equal(workerResult.success, true);

    const updatedEvent = await webhookRepository.findById(eventRecord.id);
    assert.equal(updatedEvent.status, "PROCESSED");
    assert.equal(updatedEvent.processed, true);
    assert.ok(updatedEvent.processedAt);

    assert.equal(payment.status, "SUCCESS");
  });

  it("Dead Letter Queue (DLQ): moves event to DEAD_LETTER upon reaching max attempts", async () => {
    // Create an event that will cause an error
    const eventRecord = await webhookRepository.create({
      gateway: "STRIPE",
      eventId: "evt_dlq_test",
      eventType: "payment_intent.succeeded",
      payload: null, // Bad payload to simulate failure
      status: "RECEIVED",
    });

    // Mock payment state machine to throw an error
    const originalTransition = paymentStateMachine.transition;
    paymentStateMachine.transition = async () => {
      throw new Error("Simulated database constraint failure.");
    };

    const job = {
      id: "job_dlq_max",
      data: {
        webhookEventId: eventRecord.id,
        gateway: "STRIPE",
        eventId: "evt_dlq_test",
        eventType: "payment_intent.succeeded",
      },
      attemptsMade: 4, // 5th attempt = max attempts (env.webhookMaxAttempts is 5)
    };

    await assert.rejects(async () => {
      await processWebhookJob(job);
    });

    const updatedEvent = await webhookRepository.findById(eventRecord.id);
    assert.equal(updatedEvent.status, "DEAD_LETTER");
    assert.ok(updatedEvent.failedAt);
    assert.ok(updatedEvent.errorMessage);

    // Restore
    paymentStateMachine.transition = originalTransition;
  });
});
