import "./setup.js";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import adminController from "../src/controllers/admin.controller.js";
import auditService from "../src/services/audit.service.js";
import auditRepository from "../src/repositories/audit.repository.js";
import prisma from "../src/config/prisma.js";
import { createMockReqRes } from "./setup.js";

describe("Admin Observability & Audit Trail Test Suite", () => {
  const auditStore = [];

  beforeEach(() => {
    auditStore.length = 0;

    auditRepository.create = async (data) => {
      const entry = {
        id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        ...data,
        createdAt: new Date(),
      };
      auditStore.push(entry);
      return entry;
    };

    auditRepository.findAll = async () => auditStore;
    auditRepository.countAll = async () => auditStore.length;
  });

  it("Metrics Endpoint: accurately computes success and failure rates across gateways", async () => {
    // Mock prisma counts
    prisma.payment.count = async (args = {}) => {
      const status = args?.where?.status;
      if (status === "SUCCESS") return 80;
      if (status === "FAILED") return 20;
      if (status === "PENDING") return 5;
      if (typeof status === "object" && status?.in) return 10;
      if (args?.where?.gateway === "STRIPE") return 60;
      if (args?.where?.gateway === "CASHFREE") return 40;
      return 100; // total payments
    };

    prisma.webhookEvent.count = async () => 2; // 2 dead letter webhooks
    prisma.reconciliationRecord.count = async () => 1; // 1 open mismatch

    const { req, res } = createMockReqRes({ method: "GET" });
    await adminController.getMetrics(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.payments.total, 100);
    assert.equal(res.body.data.payments.successful, 80);
    assert.equal(res.body.data.payments.failed, 20);
    assert.equal(res.body.data.payments.successRatePercent, 80);
    assert.equal(res.body.data.payments.failureRatePercent, 20);
    assert.equal(res.body.data.gatewayDistribution.stripe, 60);
    assert.equal(res.body.data.gatewayDistribution.cashfree, 40);
    assert.equal(res.body.data.reliability.deadLetterWebhooks, 2);
    assert.equal(res.body.data.reliability.openReconciliationMismatches, 1);
  });

  it("Audit Trail: sanitizes sensitive keys and persists immutable log", async () => {
    const entry = await auditService.log({
      actorUserId: "usr_admin_1",
      action: "WEBHOOK_REPROCESSED",
      entityType: "WEBHOOK",
      entityId: "evt_123",
      metadata: {
        password: "sensitive_password",
        secretKey: "sk_live_secret",
        reason: "Manual recovery after network blip",
      },
    });

    assert.ok(entry);
    assert.equal(entry.action, "WEBHOOK_REPROCESSED");
    assert.equal(entry.entityType, "WEBHOOK");
    // Verify sensitive fields stripped
    assert.equal(entry.metadata.password, undefined);
    assert.equal(entry.metadata.secretKey, undefined);
    assert.equal(entry.metadata.reason, "Manual recovery after network blip");
  });
});
