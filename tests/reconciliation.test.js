import "./setup.js";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

import reconciliationService from "../src/services/reconciliation.service.js";
import reconciliationRepository from "../src/repositories/reconciliation.repository.js";
import gatewayResolver from "../src/integrations/payment/gatewayResolver.js";
import prisma from "../src/config/prisma.js";
import ApiError from "../src/utils/ApiError.js";

describe("Payment Reconciliation Engine Test Suite", () => {
  const reconStore = new Map();

  beforeEach(() => {
    reconStore.clear();

    reconciliationRepository.create = async (data) => {
      const record = {
        id: `recon_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        ...data,
        createdAt: new Date(),
        status: data.status || "MISMATCH",
      };
      reconStore.set(record.id, record);
      return record;
    };

    reconciliationRepository.findById = async (id) => {
      return reconStore.get(id) || null;
    };

    reconciliationRepository.resolve = async (id, { resolution, resolvedBy }) => {
      const rec = reconStore.get(id);
      if (!rec) return null;
      rec.status = "RESOLVED";
      rec.resolution = resolution;
      rec.resolvedBy = resolvedBy;
      rec.resolvedAt = new Date();
      return rec;
    };
  });

  it("Matched Payment: reports match when DB and Gateway state align perfectly", async () => {
    // Mock gateway adapter response
    const mockAdapter = {
      name: "STRIPE",
      getPayment: async (ref) => ({
        paymentId: ref,
        amount: 1000,
        currency: "INR",
        status: "SUCCESS",
      }),
    };
    gatewayResolver.resolve = () => mockAdapter;

    prisma.payment.findMany = async () => [
      {
        id: "pay_recon_1",
        gateway: "STRIPE",
        status: "SUCCESS",
        amount: new Prisma.Decimal("1000.00"),
        currency: "INR",
        gatewayPaymentId: "pi_match_1",
      },
    ];

    const result = await reconciliationService.runReconciliation({ gateway: "STRIPE" });
    assert.equal(result.totalChecked, 1);
    assert.equal(result.matchedCount, 1);
    assert.equal(result.mismatchCount, 0);
  });

  it("Status Mismatch: detects DB PENDING vs Gateway SUCCESS discrepancy", async () => {
    const mockAdapter = {
      name: "STRIPE",
      getPayment: async (ref) => ({
        paymentId: ref,
        amount: 1500,
        currency: "INR",
        status: "SUCCESS",
      }),
    };
    gatewayResolver.resolve = () => mockAdapter;

    prisma.payment.findMany = async () => [
      {
        id: "pay_recon_2",
        gateway: "STRIPE",
        status: "PENDING", // DB still pending!
        amount: new Prisma.Decimal("1500.00"),
        currency: "INR",
        gatewayPaymentId: "pi_mismatch_status",
      },
    ];

    const result = await reconciliationService.runReconciliation({ gateway: "STRIPE" });
    assert.equal(result.totalChecked, 1);
    assert.equal(result.matchedCount, 0);
    assert.equal(result.mismatchCount, 1);
    assert.equal(result.mismatches[0].differenceType, "STATUS_MISMATCH");
  });

  it("Amount Mismatch: detects discrepancy between DB amount and Gateway amount", async () => {
    const mockAdapter = {
      name: "STRIPE",
      getPayment: async (ref) => ({
        paymentId: ref,
        amount: 800, // Gateway charged 800
        currency: "INR",
        status: "SUCCESS",
      }),
    };
    gatewayResolver.resolve = () => mockAdapter;

    prisma.payment.findMany = async () => [
      {
        id: "pay_recon_3",
        gateway: "STRIPE",
        status: "SUCCESS",
        amount: new Prisma.Decimal("1000.00"), // DB expected 1000
        currency: "INR",
        gatewayPaymentId: "pi_mismatch_amount",
      },
    ];

    const result = await reconciliationService.runReconciliation({ gateway: "STRIPE" });
    assert.equal(result.mismatchCount, 1);
    assert.equal(result.mismatches[0].differenceType, "AMOUNT_MISMATCH");
  });

  it("Admin Discrepancy Resolution: requires justification and updates record to RESOLVED", async () => {
    const createdRecord = await reconciliationRepository.create({
      gateway: "STRIPE",
      paymentId: "pay_recon_resolve",
      differenceType: "STATUS_MISMATCH",
      status: "MISMATCH",
    });

    const resolved = await reconciliationService.resolveDiscrepancy(createdRecord.id, {
      resolution: "Gateway confirmed successful settlement; manually adjusted internal DB.",
      resolvedBy: "admin_user_id",
    });

    assert.equal(resolved.status, "RESOLVED");
    assert.equal(resolved.resolvedBy, "admin_user_id");
    assert.ok(resolved.resolvedAt);
  });

  it("Resolution Rejection: rejects resolution attempts with empty or too short notes", async () => {
    const createdRecord = await reconciliationRepository.create({
      gateway: "STRIPE",
      paymentId: "pay_recon_short",
      differenceType: "STATUS_MISMATCH",
      status: "MISMATCH",
    });

    await assert.rejects(
      async () => {
        await reconciliationService.resolveDiscrepancy(createdRecord.id, {
          resolution: "ok", // Too short!
          resolvedBy: "admin_user_id",
        });
      },
      (err) => err instanceof ApiError && err.errorCode === "RESOLUTION_REASON_REQUIRED"
    );
  });
});
