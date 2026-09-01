import express from "express";
import paymentController from "../../controllers/payment.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { idempotencyMiddleware } from "../../middlewares/idempotency.middleware.js";
import validationMiddleware from "../../middlewares/validation.middleware.js";
import { createPaymentSchema } from "../../validators/payment.validation.js";

const router = express.Router();

/**
 * Unified Payment APIs (v1)
 */

// POST /api/v1/payments - Create unified payment with Idempotency-Key
router.post(
  "/",
  authenticate,
  idempotencyMiddleware,
  validationMiddleware(createPaymentSchema),
  paymentController.createPayment
);

// GET /api/v1/payments/history - Get payment history for authenticated user
router.get(
  "/history",
  authenticate,
  paymentController.getPaymentHistory
);

// GET /api/v1/payments/:paymentId - Get single payment details with ownership check
router.get(
  "/:paymentId",
  authenticate,
  paymentController.getPayment
);

export default router;
