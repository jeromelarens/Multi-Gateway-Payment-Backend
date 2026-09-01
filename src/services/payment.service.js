import crypto from "crypto";
import { Prisma } from "@prisma/client";

import prisma from "../config/prisma.js";
import logger from "../config/logger.js";
import ApiError from "../utils/ApiError.js";

import orderRepository from "../repositories/order.repository.js";
import paymentRepository from "../repositories/payment.repository.js";
import userRepository from "../repositories/user.repository.js";

import gatewayResolver from "../integrations/payment/gatewayResolver.js";
import notificationService from "./notification.service.js";

class PaymentService {
  /**
   * Unified create payment method across any supported gateway
   */
  async createPayment(data) {
    const {
      userId,
      amount,
      currency = "INR",
      gateway = "STRIPE",
      description = "Order payment",
      returnUrl,
      notifyUrl,
      metadata = {},
    } = data;

    // 1. Amount validation
    if (
      amount === undefined ||
      amount === null ||
      Number.isNaN(Number(amount)) ||
      Number(amount) <= 0
    ) {
      throw ApiError.badRequest(
        "Payment amount must be greater than zero.",
        [],
        "INVALID_AMOUNT"
      );
    }

    const numAmount = Number(amount);
    const decimalPlaces = (numAmount.toString().split(".")[1] || "").length;
    if (decimalPlaces > 2) {
      throw ApiError.badRequest(
        "Payment amount cannot exceed 2 decimal places.",
        [],
        "INVALID_AMOUNT_PRECISION"
      );
    }

    // 2. Currency validation (system supports INR)
    const normalizedCurrency = (currency || "INR").trim().toUpperCase();
    if (normalizedCurrency !== "INR") {
      throw ApiError.badRequest(
        `Unsupported currency: '${currency}'. Only 'INR' is supported in this configuration.`,
        [],
        "UNSUPPORTED_CURRENCY"
      );
    }

    // 3. User verification
    const user = await userRepository.findById(userId);
    if (!user) {
      throw ApiError.notFound("User not found.", [], "RESOURCE_NOT_FOUND");
    }

    // 4. Resolve gateway adapter
    const gatewayAdapter = gatewayResolver.resolve(gateway);
    const normalizedGateway = gatewayAdapter.name;

    // 5. Generate internal order identifiers
    const orderNumber = `ORD-${Date.now()}-${crypto.randomInt(1000, 9999)}`;

    // 6. Handle customer preparation if gateway requires it (e.g. Stripe customer)
    let customerRef = { ...user };
    if (normalizedGateway === "STRIPE" && !user.stripeCustomerId) {
      try {
        const customerResult = await gatewayAdapter.createCustomer({
          name: user.fullName,
          email: user.email,
          phone: user.phone,
          metadata: { userId: user.id },
        });

        if (customerResult?.customerId) {
          customerRef.stripeCustomerId = customerResult.customerId;
          await userRepository.updateStripeCustomer(user.id, customerResult.customerId);
        }
      } catch (custErr) {
        logger.warn({
          event: "GATEWAY_CUSTOMER_CREATION_FAILED",
          gateway: normalizedGateway,
          userId: user.id,
          error: custErr.message,
        });
      }
    }

    // 7. Invoke Payment Gateway
    let gatewayResponse = null;
    try {
      gatewayResponse = await gatewayAdapter.createPayment({
        amount: numAmount,
        currency: normalizedCurrency,
        customer: customerRef,
        description,
        orderId: null,
        orderNumber,
        returnUrl,
        notifyUrl,
        metadata: {
          ...metadata,
          userId: user.id,
        },
      });
    } catch (gatewayErr) {
      logger.error({
        event: "GATEWAY_PAYMENT_CREATION_FAILED",
        gateway: normalizedGateway,
        orderNumber,
        error: gatewayErr.message,
      });
      throw gatewayErr;
    }

    // 8. Persist Order and Payment in Database Transaction
    let result = null;
    try {
      result = await prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            orderNumber,
            amount: new Prisma.Decimal(numAmount),
            currency: normalizedCurrency,
            userId,
            status: "PENDING",
          },
        });

        const payment = await tx.payment.create({
          data: {
            gateway: normalizedGateway,
            paymentIntentId: gatewayResponse.paymentIntentId || null,
            gatewayOrderId: gatewayResponse.gatewayOrderId || null,
            gatewayPaymentId: gatewayResponse.gatewayPaymentId || null,
            clientSecret: gatewayResponse.clientSecret || null,
            amount: new Prisma.Decimal(numAmount),
            currency: normalizedCurrency,
            orderId: order.id,
            userId,
            status: "PENDING",
            metadata: metadata || {},
          },
        });

        return { order, payment };
      });
    } catch (dbError) {
      // 9. Distributed failure handling & compensation
      logger.error({
        event: "DATABASE_TRANSACTION_FAILED_AFTER_GATEWAY_CREATION",
        gateway: normalizedGateway,
        gatewayPaymentId: gatewayResponse?.gatewayPaymentId,
        gatewayOrderId: gatewayResponse?.gatewayOrderId,
        error: dbError.message,
      });

      // Attempt compensation: cancel gateway order/payment
      try {
        const cleanupId = gatewayResponse?.gatewayPaymentId || gatewayResponse?.gatewayOrderId;
        if (cleanupId && gatewayAdapter.cancelPayment) {
          await gatewayAdapter.cancelPayment(cleanupId);
          logger.info({
            event: "ORPHAN_GATEWAY_PAYMENT_CANCELLED",
            gateway: normalizedGateway,
            cleanupId,
          });
        }
      } catch (cleanupError) {
        logger.error({
          event: "ORPHAN_GATEWAY_PAYMENT_CLEANUP_FAILED",
          gateway: normalizedGateway,
          error: cleanupError.message,
        });
      }

      throw ApiError.internal(
        "Failed to record payment transaction in database.",
        [dbError.message],
        "DATABASE_TRANSACTION_FAILED"
      );
    }

    logger.info({
      event: "PAYMENT_TRANSACTION_INITIALIZED",
      paymentId: result.payment.id,
      orderId: result.order.id,
      orderNumber,
      gateway: normalizedGateway,
    });

    return {
      paymentId: result.payment.id,
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      gateway: normalizedGateway,
      status: result.payment.status,
      amount: numAmount,
      currency: normalizedCurrency,
      clientSecret: gatewayResponse.clientSecret || null,
      gatewayOrderId: gatewayResponse.gatewayOrderId || null,
      gatewayPaymentId: gatewayResponse.gatewayPaymentId || null,
      requiresAction: gatewayResponse.requiresAction || false,
    };
  }

  /**
   * Backward-compatible alias for createOrder
   */
  async createOrder(data) {
    return this.createPayment(data);
  }

  /**
   * Retrieve payment by ID with ownership enforcement
   */
  async getPayment(paymentId, authenticatedUserId = null, userRole = "USER") {
    const payment = await paymentRepository.findById(paymentId);

    if (!payment) {
      throw ApiError.notFound("Payment record not found.", [], "RESOURCE_NOT_FOUND");
    }

    // Ownership check: non-admins can only view their own payments
    if (authenticatedUserId && userRole !== "ADMIN" && payment.userId !== authenticatedUserId) {
      throw ApiError.forbidden(
        "Access denied. You do not have permission to view this payment.",
        [],
        "AUTHORIZATION_ERROR"
      );
    }

    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      orderNumber: payment.order?.orderNumber,
      gateway: payment.gateway,
      amount: Number(payment.amount),
      currency: payment.currency,
      status: payment.status,
      method: payment.method,
      gatewayOrderId: payment.gatewayOrderId,
      gatewayPaymentId: payment.gatewayPaymentId,
      paymentIntentId: payment.paymentIntentId,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      refunds: payment.refunds || [],
    };
  }

  /**
   * Get paginated payment history for a user
   */
  async getUserPayments(userId, { page = 1, limit = 20 } = {}) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw ApiError.notFound("User not found.", [], "RESOURCE_NOT_FOUND");
    }

    const skip = (page - 1) * limit;
    const [payments, total] = await Promise.all([
      paymentRepository.getUserPayments(userId, { skip, take: limit }),
      paymentRepository.countUserPayments(userId),
    ]);

    return {
      payments: payments.map((p) => ({
        paymentId: p.id,
        orderId: p.orderId,
        orderNumber: p.order?.orderNumber,
        gateway: p.gateway,
        amount: Number(p.amount),
        currency: p.currency,
        status: p.status,
        method: p.method,
        createdAt: p.createdAt,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Cancel an existing payment
   */
  async cancelPayment(paymentIntentId) {
    const payment = await paymentRepository.findByPaymentIntent(paymentIntentId);

    if (!payment) {
      throw ApiError.notFound("Payment not found.", [], "RESOURCE_NOT_FOUND");
    }

    const gatewayAdapter = gatewayResolver.resolve(payment.gateway || "STRIPE");
    await gatewayAdapter.cancelPayment(paymentIntentId);

    await paymentRepository.updateByPaymentIntent(paymentIntentId, {
      status: "FAILED",
    });

    await orderRepository.updateStatus(payment.orderId, "CANCELLED");

    logger.info({
      event: "PAYMENT_CANCELLED",
      paymentIntentId,
      orderId: payment.orderId,
    });

    return {
      success: true,
      message: "Payment cancelled successfully.",
    };
  }

  /**
   * Confirm successful payment
   */
  async confirmPayment(
    paymentIntentId,
    stripeChargeId = null,
    gatewayTransactionId = null,
    paymentMethodId = null
  ) {
    const payment = await paymentRepository.findByPaymentIntent(paymentIntentId);

    if (!payment) {
      throw ApiError.notFound("Payment not found.", [], "RESOURCE_NOT_FOUND");
    }

    await paymentRepository.updateByPaymentIntent(paymentIntentId, {
      status: "SUCCESS",
      stripeChargeId,
      gatewayTransactionId,
      paymentMethodId,
    });

    await orderRepository.updateStatus(payment.orderId, "PAID");

    logger.info({
      event: "PAYMENT_CONFIRMED",
      paymentIntentId,
      paymentId: payment.id,
      orderId: payment.orderId,
    });

    const updatedPayment = await paymentRepository.findByPaymentIntent(paymentIntentId);

    if (updatedPayment) {
      try {
        await notificationService.sendPaymentSuccess({
          user: updatedPayment.user,
          order: updatedPayment.order,
          payment: updatedPayment,
        });
      } catch (error) {
        logger.error({
          event: "PAYMENT_SUCCESS_NOTIFICATION_ERROR",
          paymentId: updatedPayment.id,
          error: error.message,
        });
      }
    }

    return {
      success: true,
      message: "Payment confirmed successfully.",
      paymentId: updatedPayment?.id,
      orderId: updatedPayment?.orderId,
    };
  }

  /**
   * Mark payment as failed
   */
  async markPaymentFailed(
    paymentIntentId,
    failureReason = "Unknown payment failure"
  ) {
    const payment = await paymentRepository.findByPaymentIntent(paymentIntentId);

    if (!payment) {
      throw ApiError.notFound("Payment not found.", [], "RESOURCE_NOT_FOUND");
    }

    await paymentRepository.updateByPaymentIntent(paymentIntentId, {
      status: "FAILED",
      failureReason,
    });

    await orderRepository.updateStatus(payment.orderId, "FAILED");

    logger.warn({
      event: "PAYMENT_FAILED",
      paymentIntentId,
      orderId: payment.orderId,
      userId: payment.userId,
      failureReason,
    });

    const updatedPayment = await paymentRepository.findByPaymentIntent(paymentIntentId);

    return {
      success: true,
      message: "Payment marked as failed.",
      paymentId: updatedPayment?.id,
      orderId: updatedPayment?.orderId,
    };
  }
}

export default new PaymentService();