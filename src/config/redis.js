import { Redis } from "ioredis";
import env from "./env.js";
import logger from "./logger.js";

let redisClient = null;
let isConnected = false;

export function getRedisClient() {
  if (redisClient) return redisClient;

  // In test environment, return an in-memory mock client
  if (process.env.NODE_ENV === "test") {
    redisClient = {
      ping: async () => "PONG",
      quit: async () => {},
      disconnect: () => {},
      on: () => {},
      status: "ready",
    };
    isConnected = true;
    return redisClient;
  }

  try {
    redisClient = new Redis(env.redisUrl, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
      retryStrategy: (times) => {
        if (times > 10) {
          logger.warn("Redis connection retry limit reached. Continuing in degraded mode.");
          return null;
        }
        return Math.min(times * 200, 3000);
      },
    });

    redisClient.on("connect", () => {
      isConnected = true;
      logger.info({ event: "REDIS_CONNECTED", url: env.redisUrl });
    });

    redisClient.on("ready", () => {
      isConnected = true;
    });

    redisClient.on("error", (err) => {
      isConnected = false;
      logger.warn({ event: "REDIS_ERROR", message: err.message });
    });

    redisClient.on("close", () => {
      isConnected = false;
      logger.warn({ event: "REDIS_CONNECTION_CLOSED" });
    });
  } catch (err) {
    logger.warn({ event: "REDIS_INIT_FAILED", message: err.message });
  }

  return redisClient;
}

export function isRedisConnected() {
  return isConnected;
}

export async function pingRedis() {
  if (!redisClient) return false;
  try {
    const res = await redisClient.ping();
    return res === "PONG";
  } catch {
    return false;
  }
}

export async function closeRedis() {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      redisClient.disconnect();
    }
    redisClient = null;
    isConnected = false;
  }
}

export default { getRedisClient, pingRedis, closeRedis, isRedisConnected };
