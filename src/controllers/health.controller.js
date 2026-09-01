import prisma from "../config/prisma.js";
import { pingRedis } from "../config/redis.js";

export const healthCheck = (req, res) => {
  return res.status(200).json({
    success: true,
    status: "OK",
    message: "Payment Integration API is operational.",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
};

export const liveness = (req, res) => {
  return res.status(200).json({
    status: "LIVE",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
};

export const readiness = async (req, res) => {
  let dbStatus = "DOWN";
  let redisStatus = "DOWN";

  try {
    // Quick DB connectivity check
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "UP";
  } catch (err) {
    dbStatus = "DOWN";
  }

  try {
    const redisOk = await pingRedis();
    redisStatus = redisOk ? "UP" : "DOWN";
  } catch (err) {
    redisStatus = "DOWN";
  }

  const isReady = dbStatus === "UP";
  const overallStatus = isReady && redisStatus === "UP" ? "READY" : isReady ? "DEGRADED" : "UNHEALTHY";
  const statusCode = isReady ? 200 : 503;

  return res.status(statusCode).json({
    status: overallStatus,
    services: {
      database: dbStatus,
      redis: redisStatus,
    },
    timestamp: new Date().toISOString(),
  });
};

export default { healthCheck, liveness, readiness };