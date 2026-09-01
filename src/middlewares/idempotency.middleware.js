import crypto from "crypto";
import idempotencyRepository from "../repositories/idempotency.repository.js";
import ApiError from "../utils/ApiError.js";
import logger from "../config/logger.js";

/**
 * Generate deterministic SHA-256 hash of the request payload
 */
function computeRequestHash(body) {
  const jsonStr = JSON.stringify(body || {}, Object.keys(body || {}).sort());
  return crypto.createHash("sha256").update(jsonStr).digest("hex");
}

/**
 * Request-level Idempotency Middleware
 *
 * Enforces safe retry semantics, prevents duplicate payment operations, and
 * protects against race conditions when multiple identical requests arrive simultaneously.
 */
export const idempotencyMiddleware = async (req, res, next) => {
  const idempotencyKey = req.headers["idempotency-key"] || req.headers["x-idempotency-key"];

  if (!idempotencyKey) {
    return next(
      ApiError.badRequest(
        "Idempotency-Key header is required for this operation.",
        [],
        "IDEMPOTENCY_KEY_REQUIRED"
      )
    );
  }

  // Sanitize and validate key length
  const key = String(idempotencyKey).trim();
  if (key.length < 4 || key.length > 255) {
    return next(
      ApiError.badRequest(
        "Idempotency-Key must be between 4 and 255 characters long.",
        [],
        "INVALID_IDEMPOTENCY_KEY"
      )
    );
  }

  // Ensure authenticated user identity is available
  const userId = req.user?.id;
  if (!userId) {
    return next(
      ApiError.unauthorized(
        "Authentication is required before idempotency verification.",
        [],
        "AUTHENTICATION_ERROR"
      )
    );
  }

  const endpoint = `${req.method} ${req.baseUrl || ""}${req.path}`;
  const requestHash = computeRequestHash(req.body);

  try {
    const { isNew, record } = await idempotencyRepository.reserve({
      key,
      userId,
      endpoint,
      requestHash,
    });

    if (!isNew && record) {
      // Check expiration
      if (new Date() > new Date(record.expiresAt)) {
        // Expired key, reset to processing
        await idempotencyRepository.resetForRetry(record.id, requestHash);
      } else if (record.status === "COMPLETED") {
        // Compare request fingerprint
        if (record.requestHash !== requestHash) {
          logger.warn({
            event: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_BODY",
            userId,
            key,
          });

          return next(
            ApiError.idempotencyConflict(
              "Idempotency key has already been used with different request parameters.",
              [],
              "IDEMPOTENCY_KEY_REUSED"
            )
          );
        }

        logger.info({
          event: "IDEMPOTENCY_CACHE_HIT",
          userId,
          key,
          statusCode: record.responseStatus,
        });

        // Set idempotency replay header and return cached response
        res.setHeader("Idempotent-Replay", "true");
        return res.status(record.responseStatus || 200).json(record.responseBody);
      } else if (record.status === "PROCESSING") {
        logger.warn({
          event: "CONCURRENT_IDEMPOTENT_REQUEST",
          userId,
          key,
        });

        return next(
          ApiError.idempotencyConflict(
            "A request with this Idempotency-Key is currently being processed. Please try again shortly.",
            [],
            "CONCURRENT_REQUEST_IN_PROGRESS"
          )
        );
      } else if (record.status === "FAILED") {
        // Allow retry after failure
        await idempotencyRepository.resetForRetry(record.id, requestHash);
      }
    }

    // Capture response to store when finished
    const originalJson = res.json.bind(res);
    const reservationId = record?.id;

    res.json = (body) => {
      const statusCode = res.statusCode || 200;

      if (reservationId) {
        if (statusCode >= 200 && statusCode < 300) {
          const resourceId = body?.data?.paymentId || body?.data?.orderId || null;
          idempotencyRepository
            .complete(reservationId, statusCode, body, resourceId)
            .catch((err) =>
              logger.error({
                event: "IDEMPOTENCY_COMPLETE_FAILED",
                reservationId,
                error: err.message,
              })
            );
        } else {
          idempotencyRepository
            .fail(reservationId)
            .catch((err) =>
              logger.error({
                event: "IDEMPOTENCY_FAIL_FAILED",
                reservationId,
                error: err.message,
              })
            );
        }
      }

      return originalJson(body);
    };

    next();
  } catch (error) {
    next(error);
  }
};

export default idempotencyMiddleware;
