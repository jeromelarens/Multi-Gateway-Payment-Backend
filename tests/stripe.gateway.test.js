import "./setup.js";
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import stripeGateway from "../src/integrations/payment/stripe/stripe.gateway.js";
import stripeMapper from "../src/integrations/payment/stripe/stripe.mapper.js";
import stripePaymentIntent from "../src/integrations/stripe/paymentIntent.js";

describe("Stripe Gateway Adapter Test Suite", () => {
  test("Adapter Name: identifies as STRIPE", () => {
    assert.equal(stripeGateway.name, "STRIPE");
  });

  test("Mapper: maps Stripe statuses correctly to unified status", () => {
    assert.equal(stripeMapper.mapPaymentStatus("succeeded"), "SUCCESS");
    assert.equal(stripeMapper.mapPaymentStatus("requires_action"), "PENDING");
    assert.equal(stripeMapper.mapPaymentStatus("processing"), "PENDING");
    assert.equal(stripeMapper.mapPaymentStatus("canceled"), "FAILED");
    assert.equal(stripeMapper.mapPaymentStatus("unknown"), "PENDING");
  });

  test("Create Payment: constructs payment intent and returns unified DTO", async () => {
    const originalCreate = stripePaymentIntent.create;
    stripePaymentIntent.create = async (params) => {
      return {
        id: "pi_test_12345",
        client_secret: "pi_test_12345_secret_67890",
        amount: params.amount,
        currency: params.currency,
        status: "requires_payment_method",
      };
    };

    try {
      const result = await stripeGateway.createPayment({
        amount: 500,
        currency: "INR",
        customer: { id: "cust_123", email: "stripe@example.com" },
        description: "Test Stripe Payment",
        orderId: "ord_abc",
        orderNumber: "ORD-9999",
      });

      assert.equal(result.gateway, "STRIPE");
      assert.equal(result.gatewayPaymentId, "pi_test_12345");
      assert.equal(result.clientSecret, "pi_test_12345_secret_67890");
      assert.equal(result.status, "PENDING");
      assert.equal(result.amount, 500);
      assert.equal(result.currency, "INR");
    } finally {
      stripePaymentIntent.create = originalCreate;
    }
  });

  test("Error Mapping: safely maps Stripe SDK failures into ApiError", () => {
    const mockStripeError = new Error("Your card was declined.");
    mockStripeError.statusCode = 402;
    mockStripeError.raw = { message: "Your card was declined." };

    const apiError = stripeMapper.toGatewayError(mockStripeError);
    assert.equal(apiError.statusCode, 402);
    assert.equal(apiError.errorCode, "PAYMENT_GATEWAY_ERROR");
    assert.equal(apiError.message, "Your card was declined.");
  });

  test("Webhook verification: rejects missing signature", () => {
    assert.throws(
      () => {
        stripeGateway.verifyWebhook(Buffer.from("{}"), {});
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.errorCode, "WEBHOOK_SIGNATURE_MISSING");
        return true;
      }
    );
  });
});
