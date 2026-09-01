import http from "http";

import app from "./app.js";
import env from "./config/env.js";
import prisma from "./config/prisma.js";
import logger from "./config/logger.js";
import transporter from "./integrations/email/transporter.js";
import { getRedisClient, closeRedis } from "./config/redis.js";
import { startAllWorkers, closeAllWorkers } from "./workers/index.js";

const server = http.createServer(app);

async function startServer() {
  try {
    // 1. Connect PostgreSQL (Prisma)
    await prisma.$connect();
    logger.info("✅ PostgreSQL Connected");

    // 2. Connect Redis & Start Workers
    try {
      getRedisClient();
      startAllWorkers();
      logger.info("✅ BullMQ Workers Initialized");
    } catch (redisErr) {
      logger.warn({
        event: "REDIS_STARTUP_WARNING",
        error: redisErr.message,
      });
    }

    // 3. Verify SMTP
    try {
      await transporter.verifyConnection();
      logger.info("✅ SMTP Connected");
    } catch (error) {
      logger.warn({
        event: "SMTP_UNAVAILABLE",
        error: error.message,
      });
      logger.warn("⚠️  Email service unavailable. Server will continue.");
    }

    // 4. Start HTTP Server
    server.listen(env.port, () => {
      logger.info(`🚀 Server running on http://localhost:${env.port}`);
      logger.info(`🌍 Environment : ${env.nodeEnv}`);
    });

  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
}

startServer();

/* -------------------------------------------------------------------------- */
/*                              Graceful Shutdown                             */
/* -------------------------------------------------------------------------- */

async function performGracefulShutdown(signal) {
  logger.info(`🛑 ${signal} received. Performing graceful shutdown...`);

  // 1. Stop accepting new HTTP requests
  server.close(async (error) => {
    if (error) {
      logger.error({ event: "SERVER_CLOSE_FAILED", error: error.message });
    }

    try {
      // 2. Close all BullMQ workers
      await closeAllWorkers();
      logger.info("🛑 Background workers stopped");

      // 3. Close Redis connections
      await closeRedis();
      logger.info("🛑 Redis connection closed");

      // 4. Disconnect PostgreSQL (Prisma)
      await prisma.$disconnect();
      logger.info("🛑 Database disconnected");

      logger.info("🛑 Graceful shutdown complete");
      process.exit(0);
    } catch (shutdownErr) {
      logger.error({ event: "GRACEFUL_SHUTDOWN_ERROR", error: shutdownErr.message });
      process.exit(1);
    }
  });

  // Force termination after timeout
  setTimeout(() => {
    logger.error("⚠️ Forced shutdown due to timeout.");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGINT", () => performGracefulShutdown("SIGINT"));
process.on("SIGTERM", () => performGracefulShutdown("SIGTERM"));

process.on("unhandledRejection", async (reason) => {
  logger.error({
    event: "UNHANDLED_REJECTION",
    error: reason?.stack || reason?.message || reason,
  });

  try {
    await closeAllWorkers();
    await closeRedis();
    await prisma.$disconnect();
  } catch {
    // Ignore cleanup errors during crash
  }

  process.exit(1);
});

process.on("uncaughtException", async (error) => {
  logger.error({
    event: "UNCAUGHT_EXCEPTION",
    error: error.stack || error.message,
  });

  try {
    await closeAllWorkers();
    await closeRedis();
    await prisma.$disconnect();
  } catch {
    // Ignore cleanup errors during crash
  }

  process.exit(1);
});