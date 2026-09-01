import stripe from "./stripe.client.js";

class StripeRefund {
  async create({
    paymentIntent,
    amount,
    reason,
    metadata = {},
  }, options = {}) {
    const data = {
      payment_intent: paymentIntent,
      metadata,
    };

    if (amount !== undefined && amount !== null) {
      data.amount = amount;
    }

    if (reason) {
      data.reason = reason;
    }

    return stripe.refunds.create(data, options);
  }

  async retrieve(refundId) {
    return stripe.refunds.retrieve(refundId);
  }

  async list(paymentIntent) {
    return stripe.refunds.list({
      payment_intent: paymentIntent,
    });
  }
}

export default new StripeRefund();