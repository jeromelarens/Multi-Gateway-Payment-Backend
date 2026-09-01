import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";

import env from "./config/env.js";

import paymentRoutes from "./routes/payment.routes.js";
import paymentV1Routes from "./routes/v1/payment.routes.js";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import refundRoutes from "./routes/refund.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import healthRoutes from "./routes/health.routes.js";
import invoiceRoutes from "./routes/invoice.routes.js";

import errorMiddleware from "./middlewares/error.middleware.js";
import notFoundMiddleware from "./middlewares/notFound.middleware.js";
import rateLimiterMiddleware from "./middlewares/rateLimiter.middleware.js";

const app = express();

/* -------------------------------------------------------------------------- */
/*                                  Security                                  */
/* -------------------------------------------------------------------------- */

app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(compression());

app.use(cookieParser());

/* -------------------------------------------------------------------------- */
/*                             Stripe Webhook                                 */
/* -------------------------------------------------------------------------- */
/*
|--------------------------------------------------------------------------
| IMPORTANT
|--------------------------------------------------------------------------
| Stripe signature verification requires the RAW request body.
| This route MUST be registered BEFORE express.json().
*/

app.use(
  "/api/webhook",
  express.raw({
    type: "application/json",
  }),
  webhookRoutes
);

/* -------------------------------------------------------------------------- */
/*                               Body Parsers                                 */
/* -------------------------------------------------------------------------- */

app.use(
  express.json({
    limit: "5mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "5mb",
  })
);

/* -------------------------------------------------------------------------- */
/*                                   Logger                                   */
/* -------------------------------------------------------------------------- */

if (env.nodeEnv !== "production") {
  app.use(morgan("dev"));
}

/* -------------------------------------------------------------------------- */
/*                               Rate Limiter                                 */
/* -------------------------------------------------------------------------- */

app.use(rateLimiterMiddleware);

/* -------------------------------------------------------------------------- */
/*                                   Routes                                   */
/* -------------------------------------------------------------------------- */

app.get("/", (req, res) => {
  return res.status(200).json({
    success: true,
    application: "Payment Integration Backend",
    version: "2.0.0",
    environment: env.nodeEnv,
    status: "Running",
    timestamp: new Date().toISOString(),
    apis: {
      v1: {
        auth: "/api/v1/auth",
        payments: "/api/v1/payments",
        admin: "/api/v1/admin",
      },
      health: {
        status: "/api/health",
        live: "/api/health/live",
        ready: "/api/health/ready",
      },
      payment: "/api/payment",
      refund: "/api/refund",
      webhook: "/api/webhook",
    },
  });
});

/* v1 API Routes */
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/payments", paymentV1Routes);
app.use("/api/v1/admin", adminRoutes);

/* Legacy & Operational Routes */
app.use("/api/health", healthRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/refund", refundRoutes);
app.use("/api/invoice", invoiceRoutes);

/* -------------------------------------------------------------------------- */
/*                              404 Middleware                                */
/* -------------------------------------------------------------------------- */

app.use(notFoundMiddleware);

/* -------------------------------------------------------------------------- */
/*                              Error Handler                                 */
/* -------------------------------------------------------------------------- */

app.use(errorMiddleware);

export default app;