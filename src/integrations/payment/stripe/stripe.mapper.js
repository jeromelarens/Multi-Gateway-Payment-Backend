import ApiError from "../../../utils/ApiError.js";

class StripeMapper {
  /**
   * Map Stripe PaymentIntent status to unified application status
   */
  mapPaymentStatus(stripeStatus) {
    const statusMap = {
      succeeded: "SUCCESS",
      processing: "PENDING",
      requires_payment_method: "PENDING",
      requires_confirmation: "PENDING",
      requires_action: "PENDING",
      requires_capture: "PENDING",
      canceled: "FAILED",
    };

    return statusMap[stripeStatus?.toLowerCase()] || "PENDING";
  }

  /**
   * Map Stripe PaymentIntent to unified payment creation response
   */
  toUnifiedPaymentResponse(paymentIntent, orderId, orderNumber) {
    return {
      orderId,
      orderNumber,
      gateway: "STRIPE",
      gatewayOrderId: null,
      gatewayPaymentId: paymentIntent.id,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      status: this.mapPaymentStatus(paymentIntent.status),
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency.toUpperCase(),
      requiresAction: paymentIntent.status === "requires_action",
    };
  }

  /**
   * Map Stripe Refund to unified refund response
   */
  toUnifiedRefundResponse(stripeRefund) {
    const refundStatusMap = {
      succeeded: "SUCCEEDED",
      pending: "PENDING",
      failed: "FAILED",
      canceled: "CANCELED",
    };

    return {
      gatewayRefundId: stripeRefund.id,
      status: refundStatusMap[stripeRefund.status] || "PENDING",
      amount: stripeRefund.amount ? stripeRefund.amount / 100 : null,
      currency: stripeRefund.currency ? stripeRefund.currency.toUpperCase() : "INR",
    };
  }

  /**
   * Map Stripe SDK errors to safe normalized application errors
   */
  toGatewayError(error) {
    const message = error.message || "Stripe payment gateway error.";
    const statusCode = error.statusCode || 502;

    return new ApiError(
      statusCode >= 400 && statusCode < 500 ? statusCode : 502,
      message,
      error.raw ? [error.raw.message || error.message] : [error.message],
      "PAYMENT_GATEWAY_ERROR"
    );
  }
}

export default new StripeMapper();
