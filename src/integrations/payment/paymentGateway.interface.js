/**
 * Abstract Payment Gateway Contract
 *
 * All payment gateway adapters (Stripe, Cashfree, etc.) must implement this interface.
 * The core payment business service only interacts with this contract, ensuring complete
 * isolation from provider-specific SDKs or HTTP APIs.
 */
class PaymentGateway {
  /**
   * Gateway identifier (e.g. "STRIPE", "CASHFREE")
   */
  get name() {
    throw new Error("Property 'name' must be implemented.");
  }

  /**
   * Create or retrieve customer in gateway
   * @param {Object} customerData - { name, email, phone, metadata }
   * @returns {Promise<{ customerId: string }>}
   */
  async createCustomer(customerData) {
    throw new Error("Method 'createCustomer()' must be implemented.");
  }

  /**
   * Create payment / order on the gateway
   * @param {Object} paymentData - { orderId, orderNumber, amount, currency, customer, description, returnUrl, notifyUrl, metadata }
   * @returns {Promise<Object>} Unified payment response
   */
  async createPayment(paymentData) {
    throw new Error("Method 'createPayment()' must be implemented.");
  }

  /**
   * Retrieve payment details from the gateway
   * @param {string} gatewayId - Gateway payment ID or order ID
   * @returns {Promise<Object>} Unified payment status response
   */
  async getPayment(gatewayId) {
    throw new Error("Method 'getPayment()' must be implemented.");
  }

  /**
   * Cancel or void an uncaptured / pending payment
   * @param {string} gatewayId
   * @returns {Promise<Object>}
   */
  async cancelPayment(gatewayId) {
    throw new Error("Method 'cancelPayment()' must be implemented.");
  }

  /**
   * Process refund through the gateway
   * @param {Object} refundData - { payment, amount, reason, idempotencyKey }
   * @returns {Promise<Object>} Unified refund response
   */
  async refundPayment(refundData) {
    throw new Error("Method 'refundPayment()' must be implemented.");
  }

  /**
   * Verify webhook signature and extract normalized event
   * @param {string | Buffer} payload - Raw request body
   * @param {Object} headers - Request headers
   * @returns {Object} { eventId, eventType, data, raw }
   */
  verifyWebhook(payload, headers) {
    throw new Error("Method 'verifyWebhook()' must be implemented.");
  }
}

export default PaymentGateway;
