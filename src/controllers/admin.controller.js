import prisma from "../config/prisma.js";
import reconciliationService from "../services/reconciliation.service.js";
import auditService from "../services/audit.service.js";
import { processWebhookJob } from "../workers/webhook.worker.js";
import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/apiResponse.js";
import ApiError from "../utils/ApiError.js";

class AdminController {
  /**
   * GET /api/v1/admin/payments
   */
  getPayments = asyncHandler(async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const where = {};
    if (req.query.gateway) where.gateway = req.query.gateway.toUpperCase();
    if (req.query.status) where.status = req.query.status.toUpperCase();
    if (req.query.userId) where.userId = req.query.userId;

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, email: true, fullName: true } },
          order: { select: { orderNumber: true } },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return ApiResponse.success(
      res,
      "Payments retrieved successfully.",
      {
        payments,
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
      },
      200
    );
  });

  /**
   * GET /api/v1/admin/payments/:id
   */
  getPaymentById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        user: true,
        order: true,
        refunds: true,
        transactionLedgers: true,
        reconciliationRecords: true,
      },
    });

    if (!payment) {
      throw ApiError.notFound("Payment not found.", [], "RESOURCE_NOT_FOUND");
    }

    return ApiResponse.success(res, "Payment details retrieved successfully.", payment, 200);
  });

  /**
   * GET /api/v1/admin/webhooks
   */
  getWebhooks = asyncHandler(async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const where = {};
    if (req.query.status) where.status = req.query.status.toUpperCase();
    if (req.query.gateway) where.gateway = req.query.gateway.toUpperCase();

    const [events, total] = await Promise.all([
      prisma.webhookEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.webhookEvent.count({ where }),
    ]);

    return ApiResponse.success(
      res,
      "Webhook events retrieved successfully.",
      {
        events,
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
      },
      200
    );
  });

  /**
   * POST /api/v1/admin/webhooks/:eventId/reprocess
   */
  reprocessWebhook = asyncHandler(async (req, res) => {
    const { eventId } = req.params;

    const webhookRecord = await prisma.webhookEvent.findFirst({
      where: {
        OR: [{ id: eventId }, { eventId }],
      },
    });

    if (!webhookRecord) {
      throw ApiError.notFound("Webhook event not found.", [], "RESOURCE_NOT_FOUND");
    }

    // Audit the administrative manual reprocess action
    await auditService.log({
      actorUserId: req.user?.id,
      action: "WEBHOOK_REPROCESSED",
      entityType: "WEBHOOK",
      entityId: webhookRecord.id,
      metadata: {
        previousStatus: webhookRecord.status,
        attempts: webhookRecord.attempts,
        gateway: webhookRecord.gateway,
        eventId: webhookRecord.eventId,
      },
    });

    // Execute processing
    const jobMock = {
      id: `manual:${webhookRecord.id}:${Date.now()}`,
      data: {
        webhookEventId: webhookRecord.id,
        gateway: webhookRecord.gateway,
        eventId: webhookRecord.eventId,
        eventType: webhookRecord.eventType,
      },
      attemptsMade: webhookRecord.attempts,
    };

    const result = await processWebhookJob(jobMock);

    const updated = await prisma.webhookEvent.findUnique({
      where: { id: webhookRecord.id },
    });

    return ApiResponse.success(
      res,
      "Webhook event reprocessed successfully.",
      { webhook: updated, result },
      200
    );
  });

  /**
   * GET /api/v1/admin/reconciliation
   */
  getReconciliation = asyncHandler(async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const filter = {
      page,
      limit,
      gateway: req.query.gateway?.toUpperCase(),
      status: req.query.status?.toUpperCase(),
      differenceType: req.query.differenceType?.toUpperCase(),
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    };

    const result = await reconciliationService.getReconciliationRecords(filter);
    return ApiResponse.success(res, "Reconciliation records retrieved successfully.", result, 200);
  });

  /**
   * POST /api/v1/admin/reconciliation/:id/resolve
   */
  resolveReconciliation = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { resolution, action } = req.body;

    const resolved = await reconciliationService.resolveDiscrepancy(id, {
      resolution,
      action,
      resolvedBy: req.user?.id || "ADMIN",
    });

    return ApiResponse.success(res, "Reconciliation discrepancy resolved successfully.", resolved, 200);
  });

  /**
   * GET /api/v1/admin/audit-logs
   */
  getAuditLogs = asyncHandler(async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;

    const filter = {
      page,
      limit,
      entityType: req.query.entityType?.toUpperCase(),
      action: req.query.action?.toUpperCase(),
      actorUserId: req.query.actorUserId,
    };

    const result = await auditService.getAuditLogs(filter);
    return ApiResponse.success(res, "Audit logs retrieved successfully.", result, 200);
  });

  /**
   * GET /api/v1/admin/metrics
   */
  getMetrics = asyncHandler(async (req, res) => {
    const [
      totalPayments,
      successfulPayments,
      failedPayments,
      pendingPayments,
      refundedPayments,
      stripeCount,
      cashfreeCount,
      deadLetterWebhooks,
      openMismatches,
    ] = await Promise.all([
      prisma.payment.count(),
      prisma.payment.count({ where: { status: "SUCCESS" } }),
      prisma.payment.count({ where: { status: "FAILED" } }),
      prisma.payment.count({ where: { status: "PENDING" } }),
      prisma.payment.count({ where: { status: { in: ["REFUNDED", "PARTIALLY_REFUNDED"] } } }),
      prisma.payment.count({ where: { gateway: "STRIPE" } }),
      prisma.payment.count({ where: { gateway: "CASHFREE" } }),
      prisma.webhookEvent.count({ where: { status: "DEAD_LETTER" } }),
      prisma.reconciliationRecord.count({ where: { status: "MISMATCH" } }),
    ]);

    const successRate = totalPayments > 0 ? ((successfulPayments / totalPayments) * 100).toFixed(2) : "0.00";
    const failureRate = totalPayments > 0 ? ((failedPayments / totalPayments) * 100).toFixed(2) : "0.00";

    return ApiResponse.success(
      res,
      "Operational metrics retrieved successfully.",
      {
        payments: {
          total: totalPayments,
          successful: successfulPayments,
          failed: failedPayments,
          pending: pendingPayments,
          refunded: refundedPayments,
          successRatePercent: Number(successRate),
          failureRatePercent: Number(failureRate),
        },
        gatewayDistribution: {
          stripe: stripeCount,
          cashfree: cashfreeCount,
        },
        reliability: {
          deadLetterWebhooks,
          openReconciliationMismatches: openMismatches,
        },
      },
      200
    );
  });
}

export default new AdminController();
