import "./setup.js";
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

import paymentService from "../src/services/payment.service.js";
import userRepository from "../src/repositories/user.repository.js";
import prisma from "../src/config/prisma.js";
import gatewayResolver from "../src/integrations/payment/gatewayResolver.js";

describe("Unified Payment Service Test Suite", () => {
  const mockUser = {
    id: "usr_unified_1",
    fullName: "Aryan Patel",
    email: "aryan@example.com",
    phone: "+919876543210",
    stripeCustomerId: "cus_mock_stripe_1",
  };

  beforeEach(() => {
    userRepository.findById = async (id) => (id === mockUser.id ? mockUser : null);

    // Mock prisma.$transaction
    prisma.$transaction = async (callback) => {
      const txMock = {
        order: {
          create: async ({ data }) => ({
            id: `ord_${Date.now()}`,
            ...data,
            createdAt: new Date(),
          }),
        },
        payment: {
          create: async ({ data }) => ({
            id: `pay_${Date.now()}`,
            ...data,
            createdAt: new Date(),
          }),
        },
      };
      return callback(txMock);
    };
  });

  test("Validation: rejects non-positive or zero amount", async () => {
    for (const invalidAmount of [0, -100, "invalid", null]) {
      await assert.rejects(
        async () => {
          await paymentService.createPayment({
            userId: mockUser.id,
            amount: invalidAmount,
            currency: "INR",
            gateway: "STRIPE",
          });
        },
        (err) => {
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    }
  });

  test("Validation: rejects precision greater than 2 decimal places", async () => {
    await assert.rejects(
      async () => {
        await paymentService.createPayment({
          userId: mockUser.id,
          amount: 100.999, // 3 decimals
          currency: "INR",
          gateway: "STRIPE",
        });
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.errorCode, "INVALID_AMOUNT_PRECISION");
        return true;
      }
    );
  });

  test("Validation: rejects unsupported currency (only INR supported)", async () => {
    await assert.rejects(
      async () => {
        await paymentService.createPayment({
          userId: mockUser.id,
          amount: 500,
          currency: "EUR",
          gateway: "STRIPE",
        });
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.errorCode, "UNSUPPORTED_CURRENCY");
        return true;
      }
    );
  });

  test("Validation: rejects unsupported gateway name with 400 UNSUPPORTED_GATEWAY", async () => {
    await assert.rejects(
      async () => {
        await paymentService.createPayment({
          userId: mockUser.id,
          amount: 500,
          currency: "INR",
          gateway: "BITCOIN_PAY",
        });
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.errorCode, "UNSUPPORTED_GATEWAY");
        return true;
      }
    );
  });

  test("Stripe Gateway: successfully initializes payment through adapter", async () => {
    const stripeAdapter = gatewayResolver.resolve("STRIPE");
    const originalCreate = stripeAdapter.createPayment;

    stripeAdapter.createPayment = async (data) => ({
      gateway: "STRIPE",
      paymentIntentId: "pi_mock_unified",
      gatewayPaymentId: "pi_mock_unified",
      clientSecret: "pi_mock_unified_secret",
      status: "PENDING",
      amount: data.amount,
      currency: data.currency,
      requiresAction: false,
    });

    try {
      const result = await paymentService.createPayment({
        userId: mockUser.id,
        amount: 1200,
        currency: "INR",
        gateway: "STRIPE",
        description: "Unified Stripe Test",
      });

      assert.equal(result.gateway, "STRIPE");
      assert.equal(result.status, "PENDING");
      assert.equal(result.amount, 1200);
      assert.equal(result.currency, "INR");
      assert.ok(result.paymentId);
      assert.ok(result.orderId);
      assert.ok(result.orderNumber);
      assert.equal(result.clientSecret, "pi_mock_unified_secret");
    } finally {
      stripeAdapter.createPayment = originalCreate;
    }
  });

  test("Cashfree Gateway: successfully initializes payment through adapter", async () => {
    const cfAdapter = gatewayResolver.resolve("CASHFREE");
    const originalCreate = cfAdapter.createPayment;

    cfAdapter.createPayment = async (data) => ({
      gateway: "CASHFREE",
      gatewayOrderId: "cf_ord_unified_1",
      clientSecret: "cf_session_token_123",
      status: "PENDING",
      amount: data.amount,
      currency: "INR",
      requiresAction: true,
    });

    try {
      const result = await paymentService.createPayment({
        userId: mockUser.id,
        amount: 2500,
        currency: "INR",
        gateway: "CASHFREE",
        description: "Unified Cashfree Test",
      });

      assert.equal(result.gateway, "CASHFREE");
      assert.equal(result.status, "PENDING");
      assert.equal(result.amount, 2500);
      assert.equal(result.currency, "INR");
      assert.ok(result.paymentId);
      assert.ok(result.orderId);
      assert.equal(result.clientSecret, "cf_session_token_123");
      assert.equal(result.gatewayOrderId, "cf_ord_unified_1");
    } finally {
      cfAdapter.createPayment = originalCreate;
    }
  });

  test("Distributed Failure Handling: triggers gateway compensation when DB transaction fails", async () => {
    const stripeAdapter = gatewayResolver.resolve("STRIPE");
    let cancelPaymentCalledWith = null;

    const originalCreate = stripeAdapter.createPayment;
    const originalCancel = stripeAdapter.cancelPayment;

    stripeAdapter.createPayment = async () => ({
      gateway: "STRIPE",
      paymentIntentId: "pi_orphan_123",
      gatewayPaymentId: "pi_orphan_123",
      clientSecret: "secret",
      status: "PENDING",
    });

    stripeAdapter.cancelPayment = async (id) => {
      cancelPaymentCalledWith = id;
      return { success: true };
    };

    // Simulate DB failure
    prisma.$transaction = async () => {
      throw new Error("Simulated database connection loss during transaction");
    };

    try {
      await assert.rejects(
        async () => {
          await paymentService.createPayment({
            userId: mockUser.id,
            amount: 500,
            currency: "INR",
            gateway: "STRIPE",
          });
        },
        (err) => {
          assert.equal(err.statusCode, 500);
          assert.equal(err.errorCode, "DATABASE_TRANSACTION_FAILED");
          return true;
        }
      );

      // Verify compensation happened
      assert.equal(
        cancelPaymentCalledWith,
        "pi_orphan_123",
        "Gateway cancellation must be called on distributed DB failure"
      );
    } finally {
      stripeAdapter.createPayment = originalCreate;
      stripeAdapter.cancelPayment = originalCancel;
    }
  });
});
