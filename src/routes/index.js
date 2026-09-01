import express from "express";
import authRoutes from "./auth.routes.js";
import paymentV1Routes from "./v1/payment.routes.js";
import adminRoutes from "./admin.routes.js";
import paymentRoutes from "./payment.routes.js";
import refundRoutes from "./refund.routes.js";
import invoiceRoutes from "./invoice.routes.js";
import healthRoutes from "./health.routes.js";

const router = express.Router();

// v1 sub-routers
router.use("/v1/auth", authRoutes);
router.use("/v1/payments", paymentV1Routes);
router.use("/v1/admin", adminRoutes);

// General & legacy routers
router.use("/health", healthRoutes);
router.use("/payment", paymentRoutes);
router.use("/refund", refundRoutes);
router.use("/invoice", invoiceRoutes);

export default router;
