import webhookService from "../services/webhook.service.js";
import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/apiResponse.js";

class WebhookController {
  /*
  |--------------------------------------------------------------------------
  | Stripe Webhook
  |--------------------------------------------------------------------------
  |
  | ⚠️ IMPORTANT: This route MUST use `express.raw({ type: "application/json" })`
  | in the router (or app.js) BEFORE this controller is reached.
  |
  | Stripe's `constructEvent()` requires the raw request body (Buffer/string),
  | not a parsed JSON object. If `express.json()` middleware parses the body first,
  | signature verification will fail.
  |
  | Correct setup in app.js:
  |   app.use("/api/webhooks", webhookRoutes);  // uses express.raw() internally
  |   app.use(express.json());                    // for all other routes
  |
  */

  handleStripeWebhook = asyncHandler(async (req, res) => {
    await webhookService.handleStripeWebhook(
      req.body,
      req.headers["stripe-signature"]
    );

    // Stripe expects HTTP 200
    return res.status(200).json({
      received: true,
    });
  });

  /*
  |--------------------------------------------------------------------------
  | Webhook History
  |--------------------------------------------------------------------------
  */

  getWebhookEvents = asyncHandler(async (req, res) => {
    const events = await webhookService.getWebhookEvents();

    return ApiResponse.success(
      res,
      "Webhook events fetched successfully.",
      events
    );
  });

  /*
  |--------------------------------------------------------------------------
  | Webhook Details
  |--------------------------------------------------------------------------
  */

  getWebhookById = asyncHandler(async (req, res) => {
    const { eventId } = req.params;

    const event = await webhookService.getWebhookById(eventId);

    return ApiResponse.success(
      res,
      "Webhook event fetched successfully.",
      event
    );
  });
}

export default new WebhookController();