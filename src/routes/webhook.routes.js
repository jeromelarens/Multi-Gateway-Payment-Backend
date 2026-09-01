import express from "express";

import webhookController from "../controllers/webhook.controller.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Stripe Webhook Endpoint
|--------------------------------------------------------------------------
|
| ⚠️ CRITICAL: Must use `express.raw()` here to preserve the raw request
| body as a Buffer. Stripe signature verification requires the exact
| raw body bytes — parsed JSON objects will cause signature mismatch.
|
| Mount this route BEFORE `express.json()` in app.js:
|   app.use("/api/webhooks", webhookRoutes);
|   app.use(express.json());
|
*/

router.post(
  "/",
  express.raw({ type: "application/json" }),
  webhookController.handleStripeWebhook
);

/*
|--------------------------------------------------------------------------
| Webhook History
|--------------------------------------------------------------------------
*/

router.get(
  "/",
  webhookController.getWebhookEvents
);

/*
|--------------------------------------------------------------------------
| Webhook Details
|--------------------------------------------------------------------------
*/

router.get(
  "/:eventId",
  webhookController.getWebhookById
);

export default router;