import stripe from "./stripe.client.js";
import env from "../../config/env.js";

class StripeWebhook {
  verify(payload, signature) {
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      env.stripeWebhookSecret
    );
  }
}

export default new StripeWebhook();