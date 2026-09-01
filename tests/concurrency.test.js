import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

import ledgerService from "../src/services/ledger.service.js";
import ledgerRepository from "../src/repositories/ledger.repository.js";
import webhookRepository from "../src/repositories/webhook.repository.js";
import webhookService from "../src/services/webhook.service.js";
import stripeWebhook from "../src/integrations/stripe/webhook.js";

describe("Phase 2 High-Concurrency & Stress Test Suite", () => {
  it("STRESS TEST: 100 concurrent webhook events with identical eventId create exactly 1 DB record", async () => {
    const webhookStore = new Map();

    webhookRepository.findByGatewayAndEventId = async (gateway, eventId) => {
      return webhookStore.get(`${gateway}:${eventId}`) || null;
    };

    webhookRepository.create = async (data) => {
      const key = `${data.gateway}:${data.eventId}`;
      if (webhookStore.has(key)) {
        // Simulates DB unique constraint violation
        const err = new Error("Unique constraint failed");
        err.code = "P2002";
        throw err;
      }
      const record = { id: `evt_${Date.now()}_${Math.random()}`, ...data, createdAt: new Date() };
      webhookStore.set(key, record);
      return record;
    };

    stripeWebhook.verify = () => ({
      id: "evt_stress_100_concurrent",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_stress_100" } },
    });

    const requests = Array.from({ length: 100 }, () =>
      webhookService.handleStripeWebhook("raw_body", "valid_sig").catch((err) => ({
        success: false,
        error: err.message,
      }))
    );

    const results = await Promise.all(requests);
    const successfulResponses = results.filter((r) => r.success === true);

    // All 100 requests receive successful HTTP ACK (either created or duplicate ignored)
    assert.equal(successfulResponses.length, 100);

    // Exactly 1 webhook event record exists in storage
    assert.equal(webhookStore.size, 1);
  });

  it("STRESS TEST: 100 concurrent ledger creation attempts produce exactly 1 ledger entry", async () => {
    const ledgerStore = new Map();

    ledgerRepository.create = async (data) => {
      if (ledgerStore.has(data.idempotencyRef)) {
        return ledgerStore.get(data.idempotencyRef);
      }
      const entry = {
        id: `led_${Date.now()}_${Math.random()}`,
        ...data,
        createdAt: new Date(),
      };
      ledgerStore.set(data.idempotencyRef, entry);
      return entry;
    };

    ledgerRepository.findByIdempotencyRef = async (ref) => {
      return ledgerStore.get(ref) || null;
    };

    const payment = {
      id: "pay_stress_100",
      userId: "usr_stress_100",
      orderId: "ord_stress_100",
      gateway: "STRIPE",
      amount: new Prisma.Decimal("1000.00"),
      currency: "INR",
      gatewayPaymentId: "pi_stress_100",
    };

    const calls = Array.from({ length: 100 }, () =>
      ledgerService.recordPaymentCredit({
        payment,
        externalEventId: "evt_stress_ledger_100",
      })
    );

    const entries = await Promise.all(calls);
    const firstId = entries[0].id;

    for (const e of entries) {
      assert.equal(e.id, firstId);
    }
    assert.equal(ledgerStore.size, 1);
  });

  it("STRESS TEST: 100 concurrent refund debits for same refund produce exactly 1 debit entry", async () => {
    const ledgerStore = new Map();

    ledgerRepository.create = async (data) => {
      if (ledgerStore.has(data.idempotencyRef)) {
        return ledgerStore.get(data.idempotencyRef);
      }
      const entry = {
        id: `led_${Date.now()}_${Math.random()}`,
        ...data,
        createdAt: new Date(),
      };
      ledgerStore.set(data.idempotencyRef, entry);
      return entry;
    };

    ledgerRepository.findByIdempotencyRef = async (ref) => {
      return ledgerStore.get(ref) || null;
    };

    const payment = {
      id: "pay_stress_ref",
      userId: "usr_stress_ref",
      orderId: "ord_stress_ref",
      gateway: "STRIPE",
      amount: new Prisma.Decimal("2000.00"),
      currency: "INR",
    };

    const refund = {
      id: "ref_stress_exact",
      refundNumber: "REF-STRESS-001",
      amount: new Prisma.Decimal("500.00"),
    };

    const calls = Array.from({ length: 100 }, () =>
      ledgerService.recordRefundDebit({
        payment,
        refund,
        isPartial: true,
      })
    );

    const debits = await Promise.all(calls);
    const firstId = debits[0].id;

    for (const d of debits) {
      assert.equal(d.id, firstId);
    }
    assert.equal(ledgerStore.size, 1);
  });
});
