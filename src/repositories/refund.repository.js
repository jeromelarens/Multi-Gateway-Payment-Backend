import prisma from "../config/prisma.js";

class RefundRepository {
  async create(data) {
    return prisma.refund.create({
      data,
    });
  }

  async findById(id) {
    return prisma.refund.findUnique({
      where: {
        id,
      },
      include: {
        payment: {
          include: {
            order: true,
            user: true,
          },
        },
      },
    });
  }

  async findByStripeRefundId(stripeRefundId) {
    return prisma.refund.findUnique({
      where: {
        stripeRefundId,
      },
      include: {
        payment: {
          include: {
            order: true,
            user: true,
          },
        },
      },
    });
  }

  async findPaymentRefunds(paymentId) {
    return prisma.refund.findMany({
      where: {
        paymentId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async findAll() {
    return prisma.refund.findMany({
      include: {
        payment: {
          include: {
            order: true,
            user: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async update(id, data) {
    return prisma.refund.update({
      where: {
        id,
      },
      data,
    });
  }

  async updateStatus(id, status) {
    return prisma.refund.update({
      where: {
        id,
      },
      data: {
        status,
      },
    });
  }

  async delete(id) {
    return prisma.refund.delete({
      where: {
        id,
      },
    });
  }
}

export default new RefundRepository();