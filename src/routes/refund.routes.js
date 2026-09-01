import express from "express";

import refundController from "../controllers/refund.controller.js";
import validationMiddleware from "../middlewares/validation.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";

import refundSchema from "../validators/refund.validation.js";

const router = express.Router();

// Require authentication for all refund operations
router.use(authenticate);

/*
|--------------------------------------------------------------------------
| Refund APIs
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Create Refund
|--------------------------------------------------------------------------
*/

router.post(
  "/",
  validationMiddleware(refundSchema),
  refundController.createRefund
);

/*
|--------------------------------------------------------------------------
| Get All Refunds
|--------------------------------------------------------------------------
*/

router.get(
  "/",
  refundController.getAllRefunds
);

/*
|--------------------------------------------------------------------------
| Get Refunds By Payment ID
|--------------------------------------------------------------------------
*/

router.get(
  "/payment/:paymentId",
  refundController.getPaymentRefunds
);

/*
|--------------------------------------------------------------------------
| Get Refund By Refund ID
|--------------------------------------------------------------------------
*/

router.get(
  "/:refundId",
  refundController.getRefund
);

export default router;