import express from "express";
import adminController from "../controllers/admin.controller.js";
import { authenticate, requireRole } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Enforce authentication & ADMIN role across all /api/v1/admin routes
router.use(authenticate);
router.use(requireRole("ADMIN"));

// Payments observability
router.get("/payments", adminController.getPayments);
router.get("/payments/:id", adminController.getPaymentById);

// Webhook monitoring and manual DLQ reprocessing
router.get("/webhooks", adminController.getWebhooks);
router.post("/webhooks/:eventId/reprocess", adminController.reprocessWebhook);

// Reconciliation management
router.get("/reconciliation", adminController.getReconciliation);
router.post("/reconciliation/:id/resolve", adminController.resolveReconciliation);

// Audit logs
router.get("/audit-logs", adminController.getAuditLogs);

// System metrics
router.get("/metrics", adminController.getMetrics);

export default router;
