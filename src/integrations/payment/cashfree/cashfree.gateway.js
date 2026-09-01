import PaymentGateway from "../paymentGateway.interface.js";
import cashfreeMapper from "./cashfree.mapper.js";
import cashfreeWebhookHandler from "./cashfree.webhook.js";
import env from "../../../config/env.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";

class CashfreeGateway extends PaymentGateway {
  get name() {
    return "CASHFREE";
  }

  /**
   * Get Cashfree API base URL based on environment
   */
  _getBaseUrl() {
    return env.cashfreeEnvironment === "production"
      ? "https://api.cashfree.com/pg"
      : "https://sandbox.cashfree.com/pg";
  }

  /**
   * Common request headers for Cashfree API
   */
  _getHeaders() {
    if (!env.cashfreeAppId || !env.cashfreeSecretKey) {
      throw ApiError.gatewayError(
        "Cashfree credentials (CASHFREE_APP_ID or CASHFREE_SECRET_KEY) are not configured."
      );
    }

    return {
      "Content-Type": "application/json",
      "x-client-id": env.cashfreeAppId,
      "x-client-secret": env.cashfreeSecretKey,
      "x-api-version": env.cashfreeApiVersion || "2023-08-01",
    };
  }

  /**
   * Generic HTTP request helper with error handling
   */
  async _request(endpoint, options = {}) {
    const url = `${this._getBaseUrl()}${endpoint}`;
    const headers = { ...this._getHeaders(), ...options.headers };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const responseBody = await response.json().catch(() => null);

      if (!response.ok) {
        const error = new Error(
          responseBody?.message || `Cashfree API returned HTTP ${response.status}`
        );
        error.statusCode = response.status;
        throw cashfreeMapper.toGatewayError(error, responseBody);
      }

      return responseBody;
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error({
        event: "CASHFREE_API_REQUEST_FAILED",
        url,
        error: error.message,
      });
      throw cashfreeMapper.toGatewayError(error);
    }
  }

  async createCustomer(customerData) {
    // Cashfree creates customer automatically during order creation
    return {
      customerId: customerData.id || `CUST_${Date.now()}`,
    };
  }

  async createPayment(paymentData) {
    const {
      amount,
      currency = "INR",
      customer,
      description = "Order payment",
      orderId,
      orderNumber,
      returnUrl,
      notifyUrl,
      metadata = {},
    } = paymentData;

    if (currency.toUpperCase() !== "INR") {
      throw ApiError.badRequest(
        "Cashfree gateway currently only supports INR currency transactions.",
        [],
        "CURRENCY_NOT_SUPPORTED"
      );
    }

    // Cashfree order_id accepts alphanumeric characters and hyphens/underscores
    const cfOrderId = orderNumber || `ORD-${Date.now()}`;

    // Customer details validation
    const customerPhone = customer?.phone || "9999999999";
    const customerId = customer?.id || `user_${Date.now()}`;
    const customerEmail = customer?.email || "customer@example.com";
    const customerName = customer?.fullName || customer?.name || "Customer";

    const payload = {
      order_id: cfOrderId,
      order_amount: Number(Number(amount).toFixed(2)),
      order_currency: "INR",
      customer_details: {
        customer_id: customerId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
      },
      order_note: description.substring(0, 200),
    };

    if (returnUrl || notifyUrl) {
      payload.order_meta = {};
      if (returnUrl) payload.order_meta.return_url = returnUrl;
      if (notifyUrl) payload.order_meta.notify_url = notifyUrl;
    }

    if (metadata && Object.keys(metadata).length > 0) {
      // Cashfree order_tags allows string key-value pairs
      payload.order_tags = Object.entries(metadata).reduce((acc, [k, v]) => {
        acc[k.substring(0, 50)] = String(v).substring(0, 100);
        return acc;
      }, {});
    }

    const response = await this._request("/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    logger.info({
      event: "CASHFREE_ORDER_CREATED",
      orderId,
      cfOrderId: response.cf_order_id,
      orderNumber,
    });

    return cashfreeMapper.toUnifiedPaymentResponse(response, orderId, orderNumber);
  }

  async getPayment(gatewayOrderId) {
    const response = await this._request(`/orders/${encodeURIComponent(gatewayOrderId)}`, {
      method: "GET",
    });

    return {
      gatewayOrderId: String(response.cf_order_id || response.order_id),
      status: cashfreeMapper.mapPaymentStatus(response.order_status),
      amount: Number(response.order_amount),
      currency: response.order_currency?.toUpperCase() || "INR",
      raw: response,
    };
  }

  async cancelPayment(gatewayOrderId) {
    try {
      const response = await this._request(`/orders/${encodeURIComponent(gatewayOrderId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          order_status: "TERMINATED",
        }),
      });

      return {
        success: true,
        status: cashfreeMapper.mapPaymentStatus(response.order_status),
      };
    } catch (error) {
      logger.error({
        event: "CASHFREE_CANCEL_PAYMENT_ERROR",
        gatewayOrderId,
        error: error.message,
      });
      return { success: false, error: error.message };
    }
  }

  async refundPayment(refundData) {
    const { payment, amount, reason, idempotencyKey } = refundData;
    const cfOrderId = payment.gatewayOrderId || payment.order?.orderNumber;

    if (!cfOrderId) {
      throw ApiError.badRequest(
        "Payment is missing Cashfree order identifier.",
        [],
        "MISSING_GATEWAY_IDENTIFIER"
      );
    }

    const refundId = `REF-${Date.now()}`;
    const payload = {
      refund_amount: Number(Number(amount).toFixed(2)),
      refund_id: idempotencyKey || refundId,
      refund_note: reason || "Customer refund",
    };

    const response = await this._request(`/orders/${encodeURIComponent(cfOrderId)}/refunds`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    logger.info({
      event: "CASHFREE_REFUND_CREATED",
      paymentId: payment.id,
      cfRefundId: response.cf_refund_id,
    });

    return cashfreeMapper.toUnifiedRefundResponse(response);
  }

  verifyWebhook(payload, headers) {
    return cashfreeWebhookHandler.verify(payload, headers);
  }
}

export default new CashfreeGateway();
