import "./setup.js";
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import webhookService from "../src/services/webhook.service.js";
import webhookRepository from "../src/repositories/webhook.repository.js";
import gatewayResolver from "../src/integrations/payment/gatewayResolver.js";
import ApiError from "../src/utils/ApiError.js";

describe("Gateway-Independent Webhook Service Test Suite", () => {
  const webhookStore = new Map();

  beforeEach(() => {
    webhookStore.clear();

    webhookRepository.findByGatewayAndEventId = async (gateway, eventId) => {
      return webhookStore.get(`${gateway}:${eventId}`) || null;
    };

    webhookRepository.create = async (data) => {
      const key = `${data.gateway}:${data.eventId}`;
      if (webhookStore.has(key)) {
        const err = new Error("Unique constraint failed");
        err.code = "P2002";
        throw err;
      }
      const record = {
        id: `evt_rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        ...data,
        attempts: 0,
        createdAt: new Date(),
      };
      webhookStore.set(key, record);
      webhookStore.set(record.id, record);
      return record;
    };

    webhookRepository.findAll = async () => Array.from(webhookStore.values());
    webhookRepository.findById = async (id) => webhookStore.get(id) || null;
  });

  test("handleGatewayWebhook: resolves gateway, verifies signature, persists and queues event", async () => {
    // Mock gateway adapter
    const mockAdapter = {
      name: "CASHFREE",
      verifyWebhook: (payload, headers) => ({
        eventId: "cf_evt_test_101",
        eventType: "PAYMENT_SUCCESS_WEBHOOK",
        data: { order: { order_id: "ORD-CF-1" } },
      }),
    };

    const originalResolve = gatewayResolver.resolve;
    gatewayResolver.resolve = (name) => {
      if (name === "CASHFREE") return mockAdapter;
      return originalResolve.call(gatewayResolver, name);
    };

    try {
      const result = await webhookService.handleGatewayWebhook(
        "CASHFREE",
        { test: "data" },
        { "x-webhook-signature": "valid_sig" }
      );

      assert.equal(result.success, true);
      assert.ok(webhookStore.has("CASHFREE:cf_evt_test_101"));
    } finally {
      gatewayResolver.resolve = originalResolve;
    }
  });

  test("handleGatewayWebhook: rejects unsupported gateway with 400 UNSUPPORTED_GATEWAY", async () => {
    await assert.rejects(
      async () => {
        await webhookService.handleGatewayWebhook("UNKNOWN_GW", {}, {});
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.errorCode, "UNSUPPORTED_GATEWAY");
        return true;
      }
    );
  });

  test("handleGatewayWebhook: ignores duplicate webhook event idempotently", async () => {
    const mockAdapter = {
      name: "STRIPE",
      verifyWebhook: () => ({
        eventId: "evt_duplicate_test",
        eventType: "payment_intent.succeeded",
        data: { id: "pi_dup_1" },
      }),
    };

    const originalResolve = gatewayResolver.resolve;
    gatewayResolver.resolve = () => mockAdapter;

    try {
      // First arrival
      const first = await webhookService.handleGatewayWebhook("STRIPE", {}, {});
      assert.equal(first.success, true);

      // Duplicate arrival
      const duplicate = await webhookService.handleGatewayWebhook("STRIPE", {}, {});
      assert.equal(duplicate.success, true);
      assert.match(duplicate.message, /duplicate webhook event ignored/i);
    } finally {
      gatewayResolver.resolve = originalResolve;
    }
  });

  test("Webhook Queries: lists events and retrieves details by ID", async () => {
    const record = {
      id: "evt_rec_999",
      gateway: "STRIPE",
      eventId: "evt_query_test",
      eventType: "payment_intent.succeeded",
      status: "PROCESSED",
    };
    webhookStore.set("evt_rec_999", record);

    const list = await webhookService.getWebhookEvents();
    assert.ok(Array.isArray(list));

    const found = await webhookService.getWebhookById("evt_rec_999");
    assert.equal(found.id, "evt_rec_999");

    await assert.rejects(
      async () => {
        await webhookService.getWebhookById("non_existent_evt");
      },
      (err) => {
        assert.equal(err.statusCode, 404);
        return true;
      }
    );
  });
});
