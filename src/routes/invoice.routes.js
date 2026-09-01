import express from "express";

import invoiceController from "../controllers/invoice.controller.js";
import validationMiddleware from "../middlewares/validation.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";

import invoiceSchema from "../validators/invoice.validation.js";

const router = express.Router();

// Require authentication for all invoice operations
router.use(authenticate);

/*
|--------------------------------------------------------------------------
| Invoice APIs
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Create Invoice
|--------------------------------------------------------------------------
*/

router.post(
  "/",
  validationMiddleware(invoiceSchema),
  invoiceController.createInvoice
);

/*
|--------------------------------------------------------------------------
| Get All Invoices
|--------------------------------------------------------------------------
*/

router.get(
  "/",
  invoiceController.getAllInvoices
);

/*
|--------------------------------------------------------------------------
| Get Invoice By Order ID
|--------------------------------------------------------------------------
*/

router.get(
  "/order/:orderId",
  invoiceController.getOrderInvoice
);

/*
|--------------------------------------------------------------------------
| Get Invoice By Invoice ID
|--------------------------------------------------------------------------
*/

router.get(
  "/:invoiceId",
  invoiceController.getInvoice
);

export default router;