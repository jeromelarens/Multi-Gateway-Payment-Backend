import crypto from "crypto";
import env from "../../../config/env.js";
import ApiError from "../../../utils/ApiError.js";

class CashfreeWebhookHandler {
  /**
   * Verify signature using Cashfree HMAC-SHA256
   * Cashfree signs: `${timestamp}${rawPayload}` with `CASHFREE_WEBHOOK_SECRET`
   */
  verify(payload, headers) {
    const signature = headers["x-webhook-signature"];
    const timestamp = headers["x-webhook-timestamp"];

    if (!signature || !timestamp) {
      throw ApiError.badRequest(
        "Missing Cashfree webhook signature or timestamp headers.",
        [],
        "WEBHOOK_SIGNATURE_MISSING"
      );
    }

    if (!env.cashfreeWebhookSecret) {
      throw ApiError.internal(
        "Cashfree webhook secret is not configured on the server.",
        [],
        "CONFIG_ERROR"
      );
    }

    const rawBody = Buffer.isBuffer(payload) ? payload.toString("utf8") : (typeof payload === "string" ? payload : JSON.stringify(payload));
    const dataToSign = `${timestamp}${rawBody}`;

    const expectedSignature = crypto
      .createHmac("sha256", env.cashfreeWebhookSecret)
      .update(dataToSign)
      .digest("base64");

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      throw ApiError.badRequest(
        "Invalid Cashfree webhook signature.",
        [],
        "WEBHOOK_SIGNATURE_INVALID"
      );
    }

    const parsedData = typeof payload === "object" && !Buffer.isBuffer(payload) ? payload : JSON.parse(rawBody);

    return {
      eventId: parsedData.event_id || `${parsedData.type || "CASHFREE"}_${Date.now()}`,
      eventType: parsedData.type || "PAYMENT_SUCCESS_WEBHOOK",
      data: parsedData.data || parsedData,
      raw: parsedData,
    };
  }
}

export default new CashfreeWebhookHandler();
