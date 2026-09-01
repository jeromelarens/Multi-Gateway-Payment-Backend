import "./setup.js";
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import idempotencyRepository from "../src/repositories/idempotency.repository.js";
import { idempotencyMiddleware } from "../src/middlewares/idempotency.middleware.js";
import { createMockReqRes } from "./setup.js";

describe("Request-Level Idempotency & Concurrency Test Suite", () => {
  // In-memory idempotency storage simulating DB unique constraint
  const memoryStore = new Map();

  beforeEach(() => {
    memoryStore.clear();

    idempotencyRepository.findByUserAndKey = async (userId, key) => {
      return memoryStore.get(`${userId}:${key}`) || null;
    };

    idempotencyRepository.reserve = async ({ key, userId, endpoint, requestHash, ttlHours = 24 }) => {
      const compositeKey = `${userId}:${key}`;
      if (memoryStore.has(compositeKey)) {
        return { isNew: false, record: memoryStore.get(compositeKey) };
      }

      const record = {
        id: `idem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        key,
        userId,
        endpoint,
        requestHash,
        status: "PROCESSING",
        responseStatus: null,
        responseBody: null,
        expiresAt: new Date(Date.now() + ttlHours * 3600000),
      };

      memoryStore.set(compositeKey, record);
      return { isNew: true, record };
    };

    idempotencyRepository.complete = async (id, responseStatus, responseBody, resourceId = null) => {
      for (const record of memoryStore.values()) {
        if (record.id === id) {
          record.status = "COMPLETED";
          record.responseStatus = responseStatus;
          record.responseBody = responseBody;
          record.resourceId = resourceId;
          return record;
        }
      }
      return null;
    };

    idempotencyRepository.fail = async (id) => {
      for (const record of memoryStore.values()) {
        if (record.id === id) {
          record.status = "FAILED";
          return record;
        }
      }
      return null;
    };

    idempotencyRepository.resetForRetry = async (id, requestHash) => {
      for (const record of memoryStore.values()) {
        if (record.id === id) {
          record.status = "PROCESSING";
          record.requestHash = requestHash;
          record.responseStatus = null;
          record.responseBody = null;
          return record;
        }
      }
      return null;
    };
  });

  test("Missing Idempotency-Key: rejects with 400 IDEMPOTENCY_KEY_REQUIRED", async () => {
    const { req, res, next } = createMockReqRes({
      method: "POST",
      url: "/api/v1/payments",
      body: { amount: 100 },
      user: { id: "user_1" },
    });

    await idempotencyMiddleware(req, res, next);
    assert.ok(req._error);
    assert.equal(req._error.statusCode, 400);
    assert.equal(req._error.errorCode, "IDEMPOTENCY_KEY_REQUIRED");
  });

  test("First request: processes and stores response in idempotency record", async () => {
    const { req, res, next } = createMockReqRes({
      method: "POST",
      url: "/api/v1/payments",
      headers: { "idempotency-key": "test-key-001" },
      body: { amount: 500, currency: "INR" },
      user: { id: "user_1" },
    });

    await idempotencyMiddleware(req, res, next);
    assert.equal(req._error, undefined);

    // Simulate controller executing and sending response
    const mockPaymentData = { success: true, data: { paymentId: "pay_1", amount: 500 } };
    res.status(201).json(mockPaymentData);

    const stored = memoryStore.get("user_1:test-key-001");
    assert.ok(stored);
    assert.equal(stored.status, "COMPLETED");
    assert.equal(stored.responseStatus, 201);
    assert.deepEqual(stored.responseBody, mockPaymentData);
  });

  test("Duplicate request with same key and same body: returns identical cached response without re-processing", async () => {
    const key = "test-key-replay";
    const body = { amount: 750, currency: "INR" };

    // 1. Initial request
    const first = createMockReqRes({
      method: "POST",
      url: "/api/v1/payments",
      headers: { "idempotency-key": key },
      body,
      user: { id: "user_1" },
    });

    await idempotencyMiddleware(first.req, first.res, first.next);
    first.res.status(201).json({ success: true, data: { paymentId: "pay_cached", amount: 750 } });

    // 2. Second request with same key and identical body
    let controllerCalled = false;
    const second = createMockReqRes({
      method: "POST",
      url: "/api/v1/payments",
      headers: { "idempotency-key": key },
      body,
      user: { id: "user_1" },
    });

    await idempotencyMiddleware(second.req, second.res, () => {
      controllerCalled = true;
    });

    assert.equal(controllerCalled, false, "Controller must NOT be invoked on idempotent replay");
    assert.equal(second.res.statusCode, 201);
    assert.equal(second.res.headers["idempotent-replay"], "true");
    assert.deepEqual(second.res.body, { success: true, data: { paymentId: "pay_cached", amount: 750 } });
  });

  test("Reused key with different request body: rejected with 409 IDEMPOTENCY_KEY_REUSED", async () => {
    const key = "test-conflict-key";

    // 1. First request for amount 1000
    const first = createMockReqRes({
      method: "POST",
      url: "/api/v1/payments",
      headers: { "idempotency-key": key },
      body: { amount: 1000, currency: "INR" },
      user: { id: "user_1" },
    });
    await idempotencyMiddleware(first.req, first.res, first.next);
    first.res.status(201).json({ success: true, data: { paymentId: "pay_1000" } });

    // 2. Second request reuses key with different amount 500
    const second = createMockReqRes({
      method: "POST",
      url: "/api/v1/payments",
      headers: { "idempotency-key": key },
      body: { amount: 500, currency: "INR" }, // Mismatched payload!
      user: { id: "user_1" },
    });
    await idempotencyMiddleware(second.req, second.res, second.next);

    assert.ok(second.req._error, "Should reject with conflict error");
    assert.equal(second.req._error.statusCode, 409);
    assert.equal(second.req._error.errorCode, "IDEMPOTENCY_KEY_REUSED");
  });

  test("Concurrent requests with same key: rejects overlapping request with 409 CONCURRENT_REQUEST_IN_PROGRESS", async () => {
    const key = "test-concurrent-key";

    // Request 1 starts processing (no res.json called yet -> status remains PROCESSING)
    const first = createMockReqRes({
      method: "POST",
      url: "/api/v1/payments",
      headers: { "idempotency-key": key },
      body: { amount: 200 },
      user: { id: "user_concurrent" },
    });
    await idempotencyMiddleware(first.req, first.res, first.next);
    assert.equal(first.req._error, undefined);

    // Request 2 arrives simultaneously with the exact same key
    const second = createMockReqRes({
      method: "POST",
      url: "/api/v1/payments",
      headers: { "idempotency-key": key },
      body: { amount: 200 },
      user: { id: "user_concurrent" },
    });
    await idempotencyMiddleware(second.req, second.res, second.next);

    assert.ok(second.req._error, "Simultaneous concurrent request must be rejected");
    assert.equal(second.req._error.statusCode, 409);
    assert.equal(second.req._error.errorCode, "CONCURRENT_REQUEST_IN_PROGRESS");
  });

  test("CONCURRENCY STRESS TEST: 100 concurrent identical requests must not create 100 payments (only 1 succeeds)", async () => {
    const key = `stress-test-${Date.now()}`;
    const payload = { amount: 999, currency: "INR", gateway: "STRIPE" };
    const userId = "stress_tester_user";

    let paymentsCreatedCount = 0;

    // Simulate 100 simultaneous requests
    const promises = Array.from({ length: 100 }, async (_, index) => {
      const { req, res, next } = createMockReqRes({
        method: "POST",
        url: "/api/v1/payments",
        headers: { "idempotency-key": key },
        body: payload,
        user: { id: userId },
      });

      let middlewarePassed = false;
      await idempotencyMiddleware(req, res, (err) => {
        if (!err) middlewarePassed = true;
        else req._error = err;
      });

      if (middlewarePassed) {
        // Simulate payment creation in business logic
        paymentsCreatedCount++;
        res.status(201).json({
          success: true,
          data: { paymentId: `payment_${key}`, amount: 999 },
        });
        return { status: 201, result: "created" };
      } else if (req._error) {
        return { status: req._error.statusCode, result: req._error.errorCode };
      } else {
        return { status: res.statusCode, result: "cached" };
      }
    });

    const results = await Promise.all(promises);

    // CRITICAL ASSERTION: Exactly 1 payment created!
    assert.equal(
      paymentsCreatedCount,
      1,
      `Exactly 1 payment must be created out of 100 concurrent requests, but got ${paymentsCreatedCount}`
    );

    const createdResults = results.filter((r) => r.result === "created");
    assert.equal(createdResults.length, 1);
  });
});
