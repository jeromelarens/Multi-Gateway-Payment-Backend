import Stripe from "stripe";
import env from "../config/env.js";

const stripe = new Stripe(env.stripeSecretKey);

const webhookMiddleware = (req, res, next) => {
  try {
    const signature = req.headers["stripe-signature"];

    if (!signature) {
      return res.status(400).json({
        success: false,
        message: "Missing Stripe Signature",
      });
    }

    const event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      env.stripeWebhookSecret
    );

    req.stripeEvent = event;

    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid Webhook Signature",
    });
  }
};

export default webhookMiddleware;