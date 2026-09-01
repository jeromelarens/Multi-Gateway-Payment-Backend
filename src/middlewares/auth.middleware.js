import jwt from "jsonwebtoken";
import env from "../config/env.js";
import ApiError from "../utils/ApiError.js";
import userRepository from "../repositories/user.repository.js";

/**
 * Authentication middleware: verifies JWT and attaches user to request
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw ApiError.unauthorized(
        "Authentication required. Bearer token missing.",
        [],
        "AUTHENTICATION_ERROR"
      );
    }

    const token = authHeader.split(" ")[1];

    let decoded;
    try {
      decoded = jwt.verify(token, env.jwtSecret);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        throw ApiError.unauthorized(
          "Authentication token has expired. Please log in again.",
          [],
          "TOKEN_EXPIRED"
        );
      }
      throw ApiError.unauthorized(
        "Invalid authentication token.",
        [],
        "INVALID_TOKEN"
      );
    }

    const user = await userRepository.findById(decoded.sub);
    if (!user) {
      throw ApiError.unauthorized(
        "User associated with this token no longer exists.",
        [],
        "AUTHENTICATION_ERROR"
      );
    }

    // Attach sanitized user context to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    };

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Role-based authorization middleware
 */
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(
        ApiError.unauthorized("Authentication required.", [], "AUTHENTICATION_ERROR")
      );
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `Access forbidden. Requires one of: ${allowedRoles.join(", ")}`,
          [],
          "AUTHORIZATION_ERROR"
        )
      );
    }

    next();
  };
};

/**
 * Resource ownership middleware to prevent IDOR vulnerabilities.
 * Checks whether the authenticated user owns the resource or is an ADMIN.
 *
 * @param {(req: import('express').Request) => Promise<string | null> | string | null} getOwnerIdFn
 */
export const requireOwnership = (getOwnerIdFn) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized("Authentication required.", [], "AUTHENTICATION_ERROR");
      }

      if (req.user.role === "ADMIN") {
        return next();
      }

      const resourceOwnerId = await getOwnerIdFn(req);

      if (!resourceOwnerId || resourceOwnerId !== req.user.id) {
        throw ApiError.forbidden(
          "Access denied. You do not have permission to access this resource.",
          [],
          "AUTHORIZATION_ERROR"
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export default authenticate;