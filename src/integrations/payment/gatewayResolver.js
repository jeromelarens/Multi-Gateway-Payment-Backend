import stripeGateway from "./stripe/stripe.gateway.js";
import cashfreeGateway from "./cashfree/cashfree.gateway.js";
import ApiError from "../../utils/ApiError.js";

class GatewayResolver {
  constructor() {
    this._gateways = new Map();

    // Register supported gateways
    this.register("STRIPE", stripeGateway);
    this.register("CASHFREE", cashfreeGateway);
  }

  /**
   * Register a new gateway adapter
   * @param {string} name - Unique gateway name (e.g. "STRIPE", "CASHFREE", "PAYPAL")
   * @param {import('./paymentGateway.interface.js').default} gatewayInstance
   */
  register(name, gatewayInstance) {
    if (!name || typeof name !== "string") {
      throw new Error("Gateway name must be a non-empty string.");
    }
    this._gateways.set(name.toUpperCase(), gatewayInstance);
  }

  /**
   * Resolve gateway adapter by name
   * @param {string} name - e.g. "STRIPE" or "CASHFREE"
   * @returns {import('./paymentGateway.interface.js').default}
   */
  resolve(name) {
    if (!name || typeof name !== "string") {
      throw ApiError.badRequest(
        "Payment gateway is required.",
        [],
        "UNSUPPORTED_GATEWAY"
      );
    }

    const normalized = name.trim().toUpperCase();
    const gateway = this._gateways.get(normalized);

    if (!gateway) {
      const supported = Array.from(this._gateways.keys()).join(", ");
      throw ApiError.badRequest(
        `Unsupported payment gateway: '${name}'. Supported gateways are: ${supported}`,
        [],
        "UNSUPPORTED_GATEWAY"
      );
    }

    return gateway;
  }

  /**
   * Get list of supported gateway identifiers
   */
  getSupportedGateways() {
    return Array.from(this._gateways.keys());
  }
}

export default new GatewayResolver();
