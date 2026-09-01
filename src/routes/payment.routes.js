import express from "express";

import paymentController from "../controllers/payment.controller.js";
import validationMiddleware from "../middlewares/validation.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";

import {
  createOrderSchema,
} from "../validators/payment.validation.js";

const router = express.Router();

// Require authentication for all payment routes
router.use(authenticate);

/*
|--------------------------------------------------------------------------
| Payment
|--------------------------------------------------------------------------
*/

router.post(
  "/create-order",
  validationMiddleware(createOrderSchema),
  paymentController.createOrder
);

router.get(
  "/history/:userId",
  paymentController.getUserPayments
);

router.get(
  "/:paymentId",
  paymentController.getPayment
);

export default router;