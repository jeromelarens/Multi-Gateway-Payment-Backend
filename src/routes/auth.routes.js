import express from "express";
import authController from "../controllers/auth.controller.js";
import validationMiddleware from "../middlewares/validation.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { registerSchema, loginSchema } from "../validators/auth.validation.js";

const router = express.Router();

router.post(
  "/register",
  validationMiddleware(registerSchema),
  authController.register
);

router.post(
  "/login",
  validationMiddleware(loginSchema),
  authController.login
);

router.get(
  "/me",
  authenticate,
  authController.getMe
);

export default router;
