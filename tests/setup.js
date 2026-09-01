import process from "process";
import prisma from "../src/config/prisma.js";

// Configure test environment variables before tests run
process.env.NODE_ENV = "test";
process.env.PORT = "5001";
process.env.JWT_SECRET = "test_super_secret_jwt_key_with_at_least_32_characters";
process.env.JWT_EXPIRES_IN = "1h";
process.env.STRIPE_SECRET_KEY = "sk_test_mock_stripe_key";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock_stripe_webhook_secret";
process.env.CASHFREE_APP_ID = "cf_app_mock_12345";
process.env.CASHFREE_SECRET_KEY = "cf_sec_mock_67890";
process.env.CASHFREE_ENVIRONMENT = "sandbox";
process.env.CASHFREE_API_VERSION = "2023-08-01";
process.env.CASHFREE_WEBHOOK_SECRET = "cf_whsec_mock_secret_key";
process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock";

// Mock safe defaults for Prisma models in tests so no live DB connection is required
if (!prisma.transactionLedger) prisma.transactionLedger = {};
prisma.transactionLedger.findUnique = async () => null;
prisma.transactionLedger.create = async ({ data }) => ({
  id: `led_mock_${Date.now()}`,
  ...data,
  createdAt: new Date(),
});
prisma.transactionLedger.findMany = async () => [];
prisma.transactionLedger.count = async () => 0;

if (!prisma.auditLog) prisma.auditLog = {};
prisma.auditLog.create = async ({ data }) => ({
  id: `aud_mock_${Date.now()}`,
  ...data,
  createdAt: new Date(),
});
prisma.auditLog.findMany = async () => [];
prisma.auditLog.count = async () => 0;

if (!prisma.reconciliationRecord) prisma.reconciliationRecord = {};
prisma.reconciliationRecord.create = async ({ data }) => ({
  id: `rec_mock_${Date.now()}`,
  ...data,
  createdAt: new Date(),
});
prisma.reconciliationRecord.findUnique = async () => null;
prisma.reconciliationRecord.findMany = async () => [];
prisma.reconciliationRecord.count = async () => 0;
prisma.reconciliationRecord.update = async ({ where, data }) => ({
  ...where,
  ...data,
  resolvedAt: new Date(),
});

/**
 * Mock Request & Response generator for Express middleware/controller testing
 */
export function createMockReqRes({
  method = "GET",
  url = "/",
  path = "/",
  headers = {},
  body = {},
  params = {},
  query = {},
  user = null,
  validatedData = null,
} = {}) {
  const req = {
    method,
    url,
    originalUrl: url,
    path,
    headers: { ...headers },
    body,
    params,
    query,
    user,
    validatedData: validatedData || body,
  };

  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    send(data) {
      this.body = data;
      return this;
    },
  };

  const next = (err) => {
    if (err) req._error = err;
  };

  return { req, res, next };
}
