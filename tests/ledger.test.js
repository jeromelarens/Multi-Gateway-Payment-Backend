import "./setup.js";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

import ledgerService from "../src/services/ledger.service.js";
import ledgerRepository from "../src/repositories/ledger.repository.js";

describe("Immutable Transaction Ledger Test Suite", () => {
  const ledgerStore = new Map();

  beforeEach(() => {
    ledgerStore.clear();

    ledgerRepository.create = async (data) => {
      if (ledgerStore.has(data.idempotencyRef)) {
        return ledgerStore.get(data.idempotencyRef);
      }

      const entry = {
        id: `ledger_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        userId: data.userId,
        orderId: data.orderId || null,
        paymentId: data.paymentId || null,
        refundId: data.refundId || null,
        type: data.type,
        direction: data.direction,
        amount: new Prisma.Decimal(data.amount),
        currency: data.currency || "INR",
        gateway: data.gateway,
        idempotencyRef: data.idempotencyRef,
        externalReference: data.externalReference || null,
        description: data.description || null,
        metadata: data.metadata || {},
        createdAt: new Date(),
      };

      ledgerStore.set(data.idempotencyRef, entry);
      return entry;
    };

    ledgerRepository.findByIdempotencyRef = async (ref) => {
      return ledgerStore.get(ref) || null;
    };

    ledgerRepository.findByPaymentId = async (paymentId) => {
      return Array.from(ledgerStore.values()).filter((e) => e.paymentId === paymentId);
    };
  });

  it("Payment Credit: records credit entry with unique idempotency reference", async () => {
    const payment = {
      id: "pay_test_101",
      userId: "usr_101",
      orderId: "ord_101",
      gateway: "STRIPE",
      amount: new Prisma.Decimal("1500.00"),
      currency: "INR",
      gatewayPaymentId: "pi_stripe_123",
      order: { orderNumber: "ORD-101" },
    };

    const entry = await ledgerService.recordPaymentCredit({
      payment,
      externalEventId: "evt_stripe_123",
    });

    assert.ok(entry);
    assert.equal(entry.direction, "CREDIT");
    assert.equal(entry.type, "PAYMENT");
    assert.equal(Number(entry.amount), 1500);
    assert.equal(entry.idempotencyRef, "STRIPE:evt_stripe_123:PAYMENT");
  });

  it("Duplicate Payment Credit: returns existing entry without creating duplicate", async () => {
    const payment = {
      id: "pay_test_102",
      userId: "usr_102",
      orderId: "ord_102",
      gateway: "STRIPE",
      amount: new Prisma.Decimal("2000.00"),
      currency: "INR",
      gatewayPaymentId: "pi_stripe_999",
      order: { orderNumber: "ORD-102" },
    };

    const first = await ledgerService.recordPaymentCredit({
      payment,
      externalEventId: "evt_stripe_999",
    });

    const second = await ledgerService.recordPaymentCredit({
      payment,
      externalEventId: "evt_stripe_999",
    });

    assert.equal(first.id, second.id);
    assert.equal(ledgerStore.size, 1);
  });

  it("Partial & Full Refund Debits: records debits and tracks balance accurately", async () => {
    const payment = {
      id: "pay_test_103",
      userId: "usr_103",
      orderId: "ord_103",
      gateway: "CASHFREE",
      amount: new Prisma.Decimal("1000.00"),
      currency: "INR",
      gatewayOrderId: "cf_ord_103",
    };

    // 1. Credit 1000
    await ledgerService.recordPaymentCredit({ payment, externalEventId: "evt_cf_103" });

    // 2. Partial Refund 300
    const refund1 = {
      id: "ref_103_a",
      refundNumber: "REF-001",
      amount: new Prisma.Decimal("300.00"),
      reason: "customer_requested",
    };
    await ledgerService.recordRefundDebit({
      payment,
      refund: refund1,
      isPartial: true,
    });

    let balance = await ledgerService.getPaymentBalance(payment.id);
    assert.equal(balance.totalCredits, 1000);
    assert.equal(balance.totalDebits, 300);
    assert.equal(balance.netSettled, 700);
    assert.equal(balance.remainingRefundable, 700);

    // 3. Final Partial Refund 700
    const refund2 = {
      id: "ref_103_b",
      refundNumber: "REF-002",
      amount: new Prisma.Decimal("700.00"),
      reason: "customer_requested",
    };
    await ledgerService.recordRefundDebit({
      payment,
      refund: refund2,
      isPartial: false,
    });

    balance = await ledgerService.getPaymentBalance(payment.id);
    assert.equal(balance.totalCredits, 1000);
    assert.equal(balance.totalDebits, 1000);
    assert.equal(balance.netSettled, 0);
    assert.equal(balance.remainingRefundable, 0);
  });

  it("Ledger Immutability: repository does not expose update or delete methods", () => {
    assert.equal(typeof ledgerRepository.update, "undefined");
    assert.equal(typeof ledgerRepository.delete, "undefined");
    assert.equal(typeof ledgerRepository.deleteMany, "undefined");
    assert.equal(typeof ledgerRepository.updateMany, "undefined");
  });

  it("Concurrency: 100 simultaneous ledger creations result in exactly 1 entry", async () => {
    const payment = {
      id: "pay_test_stress",
      userId: "usr_stress",
      orderId: "ord_stress",
      gateway: "STRIPE",
      amount: new Prisma.Decimal("500.00"),
      currency: "INR",
      gatewayPaymentId: "pi_stress_1",
    };

    const promises = Array.from({ length: 100 }, () =>
      ledgerService.recordPaymentCredit({
        payment,
        externalEventId: "evt_stress_identical",
      })
    );

    const results = await Promise.all(promises);
    const firstId = results[0].id;

    for (const r of results) {
      assert.equal(r.id, firstId);
    }
    assert.equal(ledgerStore.size, 1);
  });
});
