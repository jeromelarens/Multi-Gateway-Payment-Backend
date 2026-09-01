import Stripe from "stripe";
import env from "./env.js";

const stripe = new Stripe(env.stripeSecretKey, {
  apiVersion: "2025-06-30.basil",
  typescript: false,
});

export default stripe;