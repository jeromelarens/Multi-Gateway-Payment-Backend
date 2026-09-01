import "./setup.js";
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { requireRole, requireOwnership } from "../src/middlewares/auth.middleware.js";
import paymentService from "../src/services/payment.service.js";
import paymentRepository from "../src/repositories/payment.repository.js";
import refundService from "../src/services/refund.service.js";
import refundRepository from "../src/repositories/refund.repository.js";
import invoiceService from "../src/services/invoice.service.js";
import invoiceRepository from "../src/repositories/invoice.repository.js";
import orderRepository from "../src/repositories/order.repository.js";
import { createMockReqRes } from "./setup.js";

describe("Authorization and IDOR Protection Test Suite", () => {
  test("Role Authorization: allows user with matching role", () => {
    const { req, res, next } = createMockReqRes({
      user: { id: "admin_1", role: "ADMIN" },
    });

    const middleware = requireRole("ADMIN");
    middleware(req, res, next);

    assert.equal(req._error, undefined, "Admin should be authorized");
  });

  test("Role Authorization: rejects user with non-matching role with 403", () => {
    const { req, res, next } = createMockReqRes({
      user: { id: "user_1", role: "USER" },
    });

    const middleware = requireRole("ADMIN");
    middleware(req, res, next);

    assert.ok(req._error, "Non-admin should be rejected");
    assert.equal(req._error.statusCode, 403);
    assert.equal(req._error.errorCode, "AUTHORIZATION_ERROR");
  });

  test("Ownership Middleware: allows resource owner", async () => {
    const { req, res, next } = createMockReqRes({
      user: { id: "user_123", role: "USER" },
      params: { paymentId: "pay_1" },
    });

    const middleware = requireOwnership((r) => "user_123");
    await middleware(req, res, next);

    assert.equal(req._error, undefined, "Owner should be allowed");
  });

  test("Ownership Middleware: rejects non-owner with 403 (IDOR prevention)", async () => {
    const { req, res, next } = createMockReqRes({
      user: { id: "attacker_999", role: "USER" },
      params: { paymentId: "victim_payment" },
    });

    const middleware = requireOwnership((r) => "victim_owner_123");
    await middleware(req, res, next);

    assert.ok(req._error, "Attacker accessing another user's resource must be blocked");
    assert.equal(req._error.statusCode, 403);
    assert.equal(req._error.errorCode, "AUTHORIZATION_ERROR");
  });

  test("Ownership Middleware: allows ADMIN even if not resource owner", async () => {
    const { req, res, next } = createMockReqRes({
      user: { id: "admin_superuser", role: "ADMIN" },
    });

    const middleware = requireOwnership((r) => "normal_user_id");
    await middleware(req, res, next);

    assert.equal(req._error, undefined, "Admin bypass for management must succeed");
  });

  test("Payment Service IDOR: prevents user from reading another user's payment", async () => {
    // Stub payment repository to return payment belonging to 'victim_user'
    const originalFindById = paymentRepository.findById;
    paymentRepository.findById = async (id) => ({
      id: "pay_test_1",
      userId: "victim_user",
      orderId: "ord_1",
      gateway: "STRIPE",
      amount: 1000,
      currency: "INR",
      status: "SUCCESS",
      order: { orderNumber: "ORD-1" },
    });

    try {
      // 1. Owner accesses payment -> succeeds
      const ownerResult = await paymentService.getPayment("pay_test_1", "victim_user", "USER");
      assert.equal(ownerResult.paymentId, "pay_test_1");

      // 2. Attacker accesses payment -> 403 Forbidden
      await assert.rejects(
        async () => {
          await paymentService.getPayment("pay_test_1", "attacker_user", "USER");
        },
        (err) => {
          assert.equal(err.statusCode, 403);
          assert.equal(err.errorCode, "AUTHORIZATION_ERROR");
          return true;
        }
      );

      // 3. Admin accesses payment -> succeeds
      const adminResult = await paymentService.getPayment("pay_test_1", "admin_user", "ADMIN");
      assert.equal(adminResult.paymentId, "pay_test_1");
    } finally {
      paymentRepository.findById = originalFindById;
    }
  });

  test("Refund Service IDOR: prevents user from reading or creating another user's refund", async () => {
    const originalFindById = refundRepository.findById;
    const originalPaymentFindById = paymentRepository.findById;

    refundRepository.findById = async (id) => ({
      id: "ref_test_1",
      refundNumber: "REF-101",
      paymentId: "pay_victim_1",
      amount: 500,
      status: "SUCCEEDED",
      payment: {
        id: "pay_victim_1",
        userId: "victim_user",
      },
    });

    paymentRepository.findById = async (id) => ({
      id: "pay_victim_1",
      userId: "victim_user",
      status: "SUCCESS",
      amount: 1000,
      paymentIntentId: "pi_victim_1",
    });

    try {
      // 1. Owner accesses own refund -> succeeds
      const ownerResult = await refundService.getRefund("ref_test_1", "victim_user", "USER");
      assert.equal(ownerResult.id, "ref_test_1");

      // 2. Attacker accesses victim's refund -> 403 Forbidden
      await assert.rejects(
        async () => {
          await refundService.getRefund("ref_test_1", "attacker_user", "USER");
        },
        (err) => {
          assert.equal(err.statusCode, 403);
          assert.equal(err.errorCode, "AUTHORIZATION_ERROR");
          return true;
        }
      );

      // 3. Attacker tries to refund victim's payment -> 403 Forbidden
      await assert.rejects(
        async () => {
          await refundService.createRefund({ paymentId: "pay_victim_1", amount: 100 }, "attacker_user", "USER");
        },
        (err) => {
          assert.equal(err.statusCode, 403);
          assert.equal(err.errorCode, "AUTHORIZATION_ERROR");
          return true;
        }
      );

      // 4. Admin accesses victim's refund -> succeeds
      const adminResult = await refundService.getRefund("ref_test_1", "admin_user", "ADMIN");
      assert.equal(adminResult.id, "ref_test_1");
    } finally {
      refundRepository.findById = originalFindById;
      paymentRepository.findById = originalPaymentFindById;
    }
  });

  test("Invoice Service IDOR: prevents user from reading or creating another user's invoice", async () => {
    const originalInvoiceFindById = invoiceRepository.findById;
    const originalInvoiceFindByOrderId = invoiceRepository.findByOrderId;
    const originalOrderFindById = orderRepository.findById;

    invoiceRepository.findById = async (id) => ({
      id: "inv_test_1",
      invoiceNumber: "INV-101",
      orderId: "ord_victim_1",
      order: {
        id: "ord_victim_1",
        userId: "victim_user",
      },
    });

    invoiceRepository.findByOrderId = async (orderId) => ({
      id: "inv_test_1",
      invoiceNumber: "INV-101",
      orderId,
      order: {
        id: orderId,
        userId: "victim_user",
      },
    });

    orderRepository.findById = async (id) => ({
      id: "ord_victim_1",
      orderNumber: "ORD-V1",
      userId: "victim_user",
      payment: { id: "pay_1", status: "SUCCESS" },
    });

    try {
      // 1. Owner accesses own invoice -> succeeds
      const ownerResult = await invoiceService.getInvoice("inv_test_1", "victim_user", "USER");
      assert.equal(ownerResult.id, "inv_test_1");

      // 2. Attacker accesses victim's invoice -> 403 Forbidden
      await assert.rejects(
        async () => {
          await invoiceService.getInvoice("inv_test_1", "attacker_user", "USER");
        },
        (err) => {
          assert.equal(err.statusCode, 403);
          assert.equal(err.errorCode, "AUTHORIZATION_ERROR");
          return true;
        }
      );

      // 3. Attacker accesses victim's order invoice -> 403 Forbidden
      await assert.rejects(
        async () => {
          await invoiceService.getOrderInvoice("ord_victim_1", "attacker_user", "USER");
        },
        (err) => {
          assert.equal(err.statusCode, 403);
          assert.equal(err.errorCode, "AUTHORIZATION_ERROR");
          return true;
        }
      );

      // 4. Admin accesses victim's invoice -> succeeds
      const adminResult = await invoiceService.getInvoice("inv_test_1", "admin_user", "ADMIN");
      assert.equal(adminResult.id, "inv_test_1");
    } finally {
      invoiceRepository.findById = originalInvoiceFindById;
      invoiceRepository.findByOrderId = originalInvoiceFindByOrderId;
      orderRepository.findById = originalOrderFindById;
    }
  });
});
