import prisma from "../config/prisma.js";

class PaymentRepository {
  async create(data) {
    return prisma.payment.create({ data });
  }

  async findById(id) {
    return prisma.payment.findUnique({
      where: { id },
      include: {
        user: true,
        order: true,
        refunds: true,
      },
    });
  }

  async findByPaymentIntent(paymentIntentId) {
    if (!paymentIntentId) return null;
    return prisma.payment.findUnique({
      where: { paymentIntentId },
      include: {
        user: true,
        order: true,
        refunds: true,
      },
    });
  }

  async findByGatewayOrderId(gatewayOrderId) {
    if (!gatewayOrderId) return null;
    return prisma.payment.findFirst({
      where: { gatewayOrderId },
      include: {
        user: true,
        order: true,
        refunds: true,
      },
    });
  }

  async findByGatewayPaymentId(gatewayPaymentId) {
    if (!gatewayPaymentId) return null;
    return prisma.payment.findFirst({
      where: { gatewayPaymentId },
      include: {
        user: true,
        order: true,
        refunds: true,
      },
    });
  }

  async findByOrderId(orderId) {
    return prisma.payment.findUnique({
      where: { orderId },
      include: {
        user: true,
        order: true,
        refunds: true,
      },
    });
  }

  async getUserPayments(userId, { skip = 0, take = 20 } = {}) {
    return prisma.payment.findMany({
      where: { userId },
      include: {
        order: true,
        refunds: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
  }

  async countUserPayments(userId) {
    return prisma.payment.count({
      where: { userId },
    });
  }

  async findPendingPaymentByUser(userId, amount) {
    return prisma.payment.findFirst({
      where: {
        userId,
        amount,
        status: "PENDING",
      },
      include: {
        order: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async findPendingPayments() {
    return prisma.payment.findMany({
      where: { status: "PENDING" },
      include: {
        user: true,
        order: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async update(id, data) {
    return prisma.payment.update({
      where: { id },
      data,
    });
  }

  async updateStatus(id, status) {
    return prisma.payment.update({
      where: { id },
      data: { status },
    });
  }

  async updateByPaymentIntent(paymentIntentId, data) {
    return prisma.payment.update({
      where: { paymentIntentId },
      data,
    });
  }

  async delete(id) {
    return prisma.payment.delete({
      where: { id },
    });
  }
}

export default new PaymentRepository();