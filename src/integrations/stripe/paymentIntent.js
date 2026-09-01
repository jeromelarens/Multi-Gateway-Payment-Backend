import stripe from "./stripe.client.js";

class StripePaymentIntent {
  async create({
    amount,
    currency = "inr",
    customer,
    metadata = {},
    receipt_email,
    description,
  }) {
    return stripe.paymentIntents.create({
      amount,
      currency,
      customer,
      receipt_email,
      description,
      metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });
  }

  async retrieve(paymentIntentId) {
    return stripe.paymentIntents.retrieve(paymentIntentId);
  }

  async cancel(paymentIntentId) {
    return stripe.paymentIntents.cancel(paymentIntentId);
  }
}

export default new StripePaymentIntent();