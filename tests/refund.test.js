import "./setup.js";
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

import refundService from "../src/services/refund.service.js";
import refundRepository from "../src/repositories/refund.repository.js";
import paymentRepository from "../src/repositories/payment.repository.js";
import stripeRefund from "../src/integrations/stripe/refund.js";
import stripePaymentIntent from "../src/integrations/stripe/paymentIntent.js";
import paymentStateMachine from "../src/services/paymentStateMachine.js";
import ledgerService from "../src/services/ledger.service.js";

describe("Refund Lifecycle & Financial Accounting Test Suite", () => {
  const refundsStore = [];
  let paymentStore = {};
  const ledgerEntries = [];
  const stateTransitions = [];

  beforeEach(() => {
    refundsStore.length = 0;
    ledgerEntries.length = 0;
    stateTransitions.length = 0;

    paymentStore = {
      id: "pay_test_refund_1",
      userId: "user_owner_1",
      amount: new Prisma.Decimal("1000.00"),
      currency: "INR",
      status: "SUCCESS",
      paymentIntentId: "pi_stripe_ref_1",
    };

    paymentRepository.findById = async (id) => {
      if (id === paymentStore.id) return paymentStore;
      return null;
    };

    refundRepository.findPaymentRefunds = async (paymentId) => {
      return refundsStore.filter((r) => r.paymentId === paymentId);
    };

    refundRepository.create = async (data) => {
      const refund = {
        id: `ref_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        refundNumber: data.refundNumber,
        stripeRefundId: data.stripeRefundId,
        amount: new Prisma.Decimal(data.amount),
        reason: data.reason || null,
        status: data.status || "SUCCEEDED",
        paymentId: data.paymentId,
        createdAt: new Date(),
      };
      refundsStore.push(refund);
      return refund;
    };

    stripePaymentIntent.retrieve = async (id) => ({
      id,
      status: "succeeded",
    });

    stripeRefund.create = async (payload) => ({
      id: `re_mock_${Date.now()}`,
      status: "succeeded",
      amount: payload.amount || 100000,
    });

    paymentStateMachine.transition = async (paymentId, targetState) => {
      paymentStore.status = targetState;
      stateTransitions.push(targetState);
      return { success: true, targetState };
    };

    ledgerService.recordRefundDebit = async ({ payment, refund, isPartial, description }) => {
      const entry = {
        paymentId: payment.id,
        refundId: refund.id,
        amount: refund.amount,
        direction: "DEBIT",
        type: isPartial ? "PARTIAL_REFUND" : "REFUND",
        description,
      };
      ledgerEntries.push(entry);
      return entry;
    };
  });

  test("Validation: rejects refund on non-existent payment with 404", async () => {
    await assert.rejects(
      async () => {
        await refundService.createRefund({ paymentId: "non_existent_pay" });
      },
      (err) => {
        assert.equal(err.statusCode, 404);
        return true;
      }
    );
  });

  test("Validation: rejects refund on non-SUCCESS payment with 400", async () => {
    paymentStore.status = "PENDING";
    await assert.rejects(
      async () => {
        await refundService.createRefund({ paymentId: paymentStore.id });
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  });

  test("Validation: rejects non-positive or zero refund amount", async () => {
    for (const invalidAmount of [0, -50]) {
      await assert.rejects(
        async () => {
          await refundService.createRefund({ paymentId: paymentStore.id, amount: invalidAmount });
        },
        (err) => {
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    }
  });

  test("Validation: rejects refund amount exceeding remaining balance", async () => {
    await assert.rejects(
      async () => {
        await refundService.createRefund({ paymentId: paymentStore.id, amount: 1500 });
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /cannot exceed remaining amount/i);
        return true;
      }
    );
  });

  test("Partial Refund: correctly processes ₹300 partial refund and transitions to PARTIALLY_REFUNDED", async () => {
    const result = await refundService.createRefund({
      paymentId: paymentStore.id,
      amount: 300,
      reason: "requested_by_customer",
    });

    assert.equal(result.success, true);
    assert.equal(Number(result.refund.amount), 300);
    assert.equal(paymentStore.status, "PARTIALLY_REFUNDED");
    assert.equal(ledgerEntries.length, 1);
    assert.equal(ledgerEntries[0].direction, "DEBIT");
    assert.equal(ledgerEntries[0].type, "PARTIAL_REFUND");
    assert.equal(Number(ledgerEntries[0].amount), 300);
  });

  test("Multiple Partial Refunds: ₹1000 payment -> ₹300 -> ₹700 full settlement -> REFUNDED", async () => {
    // 1. First partial refund of ₹300
    const refund1 = await refundService.createRefund({
      paymentId: paymentStore.id,
      amount: 300,
    });
    assert.equal(refund1.success, true);
    assert.equal(paymentStore.status, "PARTIALLY_REFUNDED");

    // 2. Second partial refund of remaining ₹700
    const refund2 = await refundService.createRefund({
      paymentId: paymentStore.id,
      amount: 700,
    });
    assert.equal(refund2.success, true);
    assert.equal(paymentStore.status, "REFUNDED");
    assert.equal(ledgerEntries.length, 2);
    assert.equal(ledgerEntries[1].type, "REFUND");

    // 3. Attempting another refund when balance is ₹0 fails with 409
    await assert.rejects(
      async () => {
        await refundService.createRefund({
          paymentId: paymentStore.id,
          amount: 50,
        });
      },
      (err) => {
        assert.ok(err.statusCode === 400 || err.statusCode === 409);
        return true;
      }
    );
  });

  test("Full Refund: defaults to remaining balance when amount is omitted and transitions to REFUNDED", async () => {
    const result = await refundService.createRefund({
      paymentId: paymentStore.id,
    });

    assert.equal(result.success, true);
    assert.equal(Number(result.refund.amount), 1000);
    assert.equal(paymentStore.status, "REFUNDED");
    assert.equal(ledgerEntries.length, 1);
    assert.equal(ledgerEntries[0].type, "REFUND");
  });
});
