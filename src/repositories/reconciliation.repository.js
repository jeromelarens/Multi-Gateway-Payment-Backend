import prisma from "../config/prisma.js";
import { Prisma } from "@prisma/client";

class ReconciliationRepository {
  async create(data) {
    return prisma.reconciliationRecord.create({
      data: {
        ...data,
        internalAmount: data.internalAmount !== undefined && data.internalAmount !== null
          ? new Prisma.Decimal(data.internalAmount)
          : null,
        gatewayAmount: data.gatewayAmount !== undefined && data.gatewayAmount !== null
          ? new Prisma.Decimal(data.gatewayAmount)
          : null,
      },
    });
  }

  async findById(id) {
    return prisma.reconciliationRecord.findUnique({
      where: { id },
      include: {
        payment: {
          include: { user: true, order: true },
        },
      },
    });
  }

  async findAll({
    skip = 0,
    take = 50,
    gateway = null,
    status = null,
    differenceType = null,
    startDate = null,
    endDate = null,
  } = {}) {
    const where = {};
    if (gateway) where.gateway = gateway;
    if (status) where.status = status;
    if (differenceType) where.differenceType = differenceType;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    return prisma.reconciliationRecord.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        payment: {
          select: {
            id: true,
            status: true,
            amount: true,
            currency: true,
            orderId: true,
          },
        },
      },
    });
  }

  async countAll({
    gateway = null,
    status = null,
    differenceType = null,
    startDate = null,
    endDate = null,
  } = {}) {
    const where = {};
    if (gateway) where.gateway = gateway;
    if (status) where.status = status;
    if (differenceType) where.differenceType = differenceType;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    return prisma.reconciliationRecord.count({ where });
  }

  async resolve(id, { resolution, resolvedBy }) {
    return prisma.reconciliationRecord.update({
      where: { id },
      data: {
        status: "RESOLVED",
        resolution,
        resolvedBy,
        resolvedAt: new Date(),
      },
    });
  }
}

export default new ReconciliationRepository();
