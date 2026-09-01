import express from "express";
import { healthCheck, liveness, readiness } from "../controllers/health.controller.js";

const router = express.Router();

router.get("/", healthCheck);
router.get("/live", liveness);
router.get("/ready", readiness);

export default router;