import stripe from "../../stripe/stripe.client.js";
import env from "../../../config/env.js";
import ApiError from "../../../utils/ApiError.js";

class StripeWebhookHandler {
  /**
   * Verify signature using Stripe SDK and extract unified event
   */
  verify(payload, signature) {
    if (!signature) {
      throw ApiError.badRequest(
        "Missing Stripe-Signature header.",
        [],
        "WEBHOOK_SIGNATURE_MISSING"
      );
    }

    try {
      const event = stripe.webhooks.constructEvent(
        payload,
        signature,
        env.stripeWebhookSecret
      );

      return {
        eventId: event.id,
        eventType: event.type,
        data: event.data.object,
        raw: event,
      };
    } catch (err) {
      throw ApiError.badRequest(
        `Invalid Stripe webhook signature: ${err.message}`,
        [],
        "WEBHOOK_SIGNATURE_INVALID"
      );
    }
  }
}

export default new StripeWebhookHandler();
