import logger from "../config/logger.js";
import env from "../config/env.js";

const errorMiddleware = (error, req, res, next) => {
  logger.error({
    message: error.message,
    stack: error.stack,
    path: req.originalUrl,
    method: req.method,
    errorCode: error.errorCode,
  });

  const statusCode = error.statusCode || 500;
  const errorCode = error.errorCode || (statusCode >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST");

  // Format message: do not leak raw internal database errors in production
  let message = error.message || "An unexpected error occurred.";
  if (statusCode === 500 && env.nodeEnv === "production") {
    message = "An unexpected internal server error occurred.";
  }

  const response = {
    success: false,
    errorCode,
    message,
    errors: error.errors || [],
  };

  if (env.nodeEnv !== "production" && error.stack) {
    response.stack = error.stack;
  }

  return res.status(statusCode).json(response);
};

export default errorMiddleware;