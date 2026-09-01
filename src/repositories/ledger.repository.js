import prisma from "../config/prisma.js";
import { Prisma } from "@prisma/client";

/**
 * Immutable Transaction Ledger Repository
 *
 * Enforces append-only storage for all financial events.
 * No UPDATE or DELETE operations are exposed by this repository.
 */
class LedgerRepository {
  /**
   * Append a new entry to the immutable ledger
   */
  async create(data, tx = null) {
    const db = tx || prisma;

    try {
      return await db.transactionLedger.create({
        data: {
          ...data,
          amount: new Prisma.Decimal(data.amount),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        // Idempotent duplicate reference
        return await this.findByIdempotencyRef(data.idempotencyRef, tx);
      }
      throw error;
    }
  }

  async findById(id, tx = null) {
    const db = tx || prisma;
    return db.transactionLedger.findUnique({
      where: { id },
      include: { user: true, payment: true },
    });
  }

  async findByIdempotencyRef(idempotencyRef, tx = null) {
    const db = tx || prisma;
    return db.transactionLedger.findUnique({
      where: { idempotencyRef },
    });
  }

  async findByPaymentId(paymentId, tx = null) {
    const db = tx || prisma;
    return db.transactionLedger.findMany({
      where: { paymentId },
      orderBy: { createdAt: "asc" },
    });
  }

  async findByUserId(userId, { skip = 0, take = 20 } = {}, tx = null) {
    const db = tx || prisma;
    return db.transactionLedger.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
  }

  async countByUserId(userId, tx = null) {
    const db = tx || prisma;
    return db.transactionLedger.count({
      where: { userId },
    });
  }

  async findAll({ skip = 0, take = 50, type = null, gateway = null } = {}, tx = null) {
    const db = tx || prisma;
    const where = {};
    if (type) where.type = type;
    if (gateway) where.gateway = gateway;

    return db.transactionLedger.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        user: { select: { id: true, email: true, fullName: true } },
      },
    });
  }

  async countAll({ type = null, gateway = null } = {}, tx = null) {
    const db = tx || prisma;
    const where = {};
    if (type) where.type = type;
    if (gateway) where.gateway = gateway;

    return db.transactionLedger.count({ where });
  }
}

export default new LedgerRepository();
