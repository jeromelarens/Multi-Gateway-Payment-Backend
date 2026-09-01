import PaymentGateway from "../paymentGateway.interface.js";
import stripeCustomer from "../../stripe/customer.js";
import stripePaymentIntent from "../../stripe/paymentIntent.js";
import stripeRefund from "../../stripe/refund.js";
import stripeMapper from "./stripe.mapper.js";
import stripeWebhookHandler from "./stripe.webhook.js";
import { toSmallestUnit } from "../../../utils/currency.js";
import logger from "../../../config/logger.js";

class StripeGateway extends PaymentGateway {
  get name() {
    return "STRIPE";
  }

  async createCustomer(customerData) {
    try {
      const customer = await stripeCustomer.createCustomer({
        name: customerData.name,
        email: customerData.email,
        phone: customerData.phone,
        metadata: customerData.metadata || {},
      });

      return { customerId: customer.id };
    } catch (error) {
      logger.error({
        event: "STRIPE_CREATE_CUSTOMER_ERROR",
        error: error.message,
      });
      throw stripeMapper.toGatewayError(error);
    }
  }

  async createPayment(paymentData) {
    const {
      amount,
      currency = "INR",
      customer,
      description = "",
      orderId,
      orderNumber,
      metadata = {},
    } = paymentData;

    try {
      const paymentIntent = await stripePaymentIntent.create({
        amount: toSmallestUnit(amount),
        currency: currency.toLowerCase(),
        customer: customer?.stripeCustomerId || customer?.id,
        receipt_email: customer?.email,
        description,
        metadata: {
          ...metadata,
          orderId,
          orderNumber,
          userId: customer?.id || metadata?.userId,
        },
      });

      logger.info({
        event: "STRIPE_PAYMENT_INTENT_CREATED",
        paymentIntentId: paymentIntent.id,
        orderNumber,
      });

      return stripeMapper.toUnifiedPaymentResponse(paymentIntent, orderId, orderNumber);
    } catch (error) {
      logger.error({
        event: "STRIPE_CREATE_PAYMENT_ERROR",
        orderNumber,
        error: error.message,
      });
      throw stripeMapper.toGatewayError(error);
    }
  }

  async getPayment(gatewayPaymentId) {
    try {
      const intent = await stripePaymentIntent.retrieve(gatewayPaymentId);
      return {
        gatewayPaymentId: intent.id,
        status: stripeMapper.mapPaymentStatus(intent.status),
        amount: intent.amount / 100,
        currency: intent.currency.toUpperCase(),
        raw: intent,
      };
    } catch (error) {
      logger.error({
        event: "STRIPE_GET_PAYMENT_ERROR",
        gatewayPaymentId,
        error: error.message,
      });
      throw stripeMapper.toGatewayError(error);
    }
  }

  async cancelPayment(gatewayPaymentId) {
    try {
      const intent = await stripePaymentIntent.retrieve(gatewayPaymentId);
      if (intent.status !== "succeeded" && intent.status !== "canceled") {
        const cancelled = await stripePaymentIntent.cancel(gatewayPaymentId);
        return { success: true, status: cancelled.status };
      }
      return { success: false, status: intent.status };
    } catch (error) {
      logger.error({
        event: "STRIPE_CANCEL_PAYMENT_ERROR",
        gatewayPaymentId,
        error: error.message,
      });
      throw stripeMapper.toGatewayError(error);
    }
  }

  async refundPayment(refundData) {
    const { payment, amount, reason, idempotencyKey } = refundData;

    try {
      const stripeOptions = {};
      if (idempotencyKey) {
        stripeOptions.idempotencyKey = idempotencyKey;
      }

      const refund = await stripeRefund.create(
        {
          paymentIntent: payment.paymentIntentId || payment.gatewayPaymentId,
          amount: amount ? toSmallestUnit(amount) : undefined,
          reason,
          metadata: {
            paymentId: payment.id,
            orderId: payment.orderId,
          },
        },
        stripeOptions
      );

      return stripeMapper.toUnifiedRefundResponse(refund);
    } catch (error) {
      logger.error({
        event: "STRIPE_REFUND_ERROR",
        paymentId: payment.id,
        error: error.message,
      });
      throw stripeMapper.toGatewayError(error);
    }
  }

  verifyWebhook(payload, headers) {
    const signature = headers["stripe-signature"];
    return stripeWebhookHandler.verify(payload, signature);
  }
}

export default new StripeGateway();
