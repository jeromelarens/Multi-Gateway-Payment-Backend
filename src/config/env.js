import dotenv from "dotenv";

dotenv.config();

const requiredEnv = [
  "PORT",
  "NODE_ENV",
  "DATABASE_URL",
];

if (process.env.NODE_ENV === "production") {
  requiredEnv.push("JWT_SECRET");
}

const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  throw new Error(
    `❌ Missing required environment variables: ${missingEnv.join(", ")}`
  );
}

const env = {
  port: Number(process.env.PORT) || 5000,

  nodeEnv: process.env.NODE_ENV || "development",

  databaseUrl: process.env.DATABASE_URL,

  directUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,

  // JWT Configuration
  jwtSecret: process.env.JWT_SECRET || "default_jwt_secret_dev_only_32char_key_min",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",

  // Stripe Configuration
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",

  // Cashfree Configuration
  cashfreeAppId: process.env.CASHFREE_APP_ID || "",
  cashfreeSecretKey: process.env.CASHFREE_SECRET_KEY || "",
  cashfreeEnvironment: (process.env.CASHFREE_ENVIRONMENT || "sandbox").toLowerCase(),
  cashfreeApiVersion: process.env.CASHFREE_API_VERSION || "2023-08-01",
  cashfreeWebhookSecret: process.env.CASHFREE_WEBHOOK_SECRET || "",

  // Redis & Queue Configuration
  redisUrl: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  queuePrefix: process.env.QUEUE_PREFIX || "payment_queue",

  // Retry Policies
  webhookMaxAttempts: Number(process.env.WEBHOOK_MAX_ATTEMPTS) || 5,
  webhookBackoffMs: Number(process.env.WEBHOOK_BACKOFF_MS) || 5000,
  emailMaxAttempts: Number(process.env.EMAIL_MAX_ATTEMPTS) || 5,
  invoiceMaxAttempts: Number(process.env.INVOICE_MAX_ATTEMPTS) || 3,

  // Reconciliation Configuration
  reconciliationCron: process.env.RECONCILIATION_CRON || "0 2 * * *", // Daily at 02:00
  reconciliationLookbackDays: Number(process.env.RECONCILIATION_LOOKBACK_DAYS) || 1,

  // Ledger Configuration
  ledgerEnabled: process.env.LEDGER_ENABLED !== "false",

  // Email Configuration
  emailHost: process.env.EMAIL_HOST,
  emailPort: Number(process.env.EMAIL_PORT) || 587,
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS,
  emailFrom: process.env.EMAIL_FROM || "Payment Integration <noreply@payment-integration.com>",
};

export default env;