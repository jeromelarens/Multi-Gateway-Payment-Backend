import "./setup.js";
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

import cashfreeGateway from "../src/integrations/payment/cashfree/cashfree.gateway.js";
import cashfreeMapper from "../src/integrations/payment/cashfree/cashfree.mapper.js";
import cashfreeWebhookHandler from "../src/integrations/payment/cashfree/cashfree.webhook.js";

describe("Cashfree Gateway Adapter Test Suite", () => {
  test("Adapter Name: identifies as CASHFREE", () => {
    assert.equal(cashfreeGateway.name, "CASHFREE");
  });

  test("Mapper: maps Cashfree order statuses correctly", () => {
    assert.equal(cashfreeMapper.mapPaymentStatus("ACTIVE"), "PENDING");
    assert.equal(cashfreeMapper.mapPaymentStatus("PAID"), "SUCCESS");
    assert.equal(cashfreeMapper.mapPaymentStatus("EXPIRED"), "FAILED");
    assert.equal(cashfreeMapper.mapPaymentStatus("TERMINATED"), "FAILED");
  });

  test("Mapper: maps Cashfree order response to unified payment DTO", () => {
    const mockCfResponse = {
      cf_order_id: "987654321",
      order_id: "ORD-TEST-123",
      order_amount: 1500.0,
      order_currency: "INR",
      order_status: "ACTIVE",
      payment_session_id: "session_mock_token_abc",
    };

    const unified = cashfreeMapper.toUnifiedPaymentResponse(
      mockCfResponse,
      "internal_ord_1",
      "ORD-TEST-123"
    );

    assert.equal(unified.gateway, "CASHFREE");
    assert.equal(unified.gatewayOrderId, "987654321");
    assert.equal(unified.clientSecret, "session_mock_token_abc");
    assert.equal(unified.status, "PENDING");
    assert.equal(unified.amount, 1500);
    assert.equal(unified.currency, "INR");
    assert.equal(unified.requiresAction, true);
  });

  test("Create Payment: validates INR-only currency restriction", async () => {
    await assert.rejects(
      async () => {
        await cashfreeGateway.createPayment({
          amount: 100,
          currency: "USD", // Invalid for Cashfree
          customer: { id: "u_1" },
        });
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.errorCode, "CURRENCY_NOT_SUPPORTED");
        return true;
      }
    );
  });

  test("Create Payment: invokes Cashfree API and returns unified response", async () => {
    const originalRequest = cashfreeGateway._request;
    cashfreeGateway._request = async (endpoint, options) => {
      assert.equal(endpoint, "/orders");
      const body = JSON.parse(options.body);
      assert.equal(body.order_currency, "INR");
      assert.equal(body.order_amount, 999);
      assert.ok(body.customer_details.customer_phone);

      return {
        cf_order_id: "cf_ord_999",
        order_id: body.order_id,
        order_amount: 999.0,
        order_currency: "INR",
        order_status: "ACTIVE",
        payment_session_id: "session_test_xyz",
      };
    };

    try {
      const result = await cashfreeGateway.createPayment({
        amount: 999,
        currency: "INR",
        customer: {
          id: "usr_cf_1",
          fullName: "Rohan Sharma",
          email: "rohan@example.com",
          phone: "+919876543210",
        },
        description: "Test Cashfree Order",
        orderId: "ord_db_123",
        orderNumber: "ORD-CF-1",
      });

      assert.equal(result.gateway, "CASHFREE");
      assert.equal(result.gatewayOrderId, "cf_ord_999");
      assert.equal(result.clientSecret, "session_test_xyz");
      assert.equal(result.status, "PENDING");
      assert.equal(result.amount, 999);
    } finally {
      cashfreeGateway._request = originalRequest;
    }
  });

  test("Webhook: verifies signature and parses event payload", () => {
    const payload = JSON.stringify({
      data: {
        order: { order_id: "ORD-123" },
        payment: { payment_status: "SUCCESS" },
      },
      event_time: "2026-08-31T12:00:00Z",
      type: "PAYMENT_SUCCESS_WEBHOOK",
    });

    const timestamp = Date.now().toString();
    const dataToSign = `${timestamp}${payload}`;
    const signature = crypto
      .createHmac("sha256", process.env.CASHFREE_WEBHOOK_SECRET)
      .update(dataToSign)
      .digest("base64");

    const verified = cashfreeWebhookHandler.verify(payload, {
      "x-webhook-signature": signature,
      "x-webhook-timestamp": timestamp,
    });

    assert.equal(verified.eventType, "PAYMENT_SUCCESS_WEBHOOK");
    assert.ok(verified.data);
  });

  test("Webhook: rejects invalid signature", () => {
    assert.throws(
      () => {
        cashfreeWebhookHandler.verify("{}", {
          "x-webhook-signature": "invalid_sig",
          "x-webhook-timestamp": "12345678",
        });
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.errorCode, "WEBHOOK_SIGNATURE_INVALID");
        return true;
      }
    );
  });
});
