import prisma from "../config/prisma.js";
import { Prisma } from "@prisma/client";

class IdempotencyRepository {
  /**
   * Attempt atomic reservation of an idempotency key.
   * Leverages Prisma unique constraint @@unique([userId, key]) to guarantee
   * race condition safety even under high concurrency.
   */
  async reserve({ key, userId, endpoint, requestHash, ttlHours = 24 }) {
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    try {
      const record = await prisma.idempotencyKey.create({
        data: {
          key,
          userId,
          endpoint,
          requestHash,
          status: "PROCESSING",
          expiresAt,
        },
      });

      return { isNew: true, record };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        // Key already exists (concurrent or repeated request)
        const existing = await this.findByUserAndKey(userId, key);
        return { isNew: false, record: existing };
      }
      throw error;
    }
  }

  async findByUserAndKey(userId, key) {
    return prisma.idempotencyKey.findUnique({
      where: {
        userId_key: {
          userId,
          key,
        },
      },
    });
  }

  async complete(id, responseStatus, responseBody, resourceId = null) {
    return prisma.idempotencyKey.update({
      where: { id },
      data: {
        status: "COMPLETED",
        responseStatus,
        responseBody,
        resourceId,
      },
    });
  }

  async fail(id) {
    return prisma.idempotencyKey.update({
      where: { id },
      data: {
        status: "FAILED",
      },
    });
  }

  async resetForRetry(id, requestHash) {
    return prisma.idempotencyKey.update({
      where: { id },
      data: {
        status: "PROCESSING",
        requestHash,
        responseStatus: null,
        responseBody: null,
      },
    });
  }

  async delete(id) {
    return prisma.idempotencyKey.delete({
      where: { id },
    });
  }
}

export default new IdempotencyRepository();
