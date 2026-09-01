import prisma from "../config/prisma.js";
import reconciliationRepository from "../repositories/reconciliation.repository.js";
import gatewayResolver from "../integrations/payment/gatewayResolver.js";
import auditService from "./audit.service.js";
import ApiError from "../utils/ApiError.js";
import logger from "../config/logger.js";

class ReconciliationService {
  /**
   * Run automated reconciliation for payments in a given time window
   */
  async runReconciliation({ gateway = "STRIPE", lookbackDays = 1, limit = 100 }) {
    const gatewayAdapter = gatewayResolver.resolve(gateway);
    const startDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    // Fetch payments within the lookback window
    const payments = await prisma.payment.findMany({
      where: {
        gateway: gateway.toUpperCase(),
        createdAt: { gte: startDate },
      },
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    let totalChecked = 0;
    let matchedCount = 0;
    const mismatches = [];

    for (const payment of payments) {
      totalChecked++;
      const gatewayRef = payment.gatewayPaymentId || payment.paymentIntentId || payment.gatewayOrderId;

      if (!gatewayRef) {
        // Missing gateway reference on internal record
        const record = await reconciliationRepository.create({
          gateway: payment.gateway,
          paymentId: payment.id,
          gatewayReference: null,
          internalStatus: payment.status,
          gatewayStatus: null,
          internalAmount: payment.amount,
          gatewayAmount: null,
          currency: payment.currency,
          differenceType: "MISSING_GATEWAY_PAYMENT",
          status: "MISMATCH",
          metadata: { note: "Internal payment record has no gateway transaction reference." },
        });
        mismatches.push(record);
        continue;
      }

      try {
        const gatewayData = await gatewayAdapter.getPayment(gatewayRef);
        const internalAmount = Number(payment.amount);
        const gatewayAmount = Number(gatewayData.amount);

        // Check 1: Status Mismatch
        const statusMatches = payment.status === gatewayData.status;

        // Check 2: Amount Mismatch (precision comparison)
        const amountMatches = Math.abs(internalAmount - gatewayAmount) < 0.01;

        // Check 3: Currency Mismatch
        const currencyMatches = (payment.currency || "INR").toUpperCase() === (gatewayData.currency || "INR").toUpperCase();

        if (statusMatches && amountMatches && currencyMatches) {
          matchedCount++;
        } else {
          let differenceType = "STATUS_MISMATCH";
          if (!amountMatches) differenceType = "AMOUNT_MISMATCH";
          else if (!currencyMatches) differenceType = "CURRENCY_MISMATCH";

          const record = await reconciliationRepository.create({
            gateway: payment.gateway,
            paymentId: payment.id,
            gatewayReference: gatewayRef,
            internalStatus: payment.status,
            gatewayStatus: gatewayData.status,
            internalAmount: payment.amount,
            gatewayAmount: gatewayData.amount,
            currency: payment.currency,
            differenceType,
            status: "MISMATCH",
            metadata: {
              internalStatus: payment.status,
              gatewayStatus: gatewayData.status,
              internalAmount,
              gatewayAmount,
            },
          });

          mismatches.push(record);

          logger.warn({
            event: "RECONCILIATION_MISMATCH_DETECTED",
            paymentId: payment.id,
            differenceType,
            internalStatus: payment.status,
            gatewayStatus: gatewayData.status,
          });
        }
      } catch (err) {
        logger.error({
          event: "RECONCILIATION_GATEWAY_QUERY_FAILED",
          paymentId: payment.id,
          gatewayRef,
          error: err.message,
        });

        const record = await reconciliationRepository.create({
          gateway: payment.gateway,
          paymentId: payment.id,
          gatewayReference: gatewayRef,
          internalStatus: payment.status,
          gatewayStatus: "QUERY_FAILED",
          internalAmount: payment.amount,
          gatewayAmount: null,
          currency: payment.currency,
          differenceType: "MISSING_GATEWAY_PAYMENT",
          status: "MANUAL_REVIEW",
          metadata: { queryError: err.message },
        });
        mismatches.push(record);
      }
    }

    logger.info({
      event: "RECONCILIATION_RUN_COMPLETED",
      gateway,
      totalChecked,
      matchedCount,
      mismatchCount: mismatches.length,
    });

    return {
      gateway,
      totalChecked,
      matchedCount,
      mismatchCount: mismatches.length,
      mismatches,
    };
  }

  /**
   * Admin resolution of a reconciliation discrepancy
   */
  async resolveDiscrepancy(id, { resolution, resolvedBy, action = "MARK_RESOLVED" }) {
    if (!resolution || typeof resolution !== "string" || resolution.trim().length < 5) {
      throw ApiError.badRequest(
        "A detailed resolution justification is required (minimum 5 characters).",
        [],
        "RESOLUTION_REASON_REQUIRED"
      );
    }

    const record = await reconciliationRepository.findById(id);
    if (!record) {
      throw ApiError.notFound("Reconciliation record not found.", [], "RESOURCE_NOT_FOUND");
    }

    const updated = await reconciliationRepository.resolve(id, {
      resolution: resolution.trim(),
      resolvedBy: resolvedBy || "ADMIN",
    });

    // Record immutable audit trail
    await auditService.log({
      actorUserId: resolvedBy,
      action: "RECONCILIATION_RESOLVED",
      entityType: "RECONCILIATION",
      entityId: id,
      metadata: {
        paymentId: record.paymentId,
        differenceType: record.differenceType,
        resolution: resolution.trim(),
        action,
      },
    });

    return updated;
  }

  async getReconciliationRecords(filter = {}) {
    const { page = 1, limit = 50, gateway, status, differenceType, startDate, endDate } = filter;
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      reconciliationRepository.findAll({ skip, take: limit, gateway, status, differenceType, startDate, endDate }),
      reconciliationRepository.countAll({ gateway, status, differenceType, startDate, endDate }),
    ]);

    return {
      records,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getRecordById(id) {
    const record = await reconciliationRepository.findById(id);
    if (!record) {
      throw ApiError.notFound("Reconciliation record not found.", [], "RESOURCE_NOT_FOUND");
    }
    return record;
  }
}

export default new ReconciliationService();
