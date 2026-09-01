class ApiError extends Error {
  constructor(
    statusCode,
    message,
    errors = [],
    errorCode = "INTERNAL_SERVER_ERROR",
    stack = ""
  ) {
    super(message);

    this.statusCode = statusCode;
    this.success = false;
    this.errorCode = errorCode;
    this.errors = Array.isArray(errors) ? errors : [errors];

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static badRequest(message, errors = [], errorCode = "BAD_REQUEST") {
    return new ApiError(400, message, errors, errorCode);
  }

  static unauthorized(message = "Unauthorized access", errors = [], errorCode = "AUTHENTICATION_ERROR") {
    return new ApiError(401, message, errors, errorCode);
  }

  static forbidden(message = "Forbidden access", errors = [], errorCode = "AUTHORIZATION_ERROR") {
    return new ApiError(403, message, errors, errorCode);
  }

  static notFound(message = "Resource not found", errors = [], errorCode = "RESOURCE_NOT_FOUND") {
    return new ApiError(404, message, errors, errorCode);
  }

  static conflict(message = "Resource conflict", errors = [], errorCode = "DUPLICATE_RESOURCE") {
    return new ApiError(409, message, errors, errorCode);
  }

  static idempotencyConflict(message = "Idempotency conflict", errors = [], errorCode = "IDEMPOTENCY_CONFLICT") {
    return new ApiError(409, message, errors, errorCode);
  }

  static unprocessableEntity(message, errors = [], errorCode = "VALIDATION_ERROR") {
    return new ApiError(422, message, errors, errorCode);
  }

  static gatewayError(message, errors = [], errorCode = "PAYMENT_GATEWAY_ERROR") {
    return new ApiError(502, message, errors, errorCode);
  }

  static internal(message = "Internal Server Error", errors = [], errorCode = "DATABASE_ERROR") {
    return new ApiError(500, message, errors, errorCode);
  }
}

export default ApiError;