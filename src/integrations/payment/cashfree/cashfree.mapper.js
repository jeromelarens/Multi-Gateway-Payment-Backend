import ApiError from "../../../utils/ApiError.js";

class CashfreeMapper {
  /**
   * Map Cashfree Order Status to unified payment status
   */
  mapPaymentStatus(cashfreeStatus) {
    const statusMap = {
      PAID: "SUCCESS",
      ACTIVE: "PENDING",
      EXPIRED: "FAILED",
      TERMINATED: "FAILED",
    };

    return statusMap[cashfreeStatus?.toUpperCase()] || "PENDING";
  }

  /**
   * Map Cashfree Refund Status to unified refund status
   */
  mapRefundStatus(cashfreeRefundStatus) {
    const statusMap = {
      SUCCESS: "SUCCEEDED",
      PENDING: "PENDING",
      CANCELLED: "CANCELED",
      FAILED: "FAILED",
    };

    return statusMap[cashfreeRefundStatus?.toUpperCase()] || "PENDING";
  }

  /**
   * Map Cashfree order response to unified payment response
   */
  toUnifiedPaymentResponse(cfResponse, orderId, orderNumber) {
    return {
      orderId,
      orderNumber,
      gateway: "CASHFREE",
      gatewayOrderId: String(cfResponse.cf_order_id || cfResponse.order_id),
      gatewayPaymentId: cfResponse.payment_session_id || null,
      paymentIntentId: null,
      clientSecret: cfResponse.payment_session_id || null,
      paymentSessionId: cfResponse.payment_session_id || null,
      status: this.mapPaymentStatus(cfResponse.order_status),
      amount: Number(cfResponse.order_amount),
      currency: (cfResponse.order_currency || "INR").toUpperCase(),
      requiresAction: cfResponse.order_status === "ACTIVE",
    };
  }

  /**
   * Map Cashfree refund response to unified refund response
   */
  toUnifiedRefundResponse(cfRefund) {
    return {
      gatewayRefundId: String(cfRefund.cf_refund_id || cfRefund.refund_id),
      status: this.mapRefundStatus(cfRefund.refund_status),
      amount: Number(cfRefund.refund_amount),
      currency: (cfRefund.refund_currency || "INR").toUpperCase(),
    };
  }

  /**
   * Map Cashfree HTTP/API errors to safe ApiError
   */
  toGatewayError(error, responseBody = null) {
    let message = error.message || "Cashfree payment gateway error.";
    let details = [];

    if (responseBody) {
      if (responseBody.message) {
        message = `Cashfree: ${responseBody.message}`;
      }
      if (responseBody.code) {
        details.push(responseBody.code);
      }
    }

    const statusCode = error.statusCode || 502;

    return new ApiError(
      statusCode >= 400 && statusCode < 500 ? statusCode : 502,
      message,
      details.length ? details : [message],
      "PAYMENT_GATEWAY_ERROR"
    );
  }
}

export default new CashfreeMapper();
