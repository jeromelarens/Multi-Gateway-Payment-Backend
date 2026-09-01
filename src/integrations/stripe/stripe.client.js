import Stripe from "stripe";
import env from "../../config/env.js";

const stripe = new Stripe(env.stripeSecretKey, {
  apiVersion: "2025-06-30.basil",
});

export default stripe;